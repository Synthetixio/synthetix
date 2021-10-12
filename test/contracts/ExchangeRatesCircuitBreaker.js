'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { currentTime, fastForward, toUnit } = require('../utils')();

const { setupAllContracts } = require('./setup');

const {
	setExchangeFeeRateForSynths,
	getDecodedLogs,
	decodedEventEqual,
	onlyGivenAddressCanInvoke,
	setStatus,
} = require('./helpers');

const {
	toBytes32,
	defaults: { PRICE_DEVIATION_THRESHOLD_FACTOR },
} = require('../..');

contract('ExchangeRatesCircuitBreaker tests', async accounts => {
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
		sETHContract,
		oracle,
		timestamp,
		exchanger,
		exchangeFeeRate,
		cicruitBreaker,
		amountIssued,
		systemSettings,
		systemStatus,
		resolver;

	const itSetsLastExchangeRateForSynth = () => {
		describe('setLastExchangeRateForSynth() SIP-78', () => {
			it('cannot be invoked by any user', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: cicruitBreaker.setLastExchangeRateForSynth,
					args: [sEUR, toUnit('100')],
					accounts,
					reason: 'Restricted to ExchangeRates',
				});
			});

			describe('when ExchangeRates is spoofed using an account', () => {
				beforeEach(async () => {
					await resolver.importAddresses([toBytes32('ExchangeRates')], [account1], {
						from: owner,
					});
					await cicruitBreaker.rebuildCache();
				});
				it('reverts when invoked by ExchangeRates with a 0 rate', async () => {
					await assert.revert(
						cicruitBreaker.setLastExchangeRateForSynth(sEUR, '0', { from: account1 }),
						'Rate must be above 0'
					);
				});
				describe('when invoked with a real rate by ExchangeRates', () => {
					let resetTx;
					beforeEach(async () => {
						resetTx = await cicruitBreaker.setLastExchangeRateForSynth(sEUR, toUnit('1.9'), {
							from: account1,
						});
					});
					it('then lastExchangeRate is set for the synth', async () => {
						assert.bnEqual(await cicruitBreaker.lastExchangeRate(sEUR), toUnit('1.9'));
					});
					it('then it emits an LastRateOverriden', async () => {
						const logs = await getDecodedLogs({
							hash: resetTx.tx,
							contracts: [cicruitBreaker],
						});
						decodedEventEqual({
							log: logs.find(({ name }) => name === 'LastRateOverriden'),
							event: 'LastRateOverriden',
							emittedFrom: cicruitBreaker.address,
							args: [sEUR, toUnit('0'), toUnit('1.9')],
						});
					});
				});
			});
		});
	};

	const itDeviatesCorrectly = () => {
		describe('priceDeviationThresholdFactor()', () => {
			it('the default is configured correctly', async () => {
				// Note: this only tests the effectiveness of the setup script, not the deploy script,
				assert.equal(
					await cicruitBreaker.priceDeviationThresholdFactor(),
					PRICE_DEVIATION_THRESHOLD_FACTOR
				);
			});
		});

		describe('isDeviationAboveThreshold()', () => {
			it('true if ratio == deviation factor', async () => {
				assert.isTrue(await cicruitBreaker.isDeviationAboveThreshold(toUnit('100'), toUnit('300')));
				assert.isTrue(await cicruitBreaker.isDeviationAboveThreshold(toUnit('300'), toUnit('100')));
			});

			it('true if ratio > deviation factor', async () => {
				assert.isTrue(await cicruitBreaker.isDeviationAboveThreshold(toUnit('301'), toUnit('100')));
				assert.isTrue(await cicruitBreaker.isDeviationAboveThreshold(toUnit('100'), toUnit('301')));
			});

			it('false if ratio < deviation factor', async () => {
				assert.isFalse(
					await cicruitBreaker.isDeviationAboveThreshold(toUnit('100'), toUnit('299'))
				);
				assert.isFalse(
					await cicruitBreaker.isDeviationAboveThreshold(toUnit('299'), toUnit('100'))
				);
			});

			it('true if either one is zero', async () => {
				assert.isTrue(await cicruitBreaker.isDeviationAboveThreshold(toUnit('100'), toUnit('0')));
				assert.isTrue(await cicruitBreaker.isDeviationAboveThreshold(toUnit('0'), toUnit('100')));
				assert.isTrue(await cicruitBreaker.isDeviationAboveThreshold(toUnit('0'), toUnit('0')));
			});

			describe('changing the factor works', () => {
				describe('when the factor is set to 3.1', () => {
					beforeEach(async () => {
						await systemSettings.setPriceDeviationThresholdFactor(toUnit('3.1'), { from: owner });
					});
					it('false if ratio < new deviation factor but > old deviation factor', async () => {
						assert.isFalse(
							await cicruitBreaker.isDeviationAboveThreshold(toUnit('100'), toUnit('300'))
						);
						assert.isFalse(
							await cicruitBreaker.isDeviationAboveThreshold(toUnit('300'), toUnit('100'))
						);
					});
				});
			});
		});
	};

	const itPricesSpikeDeviation = () => {
		describe('priceSpikeDeviation', () => {
			const baseRate = 100;

			const updateRate = ({ target, rate }) => {
				beforeEach(async () => {
					await fastForward(10);
					await exchangeRates.updateRates(
						[target],
						[toUnit(rate.toString())],
						await currentTime(),
						{
							from: oracle,
						}
					);
				});
			};

			describe('resetLastExchangeRate() SIP-139', () => {
				it('cannot be invoked by any user', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: cicruitBreaker.resetLastExchangeRate,
						args: [[sEUR, sAUD]],
						accounts,
						address: owner,
						reason: 'Only the contract owner may perform this action',
					});
				});
				it('when invoked without valid exchange rates, it reverts', async () => {
					await assert.revert(
						cicruitBreaker.resetLastExchangeRate([sEUR, sAUD, toBytes32('sUNKNOWN')], {
							from: owner,
						}),
						'Rates for given synths not valid'
					);
				});
			});

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
					describe('lastExchangeRate is persisted during exchanges', () => {
						it('initially has no entries', async () => {
							assert.equal(await cicruitBreaker.lastExchangeRate(sETH), '0');
							assert.equal(await cicruitBreaker.lastExchangeRate(sEUR), '0');
						});
						describe('when a user exchanges into sETH from sUSD', () => {
							beforeEach(async () => {
								await synthetix.exchange(sUSD, toUnit('100'), sETH, { from: account1 });
							});
							it('and the dest side has a rate persisted', async () => {
								assert.bnEqual(
									await cicruitBreaker.lastExchangeRate(sETH),
									toUnit(baseRate.toString())
								);
							});
						});
						describe('when a user exchanges from sETH into another synth', () => {
							beforeEach(async () => {
								await sETHContract.issue(account1, toUnit('1'));
								await synthetix.exchange(sETH, toUnit('1'), sEUR, { from: account1 });
							});
							it('then the source side has a rate persisted', async () => {
								assert.bnEqual(
									await cicruitBreaker.lastExchangeRate(sETH),
									toUnit(baseRate.toString())
								);
							});
							it('and the dest side has a rate persisted', async () => {
								// Rate of 2 from shared setup code above
								assert.bnEqual(await cicruitBreaker.lastExchangeRate(sEUR), toUnit('2'));
							});
							describe('when the price of sETH changes slightly', () => {
								updateRate({ target: sETH, rate: baseRate * 1.1 });
								describe('and another user exchanges sETH to sUSD', () => {
									beforeEach(async () => {
										await sETHContract.issue(account2, toUnit('1'));
										await synthetix.exchange(sETH, toUnit('1'), sUSD, { from: account2 });
									});
									it('then the source side has a new rate persisted', async () => {
										assert.bnEqual(
											await cicruitBreaker.lastExchangeRate(sETH),
											toUnit((baseRate * 1.1).toString())
										);
									});
								});
							});
							describe('when the price of sETH is over a deviation', () => {
								beforeEach(async () => {
									// sETH over deviation and sEUR slight change
									await fastForward(10);
									await exchangeRates.updateRates(
										[sETH, sEUR],
										[toUnit(baseRate * 3).toString(), toUnit('1.9')],
										await currentTime(),
										{
											from: oracle,
										}
									);
								});
								describe('and another user exchanges sETH to sEUR', () => {
									beforeEach(async () => {
										await sETHContract.issue(account2, toUnit('1'));
										await synthetix.exchange(sETH, toUnit('1'), sEUR, { from: account2 });
									});
									it('then the source side has not persisted the rate', async () => {
										assert.bnEqual(
											await cicruitBreaker.lastExchangeRate(sETH),
											toUnit(baseRate.toString())
										);
									});
									it('then the dest side has persisted the rate', async () => {
										assert.bnEqual(await cicruitBreaker.lastExchangeRate(sEUR), toUnit('1.9'));
									});
								});
							});
							describe('when the price of sEUR is over a deviation', () => {
								beforeEach(async () => {
									// sEUR over deviation and sETH slight change
									await fastForward(10);
									await exchangeRates.updateRates(
										[sETH, sEUR],
										[toUnit(baseRate * 1.1).toString(), toUnit('10')],
										await currentTime(),
										{
											from: oracle,
										}
									);
								});
								describe('and another user exchanges sEUR to sETH', () => {
									beforeEach(async () => {
										await sETHContract.issue(account2, toUnit('1'));
										await synthetix.exchange(sETH, toUnit('1'), sEUR, { from: account2 });
									});
									it('then the source side has persisted the rate', async () => {
										assert.bnEqual(
											await cicruitBreaker.lastExchangeRate(sETH),
											toUnit((baseRate * 1.1).toString())
										);
									});
									it('and the dest side has not persisted the rate', async () => {
										assert.bnEqual(await cicruitBreaker.lastExchangeRate(sEUR), toUnit('2'));
									});

									describe('when the owner invokes resetLastExchangeRate([sEUR, sETH])', () => {
										let resetTx;

										beforeEach(async () => {
											resetTx = await cicruitBreaker.resetLastExchangeRate([sEUR, sETH], {
												from: owner,
											});
										});

										it('then the sEUR last exchange rate is updated to the current price', async () => {
											assert.bnEqual(await cicruitBreaker.lastExchangeRate(sEUR), toUnit('10'));
										});

										it('and the sETH rate has not changed', async () => {
											assert.bnEqual(
												await cicruitBreaker.lastExchangeRate(sETH),
												toUnit((baseRate * 1.1).toString())
											);
										});

										it('then it emits an LastRateOverriden', async () => {
											const logs = await getDecodedLogs({
												hash: resetTx.tx,
												contracts: [cicruitBreaker],
											});
											decodedEventEqual({
												log: logs.find(({ name }) => name === 'LastRateOverriden'),
												event: 'LastRateOverriden',
												emittedFrom: cicruitBreaker.address,
												args: [sEUR, toUnit('2'), toUnit('10')],
											});
										});
									});
								});
							});
						});
					});

					describe('the isSynthRateInvalid() view correctly returns status', () => {
						it('when called with a synth with only a single rate, returns false', async () => {
							assert.equal(await cicruitBreaker.isSynthRateInvalid(sETH), false);
						});
						it('when called with a synth with no rate (i.e. 0), returns true', async () => {
							assert.equal(await cicruitBreaker.isSynthRateInvalid(toBytes32('XYZ')), true);
						});
						describe('when a synth rate changes outside of the range', () => {
							updateRate({ target: sETH, rate: baseRate * 2 });

							it('when called with that synth, returns true', async () => {
								assert.equal(await cicruitBreaker.isSynthRateInvalid(sETH), true);
							});

							describe('when the synth rate changes back into the range', () => {
								updateRate({ target: sETH, rate: baseRate });

								it('then when called with the target, still returns true', async () => {
									assert.equal(await cicruitBreaker.isSynthRateInvalid(sETH), true);
								});
							});
						});
						describe('when there is a last rate into sETH via an exchange', () => {
							beforeEach(async () => {
								await synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account2 });
							});

							describe('when a synth rate changes outside of the range and then returns to the range', () => {
								updateRate({ target: sETH, rate: baseRate * 2 });
								updateRate({ target: sETH, rate: baseRate * 1.2 });

								it('then when called with the target, returns false', async () => {
									assert.equal(await cicruitBreaker.isSynthRateInvalid(sETH), false);
								});
							});
						});

						describe('when there is a last price out of sETH via an exchange', () => {
							beforeEach(async () => {
								await sETHContract.issue(account2, toUnit('1'));
								await synthetix.exchange(sETH, toUnit('0.001'), sUSD, { from: account2 });
							});

							describe('when a synth price changes outside of the range and then returns to the range', () => {
								updateRate({ target: sETH, rate: baseRate * 2 });
								updateRate({ target: sETH, rate: baseRate * 1.2 });

								it('then when called with the target, returns false', async () => {
									assert.equal(await cicruitBreaker.isSynthRateInvalid(sETH), false);
								});
							});
						});
					});

					describe('suspension invoked by anyone via rateWithCircuitBroken()', () => {
						// sTRX relies on the fact that sTRX is a valid synth but never given a rate in the setup code
						// above
						const synthWithNoRate = toBytes32('sTRX');
						it('when called with invalid synth, then reverts', async () => {
							await assert.revert(
								cicruitBreaker.rateWithCircuitBroken(toBytes32('XYZ')),
								'No such synth'
							);
						});
						describe('when called with a synth with no price', () => {
							let logs;
							beforeEach(async () => {
								const { tx: hash } = await cicruitBreaker.rateWithCircuitBroken(synthWithNoRate);
								logs = await getDecodedLogs({
									hash,
									contracts: [synthetix, exchanger, systemStatus],
								});
							});
							it('then suspension works as expected', async () => {
								const { suspended, reason } = await systemStatus.synthSuspension(synthWithNoRate);
								assert.ok(suspended);
								assert.equal(reason, '65');
								assert.ok(logs.some(({ name }) => name === 'SynthSuspended'));
							});
						});

						describe('when the system is suspended', () => {
							beforeEach(async () => {
								await setStatus({ owner, systemStatus, section: 'System', suspend: true });
							});
							it('then suspending a synth has no effect', async () => {
								await cicruitBreaker.rateWithCircuitBroken(synthWithNoRate);
								// did not suspend it
								const status = await systemStatus.synthSuspension(synthWithNoRate);
								assert.isFalse(status[0]);
								// did not persist rate
								const lastRate = await cicruitBreaker.lastExchangeRate(synthWithNoRate);
								assert.equal(lastRate, 0);
							});
							describe(`when system is resumed`, () => {
								beforeEach(async () => {
									await setStatus({ owner, systemStatus, section: 'System', suspend: false });
								});
								it('then suspension works as expected', async () => {
									await cicruitBreaker.rateWithCircuitBroken(synthWithNoRate);
									const { suspended, reason } = await systemStatus.synthSuspension(synthWithNoRate);
									assert.ok(suspended);
									assert.equal(reason, '65');
								});
							});
						});
					});

					describe('edge case: resetting an iSynth resets the lastExchangeRate (SIP-78)', () => {
						describe('when setInversePricing is invoked with no underlying rate', () => {
							it('it does not revert', async () => {
								await exchangeRates.setInversePricing(
									iETH,
									toUnit(4000),
									toUnit(6500),
									toUnit(1000),
									false,
									false,
									{
										from: owner,
									}
								);
							});
						});
						describe('when an iSynth is set with inverse pricing and has a price in bounds', () => {
							beforeEach(async () => {
								await exchangeRates.setInversePricing(
									iBTC,
									toUnit(4000),
									toUnit(6500),
									toUnit(1000),
									false,
									false,
									{
										from: owner,
									}
								);
							});
							// in-bounds update
							updateRate({ target: iBTC, rate: 4100 });

							describe('when a user exchanges into the iSynth', () => {
								beforeEach(async () => {
									await synthetix.exchange(sUSD, toUnit('100'), iBTC, { from: account1 });
								});
								it('then last exchange rate is correct', async () => {
									assert.bnEqual(await cicruitBreaker.lastExchangeRate(iBTC), toUnit(3900));
								});
								describe('when the inverse is reset with different limits, yielding a rate above the deviation factor', () => {
									beforeEach(async () => {
										await exchangeRates.setInversePricing(
											iBTC,
											toUnit(8000),
											toUnit(10500),
											toUnit(5000),
											false,
											false,
											{
												from: owner,
											}
										);
									});
									describe('when a user exchanges into the iSynth', () => {
										beforeEach(async () => {
											await synthetix.exchange(sUSD, toUnit('100'), iBTC, {
												from: account1,
											});
										});
										it('then the synth is not suspended', async () => {
											const { suspended } = await systemStatus.synthSuspension(iBTC);
											assert.ok(!suspended);
										});
										it('and the last exchange rate is the new rate (locked at lower limit)', async () => {
											assert.bnEqual(await cicruitBreaker.lastExchangeRate(iBTC), toUnit(10500));
										});
									});
								});
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
				Exchanger: exchanger,
				ExchangeRatesCircuitBreaker: cicruitBreaker,
				Synthetix: synthetix,
				ExchangeRates: exchangeRates,
				SystemStatus: systemStatus,
				SynthsUSD: sUSDContract,
				SynthsETH: sETHContract,
				SystemSettings: systemSettings,
				AddressResolver: resolver,
			} = await setupAllContracts({
				accounts,
				synths: ['sUSD', 'sETH', 'sEUR', 'sAUD', 'sBTC', 'iBTC', 'sTRX'],
				contracts: [
					'Exchanger',
					'ExchangeRatesCircuitBreaker',
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

			// Send a price update to guarantee we're not stale.
			oracle = account1;

			amountIssued = toUnit('1000');

			// give the first two accounts 1000 sUSD each
			await sUSDContract.issue(account1, amountIssued);
			await sUSDContract.issue(account2, amountIssued);
		});

		addSnapshotBeforeRestoreAfterEach();

		beforeEach(async () => {
			timestamp = await currentTime();
			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX, sETH, sBTC, iBTC],
				['0.5', '2', '1', '100', '5000', '5000'].map(toUnit),
				timestamp,
				{
					from: oracle,
				}
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

		itDeviatesCorrectly();

		itSetsLastExchangeRateForSynth();

		itPricesSpikeDeviation();
	});

	describe('When using MintableSynthetix', () => {
		before(async () => {
			({
				Exchanger: exchanger,
				ExchangeRatesCircuitBreaker: cicruitBreaker,
				Synthetix: synthetix,
				ExchangeRates: exchangeRates,
				SystemStatus: systemStatus,
				SynthsUSD: sUSDContract,
				SynthsETH: sETHContract,
				SystemSettings: systemSettings,
				AddressResolver: resolver,
			} = await setupAllContracts({
				accounts,
				synths: ['sUSD', 'sETH', 'sEUR', 'sAUD', 'sBTC', 'iBTC', 'sTRX'],
				contracts: [
					'Exchanger',
					'ExchangeRatesCircuitBreaker',
					'ExchangeState',
					'ExchangeRates',
					'DebtCache',
					'Issuer', // necessary for synthetix transfers to succeed
					'FeePool',
					'FeePoolEternalStorage',
					'MintableSynthetix',
					'SystemStatus',
					'SystemSettings',
					'DelegateApprovals',
					'FlexibleStorage',
					'CollateralManager',
				],
			}));

			// Send a price update to guarantee we're not stale.
			oracle = account1;

			amountIssued = toUnit('1000');

			// give the first two accounts 1000 sUSD each
			await sUSDContract.issue(account1, amountIssued);
			await sUSDContract.issue(account2, amountIssued);
		});

		addSnapshotBeforeRestoreAfterEach();

		beforeEach(async () => {
			timestamp = await currentTime();
			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX, sETH, sBTC, iBTC],
				['0.5', '2', '1', '100', '5000', '5000'].map(toUnit),
				timestamp,
				{
					from: oracle,
				}
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

		itDeviatesCorrectly();

		itSetsLastExchangeRateForSynth();

		itPricesSpikeDeviation();
	});
});
