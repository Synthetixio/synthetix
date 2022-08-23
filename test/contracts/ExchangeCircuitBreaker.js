'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { fastForward, toUnit } = require('../utils')();

const { setupAllContracts } = require('./setup');

const {
	setExchangeFeeRateForSynths,
	setupPriceAggregators,
	updateAggregatorRates,
} = require('./helpers');

const { toBytes32 } = require('../..');

contract('ExchangeCircuitBreaker tests', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, sBTC, iBTC, sETH, iETH] = [
		'sUSD',
		'sAUD',
		'sEUR',
		'SNX',
		'sBTC',
		'iBTC',
		'sETH',
		'iETH',
	].map(toBytes32);

	const synthKeys = [sUSD, sAUD, sEUR, sBTC, iBTC, sETH, iETH];

	const [, owner, account1, account2] = accounts;

	let synthetix,
		exchangeRates,
		sUSDContract,
		exchangeFeeRate,
		exchangeCircuitBreaker,
		circuitBreaker,
		amountIssued,
		systemSettings;

	// utility function update rates for aggregators that are already set up
	async function updateRates(keys, rates, resetCircuitBreaker = true) {
		await updateAggregatorRates(
			exchangeRates,
			resetCircuitBreaker ? circuitBreaker : null,
			keys,
			rates
		);
	}

	const itPricesSpikeDeviation = () => {
		// skipped because the relevant functionality has been replaced by `CircuitBreaker`
		describe('priceSpikeDeviation', () => {
			const baseRate = 100;

			const updateRate = ({ target, rate, resetCircuitBreaker }) => {
				beforeEach(async () => {
					await fastForward(10);
					await updateRates([target], [toUnit(rate.toString())], resetCircuitBreaker);
				});
			};

			describe(`when the price of sETH is ${baseRate}`, () => {
				updateRate({ target: sETH, rate: baseRate });

				describe('when price spike deviation is set to a factor of 2', () => {
					const baseFactor = 2;
					beforeEach(async () => {
						await systemSettings.setPriceDeviationThresholdFactor(toUnit(baseFactor.toString()), {
							from: owner,
						});
					});

					// lastExchangeRate, used for price deviations (SIP-65)
					describe('lastValue in new CircuitBreaker is persisted during exchanges', () => {
						describe('when a user exchanges into sETH from sUSD', () => {
							beforeEach(async () => {
								await synthetix.exchange(sUSD, toUnit('100'), sETH, { from: account1 });
							});
							it('and the dest side has a rate persisted', async () => {
								assert.bnEqual(
									await circuitBreaker.lastValue(await exchangeRates.aggregators(sETH)),
									toUnit(baseRate.toString())
								);
							});
						});
					});

					describe('the rateWithInvalid() view correctly returns status', () => {
						updateRate({ target: sETH, rate: baseRate, resetCircuitBreaker: true });

						let res;
						it('when called with a synth with only a single rate, returns false', async () => {
							res = await exchangeCircuitBreaker.rateWithInvalid(sETH);
							assert.bnEqual(res[0], toUnit(baseRate));
							assert.equal(res[1], false);
						});
						it('when called with a synth with no rate (i.e. 0), returns true', async () => {
							res = await exchangeCircuitBreaker.rateWithInvalid(toBytes32('XYZ'));
							assert.bnEqual(res[0], 0);
							assert.equal(res[1], true);
						});
						describe('when a synth rate changes outside of the range', () => {
							updateRate({ target: sETH, rate: baseRate * 3, resetCircuitBreaker: false });

							it('when called with that synth, returns true', async () => {
								res = await exchangeCircuitBreaker.rateWithInvalid(sETH);
								assert.bnEqual(res[0], toUnit(baseRate * 3));
								assert.equal(res[1], true);
							});
						});
					});
				});
			});
		});
	};

	describe('When using Synthetix', () => {
		before(async () => {
			const VirtualSynthMastercopy = artifacts.require('VirtualSynthMastercopy');

			({
				ExchangeCircuitBreaker: exchangeCircuitBreaker,
				CircuitBreaker: circuitBreaker,
				Synthetix: synthetix,
				ExchangeRates: exchangeRates,
				SynthsUSD: sUSDContract,
				SystemSettings: systemSettings,
			} = await setupAllContracts({
				accounts,
				synths: ['sUSD', 'sETH', 'sEUR', 'sAUD', 'sBTC', 'iBTC', 'sTRX'],
				contracts: [
					'Exchanger',
					'ExchangeCircuitBreaker',
					'CircuitBreaker',
					'ExchangeState',
					'ExchangeRates',
					'DebtCache',
					'Issuer', // necessary for synthetix transfers to succeed
					'FeePool',
					'FeePoolEternalStorage',
					'Synthetix',
					'SystemStatus',
					'SystemSettings',
					'DelegateApprovals',
					'FlexibleStorage',
					'CollateralManager',
				],
				mocks: {
					// Use a real VirtualSynthMastercopy so the spec tests can interrogate deployed vSynths
					VirtualSynthMastercopy: await VirtualSynthMastercopy.new(),
				},
			}));

			amountIssued = toUnit('1000');

			// give the first two accounts 1000 sUSD each
			await sUSDContract.issue(account1, amountIssued);
			await sUSDContract.issue(account2, amountIssued);
		});

		addSnapshotBeforeRestoreAfterEach();

		beforeEach(async () => {
			await setupPriceAggregators(exchangeRates, owner, [sAUD, sEUR, SNX, sETH, sBTC, iBTC]);
			await updateRates(
				[sAUD, sEUR, SNX, sETH, sBTC, iBTC],
				['0.5', '2', '1', '100', '5000', '5000'].map(toUnit)
			);

			// set a 0.5% exchange fee rate (1/200)
			exchangeFeeRate = toUnit('0.005');
			await setExchangeFeeRateForSynths({
				owner,
				systemSettings,
				synthKeys,
				exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
			});
		});

		itPricesSpikeDeviation();
	});
});
