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
	setupPriceAggregators,
	updateAggregatorRates,
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

	let baseSynthetixImpl,
		baseSynthetixProxy,
		exchangeRates,
		debtCache,
		escrow,
		addressResolver,
		systemSettings,
		systemStatus,
		circuitBreaker,
		aggregatorDebtRatio;

	before(async () => {
		({
			Synthetix: baseSynthetixImpl,
			ProxyERC20BaseSynthetix: baseSynthetixProxy,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			SystemSettings: systemSettings,
			DebtCache: debtCache,
			SystemStatus: systemStatus,
			CircuitBreaker: circuitBreaker,
			SynthetixEscrow: escrow,
			'ext:AggregatorDebtRatio': aggregatorDebtRatio,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sETH', 'sEUR', 'sAUD'],
			contracts: [
				'BaseSynthetix',
				'SupplySchedule',
				'AddressResolver',
				'ExchangeRates',
				'SystemSettings',
				'SystemStatus',
				'DebtCache',
				'Issuer',
				'LiquidatorRewards',
				'OneNetAggregatorDebtRatio',
				'Exchanger',
				'RewardsDistribution',
				'CollateralManager',
				'CircuitBreaker',
				'RewardEscrowV2', // required for collateral check in issuer
			],
		}));

		// use implementation ABI on the proxy address to simplify calling
		baseSynthetixProxy = await artifacts.require('BaseSynthetix').at(baseSynthetixProxy.address);

		await setupPriceAggregators(exchangeRates, owner, [sAUD, sEUR, sETH]);
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: baseSynthetixImpl.abi,
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
				'liquidateSelf',
				'liquidateDelinquentAccount',
				'liquidateDelinquentAccountEscrowIndex',
				'initializeLiquidatorRewardsRestitution',
				'migrateEscrowContractBalance',
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
				fnc: baseSynthetixImpl.exchangeWithVirtual,
				accounts,
				args: [sUSD, amount, sAUD, toBytes32('AGGREGATOR')],
				reason: 'Cannot be run on this layer',
			});
		});

		it('exchangeWithTrackingForInitiator should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetixImpl.exchangeWithTrackingForInitiator,
				accounts,
				args: [sUSD, amount, sAUD, owner, toBytes32('AGGREGATOR')],
				reason: 'Cannot be run on this layer',
			});
		});

		it('ExchangeAtomically should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetixImpl.exchangeAtomically,
				accounts,
				args: [sUSD, amount, sETH, toBytes32('AGGREGATOR'), 0],
				reason: 'Cannot be run on this layer',
			});
		});

		it('mint should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetixImpl.mint,
				accounts,
				args: [],
				reason: 'Cannot be run on this layer',
			});
		});

		it('mintSecondary should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetixImpl.mintSecondary,
				accounts,
				args: [account1, amount],
				reason: 'Cannot be run on this layer',
			});
		});
		it('mintSecondaryRewards should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetixImpl.mintSecondaryRewards,
				accounts,
				args: [amount],
				reason: 'Cannot be run on this layer',
			});
		});
		it('burnSecondary should revert no matter who the caller is', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetixImpl.burnSecondary,
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
				fnc: baseSynthetixImpl.emitExchangeTracking,
				accounts,
				args: [trackingCode, currencyKey1, amount1, amount2],
				reason: 'Only Exchanger can invoke this',
			});
		});
		it('emitExchangeRebate() cannot be invoked directly by any account', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetixImpl.emitExchangeRebate,
				accounts,
				args: [account1, currencyKey1, amount1],
				reason: 'Only Exchanger can invoke this',
			});
		});
		it('emitExchangeReclaim() cannot be invoked directly by any account', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetixImpl.emitExchangeReclaim,
				accounts,
				args: [account1, currencyKey1, amount1],
				reason: 'Only Exchanger can invoke this',
			});
		});
		it('emitSynthExchange() cannot be invoked directly by any account', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: baseSynthetixImpl.emitSynthExchange,
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
				await baseSynthetixImpl.rebuildCache();
			});
			beforeEach('call event emission functions', async () => {
				tx1 = await baseSynthetixImpl.emitExchangeRebate(account1, currencyKey1, amount1, {
					from: exchanger,
				});
				tx2 = await baseSynthetixImpl.emitExchangeReclaim(account1, currencyKey1, amount1, {
					from: exchanger,
				});
				tx3 = await baseSynthetixImpl.emitSynthExchange(
					account1,
					currencyKey1,
					amount1,
					currencyKey2,
					amount2,
					account2,
					{ from: exchanger }
				);
				tx4 = await baseSynthetixImpl.emitExchangeTracking(
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
			await baseSynthetixImpl.rebuildCache();
		});

		const amount1 = '10';
		const currencyKey1 = sAUD;
		const currencyKey2 = sEUR;
		const msgSender = owner;
		const trackingCode = toBytes32('1inch');

		it('exchangeOnBehalf is called with the right arguments ', async () => {
			await baseSynthetixImpl.exchangeOnBehalf(account1, currencyKey1, amount1, currencyKey2, {
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
			await baseSynthetixImpl.exchangeWithTracking(
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
			await baseSynthetixImpl.exchangeOnBehalfWithTracking(
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
			await baseSynthetixImpl.settle(currencyKey1, {
				from: owner,
			});
			assert.equal(smockExchanger.smocked.settle.calls[0][0], msgSender);
			assert.equal(smockExchanger.smocked.settle.calls[0][1].toString(), currencyKey1);
		});
	});

	describe('isWaitingPeriod()', () => {
		it('returns false by default', async () => {
			assert.isFalse(await baseSynthetixImpl.isWaitingPeriod(sETH));
		});
		describe('when a user has exchanged into sETH', () => {
			beforeEach(async () => {
				await updateRatesWithDefaults({ exchangeRates, owner, debtCache });

				await baseSynthetixImpl.issueSynths(toUnit('100'), { from: owner });
				await baseSynthetixImpl.exchange(sUSD, toUnit('10'), sETH, { from: owner });
			});
			it('then waiting period is true', async () => {
				assert.isTrue(await baseSynthetixImpl.isWaitingPeriod(sETH));
			});
			describe('when the waiting period expires', () => {
				beforeEach(async () => {
					await fastForward(await systemSettings.waitingPeriodSecs());
				});
				it('returns false by default', async () => {
					assert.isFalse(await baseSynthetixImpl.isWaitingPeriod(sETH));
				});
			});
		});
	});

	describe('anySynthOrSNXRateIsInvalid()', () => {
		it('should have stale rates initially', async () => {
			assert.equal(await baseSynthetixImpl.anySynthOrSNXRateIsInvalid(), true);
		});
		describe('when synth rates set', () => {
			beforeEach(async () => {
				// fast forward to get past initial SNX setting
				await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));

				await updateAggregatorRates(
					exchangeRates,
					circuitBreaker,
					[sAUD, sEUR, sETH],
					['0.5', '1.25', '100'].map(toUnit)
				);
				await debtCache.takeDebtSnapshot();
			});
			it('should still have stale rates', async () => {
				assert.equal(await baseSynthetixImpl.anySynthOrSNXRateIsInvalid(), true);
			});
			describe('when SNX is also set', () => {
				beforeEach(async () => {
					await updateAggregatorRates(exchangeRates, circuitBreaker, [SNX], ['1'].map(toUnit));
				});
				it('then no stale rates', async () => {
					assert.equal(await baseSynthetixImpl.anySynthOrSNXRateIsInvalid(), false);
				});

				describe('when only some synths are updated', () => {
					beforeEach(async () => {
						await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));

						await updateAggregatorRates(
							exchangeRates,
							circuitBreaker,
							[SNX, sAUD],
							['0.1', '0.78'].map(toUnit)
						);
					});

					it('then anySynthOrSNXRateIsInvalid() returns true', async () => {
						assert.equal(await baseSynthetixImpl.anySynthOrSNXRateIsInvalid(), true);
					});
				});
			});
		});
	});

	describe('availableCurrencyKeys()', () => {
		it('returns all currency keys by default', async () => {
			assert.deepEqual(await baseSynthetixImpl.availableCurrencyKeys(), [sUSD, sETH, sEUR, sAUD]);
		});
	});

	describe('isWaitingPeriod()', () => {
		it('returns false by default', async () => {
			assert.isFalse(await baseSynthetixImpl.isWaitingPeriod(sETH));
		});
	});

	describe('transfer()', () => {
		describe('when the system is suspended', () => {
			beforeEach(async () => {
				// approve for transferFrom to work
				await baseSynthetixImpl.approve(account1, toUnit('10'), { from: owner });
				await setStatus({ owner, systemStatus, section: 'System', suspend: true });
			});
			it('when transfer() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					baseSynthetixProxy.transfer(account1, toUnit('10'), { from: owner }),
					'Operation prohibited'
				);
			});
			it('when transferFrom() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					baseSynthetixProxy.transferFrom(owner, account2, toUnit('10'), { from: account1 }),
					'Operation prohibited'
				);
			});
			describe('when the system is resumed', () => {
				beforeEach(async () => {
					await setStatus({ owner, systemStatus, section: 'System', suspend: false });
				});
				it('when transfer() is invoked, it works as expected', async () => {
					await baseSynthetixProxy.transfer(account1, toUnit('10'), { from: owner });
				});
				it('when transferFrom() is invoked, it works as expected', async () => {
					await baseSynthetixProxy.transferFrom(owner, account2, toUnit('10'), { from: account1 });
				});
			});
		});

		beforeEach(async () => {
			// Ensure all synths have rates to allow issuance
			await updateRatesWithDefaults({ exchangeRates, owner, debtCache });
		});

		// SIP-238
		describe('implementation does not allow transfers but allows approve', () => {
			const amount = toUnit('10');
			const revertMsg = 'Only the proxy';

			it('approve does not revert', async () => {
				await baseSynthetixImpl.approve(account1, amount, { from: owner });
			});
			it('transfer reverts', async () => {
				await assert.revert(
					baseSynthetixImpl.transfer(account1, amount, { from: owner }),
					revertMsg
				);
			});
			it('transferFrom reverts', async () => {
				await baseSynthetixImpl.approve(account1, amount, { from: owner });
				await assert.revert(
					baseSynthetixImpl.transferFrom(owner, account1, amount, { from: account1 }),
					revertMsg
				);
			});
			it('transfer does not revert from a whitelisted contract', async () => {
				// set owner as RewardEscrowV2
				await addressResolver.importAddresses(['RewardEscrowV2'].map(toBytes32), [owner], {
					from: owner,
				});
				await baseSynthetixImpl.transfer(account1, amount, { from: owner });
			});
		});

		// SIP-252
		describe('migrateEscrowContractBalance', () => {
			it('restricted to owner', async () => {
				await assert.revert(
					baseSynthetixImpl.migrateEscrowContractBalance({ from: account2 }),
					'contract owner'
				);
			});
			it('reverts if both are the same address', async () => {
				await addressResolver.importAddresses(
					['RewardEscrowV2Frozen', 'RewardEscrowV2'].map(toBytes32),
					[account1, account1],
					{ from: owner }
				);
				await assert.revert(
					baseSynthetixImpl.migrateEscrowContractBalance({ from: owner }),
					'same address'
				);
			});
			it('transfers balance as needed', async () => {
				await baseSynthetixProxy.transfer(account1, toUnit('10'), { from: owner });
				// check balances
				assert.bnEqual(await baseSynthetixImpl.balanceOf(account1), toUnit('10'));
				assert.bnEqual(await baseSynthetixImpl.balanceOf(account2), toUnit('0'));

				await addressResolver.importAddresses(
					['RewardEscrowV2Frozen', 'RewardEscrowV2'].map(toBytes32),
					[account1, account2],
					{ from: owner }
				);

				await baseSynthetixImpl.migrateEscrowContractBalance({ from: owner });

				// check balances
				assert.bnEqual(await baseSynthetixImpl.balanceOf(account1), toUnit('0'));
				assert.bnEqual(await baseSynthetixImpl.balanceOf(account2), toUnit('10'));
			});
		});

		it('should transfer using the ERC20 transfer function @gasprofile', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.

			assert.bnEqual(
				await baseSynthetixImpl.totalSupply(),
				await baseSynthetixImpl.balanceOf(owner)
			);

			const transaction = await baseSynthetixProxy.transfer(account1, toUnit('10'), {
				from: owner,
			});

			assert.eventEqual(transaction, 'Transfer', {
				from: owner,
				to: account1,
				value: toUnit('10'),
			});

			assert.bnEqual(await baseSynthetixImpl.balanceOf(account1), toUnit('10'));
		});

		it('should revert when exceeding locked synthetix and calling the ERC20 transfer function', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			assert.bnEqual(
				await baseSynthetixImpl.totalSupply(),
				await baseSynthetixImpl.balanceOf(owner)
			);

			// Issue max synths.
			await baseSynthetixImpl.issueMaxSynths({ from: owner });

			// Try to transfer 0.000000000000000001 SNX
			await assert.revert(
				baseSynthetixProxy.transfer(account1, '1', { from: owner }),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			const previousOwnerBalance = await baseSynthetixImpl.balanceOf(owner);
			assert.bnEqual(await baseSynthetixImpl.totalSupply(), previousOwnerBalance);

			// Approve account1 to act on our behalf for 10 SNX.
			let transaction = await baseSynthetixImpl.approve(account1, toUnit('10'), { from: owner });
			assert.eventEqual(transaction, 'Approval', {
				owner: owner,
				spender: account1,
				value: toUnit('10'),
			});

			// Assert that transferFrom works.
			transaction = await baseSynthetixProxy.transferFrom(owner, account2, toUnit('10'), {
				from: account1,
			});

			assert.eventEqual(transaction, 'Transfer', {
				from: owner,
				to: account2,
				value: toUnit('10'),
			});

			// Assert that account2 has 10 SNX and owner has 10 less SNX
			assert.bnEqual(await baseSynthetixImpl.balanceOf(account2), toUnit('10'));
			assert.bnEqual(
				await baseSynthetixImpl.balanceOf(owner),
				previousOwnerBalance.sub(toUnit('10'))
			);

			// Assert that we can't transfer more even though there's a balance for owner.
			await assert.revert(
				baseSynthetixProxy.transferFrom(owner, account2, '1', {
					from: account1,
				})
			);
		});

		it('should revert when exceeding locked synthetix and calling the ERC20 transferFrom function', async () => {
			// Ensure our environment is set up correctly for our assumptions
			// e.g. owner owns all SNX.
			assert.bnEqual(
				await baseSynthetixImpl.totalSupply(),
				await baseSynthetixImpl.balanceOf(owner)
			);

			// Approve account1 to act on our behalf for 10 SNX.
			const transaction = await baseSynthetixImpl.approve(account1, toUnit('10'), { from: owner });
			assert.eventEqual(transaction, 'Approval', {
				owner: owner,
				spender: account1,
				value: toUnit('10'),
			});

			// Issue max synths
			await baseSynthetixImpl.issueMaxSynths({ from: owner });

			// Assert that transferFrom fails even for the smallest amount of SNX.
			await assert.revert(
				baseSynthetixProxy.transferFrom(owner, account2, '1', {
					from: account1,
				}),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		describe('when the user has issued some sUSD and exchanged for other synths', () => {
			beforeEach(async () => {
				await baseSynthetixImpl.issueSynths(toUnit('100'), { from: owner });
				await baseSynthetixImpl.exchange(sUSD, toUnit('10'), sETH, { from: owner });
				await baseSynthetixImpl.exchange(sUSD, toUnit('10'), sAUD, { from: owner });
				await baseSynthetixImpl.exchange(sUSD, toUnit('10'), sEUR, { from: owner });
			});
			it('should transfer using the ERC20 transfer function @gasprofile', async () => {
				await baseSynthetixProxy.transfer(account1, toUnit('10'), { from: owner });

				assert.bnEqual(await baseSynthetixImpl.balanceOf(account1), toUnit('10'));
			});

			it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
				const previousOwnerBalance = await baseSynthetixImpl.balanceOf(owner);

				// Approve account1 to act on our behalf for 10 SNX.
				await baseSynthetixImpl.approve(account1, toUnit('10'), { from: owner });

				// Assert that transferFrom works.
				await baseSynthetixProxy.transferFrom(owner, account2, toUnit('10'), {
					from: account1,
				});

				// Assert that account2 has 10 SNX and owner has 10 less SNX
				assert.bnEqual(await baseSynthetixImpl.balanceOf(account2), toUnit('10'));
				assert.bnEqual(
					await baseSynthetixImpl.balanceOf(owner),
					previousOwnerBalance.sub(toUnit('10'))
				);

				// Assert that we can't transfer more even though there's a balance for owner.
				await assert.revert(
					baseSynthetixProxy.transferFrom(owner, account2, '1', {
						from: account1,
					})
				);
			});
		});

		describe('rates stale for transfers', () => {
			const value = toUnit('300');
			const ensureTransferReverts = async () => {
				await assert.revert(
					baseSynthetixProxy.transfer(account2, value, { from: account1 }),
					'A synth or SNX rate is invalid'
				);
				await assert.revert(
					baseSynthetixProxy.transferFrom(account2, account1, value, {
						from: account3,
					}),
					'A synth or SNX rate is invalid'
				);
			};

			beforeEach(async () => {
				// Give some SNX to account1 & account2
				await baseSynthetixProxy.transfer(account1, toUnit('10000'), {
					from: owner,
				});
				await baseSynthetixProxy.transfer(account2, toUnit('10000'), {
					from: owner,
				});

				// Ensure that we can do a successful transfer before rates go stale
				await baseSynthetixProxy.transfer(account2, value, { from: account1 });

				// approve account3 to transferFrom account2
				await baseSynthetixImpl.approve(account3, toUnit('10000'), { from: account2 });
				await baseSynthetixProxy.transferFrom(account2, account1, value, {
					from: account3,
				});
			});

			describe('when the user has a debt position', () => {
				beforeEach(async () => {
					// ensure the accounts have a debt position
					await Promise.all([
						baseSynthetixImpl.issueSynths(toUnit('1'), { from: account1 }),
						baseSynthetixImpl.issueSynths(toUnit('1'), { from: account2 }),
					]);

					// make aggregator debt info rate stale
					await aggregatorDebtRatio.setOverrideTimestamp(await currentTime());

					// Now jump forward in time so the rates are stale
					await fastForward((await exchangeRates.rateStalePeriod()) + 1);
				});
				it('should not allow transfer if the exchange rate for SNX is stale', async () => {
					await ensureTransferReverts();

					// now give some synth rates
					await aggregatorDebtRatio.setOverrideTimestamp(0);

					await updateAggregatorRates(
						exchangeRates,
						circuitBreaker,
						[sAUD, sEUR],
						['0.5', '1.25'].map(toUnit)
					);
					await debtCache.takeDebtSnapshot();

					await ensureTransferReverts();

					// the remainder of the synths have prices
					await updateAggregatorRates(exchangeRates, circuitBreaker, [sETH], ['100'].map(toUnit));
					await debtCache.takeDebtSnapshot();

					await ensureTransferReverts();

					// now give SNX rate
					await updateAggregatorRates(exchangeRates, circuitBreaker, [SNX], ['1'].map(toUnit));

					// now SNX transfer should work
					await baseSynthetixProxy.transfer(account2, value, { from: account1 });
					await baseSynthetixProxy.transferFrom(account2, account1, value, {
						from: account3,
					});
				});

				it('should not allow transfer if debt aggregator is stale', async () => {
					await ensureTransferReverts();

					// now give SNX rate
					await updateAggregatorRates(exchangeRates, circuitBreaker, [SNX], ['1'].map(toUnit));
					await debtCache.takeDebtSnapshot();

					await ensureTransferReverts();

					// now give the aggregator debt info rate
					await aggregatorDebtRatio.setOverrideTimestamp(0);

					// now SNX transfer should work
					await baseSynthetixProxy.transfer(account2, value, { from: account1 });
					await baseSynthetixProxy.transferFrom(account2, account1, value, {
						from: account3,
					});
				});
			});

			describe('when the user has no debt', () => {
				it('should allow transfer if the exchange rate for SNX is stale', async () => {
					// SNX transfer should work
					await baseSynthetixProxy.transfer(account2, value, { from: account1 });
					await baseSynthetixProxy.transferFrom(account2, account1, value, {
						from: account3,
					});
				});

				it('should allow transfer if the exchange rate for any synth is stale', async () => {
					// now SNX transfer should work
					await baseSynthetixProxy.transfer(account2, value, { from: account1 });
					await baseSynthetixProxy.transferFrom(account2, account1, value, {
						from: account3,
					});
				});
			});
		});

		describe('when the user holds SNX', () => {
			beforeEach(async () => {
				await baseSynthetixProxy.transfer(account1, toUnit('1000'), {
					from: owner,
				});
			});

			describe('and has an escrow entry', () => {
				beforeEach(async () => {
					// Setup escrow
					const escrowedSynthetixs = toUnit('30000');
					await baseSynthetixProxy.transfer(escrow.address, escrowedSynthetixs, {
						from: owner,
					});
				});

				it('should allow transfer of synthetix by default', async () => {
					await baseSynthetixProxy.transfer(account2, toUnit('100'), { from: account1 });
				});

				describe('when the user has a debt position (i.e. has issued)', () => {
					beforeEach(async () => {
						await baseSynthetixImpl.issueSynths(toUnit('10'), { from: account1 });
					});

					it('should not allow transfer of synthetix in escrow', async () => {
						// Ensure the transfer fails as all the synthetix are in escrow
						await assert.revert(
							baseSynthetixProxy.transfer(account2, toUnit('990'), { from: account1 }),
							'Cannot transfer staked or escrowed SNX'
						);
					});
				});
			});
		});

		it('should not be possible to transfer locked synthetix', async () => {
			const issuedSynthetixs = web3.utils.toBN('200000');
			await baseSynthetixProxy.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			// Issue
			const amountIssued = toUnit('2000');
			await baseSynthetixImpl.issueSynths(amountIssued, { from: account1 });

			await assert.revert(
				baseSynthetixProxy.transfer(account2, toUnit(issuedSynthetixs), {
					from: account1,
				}),
				'Cannot transfer staked or escrowed SNX'
			);
		});

		it("should lock newly received synthetix if the user's collaterisation is too high", async () => {
			// Disable Dynamic fee so that we can neglect it.
			await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });

			// Set sEUR for purposes of this test
			await updateAggregatorRates(exchangeRates, circuitBreaker, [sEUR], [toUnit('0.75')]);
			await debtCache.takeDebtSnapshot();

			const issuedSynthetixs = web3.utils.toBN('200000');
			await baseSynthetixProxy.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});
			await baseSynthetixProxy.transfer(account2, toUnit(issuedSynthetixs), {
				from: owner,
			});

			const maxIssuableSynths = await baseSynthetixImpl.maxIssuableSynths(account1);

			// Issue
			await baseSynthetixImpl.issueSynths(maxIssuableSynths, { from: account1 });

			// Exchange into sEUR
			await baseSynthetixImpl.exchange(sUSD, maxIssuableSynths, sEUR, { from: account1 });

			// Ensure that we can transfer in and out of the account successfully
			await baseSynthetixProxy.transfer(account1, toUnit('10000'), {
				from: account2,
			});
			await baseSynthetixProxy.transfer(account2, toUnit('10000'), {
				from: account1,
			});

			// Increase the value of sEUR relative to synthetix
			await updateAggregatorRates(exchangeRates, circuitBreaker, [sEUR], [toUnit('2.10')]);
			await debtCache.takeDebtSnapshot();

			// Ensure that the new synthetix account1 receives cannot be transferred out.
			await baseSynthetixProxy.transfer(account1, toUnit('10000'), {
				from: account2,
			});
			await assert.revert(
				baseSynthetixProxy.transfer(account2, toUnit('10000'), { from: account1 })
			);
		});

		it('should unlock synthetix when collaterisation ratio changes', async () => {
			// Disable Dynamic fee so that we can neglect it.
			await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });

			// prevent circuit breaker from firing by upping the threshold to factor 5
			await systemSettings.setPriceDeviationThresholdFactor(toUnit('5'), { from: owner });

			// Set sAUD for purposes of this test
			const aud2usdrate = toUnit('2');

			await updateAggregatorRates(exchangeRates, null, [sAUD], [aud2usdrate]);
			await debtCache.takeDebtSnapshot();

			const issuedSynthetixs = web3.utils.toBN('200000');
			await baseSynthetixProxy.transfer(account1, toUnit(issuedSynthetixs), {
				from: owner,
			});

			// Issue
			const issuedSynths = await baseSynthetixImpl.maxIssuableSynths(account1);
			await baseSynthetixImpl.issueSynths(issuedSynths, { from: account1 });
			const remainingIssuable = (await baseSynthetixImpl.remainingIssuableSynths(account1))[0];

			assert.bnClose(remainingIssuable, '0');

			const transferable1 = await baseSynthetixProxy.transferableSynthetix(account1);
			assert.bnEqual(transferable1, '0');

			// Exchange into sAUD
			await baseSynthetixImpl.exchange(sUSD, issuedSynths, sAUD, { from: account1 });

			// Increase the value of sAUD relative to synthetix
			const newAUDExchangeRate = toUnit('1');
			await updateAggregatorRates(exchangeRates, circuitBreaker, [sAUD], [newAUDExchangeRate]);
			await debtCache.takeDebtSnapshot();

			const transferable2 = await baseSynthetixProxy.transferableSynthetix(account1);
			assert.equal(transferable2.gt(toUnit('1000')), true);
		});

		describe('when the user has issued some sUSD and exchanged for other synths', () => {
			beforeEach(async () => {
				await baseSynthetixImpl.issueSynths(toUnit('100'), { from: owner });
				await baseSynthetixImpl.exchange(sUSD, toUnit('10'), sETH, { from: owner });
				await baseSynthetixImpl.exchange(sUSD, toUnit('10'), sAUD, { from: owner });
				await baseSynthetixImpl.exchange(sUSD, toUnit('10'), sEUR, { from: owner });
			});
			it('should transfer using the ERC20 transfer function @gasprofile', async () => {
				await baseSynthetixProxy.transfer(account1, toUnit('10'), { from: owner });

				assert.bnEqual(await baseSynthetixImpl.balanceOf(account1), toUnit('10'));
			});

			it('should transfer using the ERC20 transferFrom function @gasprofile', async () => {
				const previousOwnerBalance = await baseSynthetixImpl.balanceOf(owner);

				// Approve account1 to act on our behalf for 10 SNX.
				await baseSynthetixImpl.approve(account1, toUnit('10'), { from: owner });

				// Assert that transferFrom works.
				await baseSynthetixProxy.transferFrom(owner, account2, toUnit('10'), {
					from: account1,
				});

				// Assert that account2 has 10 SNX and owner has 10 less SNX
				assert.bnEqual(await baseSynthetixImpl.balanceOf(account2), toUnit('10'));
				assert.bnEqual(
					await baseSynthetixImpl.balanceOf(owner),
					previousOwnerBalance.sub(toUnit('10'))
				);

				// Assert that we can't transfer more even though there's a balance for owner.
				await assert.revert(
					baseSynthetixProxy.transferFrom(owner, account2, '1', {
						from: account1,
					})
				);
			});
		});
	});
});
