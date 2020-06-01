'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

require('./common'); // import common test scaffolding

const { mockToken, setupContract, setupAllContracts } = require('./setup');

const MockEtherCollateral = artifacts.require('MockEtherCollateral');

const {
	currentTime,
	fastForward,
	fastForwardTo,
	divideDecimal,
	multiplyDecimal,
	toUnit,
	fromUnit,
} = require('../utils')();

const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	updateRatesWithDefaults,
	setStatus,
} = require('./helpers');

const {
	toBytes32,
	constants: { inflationStartTimestampInSecs, ZERO_ADDRESS },
} = require('../..');

contract('Synthetix', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, sETH] = ['sUSD', 'sAUD', 'sEUR', 'SNX', 'sETH'].map(toBytes32);

	const [, owner, account1, account2, account3] = accounts;

	let synthetix,
		exchangeRates,
		supplySchedule,
		etherCollateral,
		escrow,
		rewardEscrow,
		oracle,
		timestamp,
		addressResolver,
		synthetixState,
		systemStatus,
		sUSDSynth,
		sEURSynth,
		sAUDSynth,
		sETHSynth;

	const getRemainingIssuableSynths = async account =>
		(await synthetix.remainingIssuableSynths(account))[0];

	before(async () => {
		({
			Synthetix: synthetix,
			AddressResolver: addressResolver,
			SynthetixState: synthetixState,
			ExchangeRates: exchangeRates,
			SystemStatus: systemStatus,
			SynthetixEscrow: escrow,
			EtherCollateral: etherCollateral,
			RewardEscrow: rewardEscrow,
			SupplySchedule: supplySchedule,
			SynthsUSD: sUSDSynth,
			SynthsETH: sETHSynth,
			SynthsEUR: sEURSynth,
			SynthsAUD: sAUDSynth,
			// Proxy: proxy,
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
				'Issuer',
				'Exchanger',
				'RewardsDistribution',
				'IssuanceEternalStorage',
			],
		}));

		// Send a price update to guarantee we're not stale.
		oracle = account1;
		timestamp = await currentTime();
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: synthetix.abi,
			ignoreParents: ['ExternStateToken', 'MixinResolver'],
			expected: [
				'addSynth',
				'burnSynths',
				'burnSynthsOnBehalf',
				'burnSynthsToTarget',
				'burnSynthsToTargetOnBehalf',
				'emitExchangeRebate',
				'emitExchangeReclaim',
				'emitSynthExchange',
				'exchange',
				'exchangeOnBehalf',
				'issueMaxSynths',
				'issueMaxSynthsOnBehalf',
				'issueSynths',
				'issueSynthsOnBehalf',
				'mint',
				'removeSynth',
				'settle',
				'transfer',
				'transferFrom',
				'liquidateDelinquentAccount',
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

		it('should set constructor params on upgrade to new totalSupply', async () => {
			const YEAR_2_SYNTHETIX_TOTAL_SUPPLY = web3.utils.toWei('175000000');
			const instance = await setupContract({
				contract: 'Synthetix',
				accounts,
				skipPostDeploy: true,
				args: [account1, account2, owner, YEAR_2_SYNTHETIX_TOTAL_SUPPLY, addressResolver.address],
			});

			assert.equal(await instance.proxy(), account1);
			assert.equal(await instance.tokenState(), account2);
			assert.equal(await instance.owner(), owner);
			assert.equal(await instance.totalSupply(), YEAR_2_SYNTHETIX_TOTAL_SUPPLY);
			assert.equal(await instance.resolver(), addressResolver.address);
		});
	});

	describe('adding and removing synths', () => {
		it('should allow adding a Synth contract', async () => {
			const previousSynthCount = await synthetix.availableSynthCount();

			const { token: synth } = await mockToken({
				accounts,
				synth: 'sXYZ',
				skipInitialAllocation: true,
				supply: 0,
				name: 'XYZ',
				symbol: 'XYZ',
			});

			await synthetix.addSynth(synth.address, { from: owner });

			// Assert that we've successfully added a Synth
			assert.bnEqual(
				await synthetix.availableSynthCount(),
				previousSynthCount.add(web3.utils.toBN(1))
			);
			// Assert that it's at the end of the array
			assert.equal(await synthetix.availableSynths(previousSynthCount), synth.address);
			// Assert that it's retrievable by its currencyKey
			assert.equal(await synthetix.synths(toBytes32('sXYZ')), synth.address);
		});

		it('should disallow adding a Synth contract when the user is not the owner', async () => {
			const { token: synth } = await mockToken({
				accounts,
				synth: 'sXYZ',
				skipInitialAllocation: true,
				supply: 0,
				name: 'XYZ',
				symbol: 'XYZ',
			});

			await onlyGivenAddressCanInvoke({
				fnc: synthetix.addSynth,
				accounts,
				args: [synth.address],
				address: owner,
				reason: 'Owner only function',
			});
		});

		it('should disallow double adding a Synth contract with the same address', async () => {
			const { token: synth } = await mockToken({
				accounts,
				synth: 'sXYZ',
				skipInitialAllocation: true,
				supply: 0,
				name: 'XYZ',
				symbol: 'XYZ',
			});

			await synthetix.addSynth(synth.address, { from: owner });
			await assert.revert(
				synthetix.addSynth(synth.address, { from: owner }),
				'Synth already exists'
			);
		});

		it('should disallow double adding a Synth contract with the same currencyKey', async () => {
			const { token: synth1 } = await mockToken({
				accounts,
				synth: 'sXYZ',
				skipInitialAllocation: true,
				supply: 0,
				name: 'XYZ',
				symbol: 'XYZ',
			});

			const { token: synth2 } = await mockToken({
				accounts,
				synth: 'sXYZ',
				skipInitialAllocation: true,
				supply: 0,
				name: 'XYZ',
				symbol: 'XYZ',
			});

			await synthetix.addSynth(synth1.address, { from: owner });
			await assert.revert(
				synthetix.addSynth(synth2.address, { from: owner }),
				'Synth already exists'
			);
		});

		describe('when another synth is added with 0 supply', () => {
			let currencyKey, synth;

			beforeEach(async () => {
				const symbol = 'sBTC';
				currencyKey = toBytes32(symbol);

				({ token: synth } = await mockToken({
					synth: symbol,
					accounts,
					name: 'test',
					symbol,
					supply: 0,
					skipInitialAllocation: true,
				}));

				await synthetix.addSynth(synth.address, { from: owner });
			});

			it('should allow removing a Synth contract when it has no issued balance', async () => {
				const synthCount = await synthetix.availableSynthCount();

				assert.notEqual(await synthetix.synths(currencyKey), ZERO_ADDRESS);

				await synthetix.removeSynth(currencyKey, { from: owner });

				// Assert that we have one less synth, and that the specific currency key is gone.
				assert.bnEqual(await synthetix.availableSynthCount(), synthCount.sub(web3.utils.toBN(1)));
				assert.equal(await synthetix.synths(currencyKey), ZERO_ADDRESS);
			});

			it('should disallow removing a token by a non-owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: synthetix.removeSynth,
					args: [currencyKey],
					accounts,
					address: owner,
					reason: 'Owner only function',
				});
			});

			describe('when that synth has issued', () => {
				beforeEach(async () => {
					await synth.issue(account1, toUnit('100'));
				});
				it('should disallow removing a Synth contract when it has an issued balance', async () => {
					// Assert that we can't remove the synth now
					await assert.revert(
						synthetix.removeSynth(currencyKey, { from: owner }),
						'Synth supply exists'
					);
				});
			});
		});

		it('should disallow removing a Synth contract when requested by a non-owner', async () => {
			// Note: This test depends on state in the migration script, that there are hooked up synths
			// without balances
			await assert.revert(synthetix.removeSynth(sEUR, { from: account1 }));
		});

		it('should revert when requesting to remove a non-existent synth', async () => {
			// Note: This test depends on state in the migration script, that there are hooked up synths
			// without balances
			const currencyKey = toBytes32('NOPE');

			// Assert that we can't remove the synth
			await assert.revert(synthetix.removeSynth(currencyKey, { from: owner }));
		});
	});

	describe('totalIssuedSynths()', () => {
		it('should correctly calculate the total issued synths in a single currency', async () => {
			// Send a price update to give the synth rates
			await exchangeRates.updateRates(
				[sAUD, sEUR, sETH],
				['0.5', '1.25', '100'].map(toUnit),
				timestamp,
				{ from: oracle }
			);
			// as our synths are mocks, let's issue some amount to users
			await sUSDSynth.issue(account1, toUnit('1000'));
			await sUSDSynth.issue(account2, toUnit('100'));
			await sUSDSynth.issue(account3, toUnit('10'));
			await sUSDSynth.issue(account1, toUnit('1'));

			assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('1111'));
		});

		it('should correctly calculate the total issued synths in multiple currencies', async () => {
			// Send a price update to give the synth rates
			await exchangeRates.updateRates(
				[sAUD, sEUR, sETH],
				['0.5', '1.25', '100'].map(toUnit),
				timestamp,
				{ from: oracle }
			);

			// as our synths are mocks, let's issue some amount to users

			await sUSDSynth.issue(account1, toUnit('1000'));

			await sAUDSynth.issue(account1, toUnit('1000')); // 500 sUSD worth
			await sAUDSynth.issue(account2, toUnit('1000')); // 500 sUSD worth

			await sEURSynth.issue(account3, toUnit('80')); // 100 sUSD worth

			await sETHSynth.issue(account1, toUnit('1')); // 100 sUSD worth

			assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('2200'));
		});

		it('should not allow checking total issued synths when a rate other than the priced currency is stale', async () => {
			await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));

			await exchangeRates.updateRates([SNX, sAUD], ['0.1', '0.78'].map(toUnit), timestamp, {
				from: oracle,
			});
			await assert.revert(synthetix.totalIssuedSynths(sAUD));
		});

		it('should not allow checking total issued synths when the priced currency is stale', async () => {
			await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));

			await exchangeRates.updateRates([SNX, sEUR], ['0.1', '1.25'].map(toUnit), timestamp, {
				from: oracle,
			});
			await assert.revert(synthetix.totalIssuedSynths(sAUD));
		});
	});

	describe('transfer()', () => {
		describe('when the system is suspended', () => {
			beforeEach(async () => {
				// approve for transferFrom to work
				await synthetix.approve(account1, toUnit('10'), { from: owner });
				await setStatus({ owner, systemStatus, section: 'System', suspend: true });
			});
			it('when transfer() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					synthetix.transfer(account1, toUnit('10'), { from: owner }),
					'Operation prohibited'
				);
			});
			it('when transferFrom() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					synthetix.transferFrom(owner, account2, toUnit('10'), { from: account1 }),
					'Operation prohibited'
				);
			});
			describe('when the system is resumed', () => {
				beforeEach(async () => {
					await setStatus({ owner, systemStatus, section: 'System', suspend: false });
				});
				it('when transfer() is invoked, it works as expected', async () => {
					await synthetix.transfer(account1, toUnit('10'), { from: owner });
				});
				it('when transferFrom() is invoked, it works as expected', async () => {
					await synthetix.transferFrom(owner, account2, toUnit('10'), { from: account1 });
				});
			});
		});

		beforeEach(async () => {
			// Ensure all synths have rates to allow issuance
			await updateRatesWithDefaults({ exchangeRates, oracle });
		});

		it('should transfer using the ERC20 transfer function @gasprofile', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.

			assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

			const transaction = await synthetix.transfer(account1, toUnit('10'), { from: owner });

			assert.eventEqual(transaction, 'Transfer', {
				from: owner,
				to: account1,
				value: toUnit('10'),
			});

			assert.bnEqual(await synthetix.balanceOf(account1), toUnit('10'));
		});

		it('should revert when exceeding locked synthetix and calling the ERC20 transfer function', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

			// Issue max synths.
			await synthetix.issueMaxSynths({ from: owner });

			// Try to transfer 0.000000000000000001 SNX
			await assert.revert(
				synthetix.transfer(account1, '1', { from: owner }),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			const previousOwnerBalance = await synthetix.balanceOf(owner);
			assert.bnEqual(await synthetix.totalSupply(), previousOwnerBalance);

			// Approve account1 to act on our behalf for 10 SNX.
			let transaction = await synthetix.approve(account1, toUnit('10'), { from: owner });
			assert.eventEqual(transaction, 'Approval', {
				owner: owner,
				spender: account1,
				value: toUnit('10'),
			});

			// Assert that transferFrom works.
			transaction = await synthetix.transferFrom(owner, account2, toUnit('10'), { from: account1 });

			assert.eventEqual(transaction, 'Transfer', {
				from: owner,
				to: account2,
				value: toUnit('10'),
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

		it('should revert when exceeding locked synthetix and calling the ERC20 transferFrom function', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

			// Approve account1 to act on our behalf for 10 SNX.
			const transaction = await synthetix.approve(account1, toUnit('10'), { from: owner });
			assert.eventEqual(transaction, 'Approval', {
				owner: owner,
				spender: account1,
				value: toUnit('10'),
			});

			// Issue max synths
			await synthetix.issueMaxSynths({ from: owner });

			// Assert that transferFrom fails even for the smallest amount of SNX.
			await assert.revert(
				synthetix.transferFrom(owner, account2, '1', {
					from: account1,
				}),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		it('should not allow transfer if the exchange rate for synthetix is stale', async () => {
			// Give some SNX to account1 & account2
			const value = toUnit('300');
			await synthetix.transfer(account1, toUnit('10000'), {
				from: owner,
			});
			await synthetix.transfer(account2, toUnit('10000'), {
				from: owner,
			});

			// Ensure that we can do a successful transfer before rates go stale
			await synthetix.transfer(account2, value, { from: account1 });

			await synthetix.approve(account3, value, { from: account2 });
			await synthetix.transferFrom(account2, account1, value, {
				from: account3,
			});

			// Now jump forward in time so the rates are stale
			await fastForward((await exchangeRates.rateStalePeriod()) + 1);

			// Send a price update to guarantee we're not depending on values from outside this test.

			await exchangeRates.updateRates([sAUD, sEUR], ['0.5', '1.25'].map(toUnit), timestamp, {
				from: oracle,
			});

			// Subsequent transfers fail
			await assert.revert(synthetix.transfer(account2, value, { from: account1 }));

			await synthetix.approve(account3, value, { from: account2 });
			await assert.revert(
				synthetix.transferFrom(account2, account1, value, {
					from: account3,
				}),
				'Rate stale or not a synth'
			);
		});

		it('should not allow transfer of synthetix in escrow', async () => {
			// Setup escrow
			const escrowedSynthetixs = toUnit('30000');
			await synthetix.transfer(escrow.address, escrowedSynthetixs, {
				from: owner,
			});

			// Ensure the transfer fails as all the synthetix are in escrow
			await assert.revert(
				synthetix.transfer(account2, toUnit('100'), { from: account1 }),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		it('should not be possible to transfer locked synthetix', async () => {
			const issuedSynthetixs = web3.utils.toBN('200000');
			await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			// Issue
			const amountIssued = toUnit('2000');
			await synthetix.issueSynths(amountIssued, { from: account1 });

			await assert.revert(
				synthetix.transfer(account2, toUnit(issuedSynthetixs), {
					from: account1,
				}),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		it("should lock newly received synthetix if the user's collaterisation is too high", async () => {
			// Set sEUR for purposes of this test
			const timestamp1 = await currentTime();
			await exchangeRates.updateRates([sEUR], [toUnit('0.75')], timestamp1, { from: oracle });

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

			// Ensure that the new synthetix account1 receives cannot be transferred out.
			await synthetix.transfer(account1, toUnit('10000'), {
				from: account2,
			});
			await assert.revert(synthetix.transfer(account2, toUnit('10000'), { from: account1 }));
		});

		it('should unlock synthetix when collaterisation ratio changes', async () => {
			// Set sAUD for purposes of this test
			const timestamp1 = await currentTime();
			const aud2usdrate = toUnit('2');

			await exchangeRates.updateRates([sAUD], [aud2usdrate], timestamp1, { from: oracle });

			const issuedSynthetixs = web3.utils.toBN('200000');
			await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			// Issue
			const issuedSynths = await synthetix.maxIssuableSynths(account1);
			await synthetix.issueSynths(issuedSynths, { from: account1 });
			const remainingIssuable = await getRemainingIssuableSynths(account1);
			assert.bnClose(remainingIssuable, '0');

			const transferable1 = await synthetix.transferableSynthetix(account1);
			assert.bnEqual(transferable1, '0');

			// Exchange into sAUD
			await synthetix.exchange(sUSD, issuedSynths, sAUD, { from: account1 });

			// Increase the value of sAUD relative to synthetix
			const timestamp2 = await currentTime();
			const newAUDExchangeRate = toUnit('1');
			await exchangeRates.updateRates([sAUD], [newAUDExchangeRate], timestamp2, { from: oracle });

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

	describe('debtBalance()', () => {
		beforeEach(async () => {
			// Ensure all synths have rates to allow issuance
			await updateRatesWithDefaults({ exchangeRates, oracle });
		});

		it('should not change debt balance % if exchange rates change', async () => {
			let newAUDRate = toUnit('0.5');
			let timestamp = await currentTime();
			await exchangeRates.updateRates([sAUD], [newAUDRate], timestamp, { from: oracle });

			await synthetix.transfer(account1, toUnit('20000'), {
				from: owner,
			});
			await synthetix.transfer(account2, toUnit('20000'), {
				from: owner,
			});

			const amountIssuedAcc1 = toUnit('30');
			const amountIssuedAcc2 = toUnit('50');
			await synthetix.issueSynths(amountIssuedAcc1, { from: account1 });
			await synthetix.issueSynths(amountIssuedAcc2, { from: account2 });
			await synthetix.exchange(sUSD, amountIssuedAcc2, sAUD, { from: account2 });

			const PRECISE_UNIT = web3.utils.toWei(web3.utils.toBN('1'), 'gether');
			let totalIssuedSynthsUSD = await synthetix.totalIssuedSynths(sUSD);
			const account1DebtRatio = divideDecimal(amountIssuedAcc1, totalIssuedSynthsUSD, PRECISE_UNIT);
			const account2DebtRatio = divideDecimal(amountIssuedAcc2, totalIssuedSynthsUSD, PRECISE_UNIT);

			timestamp = await currentTime();
			newAUDRate = toUnit('1.85');
			await exchangeRates.updateRates([sAUD], [newAUDRate], timestamp, { from: oracle });

			totalIssuedSynthsUSD = await synthetix.totalIssuedSynths(sUSD);
			const conversionFactor = web3.utils.toBN(1000000000);
			const expectedDebtAccount1 = multiplyDecimal(
				account1DebtRatio,
				totalIssuedSynthsUSD.mul(conversionFactor),
				PRECISE_UNIT
			).div(conversionFactor);
			const expectedDebtAccount2 = multiplyDecimal(
				account2DebtRatio,
				totalIssuedSynthsUSD.mul(conversionFactor),
				PRECISE_UNIT
			).div(conversionFactor);

			assert.bnClose(await synthetix.debtBalanceOf(account1, sUSD), expectedDebtAccount1);
			assert.bnClose(await synthetix.debtBalanceOf(account2, sUSD), expectedDebtAccount2);
		});

		it("should correctly calculate a user's debt balance without prior issuance", async () => {
			await synthetix.transfer(account1, toUnit('200000'), {
				from: owner,
			});
			await synthetix.transfer(account2, toUnit('10000'), {
				from: owner,
			});

			const debt1 = await synthetix.debtBalanceOf(account1, toBytes32('sUSD'));
			const debt2 = await synthetix.debtBalanceOf(account2, toBytes32('sUSD'));
			assert.bnEqual(debt1, 0);
			assert.bnEqual(debt2, 0);
		});

		it("should correctly calculate a user's debt balance with prior issuance", async () => {
			// Give some SNX to account1
			await synthetix.transfer(account1, toUnit('200000'), {
				from: owner,
			});

			// Issue
			const issuedSynths = toUnit('1001');
			await synthetix.issueSynths(issuedSynths, { from: account1 });

			const debt = await synthetix.debtBalanceOf(account1, toBytes32('sUSD'));
			assert.bnEqual(debt, issuedSynths);
		});
	});

	describe('maxIssuableSynths()', () => {
		beforeEach(async () => {
			// Ensure all synths have rates to allow issuance
			await updateRatesWithDefaults({ exchangeRates, oracle });
		});

		it("should correctly calculate a user's maximum issuable synths without prior issuance", async () => {
			const rate = await exchangeRates.rateForCurrency(toBytes32('SNX'));
			const issuedSynthetixs = web3.utils.toBN('200000');
			await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});
			const issuanceRatio = await synthetixState.issuanceRatio();

			const expectedIssuableSynths = multiplyDecimal(
				toUnit(issuedSynthetixs),
				multiplyDecimal(rate, issuanceRatio)
			);
			const maxIssuableSynths = await synthetix.maxIssuableSynths(account1);

			assert.bnEqual(expectedIssuableSynths, maxIssuableSynths);
		});

		it("should correctly calculate a user's maximum issuable synths without any SNX", async () => {
			const maxIssuableSynths = await synthetix.maxIssuableSynths(account1);
			assert.bnEqual(0, maxIssuableSynths);
		});

		it("should correctly calculate a user's maximum issuable synths with prior issuance", async () => {
			const snx2usdRate = await exchangeRates.rateForCurrency(SNX);

			const issuedSynthetixs = web3.utils.toBN('320001');
			await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			const issuanceRatio = await synthetixState.issuanceRatio();
			const amountIssued = web3.utils.toBN('1234');
			await synthetix.issueSynths(toUnit(amountIssued), { from: account1 });

			const expectedIssuableSynths = multiplyDecimal(
				toUnit(issuedSynthetixs),
				multiplyDecimal(snx2usdRate, issuanceRatio)
			);

			const maxIssuableSynths = await synthetix.maxIssuableSynths(account1);
			assert.bnEqual(expectedIssuableSynths, maxIssuableSynths);
		});

		it('should error when calculating maximum issuance when the SNX rate is stale', async () => {
			// Add stale period to the time to ensure we go stale.
			await fastForward((await exchangeRates.rateStalePeriod()) + 1);

			await exchangeRates.updateRates([sAUD, sEUR], ['0.5', '1.25'].map(toUnit), timestamp, {
				from: oracle,
			});

			await assert.revert(synthetix.maxIssuableSynths(account1));
		});

		it('should error when calculating maximum issuance when the currency rate is stale', async () => {
			// Add stale period to the time to ensure we go stale.
			await fastForward((await exchangeRates.rateStalePeriod()) + 1);

			await exchangeRates.updateRates([sEUR, SNX], ['1.25', '0.12'].map(toUnit), timestamp, {
				from: oracle,
			});

			await assert.revert(synthetix.maxIssuableSynths(account1));
		});
	});

	describe('remainingIssuableSynths()', () => {
		beforeEach(async () => {
			// Ensure all synths have rates to allow issuance
			await updateRatesWithDefaults({ exchangeRates, oracle });
		});

		it("should correctly calculate a user's remaining issuable synths with prior issuance", async () => {
			const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
			const issuanceRatio = await synthetixState.issuanceRatio();

			const issuedSynthetixs = web3.utils.toBN('200012');
			await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			// Issue
			const amountIssued = toUnit('2011');
			await synthetix.issueSynths(amountIssued, { from: account1 });

			const expectedIssuableSynths = multiplyDecimal(
				toUnit(issuedSynthetixs),
				multiplyDecimal(snx2usdRate, issuanceRatio)
			).sub(amountIssued);

			const remainingIssuable = await getRemainingIssuableSynths(account1);
			assert.bnEqual(remainingIssuable, expectedIssuableSynths);
		});

		it("should correctly calculate a user's remaining issuable synths without prior issuance", async () => {
			const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
			const issuanceRatio = await synthetixState.issuanceRatio();

			const issuedSynthetixs = web3.utils.toBN('20');
			await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			const expectedIssuableSynths = multiplyDecimal(
				toUnit(issuedSynthetixs),
				multiplyDecimal(snx2usdRate, issuanceRatio)
			);

			const remainingIssuable = await getRemainingIssuableSynths(account1);
			assert.bnEqual(remainingIssuable, expectedIssuableSynths);
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
				await updateRatesWithDefaults({ exchangeRates, oracle });
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
			await updateRatesWithDefaults({ exchangeRates, oracle });

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
			await updateRatesWithDefaults({ exchangeRates, oracle });

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
			await updateRatesWithDefaults({ exchangeRates, oracle });

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
			await updateRatesWithDefaults({ exchangeRates, oracle });

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
			await updateRatesWithDefaults({ exchangeRates, oracle });

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
			await updateRatesWithDefaults({ exchangeRates, oracle });

			let existingTotalSupply = await synthetix.totalSupply();
			let mintableSupply = await supplySchedule.mintableSupply();

			// call mint on Synthetix
			await synthetix.mint();

			let newTotalSupply = await synthetix.totalSupply();
			assert.bnEqual(newTotalSupply, existingTotalSupply.add(mintableSupply));

			// fast forward EVM to Week 4
			const weekFour = weekThree + 1 * WEEK + 1 * DAY;
			await fastForwardTo(new Date(weekFour * 1000));
			await updateRatesWithDefaults({ exchangeRates, oracle });

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
			await updateRatesWithDefaults({ exchangeRates, oracle });

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

	describe('when etherCollateral is set', async () => {
		const collateralKey = 'EtherCollateral';

		beforeEach(async () => {
			// Ensure all synths have rates to allow issuance
			await updateRatesWithDefaults({ exchangeRates, oracle });
		});
		it('should have zero totalIssuedSynths', async () => {
			// totalIssuedSynthsExcludeEtherCollateral equal totalIssuedSynths
			assert.bnEqual(
				await synthetix.totalIssuedSynths(sUSD),
				await synthetix.totalIssuedSynthsExcludeEtherCollateral(sUSD)
			);
		});
		describe('creating a loan on etherCollateral to issue sETH', async () => {
			beforeEach(async () => {
				// mock etherCollateral
				etherCollateral = await MockEtherCollateral.new({ from: owner });
				// have the owner simulate being MultiCollateral so we can invoke issue and burn
				await addressResolver.importAddresses(
					[toBytes32(collateralKey)],
					[etherCollateral.address],
					{ from: owner }
				);

				// Give some SNX to account1
				await synthetix.transfer(account1, toUnit('1000'), { from: owner });

				// account1 should be able to issue
				await synthetix.issueSynths(toUnit('10'), { from: account1 });

				// set owner as Synthetix on resolver to allow issuing by owner
				await addressResolver.importAddresses([toBytes32('Synthetix')], [owner], { from: owner });

				await synthetix.setResolverAndSyncCache(addressResolver.address, { from: owner });
			});

			it('should be able to exclude sETH issued by ether Collateral from totalIssuedSynths', async () => {
				const totalSupplyBefore = await synthetix.totalIssuedSynths(sETH);

				// issue sETH
				const amountToIssue = toUnit('10');
				await sETHSynth.issue(account1, amountToIssue, { from: owner });

				// openLoan of same amount on Ether Collateral
				await etherCollateral.openLoan(amountToIssue, { from: owner });

				// totalSupply of synths should exclude Ether Collateral issued synths
				assert.bnEqual(
					totalSupplyBefore,
					await synthetix.totalIssuedSynthsExcludeEtherCollateral(sETH)
				);

				// totalIssuedSynths after includes amount issued
				assert.bnEqual(
					await synthetix.totalIssuedSynths(sETH),
					totalSupplyBefore.add(amountToIssue)
				);
			});

			it('should exclude sETH issued by ether Collateral from debtBalanceOf', async () => {
				// account1 should own 100% of the debt.
				const debtBefore = await synthetix.debtBalanceOf(account1, sUSD);
				assert.bnEqual(debtBefore, toUnit('10'));

				// issue sETH to mimic loan
				const amountToIssue = toUnit('10');
				await sETHSynth.issue(account1, amountToIssue, { from: owner });
				await etherCollateral.openLoan(amountToIssue, { from: owner });

				// After account1 owns 100% of sUSD debt.
				assert.bnEqual(await synthetix.totalIssuedSynthsExcludeEtherCollateral(sUSD), toUnit('10'));
				assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), debtBefore);
			});
		});
	});
});
