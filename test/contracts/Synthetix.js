'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { smockit } = require('@eth-optimism/smock');

require('./common'); // import common test scaffolding

const { setupContract, setupAllContracts } = require('./setup');

const { fastForwardTo, toUnit, fromUnit } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	updateRatesWithDefaults,
	setStatus,
} = require('./helpers');

const {
	toBytes32,
	constants: { inflationStartTimestampInSecs },
} = require('../..');

contract('Synthetix', async accounts => {
	const [sAUD, sEUR, sUSD, sETH] = ['sAUD', 'sEUR', 'sUSD', 'sETH'].map(toBytes32);

	const [, owner, account1, account2, account3] = accounts;

	let synthetix,
		exchangeRates,
		debtCache,
		supplySchedule,
		rewardEscrow,
		rewardEscrowV2,
		oracle,
		addressResolver,
		systemStatus,
		sUSDContract,
		sETHContract;

	before(async () => {
		({
			Synthetix: synthetix,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			DebtCache: debtCache,
			SystemStatus: systemStatus,
			RewardEscrow: rewardEscrow,
			RewardEscrowV2: rewardEscrowV2,
			SupplySchedule: supplySchedule,
			SynthsUSD: sUSDContract,
			SynthsETH: sETHContract,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sETH', 'sEUR', 'sAUD'],
			contracts: [
				'Synthetix',
				'SynthetixState',
				'SupplySchedule',
				'AddressResolver',
				'ExchangeRates',
				'SystemStatus',
				'DebtCache',
				'Issuer',
				'Exchanger',
				'RewardsDistribution',
				'CollateralManager',
				'RewardEscrowV2', // required for issuer._collateral to read collateral
				'RewardEscrow',
			],
		}));

		// Send a price update to guarantee we're not stale.
		oracle = account1;
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: synthetix.abi,
			ignoreParents: ['BaseSynthetix'],
			expected: ['migrateEscrowBalanceToRewardEscrowV2'],
		});
	});

	describe('constructor', () => {
		it('should set constructor params on deployment', async () => {
			const SYNTHETIX_TOTAL_SUPPLY = web3.utils.toWei('100000000');
			const instance = await setupContract({
				contract: 'Synthetix',
				accounts,
				skipPostDeploy: true,
				args: [account1, account2, owner, SYNTHETIX_TOTAL_SUPPLY, addressResolver.address],
			});

			assert.equal(await instance.proxy(), account1);
			assert.equal(await instance.tokenState(), account2);
			assert.equal(await instance.owner(), owner);
			assert.equal(await instance.totalSupply(), SYNTHETIX_TOTAL_SUPPLY);
			assert.equal(await instance.resolver(), addressResolver.address);
		});
	});

	describe('Exchanger calls', () => {
		let smockExchanger;
		beforeEach(async () => {
			smockExchanger = await smockit(artifacts.require('Exchanger').abi);
			smockExchanger.smocked.exchangeWithVirtual.will.return.with(() => ['1', account1]);
			smockExchanger.smocked.exchangeWithTracking.will.return.with(() => ['1']);
			await addressResolver.importAddresses(
				['Exchanger'].map(toBytes32),
				[smockExchanger.address],
				{ from: owner }
			);
			await synthetix.rebuildCache();
		});

		const amount1 = '10';
		const currencyKey1 = sAUD;
		const currencyKey2 = sEUR;
		const trackingCode = toBytes32('1inch');
		const msgSender = owner;

		it('exchangeWithVirtual is called with the right arguments ', async () => {
			await synthetix.exchangeWithVirtual(currencyKey1, amount1, currencyKey2, trackingCode, {
				from: owner,
			});
			assert.equal(smockExchanger.smocked.exchangeWithVirtual.calls[0][0], msgSender);
			assert.equal(smockExchanger.smocked.exchangeWithVirtual.calls[0][1], currencyKey1);
			assert.equal(smockExchanger.smocked.exchangeWithVirtual.calls[0][2].toString(), amount1);
			assert.equal(smockExchanger.smocked.exchangeWithVirtual.calls[0][3], currencyKey2);
			assert.equal(smockExchanger.smocked.exchangeWithVirtual.calls[0][4], msgSender);
			assert.equal(smockExchanger.smocked.exchangeWithVirtual.calls[0][5], trackingCode);
		});

		it('exchangeWithTrackingForInitiator is called with the right arguments ', async () => {
			await synthetix.exchangeWithTrackingForInitiator(
				currencyKey1,
				amount1,
				currencyKey2,
				account2,
				trackingCode,
				{ from: account3 }
			);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][0], account3);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][1], currencyKey1);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][2].toString(), amount1);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][3], currencyKey2);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][4], account3); // destination address (tx.origin)
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][5], account2);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][6], trackingCode);
		});
	});

	describe('mint() - inflationary supply minting', async () => {
		// These tests are using values modeled from https://sips.synthetix.io/sips/sip-23
		// https://docs.google.com/spreadsheets/d/1a5r9aFP5bh6wGG4-HIW2MWPf4yMthZvesZOurnG-v_8/edit?ts=5deef2a7#gid=0
		const INITIAL_WEEKLY_SUPPLY = 75e6 / 52;

		const DAY = 86400;
		const WEEK = 604800;

		const INFLATION_START_DATE = inflationStartTimestampInSecs;

		describe('suspension conditions', () => {
			beforeEach(async () => {
				// ensure mint() can succeed by default
				const week234 = INFLATION_START_DATE + WEEK * 234;
				await fastForwardTo(new Date(week234 * 1000));
				await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });
			});
			['System', 'Issuance'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section, suspend: true });
					});
					it('then calling mint() reverts', async () => {
						await assert.revert(synthetix.mint(), 'Operation prohibited');
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: false });
						});
						it('then calling mint() succeeds', async () => {
							await synthetix.mint();
						});
					});
				});
			});
		});
		it('should allow synthetix contract to mint inflationary decay for 234 weeks', async () => {
			// fast forward EVM to end of inflation supply decay at week 234
			const week234 = INFLATION_START_DATE + WEEK * 234;
			await fastForwardTo(new Date(week234 * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });

			const existingSupply = await synthetix.totalSupply();
			const mintableSupply = await supplySchedule.mintableSupply();
			const mintableSupplyDecimal = parseFloat(fromUnit(mintableSupply));
			const currentRewardEscrowBalance = await synthetix.balanceOf(rewardEscrow.address);

			// Call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();
			const newTotalSupplyDecimal = parseFloat(fromUnit(newTotalSupply));
			const minterReward = await supplySchedule.minterReward();

			const expectedEscrowBalance = currentRewardEscrowBalance
				.add(mintableSupply)
				.sub(minterReward);

			// Here we are only checking to 2 decimal places from the excel model referenced above
			// as the precise rounding is not exact but has no effect on the end result to 6 decimals.
			const expectedSupplyToMint = 160387922.86;
			const expectedNewTotalSupply = 260387922.86;
			assert.equal(mintableSupplyDecimal.toFixed(2), expectedSupplyToMint);
			assert.equal(newTotalSupplyDecimal.toFixed(2), expectedNewTotalSupply);

			assert.bnEqual(newTotalSupply, existingSupply.add(mintableSupply));
			assert.bnEqual(await synthetix.balanceOf(rewardEscrowV2.address), expectedEscrowBalance);
		});

		it('should allow synthetix contract to mint 2 weeks of supply and minus minterReward', async () => {
			// Issue
			const supplyToMint = toUnit(INITIAL_WEEKLY_SUPPLY * 2);

			// fast forward EVM to Week 3 in of the inflationary supply
			const weekThree = INFLATION_START_DATE + WEEK * 2 + DAY;
			await fastForwardTo(new Date(weekThree * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });

			const existingSupply = await synthetix.totalSupply();
			const mintableSupply = await supplySchedule.mintableSupply();
			const mintableSupplyDecimal = parseFloat(fromUnit(mintableSupply));
			const currentRewardEscrowBalance = await synthetix.balanceOf(rewardEscrow.address);

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();
			const newTotalSupplyDecimal = parseFloat(fromUnit(newTotalSupply));

			const minterReward = await supplySchedule.minterReward();
			const expectedEscrowBalance = currentRewardEscrowBalance
				.add(mintableSupply)
				.sub(minterReward);

			// Here we are only checking to 2 decimal places from the excel model referenced above
			const expectedSupplyToMintDecimal = parseFloat(fromUnit(supplyToMint));
			const expectedNewTotalSupply = existingSupply.add(supplyToMint);
			const expectedNewTotalSupplyDecimal = parseFloat(fromUnit(expectedNewTotalSupply));
			assert.equal(mintableSupplyDecimal.toFixed(2), expectedSupplyToMintDecimal.toFixed(2));
			assert.equal(newTotalSupplyDecimal.toFixed(2), expectedNewTotalSupplyDecimal.toFixed(2));

			assert.bnEqual(newTotalSupply, existingSupply.add(mintableSupply));
			assert.bnEqual(await synthetix.balanceOf(rewardEscrowV2.address), expectedEscrowBalance);
		});

		it('should allow synthetix contract to mint the same supply for 39 weeks into the inflation prior to decay', async () => {
			// 39 weeks mimics the inflationary supply minted on mainnet
			const expectedTotalSupply = toUnit(1e8 + INITIAL_WEEKLY_SUPPLY * 39);
			const expectedSupplyToMint = toUnit(INITIAL_WEEKLY_SUPPLY * 39);

			// fast forward EVM to Week 2 in Year 3 schedule starting at UNIX 1583971200+
			const weekThirtyNine = INFLATION_START_DATE + WEEK * 39 + DAY;
			await fastForwardTo(new Date(weekThirtyNine * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });

			const existingTotalSupply = await synthetix.totalSupply();
			const currentRewardEscrowBalance = await synthetix.balanceOf(rewardEscrow.address);
			const mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();
			const minterReward = await supplySchedule.minterReward();
			const expectedEscrowBalance = currentRewardEscrowBalance
				.add(expectedSupplyToMint)
				.sub(minterReward);

			// The precision is slightly off using 18 wei. Matches mainnet.
			assert.bnClose(newTotalSupply, expectedTotalSupply, 27);
			assert.bnClose(mintableSupply, expectedSupplyToMint, 27);

			assert.bnClose(newTotalSupply, existingTotalSupply.add(expectedSupplyToMint), 27);
			assert.bnClose(await synthetix.balanceOf(rewardEscrowV2.address), expectedEscrowBalance, 27);
		});

		it('should allow synthetix contract to mint 2 weeks into Terminal Inflation', async () => {
			// fast forward EVM to week 236
			const september142023 = INFLATION_START_DATE + 236 * WEEK + DAY;
			await fastForwardTo(new Date(september142023 * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });

			const existingTotalSupply = await synthetix.totalSupply();
			const mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();

			const expectedTotalSupply = toUnit('260638356.052421715910204590');
			const expectedSupplyToMint = expectedTotalSupply.sub(existingTotalSupply);

			assert.bnEqual(newTotalSupply, existingTotalSupply.add(expectedSupplyToMint));
			assert.bnEqual(newTotalSupply, expectedTotalSupply);
			assert.bnEqual(mintableSupply, expectedSupplyToMint);
		});

		it('should allow synthetix contract to mint Terminal Inflation to 2030', async () => {
			// fast forward EVM to week 236
			const week573 = INFLATION_START_DATE + 572 * WEEK + DAY;
			await fastForwardTo(new Date(week573 * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });

			const existingTotalSupply = await synthetix.totalSupply();
			const mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();

			const expectedTotalSupply = toUnit('306320971.934765774167963072');
			const expectedSupplyToMint = expectedTotalSupply.sub(existingTotalSupply);

			assert.bnEqual(newTotalSupply, existingTotalSupply.add(expectedSupplyToMint));
			assert.bnEqual(newTotalSupply, expectedTotalSupply);
			assert.bnEqual(mintableSupply, expectedSupplyToMint);
		});

		it('should be able to mint again after another 7 days period', async () => {
			// fast forward EVM to Week 3 in Year 2 schedule starting at UNIX 1553040000+
			const weekThree = INFLATION_START_DATE + 2 * WEEK + 1 * DAY;
			await fastForwardTo(new Date(weekThree * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });

			let existingTotalSupply = await synthetix.totalSupply();
			let mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			let newTotalSupply = await synthetix.totalSupply();
			assert.bnEqual(newTotalSupply, existingTotalSupply.add(mintableSupply));

			// fast forward EVM to Week 4
			const weekFour = weekThree + 1 * WEEK + 1 * DAY;
			await fastForwardTo(new Date(weekFour * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });

			existingTotalSupply = await synthetix.totalSupply();
			mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			newTotalSupply = await synthetix.totalSupply();
			assert.bnEqual(newTotalSupply, existingTotalSupply.add(mintableSupply));
		});

		it('should revert when trying to mint again within the 7 days period', async () => {
			// fast forward EVM to Week 3 of inflation
			const weekThree = INFLATION_START_DATE + 2 * WEEK + DAY;
			await fastForwardTo(new Date(weekThree * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });

			const existingTotalSupply = await synthetix.totalSupply();
			const mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();
			assert.bnEqual(newTotalSupply, existingTotalSupply.add(mintableSupply));

			const weekFour = weekThree + DAY * 1;
			await fastForwardTo(new Date(weekFour * 1000));

			// should revert if try to mint again within 7 day period / mintable supply is 0
			await assert.revert(synthetix.mint(), 'No supply is mintable');
		});
	});

	describe('migration - transfer escrow balances to reward escrow v2', () => {
		let rewardEscrowBalanceBefore;
		beforeEach(async () => {
			// transfer SNX to rewardEscrow
			await synthetix.transfer(rewardEscrow.address, toUnit('100'), { from: owner });

			rewardEscrowBalanceBefore = await synthetix.balanceOf(rewardEscrow.address);
		});
		it('should revert if called by non-owner account', async () => {
			await assert.revert(
				synthetix.migrateEscrowBalanceToRewardEscrowV2({ from: account1 }),
				'Only the contract owner may perform this action'
			);
		});
		it('should have transferred reward escrow balance to reward escrow v2', async () => {
			// call the migrate function
			await synthetix.migrateEscrowBalanceToRewardEscrowV2({ from: owner });

			// should have transferred balance to rewardEscrowV2
			assert.bnEqual(await synthetix.balanceOf(rewardEscrowV2.address), rewardEscrowBalanceBefore);

			// rewardEscrow should have 0 balance
			assert.bnEqual(await synthetix.balanceOf(rewardEscrow.address), 0);
		});
	});

	describe('Using a contract to invoke exchangeWithTrackingForInitiator', () => {
		describe('when a third party contract is setup to exchange synths', () => {
			let contractExample;
			let amountOfsUSD;
			beforeEach(async () => {
				amountOfsUSD = toUnit('100');

				const MockThirdPartyExchangeContract = artifacts.require('MockThirdPartyExchangeContract');

				// create a contract
				contractExample = await MockThirdPartyExchangeContract.new(addressResolver.address);

				// ensure rates are set
				await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });

				// issue sUSD from the owner
				await synthetix.issueSynths(amountOfsUSD, { from: owner });

				// transfer the sUSD to the contract
				await sUSDContract.transfer(contractExample.address, toUnit('100'), { from: owner });
			});

			describe('when Barrie invokes the exchange function on the contract', () => {
				let txn;
				beforeEach(async () => {
					// Barrie has no sETH to start
					assert.equal(await sETHContract.balanceOf(account3), '0');

					txn = await contractExample.exchange(sUSD, amountOfsUSD, sETH, { from: account3 });
				});
				it('then Barrie has the synths in her account', async () => {
					assert.bnGt(await sETHContract.balanceOf(account3), toUnit('0.01'));
				});
				it('and the contract has none', async () => {
					assert.equal(await sETHContract.balanceOf(contractExample.address), '0');
				});
				it('and the event emitted indicates that Barrie was the destinationAddress', async () => {
					const logs = artifacts.require('Synthetix').decodeLogs(txn.receipt.rawLogs);
					assert.eventEqual(
						logs.find(log => log.event === 'SynthExchange'),
						'SynthExchange',
						{
							account: contractExample.address,
							fromCurrencyKey: sUSD,
							fromAmount: amountOfsUSD,
							toCurrencyKey: sETH,
							toAddress: account3,
						}
					);
				});
			});
		});
	});
});
