'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { smockit } = require('@eth-optimism/smock');

require('./common'); // import common test scaffolding

const { setupContract, setupAllContracts } = require('./setup');

const { currentTime, fastForward, toUnit } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	updateRatesWithDefaults,
	setStatus,
} = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('BaseSynthetix', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, sETH] = ['sUSD', 'sAUD', 'sEUR', 'SNX', 'sETH'].map(toBytes32);

	const [, owner, account1, account2, account3] = accounts;

	let baseSynthetix,
		exchangeRates,
		debtCache,
		escrow,
		oracle,
		timestamp,
		addressResolver,
		systemSettings,
		systemStatus;

	before(async () => {
		({
			Synthetix: baseSynthetix,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			SystemSettings: systemSettings,
			DebtCache: debtCache,
			SystemStatus: systemStatus,
			SynthetixEscrow: escrow,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sETH', 'sEUR', 'sAUD'],
			contracts: [
				'BaseSynthetix',
				'SynthetixState',
				'SupplySchedule',
				'AddressResolver',
				'ExchangeRates',
				'SystemSettings',
				'SystemStatus',
				'DebtCache',
				'Issuer',
				'Exchanger',
				'RewardsDistribution',
				'CollateralManager',
				'RewardEscrowV2', // required for collateral check in issuer
			],
		}));

		// Send a price update to guarantee we're not stale.
		oracle = account1;
		timestamp = await currentTime();
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: baseSynthetix.abi,
			ignoreParents: ['ExternStateToken', 'MixinResolver'],
			expected: [
				'burnSecondary',
				'burnSynths',
				'burnSynthsOnBehalf',
				'burnSynthsToTarget',
				'burnSynthsToTargetOnBehalf',
				'emitSynthExchange',
				'emitExchangeRebate',
				'emitExchangeReclaim',
				'emitExchangeTracking',
				'exchange',
				'exchangeAtomically',
				'exchangeOnBehalf',
				'exchangeOnBehalfWithTracking',
				'exchangeWithTracking',
				'exchangeWithTrackingForInitiator',
				'exchangeWithVirtual',
				'issueMaxSynths',
				'issueMaxSynthsOnBehalf',
				'issueSynths',
				'issueSynthsOnBehalf',
				'mint',
				'mintSecondary',
				'mintSecondaryRewards',
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
				contract: 'BaseSynthetix',
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
				contract: 'BaseSynthetix',
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

	describe('non-basic functions always revert', () => {
		const amount = 100;
		it('exchangeWithVirtual should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.exchangeWithVirtual,
				accounts,
				args: [sUSD, amount, sAUD, toBytes32('AGGREGATOR')],
				reason: 'Cannot be run on this layer',
			});
		});

		it('exchangeWithTrackingForInitiator should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.exchangeWithTrackingForInitiator,
				accounts,
				args: [sUSD, amount, sAUD, owner, toBytes32('AGGREGATOR')],
				reason: 'Cannot be run on this layer',
			});
		});

		it('ExchangeAtomically should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.exchangeAtomically,
				accounts,
				args: [sUSD, amount, sETH, toBytes32('AGGREGATOR')],
				reason: 'Cannot be run on this layer',
			});
		});

		it('mint should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.mint,
				accounts,
				args: [],
				reason: 'Cannot be run on this layer',
			});
		});

		it('mintSecondary should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.mintSecondary,
				accounts,
				args: [account1, amount],
				reason: 'Cannot be run on this layer',
			});
		});
		it('mintSecondaryRewards should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.mintSecondaryRewards,
				accounts,
				args: [amount],
				reason: 'Cannot be run on this layer',
			});
		});
		it('burnSecondary should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.burnSecondary,
				accounts,
				args: [account1, amount],
				reason: 'Cannot be run on this layer',
			});
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
				fnc: baseSynthetix.emitExchangeTracking,
				accounts,
				args: [trackingCode, currencyKey1, amount1, amount2],
				reason: 'Only Exchanger can invoke this',
			});
		});
		it('emitExchangeRebate() cannot be invoked directly by any account', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.emitExchangeRebate,
				accounts,
				args: [account1, currencyKey1, amount1],
				reason: 'Only Exchanger can invoke this',
			});
		});
		it('emitExchangeReclaim() cannot be invoked directly by any account', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.emitExchangeReclaim,
				accounts,
				args: [account1, currencyKey1, amount1],
				reason: 'Only Exchanger can invoke this',
			});
		});
		it('emitSynthExchange() cannot be invoked directly by any account', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetix.emitSynthExchange,
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
				await baseSynthetix.rebuildCache();
			});
			beforeEach('call event emission functions', async () => {
				tx1 = await baseSynthetix.emitExchangeRebate(account1, currencyKey1, amount1, {
					from: exchanger,
				});
				tx2 = await baseSynthetix.emitExchangeReclaim(account1, currencyKey1, amount1, {
					from: exchanger,
				});
				tx3 = await baseSynthetix.emitSynthExchange(
					account1,
					currencyKey1,
					amount1,
					currencyKey2,
					amount2,
					account2,
					{ from: exchanger }
				);
				tx4 = await baseSynthetix.emitExchangeTracking(
					trackingCode,
					currencyKey1,
					amount1,
					amount2,
					{ from: exchanger }
				);
			});

			it('the corresponding events are emitted', async () => {
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
						fee: amount2,
					});
				});
			});
		});
	});

	describe('Exchanger calls', () => {
		let smockExchanger;
		beforeEach(async () => {
			smockExchanger = await smockit(artifacts.require('Exchanger').abi);
			smockExchanger.smocked.exchange.will.return.with(() => ['1', ZERO_ADDRESS]);
			smockExchanger.smocked.settle.will.return.with(() => ['1', '2', '3']);
			await addressResolver.importAddresses(
				['Exchanger'].map(toBytes32),
				[smockExchanger.address],
				{ from: owner }
			);
			await baseSynthetix.rebuildCache();
		});

		const amount1 = '10';
		const currencyKey1 = sAUD;
		const currencyKey2 = sEUR;
		const msgSender = owner;
		const trackingCode = toBytes32('1inch');

		it('exchangeOnBehalf is called with the right arguments ', async () => {
			await baseSynthetix.exchangeOnBehalf(account1, currencyKey1, amount1, currencyKey2, {
				from: msgSender,
			});
			assert.equal(smockExchanger.smocked.exchange.calls[0][0], account1);
			assert.equal(smockExchanger.smocked.exchange.calls[0][1], msgSender);
			assert.equal(smockExchanger.smocked.exchange.calls[0][2], currencyKey1);
			assert.equal(smockExchanger.smocked.exchange.calls[0][3].toString(), amount1);
			assert.equal(smockExchanger.smocked.exchange.calls[0][4], currencyKey2);
			assert.equal(smockExchanger.smocked.exchange.calls[0][5], account1);
			assert.equal(smockExchanger.smocked.exchange.calls[0][6], false);
			assert.equal(smockExchanger.smocked.exchange.calls[0][7], account1);
			assert.equal(smockExchanger.smocked.exchange.calls[0][8], toBytes32(''));
		});

		it('exchangeWithTracking is called with the right arguments ', async () => {
			await baseSynthetix.exchangeWithTracking(
				currencyKey1,
				amount1,
				currencyKey2,
				account2,
				trackingCode,
				{ from: msgSender }
			);
			assert.equal(smockExchanger.smocked.exchange.calls[0][0], msgSender);
			assert.equal(smockExchanger.smocked.exchange.calls[0][1], msgSender);
			assert.equal(smockExchanger.smocked.exchange.calls[0][2], currencyKey1);
			assert.equal(smockExchanger.smocked.exchange.calls[0][3].toString(), amount1);
			assert.equal(smockExchanger.smocked.exchange.calls[0][4], currencyKey2);
			assert.equal(smockExchanger.smocked.exchange.calls[0][5], msgSender);
			assert.equal(smockExchanger.smocked.exchange.calls[0][6], false);
			assert.equal(smockExchanger.smocked.exchange.calls[0][7], account2);
			assert.equal(smockExchanger.smocked.exchange.calls[0][8], trackingCode);
		});

		it('exchangeOnBehalfWithTracking is called with the right arguments ', async () => {
			await baseSynthetix.exchangeOnBehalfWithTracking(
				account1,
				currencyKey1,
				amount1,
				currencyKey2,
				account2,
				trackingCode,
				{ from: owner }
			);
			assert.equal(smockExchanger.smocked.exchange.calls[0][0], account1);
			assert.equal(smockExchanger.smocked.exchange.calls[0][1], msgSender);
			assert.equal(smockExchanger.smocked.exchange.calls[0][2], currencyKey1);
			assert.equal(smockExchanger.smocked.exchange.calls[0][3].toString(), amount1);
			assert.equal(smockExchanger.smocked.exchange.calls[0][4], currencyKey2);
			assert.equal(smockExchanger.smocked.exchange.calls[0][5], account1);

			assert.equal(smockExchanger.smocked.exchange.calls[0][6], false);
			assert.equal(smockExchanger.smocked.exchange.calls[0][7], account2);
			assert.equal(smockExchanger.smocked.exchange.calls[0][8], trackingCode);
		});

		it('settle is called with the right arguments ', async () => {
			await baseSynthetix.settle(currencyKey1, {
				from: owner,
			});
			assert.equal(smockExchanger.smocked.settle.calls[0][0], msgSender);
			assert.equal(smockExchanger.smocked.settle.calls[0][1].toString(), currencyKey1);
		});
	});

	describe('isWaitingPeriod()', () => {
		it('returns false by default', async () => {
			assert.isFalse(await baseSynthetix.isWaitingPeriod(sETH));
		});
		describe('when a user has exchanged into sETH', () => {
			beforeEach(async () => {
				await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });

				await baseSynthetix.issueSynths(toUnit('100'), { from: owner });
				await baseSynthetix.exchange(sUSD, toUnit('10'), sETH, { from: owner });
			});
			it('then waiting period is true', async () => {
				assert.isTrue(await baseSynthetix.isWaitingPeriod(sETH));
			});
			describe('when the waiting period expires', () => {
				beforeEach(async () => {
					await fastForward(await systemSettings.waitingPeriodSecs());
				});
				it('returns false by default', async () => {
					assert.isFalse(await baseSynthetix.isWaitingPeriod(sETH));
				});
			});
		});
	});

	describe('anySynthOrSNXRateIsInvalid()', () => {
		it('should have stale rates initially', async () => {
			assert.equal(await baseSynthetix.anySynthOrSNXRateIsInvalid(), true);
		});
		describe('when synth rates set', () => {
			beforeEach(async () => {
				// fast forward to get past initial SNX setting
				await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));

				timestamp = await currentTime();

				await exchangeRates.updateRates(
					[sAUD, sEUR, sETH],
					['0.5', '1.25', '100'].map(toUnit),
					timestamp,
					{ from: oracle }
				);
				await debtCache.takeDebtSnapshot();
			});
			it('should still have stale rates', async () => {
				assert.equal(await baseSynthetix.anySynthOrSNXRateIsInvalid(), true);
			});
			describe('when SNX is also set', () => {
				beforeEach(async () => {
					timestamp = await currentTime();

					await exchangeRates.updateRates([SNX], ['1'].map(toUnit), timestamp, { from: oracle });
				});
				it('then no stale rates', async () => {
					assert.equal(await baseSynthetix.anySynthOrSNXRateIsInvalid(), false);
				});

				describe('when only some synths are updated', () => {
					beforeEach(async () => {
						await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));

						timestamp = await currentTime();

						await exchangeRates.updateRates([SNX, sAUD], ['0.1', '0.78'].map(toUnit), timestamp, {
							from: oracle,
						});
					});

					it('then anySynthOrSNXRateIsInvalid() returns true', async () => {
						assert.equal(await baseSynthetix.anySynthOrSNXRateIsInvalid(), true);
					});
				});
			});
		});
	});

	describe('availableCurrencyKeys()', () => {
		it('returns all currency keys by default', async () => {
			assert.deepEqual(await baseSynthetix.availableCurrencyKeys(), [sUSD, sETH, sEUR, sAUD]);
		});
	});

	describe('isWaitingPeriod()', () => {
		it('returns false by default', async () => {
			assert.isFalse(await baseSynthetix.isWaitingPeriod(sETH));
		});
	});

	describe('transfer()', () => {
		describe('when the system is suspended', () => {
			beforeEach(async () => {
				// approve for transferFrom to work
				await baseSynthetix.approve(account1, toUnit('10'), { from: owner });
				await setStatus({ owner, systemStatus, section: 'System', suspend: true });
			});
			it('when transfer() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					baseSynthetix.transfer(account1, toUnit('10'), { from: owner }),
					'Operation prohibited'
				);
			});
			it('when transferFrom() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					baseSynthetix.transferFrom(owner, account2, toUnit('10'), { from: account1 }),
					'Operation prohibited'
				);
			});
			describe('when the system is resumed', () => {
				beforeEach(async () => {
					await setStatus({ owner, systemStatus, section: 'System', suspend: false });
				});
				it('when transfer() is invoked, it works as expected', async () => {
					await baseSynthetix.transfer(account1, toUnit('10'), { from: owner });
				});
				it('when transferFrom() is invoked, it works as expected', async () => {
					await baseSynthetix.transferFrom(owner, account2, toUnit('10'), { from: account1 });
				});
			});
		});

		beforeEach(async () => {
			// Ensure all synths have rates to allow issuance
			await updateRatesWithDefaults({ exchangeRates, oracle, debtCache });
		});

		it('should transfer using the ERC20 transfer function @gasprofile', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.

			assert.bnEqual(await baseSynthetix.totalSupply(), await baseSynthetix.balanceOf(owner));

			const transaction = await baseSynthetix.transfer(account1, toUnit('10'), { from: owner });

			assert.eventEqual(transaction, 'Transfer', {
				from: owner,
				to: account1,
				value: toUnit('10'),
			});

			assert.bnEqual(await baseSynthetix.balanceOf(account1), toUnit('10'));
		});

		it('should revert when exceeding locked synthetix and calling the ERC20 transfer function', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			assert.bnEqual(await baseSynthetix.totalSupply(), await baseSynthetix.balanceOf(owner));

			// Issue max synths.
			await baseSynthetix.issueMaxSynths({ from: owner });

			// Try to transfer 0.000000000000000001 SNX
			await assert.revert(
				baseSynthetix.transfer(account1, '1', { from: owner }),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			const previousOwnerBalance = await baseSynthetix.balanceOf(owner);
			assert.bnEqual(await baseSynthetix.totalSupply(), previousOwnerBalance);

			// Approve account1 to act on our behalf for 10 SNX.
			let transaction = await baseSynthetix.approve(account1, toUnit('10'), { from: owner });
			assert.eventEqual(transaction, 'Approval', {
				owner: owner,
				spender: account1,
				value: toUnit('10'),
			});

			// Assert that transferFrom works.
			transaction = await baseSynthetix.transferFrom(owner, account2, toUnit('10'), {
				from: account1,
			});

			assert.eventEqual(transaction, 'Transfer', {
				from: owner,
				to: account2,
				value: toUnit('10'),
			});

			// Assert that account2 has 10 SNX and owner has 10 less SNX
			assert.bnEqual(await baseSynthetix.balanceOf(account2), toUnit('10'));
			assert.bnEqual(await baseSynthetix.balanceOf(owner), previousOwnerBalance.sub(toUnit('10')));

			// Assert that we can't transfer more even though there's a balance for owner.
			await assert.revert(
				baseSynthetix.transferFrom(owner, account2, '1', {
					from: account1,
				})
			);
		});

		it('should revert when exceeding locked synthetix and calling the ERC20 transferFrom function', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			assert.bnEqual(await baseSynthetix.totalSupply(), await baseSynthetix.balanceOf(owner));

			// Approve account1 to act on our behalf for 10 SNX.
			const transaction = await baseSynthetix.approve(account1, toUnit('10'), { from: owner });
			assert.eventEqual(transaction, 'Approval', {
				owner: owner,
				spender: account1,
				value: toUnit('10'),
			});

			// Issue max synths
			await baseSynthetix.issueMaxSynths({ from: owner });

			// Assert that transferFrom fails even for the smallest amount of SNX.
			await assert.revert(
				baseSynthetix.transferFrom(owner, account2, '1', {
					from: account1,
				}),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		describe('when the user has issued some sUSD and exchanged for other synths', () => {
			beforeEach(async () => {
				await baseSynthetix.issueSynths(toUnit('100'), { from: owner });
				await baseSynthetix.exchange(sUSD, toUnit('10'), sETH, { from: owner });
				await baseSynthetix.exchange(sUSD, toUnit('10'), sAUD, { from: owner });
				await baseSynthetix.exchange(sUSD, toUnit('10'), sEUR, { from: owner });
			});
			it('should transfer using the ERC20 transfer function @gasprofile', async () => {
				await baseSynthetix.transfer(account1, toUnit('10'), { from: owner });

				assert.bnEqual(await baseSynthetix.balanceOf(account1), toUnit('10'));
			});

			it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
				const previousOwnerBalance = await baseSynthetix.balanceOf(owner);

				// Approve account1 to act on our behalf for 10 SNX.
				await baseSynthetix.approve(account1, toUnit('10'), { from: owner });

				// Assert that transferFrom works.
				await baseSynthetix.transferFrom(owner, account2, toUnit('10'), {
					from: account1,
				});

				// Assert that account2 has 10 SNX and owner has 10 less SNX
				assert.bnEqual(await baseSynthetix.balanceOf(account2), toUnit('10'));
				assert.bnEqual(
					await baseSynthetix.balanceOf(owner),
					previousOwnerBalance.sub(toUnit('10'))
				);

				// Assert that we can't transfer more even though there's a balance for owner.
				await assert.revert(
					baseSynthetix.transferFrom(owner, account2, '1', {
						from: account1,
					})
				);
			});
		});

		describe('rates stale for transfers', () => {
			const value = toUnit('300');
			const ensureTransferReverts = async () => {
				await assert.revert(
					baseSynthetix.transfer(account2, value, { from: account1 }),
					'A synth or SNX rate is invalid'
				);
				await assert.revert(
					baseSynthetix.transferFrom(account2, account1, value, {
						from: account3,
					}),
					'A synth or SNX rate is invalid'
				);
			};

			beforeEach(async () => {
				// Give some SNX to account1 & account2
				await baseSynthetix.transfer(account1, toUnit('10000'), {
					from: owner,
				});
				await baseSynthetix.transfer(account2, toUnit('10000'), {
					from: owner,
				});

				// Ensure that we can do a successful transfer before rates go stale
				await baseSynthetix.transfer(account2, value, { from: account1 });

				// approve account3 to transferFrom account2
				await baseSynthetix.approve(account3, toUnit('10000'), { from: account2 });
				await baseSynthetix.transferFrom(account2, account1, value, {
					from: account3,
				});
			});

			describe('when the user has a debt position', () => {
				beforeEach(async () => {
					// ensure the accounts have a debt position
					await Promise.all([
						baseSynthetix.issueSynths(toUnit('1'), { from: account1 }),
						baseSynthetix.issueSynths(toUnit('1'), { from: account2 }),
					]);

					// Now jump forward in time so the rates are stale
					await fastForward((await exchangeRates.rateStalePeriod()) + 1);
				});
				it('should not allow transfer if the exchange rate for SNX is stale', async () => {
					await ensureTransferReverts();

					const timestamp = await currentTime();

					// now give some synth rates
					await exchangeRates.updateRates([sAUD, sEUR], ['0.5', '1.25'].map(toUnit), timestamp, {
						from: oracle,
					});
					await debtCache.takeDebtSnapshot();

					await ensureTransferReverts();

					// the remainder of the synths have prices
					await exchangeRates.updateRates([sETH], ['100'].map(toUnit), timestamp, {
						from: oracle,
					});
					await debtCache.takeDebtSnapshot();

					await ensureTransferReverts();

					// now give SNX rate
					await exchangeRates.updateRates([SNX], ['1'].map(toUnit), timestamp, {
						from: oracle,
					});

					// now SNX transfer should work
					await baseSynthetix.transfer(account2, value, { from: account1 });
					await baseSynthetix.transferFrom(account2, account1, value, {
						from: account3,
					});
				});

				it('should not allow transfer if the exchange rate for any synth is stale', async () => {
					await ensureTransferReverts();

					const timestamp = await currentTime();

					// now give SNX rate
					await exchangeRates.updateRates([SNX], ['1'].map(toUnit), timestamp, {
						from: oracle,
					});
					await debtCache.takeDebtSnapshot();

					await ensureTransferReverts();

					// now give some synth rates
					await exchangeRates.updateRates([sAUD, sEUR], ['0.5', '1.25'].map(toUnit), timestamp, {
						from: oracle,
					});
					await debtCache.takeDebtSnapshot();

					await ensureTransferReverts();

					// now give the remainder of synths rates
					await exchangeRates.updateRates([sETH], ['100'].map(toUnit), timestamp, {
						from: oracle,
					});
					await debtCache.takeDebtSnapshot();

					// now SNX transfer should work
					await baseSynthetix.transfer(account2, value, { from: account1 });
					await baseSynthetix.transferFrom(account2, account1, value, {
						from: account3,
					});
				});
			});

			describe('when the user has no debt', () => {
				it('should allow transfer if the exchange rate for SNX is stale', async () => {
					// SNX transfer should work
					await baseSynthetix.transfer(account2, value, { from: account1 });
					await baseSynthetix.transferFrom(account2, account1, value, {
						from: account3,
					});
				});

				it('should allow transfer if the exchange rate for any synth is stale', async () => {
					// now SNX transfer should work
					await baseSynthetix.transfer(account2, value, { from: account1 });
					await baseSynthetix.transferFrom(account2, account1, value, {
						from: account3,
					});
				});
			});
		});

		describe('when the user holds SNX', () => {
			beforeEach(async () => {
				await baseSynthetix.transfer(account1, toUnit('1000'), {
					from: owner,
				});
			});

			describe('and has an escrow entry', () => {
				beforeEach(async () => {
					// Setup escrow
					const escrowedSynthetixs = toUnit('30000');
					await baseSynthetix.transfer(escrow.address, escrowedSynthetixs, {
						from: owner,
					});
				});

				it('should allow transfer of synthetix by default', async () => {
					await baseSynthetix.transfer(account2, toUnit('100'), { from: account1 });
				});

				describe('when the user has a debt position (i.e. has issued)', () => {
					beforeEach(async () => {
						await baseSynthetix.issueSynths(toUnit('10'), { from: account1 });
					});

					it('should not allow transfer of synthetix in escrow', async () => {
						// Ensure the transfer fails as all the synthetix are in escrow
						await assert.revert(
							baseSynthetix.transfer(account2, toUnit('990'), { from: account1 }),
							'Cannot transfer staked or escrowed SNX'
						);
					});
				});
			});
		});

		it('should not be possible to transfer locked synthetix', async () => {
			const issuedSynthetixs = web3.utils.toBN('200000');
			await baseSynthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			// Issue
			const amountIssued = toUnit('2000');
			await baseSynthetix.issueSynths(amountIssued, { from: account1 });

			await assert.revert(
				baseSynthetix.transfer(account2, toUnit(issuedSynthetixs), {
					from: account1,
				}),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		it("should lock newly received synthetix if the user's collaterisation is too high", async () => {
			// Set sEUR for purposes of this test
			const timestamp1 = await currentTime();
			await exchangeRates.updateRates([sEUR], [toUnit('0.75')], timestamp1, { from: oracle });
			await debtCache.takeDebtSnapshot();

			const issuedSynthetixs = web3.utils.toBN('200000');
			await baseSynthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});
			await baseSynthetix.transfer(account2, toUnit(issuedSynthetixs), {
				from: owner,
			});

			const maxIssuableSynths = await baseSynthetix.maxIssuableSynths(account1);

			// Issue
			await baseSynthetix.issueSynths(maxIssuableSynths, { from: account1 });

			// Exchange into sEUR
			await baseSynthetix.exchange(sUSD, maxIssuableSynths, sEUR, { from: account1 });

			// Ensure that we can transfer in and out of the account successfully
			await baseSynthetix.transfer(account1, toUnit('10000'), {
				from: account2,
			});
			await baseSynthetix.transfer(account2, toUnit('10000'), {
				from: account1,
			});

			// Increase the value of sEUR relative to synthetix
			const timestamp2 = await currentTime();
			await exchangeRates.updateRates([sEUR], [toUnit('2.10')], timestamp2, { from: oracle });
			await debtCache.takeDebtSnapshot();

			// Ensure that the new synthetix account1 receives cannot be transferred out.
			await baseSynthetix.transfer(account1, toUnit('10000'), {
				from: account2,
			});
			await assert.revert(baseSynthetix.transfer(account2, toUnit('10000'), { from: account1 }));
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
			await baseSynthetix.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			// Issue
			const issuedSynths = await baseSynthetix.maxIssuableSynths(account1);
			await baseSynthetix.issueSynths(issuedSynths, { from: account1 });
			const remainingIssuable = (await baseSynthetix.remainingIssuableSynths(account1))[0];

			assert.bnClose(remainingIssuable, '0');

			const transferable1 = await baseSynthetix.transferableSynthetix(account1);
			assert.bnEqual(transferable1, '0');

			// Exchange into sAUD
			await baseSynthetix.exchange(sUSD, issuedSynths, sAUD, { from: account1 });

			// Increase the value of sAUD relative to synthetix
			const timestamp2 = await currentTime();
			const newAUDExchangeRate = toUnit('1');
			await exchangeRates.updateRates([sAUD], [newAUDExchangeRate], timestamp2, { from: oracle });
			await debtCache.takeDebtSnapshot();

			const transferable2 = await baseSynthetix.transferableSynthetix(account1);
			assert.equal(transferable2.gt(toUnit('1000')), true);
		});

		describe('when the user has issued some sUSD and exchanged for other synths', () => {
			beforeEach(async () => {
				await baseSynthetix.issueSynths(toUnit('100'), { from: owner });
				await baseSynthetix.exchange(sUSD, toUnit('10'), sETH, { from: owner });
				await baseSynthetix.exchange(sUSD, toUnit('10'), sAUD, { from: owner });
				await baseSynthetix.exchange(sUSD, toUnit('10'), sEUR, { from: owner });
			});
			it('should transfer using the ERC20 transfer function @gasprofile', async () => {
				await baseSynthetix.transfer(account1, toUnit('10'), { from: owner });

				assert.bnEqual(await baseSynthetix.balanceOf(account1), toUnit('10'));
			});

			it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
				const previousOwnerBalance = await baseSynthetix.balanceOf(owner);

				// Approve account1 to act on our behalf for 10 SNX.
				await baseSynthetix.approve(account1, toUnit('10'), { from: owner });

				// Assert that transferFrom works.
				await baseSynthetix.transferFrom(owner, account2, toUnit('10'), {
					from: account1,
				});

				// Assert that account2 has 10 SNX and owner has 10 less SNX
				assert.bnEqual(await baseSynthetix.balanceOf(account2), toUnit('10'));
				assert.bnEqual(
					await baseSynthetix.balanceOf(owner),
					previousOwnerBalance.sub(toUnit('10'))
				);

				// Assert that we can't transfer more even though there's a balance for owner.
				await assert.revert(
					baseSynthetix.transferFrom(owner, account2, '1', {
						from: account1,
					})
				);
			});
		});
	});
});
