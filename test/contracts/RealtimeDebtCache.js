'use strict';

const { contract, artifacts } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts, setupContract } = require('./setup');

const { currentTime, toUnit, fastForward } = require('../utils')();
const { toBN } = require('web3-utils');
const { convertToDecimals } = require('./helpers');

const { setExchangeFeeRateForSynths, getDecodedLogs } = require('./helpers');

const {
	toBytes32,
	defaults: { DEBT_SNAPSHOT_STALE_TIME },
} = require('../..');

contract('RealtimeDebtCache', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, sETH] = ['sUSD', 'sAUD', 'sEUR', 'SNX', 'sETH'].map(toBytes32);
	const synthKeys = [sUSD, sAUD, sEUR, sETH, SNX];

	const [, owner, oracle, account1] = accounts;

	let synthetix,
		systemSettings,
		exchangeRates,
		sUSDContract,
		sETHContract,
		sEURContract,
		sAUDContract,
		timestamp,
		debtCache,
		issuer,
		synths,
		addressResolver,
		exchanger;

	// run this once before all tests to prepare our environment, snapshots on beforeEach will take
	// care of resetting to this state
	before(async () => {
		synths = ['sUSD', 'sAUD', 'sEUR', 'sETH'];
		({
			Synthetix: synthetix,
			SystemSettings: systemSettings,
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSDContract,
			SynthsETH: sETHContract,
			SynthsAUD: sAUDContract,
			SynthsEUR: sEURContract,
			DebtCache: debtCache,
			Issuer: issuer,
			AddressResolver: addressResolver,
			Exchanger: exchanger,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'ExchangeRates',
				'FeePoolEternalStorage',
				'AddressResolver',
				'RewardEscrow',
				'SynthetixEscrow',
				'SystemSettings',
				'Issuer',
				'DebtCache',
				'Exchanger', // necessary for burnSynths to check settlement of sUSD
				'DelegateApprovals', // necessary for *OnBehalf functions
				'FlexibleStorage',
				'CollateralManager',
				'RewardEscrowV2', // necessary for issuer._collateral()
			],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sETH],
			['0.5', '1.25', '0.1', '200'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// set a 0.3% default exchange fee rate
		const exchangeFeeRate = toUnit('0.003');
		await setExchangeFeeRateForSynths({
			owner,
			systemSettings,
			synthKeys,
			exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
		});
		await debtCache.takeDebtSnapshot();
	});

	it('debt snapshot stale time is correctly configured as a default', async () => {
		assert.bnEqual(await debtCache.debtSnapshotStaleTime(), DEBT_SNAPSHOT_STALE_TIME);
	});

	describe('After issuing synths', () => {
		beforeEach(async () => {
			// set minimumStakeTime on issue and burning to 0
			await systemSettings.setMinimumStakeTime(0, { from: owner });
			// set default issuance ratio of 0.2
			await systemSettings.setIssuanceRatio(toUnit('0.2'), { from: owner });
			// set up initial prices
			await exchangeRates.updateRates(
				[sAUD, sEUR, sETH],
				['0.5', '2', '100'].map(toUnit),
				await currentTime(),
				{ from: oracle }
			);
			await debtCache.takeDebtSnapshot();

			// Issue 1000 sUSD worth of tokens to a user
			await sUSDContract.issue(account1, toUnit(100));
			await sAUDContract.issue(account1, toUnit(100));
			await sEURContract.issue(account1, toUnit(100));
			await sETHContract.issue(account1, toUnit(2));
		});

		describe('Current issued debt', () => {
			it('Live debt is reported accurately', async () => {
				// The synth debt has not yet been cached.
				assert.bnEqual((await debtCache.cacheInfo()).debt, toUnit(0));

				const result = await debtCache.currentDebt();
				assert.bnEqual(result[0], toUnit(550));
				assert.isFalse(result[1]);
			});

			it('Live debt is reported accurately for individual currencies', async () => {
				const result = await debtCache.currentSynthDebts([sUSD, sEUR, sAUD, sETH]);
				const debts = result[0];

				assert.bnEqual(debts[0], toUnit(100));
				assert.bnEqual(debts[1], toUnit(200));
				assert.bnEqual(debts[2], toUnit(50));
				assert.bnEqual(debts[3], toUnit(200));

				assert.isFalse(result[1]);
			});
		});

		describe('Realtime debt cache', () => {
			let realtimeDebtCache;

			beforeEach(async () => {
				// replace the debt cache with its real-time version
				realtimeDebtCache = await setupContract({
					contract: 'RealtimeDebtCache',
					accounts,
					skipPostDeploy: true,
					args: [owner, addressResolver.address],
				});

				await addressResolver.importAddresses(
					[toBytes32('DebtCache')],
					[realtimeDebtCache.address],
					{
						from: owner,
					}
				);

				// rebuild the caches of those addresses not just added to the adress resolver
				await Promise.all([
					issuer.rebuildCache(),
					exchanger.rebuildCache(),
					realtimeDebtCache.rebuildCache(),
				]);
			});

			it('Cached values report current numbers without cache resynchronisation', async () => {
				let debts = await realtimeDebtCache.currentSynthDebts([sUSD, sEUR, sAUD, sETH]);
				assert.bnEqual(debts[0][0], toUnit(100));
				assert.bnEqual(debts[0][1], toUnit(200));
				assert.bnEqual(debts[0][2], toUnit(50));
				assert.bnEqual(debts[0][3], toUnit(200));

				debts = await realtimeDebtCache.cachedSynthDebts([sUSD, sEUR, sAUD, sETH]);
				assert.bnEqual(debts[0], toUnit(100));
				assert.bnEqual(debts[1], toUnit(200));
				assert.bnEqual(debts[2], toUnit(50));
				assert.bnEqual(debts[3], toUnit(200));
				assert.bnEqual(await realtimeDebtCache.cachedSynthDebt(sUSD), toUnit(100));
				assert.bnEqual(await realtimeDebtCache.cachedSynthDebt(sEUR), toUnit(200));
				assert.bnEqual(await realtimeDebtCache.cachedSynthDebt(sAUD), toUnit(50));
				assert.bnEqual(await realtimeDebtCache.cachedSynthDebt(sETH), toUnit(200));

				assert.bnEqual((await realtimeDebtCache.cacheInfo()).debt, toUnit(550));
				assert.bnEqual((await realtimeDebtCache.currentDebt())[0], toUnit(550));
				assert.bnEqual(await realtimeDebtCache.cachedDebt(), toUnit(550));

				await exchangeRates.updateRates(
					[sAUD, sEUR, sETH],
					['1', '3', '200'].map(toUnit),
					await currentTime(),
					{
						from: oracle,
					}
				);

				debts = await realtimeDebtCache.currentSynthDebts([sUSD, sEUR, sAUD, sETH]);
				assert.bnEqual(debts[0][0], toUnit(100));
				assert.bnEqual(debts[0][1], toUnit(300));
				assert.bnEqual(debts[0][2], toUnit(100));
				assert.bnEqual(debts[0][3], toUnit(400));

				debts = await realtimeDebtCache.cachedSynthDebts([sUSD, sEUR, sAUD, sETH]);
				assert.bnEqual(debts[0], toUnit(100));
				assert.bnEqual(debts[1], toUnit(300));
				assert.bnEqual(debts[2], toUnit(100));
				assert.bnEqual(debts[3], toUnit(400));
				assert.bnEqual(await realtimeDebtCache.cachedSynthDebt(sUSD), toUnit(100));
				assert.bnEqual(await realtimeDebtCache.cachedSynthDebt(sEUR), toUnit(300));
				assert.bnEqual(await realtimeDebtCache.cachedSynthDebt(sAUD), toUnit(100));
				assert.bnEqual(await realtimeDebtCache.cachedSynthDebt(sETH), toUnit(400));

				assert.bnEqual((await realtimeDebtCache.cacheInfo()).debt, toUnit(900));
				assert.bnEqual((await realtimeDebtCache.currentDebt())[0], toUnit(900));
				assert.bnEqual(await realtimeDebtCache.cachedDebt(), toUnit(900));
			});

			it('Cache timestamps update in real time and are never stale', async () => {
				const now = toBN(await currentTime());
				let timestamp = toBN(await realtimeDebtCache.cacheTimestamp());
				let stale = await realtimeDebtCache.cacheStale();
				let info = await realtimeDebtCache.cacheInfo();

				assert.bnLte(now, timestamp);
				assert.bnLte(timestamp, toBN(info.timestamp));
				assert.isFalse(stale);
				assert.isFalse(info.isStale);

				const staleTime = await systemSettings.debtSnapshotStaleTime();
				await fastForward(staleTime * 2);

				const later = toBN(await currentTime());
				timestamp = toBN(await realtimeDebtCache.cacheTimestamp());
				stale = await realtimeDebtCache.cacheStale();
				info = await realtimeDebtCache.cacheInfo();

				assert.bnLt(now, later);
				assert.bnLte(later, timestamp);
				assert.bnLte(timestamp, toBN(info.timestamp));
				assert.isFalse(stale);
				assert.isFalse(info.isStale);

				assert.bnEqual(
					toBN(await realtimeDebtCache.debtSnapshotStaleTime()),
					toBN(2)
						.pow(toBN(256))
						.sub(toBN(1))
				);
			});

			it('Cache invalidity changes in real time if a rate is flagged', async () => {
				const mockFlagsInterface = await artifacts.require('MockFlagsInterface').new();
				await systemSettings.setAggregatorWarningFlags(mockFlagsInterface.address, {
					from: owner,
				});
				const aggregatorEUR = await artifacts.require('MockAggregatorV2V3').new({ from: owner });
				aggregatorEUR.setDecimals('8');
				await exchangeRates.addAggregator(sEUR, aggregatorEUR.address, {
					from: owner,
				});
				await mockFlagsInterface.unflagAggregator(aggregatorEUR.address);

				await exchangeRates.updateRates(
					[sAUD, sETH],
					['1', '200'].map(toUnit),
					await currentTime(),
					{
						from: oracle,
					}
				);
				await aggregatorEUR.setLatestAnswer(convertToDecimals(3, 8), await currentTime());
				assert.isFalse(await realtimeDebtCache.cacheInvalid());
				assert.isFalse((await realtimeDebtCache.cacheInfo()).isInvalid);

				await mockFlagsInterface.flagAggregator(aggregatorEUR.address);
				assert.isTrue(await realtimeDebtCache.cacheInvalid());
				assert.isTrue((await realtimeDebtCache.cacheInfo()).isInvalid);

				await mockFlagsInterface.unflagAggregator(aggregatorEUR.address);
				assert.isFalse(await realtimeDebtCache.cacheInvalid());
				assert.isFalse((await realtimeDebtCache.cacheInfo()).isInvalid);
			});

			it('Cache functions still operate, but are no-ops', async () => {
				const noOpGasLimit = 23500;

				const txs = await Promise.all([
					realtimeDebtCache.purgeCachedSynthDebt(sEUR),
					realtimeDebtCache.takeDebtSnapshot(),
					realtimeDebtCache.updateCachedSynthDebts([sEUR]),
					realtimeDebtCache.updateCachedSynthDebtWithRate(sEUR, toUnit('1')),
					realtimeDebtCache.updateCachedSynthDebtsWithRates(
						[sEUR, sAUD],
						[toUnit('1'), toUnit('2')]
					),
					realtimeDebtCache.updateDebtCacheValidity(true),
				]);

				txs.forEach(tx => assert.isTrue(tx.receipt.gasUsed < noOpGasLimit));
			});

			describe('Exchanging, issuing, burning, settlement still operate properly', async () => {
				it('issuing sUSD updates the debt total', async () => {
					const issued = (await realtimeDebtCache.cacheInfo())[0];

					const synthsToIssue = toUnit('10');
					await synthetix.transfer(account1, toUnit('1000'), { from: owner });
					const tx = await synthetix.issueSynths(synthsToIssue, { from: account1 });
					assert.bnEqual((await realtimeDebtCache.cacheInfo())[0], issued.add(synthsToIssue));

					const logs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [debtCache],
					});
					assert.isUndefined(logs.find(({ name } = {}) => name === 'DebtCacheUpdated'));
				});

				it('burning sUSD updates the debt total', async () => {
					const synthsToIssue = toUnit('10');
					await synthetix.transfer(account1, toUnit('1000'), { from: owner });
					await synthetix.issueSynths(synthsToIssue, { from: account1 });
					const issued = (await realtimeDebtCache.cacheInfo())[0];

					const synthsToBurn = toUnit('5');

					const tx = await synthetix.burnSynths(synthsToBurn, { from: account1 });
					assert.bnEqual((await realtimeDebtCache.cacheInfo())[0], issued.sub(synthsToBurn));

					const logs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [debtCache],
					});

					assert.isUndefined(logs.find(({ name } = {}) => name === 'DebtCacheUpdated'));
				});

				it('exchanging between synths updates the debt totals for those synths', async () => {
					// Zero exchange fees so that we can neglect them.
					await systemSettings.setExchangeFeeRateForSynths([sAUD, sUSD], [toUnit(0), toUnit(0)], {
						from: owner,
					});

					await synthetix.transfer(account1, toUnit('1000'), { from: owner });
					await synthetix.issueSynths(toUnit('10'), { from: account1 });
					const issued = (await realtimeDebtCache.cacheInfo())[0];
					const debts = await realtimeDebtCache.cachedSynthDebts([sUSD, sAUD]);
					const tx = await synthetix.exchange(sUSD, toUnit('5'), sAUD, { from: account1 });
					const postDebts = await realtimeDebtCache.cachedSynthDebts([sUSD, sAUD]);
					assert.bnEqual((await realtimeDebtCache.cacheInfo())[0], issued);
					assert.bnEqual(postDebts[0], debts[0].sub(toUnit(5)));
					assert.bnEqual(postDebts[1], debts[1].add(toUnit(5)));

					// As the total debt did not change, no DebtCacheUpdated event was emitted.
					const logs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [debtCache],
					});

					assert.isUndefined(logs.find(({ name } = {}) => name === 'DebtCacheUpdated'));
				});

				it('exchanging between synths updates sUSD debt total due to fees', async () => {
					await systemSettings.setExchangeFeeRateForSynths(
						[sAUD, sUSD, sEUR],
						[toUnit(0.1), toUnit(0.1), toUnit(0.1)],
						{ from: owner }
					);

					await sEURContract.issue(account1, toUnit(20));
					const issued = (await realtimeDebtCache.cacheInfo())[0];

					const debts = await realtimeDebtCache.cachedSynthDebts([sUSD, sAUD, sEUR]);

					await synthetix.exchange(sEUR, toUnit(10), sAUD, { from: account1 });
					const postDebts = await realtimeDebtCache.cachedSynthDebts([sUSD, sAUD, sEUR]);

					assert.bnEqual((await realtimeDebtCache.cacheInfo())[0], issued);
					assert.bnEqual(postDebts[0], debts[0].add(toUnit(2)));
					assert.bnEqual(postDebts[1], debts[1].add(toUnit(18)));
					assert.bnEqual(postDebts[2], debts[2].sub(toUnit(20)));
				});

				it('exchanging between synths updates debt properly when prices have changed', async () => {
					await systemSettings.setExchangeFeeRateForSynths([sAUD, sUSD], [toUnit(0), toUnit(0)], {
						from: owner,
					});

					await sEURContract.issue(account1, toUnit(20));
					const issued = (await realtimeDebtCache.cacheInfo())[0];

					const debts = await realtimeDebtCache.cachedSynthDebts([sAUD, sEUR]);

					await exchangeRates.updateRates(
						[sAUD, sEUR],
						['1', '1'].map(toUnit),
						await currentTime(),
						{
							from: oracle,
						}
					);

					await synthetix.exchange(sEUR, toUnit(10), sAUD, { from: account1 });
					const postDebts = await realtimeDebtCache.cachedSynthDebts([sAUD, sEUR]);

					// 120 eur @ $2 = $240 and 100 aud @ $0.50 = $50 becomes:
					// 110 eur @ $1 = $110 (-$130) and 110 aud @ $1 = $110 (+$60)
					// Total debt is reduced by $130 - $60 = $70
					assert.bnEqual((await realtimeDebtCache.cacheInfo())[0], issued.sub(toUnit(70)));
					assert.bnEqual(postDebts[0], debts[0].add(toUnit(60)));
					assert.bnEqual(postDebts[1], debts[1].sub(toUnit(130)));
				});

				it('settlement updates debt totals', async () => {
					await systemSettings.setExchangeFeeRateForSynths([sAUD, sEUR], [toUnit(0), toUnit(0)], {
						from: owner,
					});
					await sAUDContract.issue(account1, toUnit(100));

					await synthetix.exchange(sAUD, toUnit(50), sEUR, { from: account1 });

					await exchangeRates.updateRates(
						[sAUD, sEUR],
						['2', '1'].map(toUnit),
						await currentTime(),
						{
							from: oracle,
						}
					);

					const tx = await exchanger.settle(account1, sAUD);
					const logs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [debtCache],
					});
					assert.equal(logs.filter(log => log !== undefined).length, 0);

					// AU$150 worth $75 became worth $300
					// The EUR debt does not change due to settlement,
					// But its price did halve, so it becomes
					// ($200 + $25) / 2 from the exchange and price update

					const results = await realtimeDebtCache.cachedSynthDebts([sAUD, sEUR]);
					assert.bnEqual(results[0], toUnit(300));
					assert.bnEqual(results[1], toUnit(112.5));
				});
			});
		});
	});
});
