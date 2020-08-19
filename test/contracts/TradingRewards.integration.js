const { contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;
const { assert } = require('./common');
const { setupAllContracts } = require('./setup');
const {
	currentTime,
	toUnit,
	takeSnapshot,
	restoreSnapshot,
	multiplyDecimal,
	divideDecimal,
} = require('../utils')();
const { setExchangeFeeRateForSynths, getDecodedLogs } = require('./helpers');
const { toBytes32 } = require('../..');

/*
 * This tests the TradingRewards contract's integration
 * with the rest of the Synthetix system.
 *
 * Inner workings of the contract are tested in TradingRewards.unit.js.
 **/
contract('TradingRewards (integration tests)', accounts => {
	const [, owner, account1, account2, aggregator] = accounts;

	const synths = ['sUSD', 'sETH'];
	const synthKeys = synths.map(toBytes32);
	const [sUSD, sETH] = synthKeys;

	const trackingCode = toBytes32('1INCH');

	let synthetix, exchanger, exchangeRates, rewards, resolver, systemSettings;
	let sUSDContract, sETHContract;

	let exchangeLogs;

	let snapshotId;

	function calculateExpectedAmount({ amountExchanged, exchangeFeeRate, sETHRate }) {
		const amountReceivedBeforeFees = divideDecimal(amountExchanged, sETHRate);
		const feeMultiplier = toUnit('1').sub(exchangeFeeRate);
		return multiplyDecimal(amountReceivedBeforeFees, feeMultiplier);
	}

	describe('when deploying the system', () => {
		const amountIssued = toUnit('1000');
		const amountExchanged = toUnit('100');
		const sETHRate = toUnit('100');
		const exchangeFeeRate = toUnit('0.005');
		const expectedAmountReceived = calculateExpectedAmount({
			amountExchanged,
			exchangeFeeRate,
			sETHRate,
		});

		before('deploy all contracts', async () => {
			({
				Synthetix: synthetix,
				TradingRewards: rewards,
				AddressResolver: resolver,
				Exchanger: exchanger,
				ExchangeRates: exchangeRates,
				SynthsUSD: sUSDContract,
				SynthsETH: sETHContract,
				SystemSettings: systemSettings,
			} = await setupAllContracts({
				accounts,
				synths,
				contracts: [
					'Synthetix',
					'TradingRewards',
					'Exchanger',
					'AddressResolver',
					'ExchangeRates',
					'SystemSettings',
				],
			}));
		});

		before('mint some sUSD', async () => {
			await sUSDContract.issue(account1, amountIssued);
			await sUSDContract.issue(account2, amountIssued);
		});

		before('set exchange rates', async () => {
			const oracle = account1;
			const timestamp = await currentTime();

			await exchangeRates.updateRates([sETH], [sETHRate], timestamp, {
				from: oracle,
			});

			// set a 0.5% exchange fee rate (1/200)
			await setExchangeFeeRateForSynths({
				owner,
				systemSettings,
				synthKeys,
				exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
			});
		});

		it('has expected balances for accounts', async () => {
			assert.bnEqual(amountIssued, await sUSDContract.balanceOf(account1));
			assert.bnEqual(amountIssued, await sUSDContract.balanceOf(account2));

			assert.bnEqual(toBN(0), await sETHContract.balanceOf(account1));
			assert.bnEqual(toBN(0), await sETHContract.balanceOf(account1));
		});

		it('has expected parameters', async () => {
			assert.equal(owner, await rewards.getPeriodController());
			assert.equal(owner, await rewards.owner());
			assert.equal(synthetix.address, await rewards.getRewardsToken());
			assert.equal(resolver.address, await rewards.resolver());
		});

		describe('when SystemSettings tradingRewardsEnabled is false', () => {
			before(async () => (snapshotId = await takeSnapshot()));
			after(async () => await restoreSnapshot(snapshotId));

			it('tradingRewardsEnabled is false', async () => {
				assert.isFalse(await systemSettings.tradingRewardsEnabled());
				assert.isFalse(await exchanger.tradingRewardsEnabled());
			});

			describe('when performing an exchange', () => {
				before('perform an exchange and get tx logs', async () => {
					const exchangeTx = await synthetix.exchange(sUSD, amountExchanged, sETH, {
						from: account1,
					});

					exchangeLogs = await getDecodedLogs({
						hash: exchangeTx.tx,
						contracts: [synthetix, rewards],
					});
					exchangeLogs = exchangeLogs.filter(log => log !== undefined);
				});

				it('emitted a SynthExchange event', async () => {
					assert.isTrue(exchangeLogs.some(log => log.name === 'SynthExchange'));
				});

				it('did not emit an ExchangeFeeRecorded event', async () => {
					assert.isFalse(exchangeLogs.some(log => log.name === 'ExchangeFeeRecorded'));
				});
			});
		});

		describe('when SystemSettings tradingRewardsEnabled is set to true', () => {
			before(async () => (snapshotId = await takeSnapshot()));
			after(async () => await restoreSnapshot(snapshotId));

			before('set tradingRewardsEnabled to true', async () => {
				await systemSettings.setTradingRewardsEnabled(true, { from: owner });
			});

			it('tradingRewardsEnabled is true', async () => {
				assert.isTrue(await systemSettings.tradingRewardsEnabled());
				assert.isTrue(await exchanger.tradingRewardsEnabled());
			});

			describe('when performing an exchange', () => {
				before('perform an exchange and get tx logs', async () => {
					const exchangeTx = await synthetix.exchange(sUSD, amountExchanged, sETH, {
						from: account1,
					});

					exchangeLogs = await getDecodedLogs({
						hash: exchangeTx.tx,
						contracts: [synthetix, rewards],
					});
					exchangeLogs = exchangeLogs.filter(log => log !== undefined);
				});

				it('emitted a SynthExchange event', async () => {
					assert.isTrue(exchangeLogs.some(log => log.name === 'SynthExchange'));
				});

				it('emitted an ExchangeFeeRecorded event', async () => {
					assert.isTrue(exchangeLogs.some(log => log.name === 'ExchangeFeeRecorded'));
				});
			});
		});

		describe('when performing exchanges via different entry points', () => {
			before(async () => (snapshotId = await takeSnapshot()));
			after(async () => await restoreSnapshot(snapshotId));

			function itExchangesNormally({ exchangeFn, description }) {
				describe(description, () => {
					before(async () => (snapshotId = await takeSnapshot()));
					after(async () => await restoreSnapshot(snapshotId));

					before('perform the exchange', async () => {
						await exchangeFn();
					});

					it('deducted the correct amount of sUSD', async () => {
						assert.bnEqual(
							await sUSDContract.balanceOf(account1),
							amountIssued.sub(amountExchanged)
						);
					});

					it('produced the correct amount of sETH', async () => {
						assert.bnEqual(await sETHContract.balanceOf(account1), expectedAmountReceived);
					});
				});
			}

			itExchangesNormally({
				description: 'when performing an exchange via synthetix.exchange',
				exchangeFn: async () =>
					await synthetix.exchange(sUSD, amountExchanged, sETH, { from: account1 }),
			});

			itExchangesNormally({
				description: 'when performing an exchange via synthetix.exchangeWithTracking',
				exchangeFn: async () =>
					await synthetix.exchangeWithTracking(
						sUSD,
						amountExchanged,
						sETH,
						account1,
						trackingCode,
						{
							from: account1
						}
					),
			});

			// TODO
			// itExchangesNormally({
			// 	description: 'when performing an exchange via synthetix.exchangeOnBehalf',
			// 	exchangeFn: async () =>
			// 		await synthetix.exchangeOnBehalf(account1, sUSD, amountExchanged, sETH, { from: aggregator }),
			// });

			// TODO
			// itExchangesNormally({
			// 	description: 'when performing an exchange via synthetix.exchangeOnBehalfWithTracking',
			// 	exchangeFn: async () =>
			// 		await synthetix.exchangeWithTracking(
			// 			sUSD,
			// 			amountExchanged,
			// 			sETH,
			// 			account1,
			// 			trackingCode,
			// 			{
			// 				from: account1
			// 			}
			// 		),
			// });
		});
	});
});
