'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { smockit } = require('@eth-optimism/smock');

require('./common'); // import common test scaffolding

const { setupContract, setupAllContracts } = require('./setup');

const { currentTime, fastForward, fastForwardTo, toUnit, fromUnit } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	updateRatesWithDefaults,
	setStatus,
} = require('./helpers');

const {
	toBytes32,
	constants: { inflationStartTimestampInSecs },
} = require('../..');

contract('Synthetix', async accounts => {
	const [sUSD, sAUD, sEUR, sETH] = ['sUSD', 'sAUD', 'sEUR', 'sETH'].map(toBytes32);

	const [, owner, account1, account2] = accounts;

	let synthetix,
		exchangeRates,
		debtCache,
		systemSettings,
		supplySchedule,
		rewardEscrow,
		rewardEscrowV2,
		oracle,
		addressResolver,
		systemStatus;

	before(async () => {
		({
			Synthetix: synthetix,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			DebtCache: debtCache,
			SystemStatus: systemStatus,
			SystemSettings: systemSettings,
			RewardEscrow: rewardEscrow,
			RewardEscrowV2: rewardEscrowV2,
			SupplySchedule: supplySchedule,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sETH', 'sEUR', 'sAUD'],
			contracts: [
				'Synthetix',
				'SynthetixState',
				'SupplySchedule',
				'SystemSettings',
				'AddressResolver',
				'ExchangeRates',
				'SystemStatus',
				'DebtCache',
				'Issuer',
				'Exchanger',
				'RewardsDistribution',
				'CollateralManager',
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
			expected: [
				'emitExchangeRebate',
				'emitExchangeReclaim',
				'emitSynthExchange',
				'emitExchangeTracking',
				'migrateEscrowBalanceToRewardEscrowV2',
			],
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

	describe('only Exchanger can call emit event functions', () => {
		const amount1 = 10;
		const amount2 = 100;
		const currencyKey1 = sAUD;
		const currencyKey2 = sEUR;
		const trackingCode = toBytes32('1inch');
		it('emitExchangeTracking() cannot be invoked directly by any account', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: synthetix.emitExchangeTracking,
				accounts,
				args: [trackingCode, currencyKey1, account1],
				reason: 'Only Exchanger can invoke this',
			});
		});
		it('emitExchangeRebate() cannot be invoked directly by any account', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: synthetix.emitExchangeRebate,
				accounts,
				args: [account1, currencyKey1, amount1],
				reason: 'Only Exchanger can invoke this',
			});
		});
		it('emitExchangeReclaim() cannot be invoked directly by any account', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: synthetix.emitExchangeReclaim,
				accounts,
				args: [account1, currencyKey1, amount1],
				reason: 'Only Exchanger can invoke this',
			});
		});
		it('emitSynthExchange() cannot be invoked directly by any account', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: synthetix.emitSynthExchange,
				accounts,
				args: [account1, currencyKey1, amount1, currencyKey2, amount2, account2],
				reason: 'Only Exchanger can invoke this',
			});
		});

		describe('Exchanger calls emit', () => {
			const exchanger = account1;
			let tx1, tx2, tx3, tx4;
			beforeEach('pawn Exchanger and sync cache', async () => {
				await addressResolver.importAddresses(['Exchanger'].map(toBytes32), [exchanger], {
					from: owner,
				});
				await synthetix.rebuildCache();
			});
			beforeEach('call event emission functions', async () => {
				tx1 = await synthetix.emitExchangeRebate(account1, currencyKey1, amount1, {
					from: exchanger,
				});
				tx2 = await synthetix.emitExchangeReclaim(account1, currencyKey1, amount1, {
					from: exchanger,
				});
				tx3 = await synthetix.emitSynthExchange(
					account1,
					currencyKey1,
					amount1,
					currencyKey2,
					amount2,
					account2,
					{ from: exchanger }
				);
				tx4 = await synthetix.emitExchangeTracking(trackingCode, currencyKey1, amount1, {
					from: exchanger,
				});
			});

			it('the corresponding events are emitted', async () => {
				assert.eventEqual(tx1, 'ExchangeRebate', {
					account: account1,
					currencyKey: currencyKey1,
					amount: amount1,
				});
				assert.eventEqual(tx2, 'ExchangeReclaim', {
					account: account1,
					currencyKey: currencyKey1,
					amount: amount1,
				});
				assert.eventEqual(tx3, 'SynthExchange', {
					account: account1,
					fromCurrencyKey: currencyKey1,
					fromAmount: amount1,
					toCurrencyKey: currencyKey2,
					toAmount: amount2,
					toAddress: account2,
				});
				assert.eventEqual(tx4, 'ExchangeTracking', {
					trackingCode: trackingCode,
					toCurrencyKey: currencyKey1,
					toAmount: amount1,
				});
			});
		});
	});

	describe('Exchanger calls @cov-skip', () => {
		let smockExchanger;
		beforeEach(async () => {
			smockExchanger = await smockit(artifacts.require('Exchanger').abi);
			smockExchanger.smocked.exchangeOnBehalf.will.return.with(() => '1');
			smockExchanger.smocked.exchangeWithTracking.will.return.with(() => '1');
			smockExchanger.smocked.exchangeOnBehalfWithTracking.will.return.with(() => '1');
			smockExchanger.smocked.exchangeWithVirtual.will.return.with(() => ['1', account1]);
			smockExchanger.smocked.settle.will.return.with(() => ['1', '2', '3']);
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

		it('exchangeOnBehalf is called with the right arguments ', async () => {
			await synthetix.exchangeOnBehalf(account1, currencyKey1, amount1, currencyKey2, {
				from: owner,
			});
			assert.equal(smockExchanger.smocked.exchangeOnBehalf.calls[0][0], account1);
			assert.equal(smockExchanger.smocked.exchangeOnBehalf.calls[0][1], msgSender);
			assert.equal(smockExchanger.smocked.exchangeOnBehalf.calls[0][2], currencyKey1);
			assert.equal(smockExchanger.smocked.exchangeOnBehalf.calls[0][3].toString(), amount1);
			assert.equal(smockExchanger.smocked.exchangeOnBehalf.calls[0][4], currencyKey2);
		});

		it('exchangeWithTracking is called with the right arguments ', async () => {
			await synthetix.exchangeWithTracking(
				currencyKey1,
				amount1,
				currencyKey2,
				account2,
				trackingCode,
				{ from: owner }
			);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][0], msgSender);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][1], currencyKey1);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][2].toString(), amount1);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][3], currencyKey2);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][4], msgSender);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][5], account2);
			assert.equal(smockExchanger.smocked.exchangeWithTracking.calls[0][6], trackingCode);
		});

		it('exchangeOnBehalfWithTracking is called with the right arguments ', async () => {
			await synthetix.exchangeOnBehalfWithTracking(
				account1,
				currencyKey1,
				amount1,
				currencyKey2,
				account2,
				trackingCode,
				{ from: owner }
			);
			assert.equal(smockExchanger.smocked.exchangeOnBehalfWithTracking.calls[0][0], account1);
			assert.equal(smockExchanger.smocked.exchangeOnBehalfWithTracking.calls[0][1], msgSender);
			assert.equal(smockExchanger.smocked.exchangeOnBehalfWithTracking.calls[0][2], currencyKey1);
			assert.equal(
				smockExchanger.smocked.exchangeOnBehalfWithTracking.calls[0][3].toString(),
				amount1
			);
			assert.equal(smockExchanger.smocked.exchangeOnBehalfWithTracking.calls[0][4], currencyKey2);
			assert.equal(smockExchanger.smocked.exchangeOnBehalfWithTracking.calls[0][5], account2);
			assert.equal(smockExchanger.smocked.exchangeOnBehalfWithTracking.calls[0][6], trackingCode);
		});

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

		it('settle is called with the right arguments ', async () => {
			await synthetix.settle(currencyKey1, {
				from: owner,
			});
			assert.equal(smockExchanger.smocked.settle.calls[0][0], msgSender);
			assert.equal(smockExchanger.smocked.settle.calls[0][1].toString(), currencyKey1);
		});
	});
	describe('isWaitingPeriod()', () => {
		it('returns false by default', async () => {
			assert.isFalse(await synthetix.isWaitingPeriod(sETH));
		});
		describe('when a user has exchanged into sETH', () => {
			beforeEach(async () => {
				await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });

				await synthetix.issueSynths(toUnit('100'), { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sETH, { from: owner });
			});
			it('then waiting period is true', async () => {
				assert.isTrue(await synthetix.isWaitingPeriod(sETH));
			});
			describe('when the waiting period expires', () => {
				beforeEach(async () => {
					await fastForward(await systemSettings.waitingPeriodSecs());
				});
				it('returns false by default', async () => {
					assert.isFalse(await synthetix.isWaitingPeriod(sETH));
				});
			});
		});
	});

	describe('transfer()', () => {
		beforeEach(async () => {
			// Ensure all synths have rates to allow issuance
			await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });
		});

		describe('when the user has issued some sUSD and exchanged for other synths', () => {
			beforeEach(async () => {
				await synthetix.issueSynths(toUnit('100'), { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sETH, { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sAUD, { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sEUR, { from: owner });
			});
			it('should transfer using the ERC20 transfer function @gasprofile', async () => {
				await synthetix.transfer(account1, toUnit('10'), { from: owner });

				assert.bnEqual(await synthetix.balanceOf(account1), toUnit('10'));
			});

			it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
				const previousOwnerBalance = await synthetix.balanceOf(owner);

				// Approve account1 to act on our behalf for 10 SNX.
				await synthetix.approve(account1, toUnit('10'), { from: owner });

				// Assert that transferFrom works.
				await synthetix.transferFrom(owner, account2, toUnit('10'), {
					from: account1,
				});

				// Assert that account2 has 10 SNX and owner has 10 less SNX
				assert.bnEqual(await synthetix.balanceOf(account2), toUnit('10'));
				assert.bnEqual(await synthetix.balanceOf(owner), previousOwnerBalance.sub(toUnit('10')));

				// Assert that we can't transfer more even though there's a balance for owner.
				await assert.revert(
					synthetix.transferFrom(owner, account2, '1', {
						from: account1,
					})
				);
			});
		});

		it("should lock newly received synthetix if the user's collaterisation is too high", async () => {
			// Set sEUR for purposes of this test
			const timestamp1 = await currentTime();
			await exchangeRates.updateRates([sEUR], [toUnit('0.75')], timestamp1, { from: oracle });
			await debtCache.takeDebtSnapshot();

			const issuedSynthetixs = web3.utils.toBN('200000');
			await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});
			await synthetix.transfer(account2, toUnit(issuedSynthetixs), {
				from: owner,
			});

			const maxIssuableSynths = await synthetix.maxIssuableSynths(account1);

			// Issue
			await synthetix.issueSynths(maxIssuableSynths, { from: account1 });

			// Exchange into sEUR
			await synthetix.exchange(sUSD, maxIssuableSynths, sEUR, { from: account1 });

			// Ensure that we can transfer in and out of the account successfully
			await synthetix.transfer(account1, toUnit('10000'), {
				from: account2,
			});
			await synthetix.transfer(account2, toUnit('10000'), {
				from: account1,
			});

			// Increase the value of sEUR relative to synthetix
			const timestamp2 = await currentTime();
			await exchangeRates.updateRates([sEUR], [toUnit('2.10')], timestamp2, { from: oracle });
			await debtCache.takeDebtSnapshot();

			// Ensure that the new synthetix account1 receives cannot be transferred out.
			await synthetix.transfer(account1, toUnit('10000'), {
				from: account2,
			});
			await assert.revert(synthetix.transfer(account2, toUnit('10000'), { from: account1 }));
		});

		it('should unlock synthetix when collaterisation ratio changes', async () => {
			// prevent circuit breaker from firing by upping the threshold to factor 5
			await systemSettings.setPriceDeviationThresholdFactor(toUnit('5'), { from: owner });

			// Set sAUD for purposes of this test
			const timestamp1 = await currentTime();
			const aud2usdrate = toUnit('2');

			await exchangeRates.updateRates([sAUD], [aud2usdrate], timestamp1, { from: oracle });
			await debtCache.takeDebtSnapshot();

			const issuedSynthetixs = web3.utils.toBN('200000');
			await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			// Issue
			const issuedSynths = await synthetix.maxIssuableSynths(account1);
			await synthetix.issueSynths(issuedSynths, { from: account1 });
			const remainingIssuable = (await synthetix.remainingIssuableSynths(account1))[0];

			assert.bnClose(remainingIssuable, '0');

			const transferable1 = await synthetix.transferableSynthetix(account1);
			assert.bnEqual(transferable1, '0');

			// Exchange into sAUD
			await synthetix.exchange(sUSD, issuedSynths, sAUD, { from: account1 });

			// Increase the value of sAUD relative to synthetix
			const timestamp2 = await currentTime();
			const newAUDExchangeRate = toUnit('1');
			await exchangeRates.updateRates([sAUD], [newAUDExchangeRate], timestamp2, { from: oracle });
			await debtCache.takeDebtSnapshot();

			const transferable2 = await synthetix.transferableSynthetix(account1);
			assert.equal(transferable2.gt(toUnit('1000')), true);
		});

		describe('when the user has issued some sUSD and exchanged for other synths', () => {
			beforeEach(async () => {
				await synthetix.issueSynths(toUnit('100'), { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sETH, { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sAUD, { from: owner });
				await synthetix.exchange(sUSD, toUnit('10'), sEUR, { from: owner });
			});
			it('should transfer using the ERC20 transfer function @gasprofile', async () => {
				await synthetix.transfer(account1, toUnit('10'), { from: owner });

				assert.bnEqual(await synthetix.balanceOf(account1), toUnit('10'));
			});

			it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
				const previousOwnerBalance = await synthetix.balanceOf(owner);

				// Approve account1 to act on our behalf for 10 SNX.
				await synthetix.approve(account1, toUnit('10'), { from: owner });

				// Assert that transferFrom works.
				await synthetix.transferFrom(owner, account2, toUnit('10'), {
					from: account1,
				});

				// Assert that account2 has 10 SNX and owner has 10 less SNX
				assert.bnEqual(await synthetix.balanceOf(account2), toUnit('10'));
				assert.bnEqual(await synthetix.balanceOf(owner), previousOwnerBalance.sub(toUnit('10')));

				// Assert that we can't transfer more even though there's a balance for owner.
				await assert.revert(
					synthetix.transferFrom(owner, account2, '1', {
						from: account1,
					})
				);
			});
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
			assert.bnEqual(await synthetix.balanceOf(rewardEscrow.address), expectedEscrowBalance);
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
			assert.bnEqual(await synthetix.balanceOf(rewardEscrow.address), expectedEscrowBalance);
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
			assert.bnClose(await synthetix.balanceOf(rewardEscrow.address), expectedEscrowBalance, 27);
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
});
