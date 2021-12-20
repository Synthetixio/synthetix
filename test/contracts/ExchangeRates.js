'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const {
	currentTime,
	fastForward,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	bytesToString,
} = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	convertToDecimals,
	setupPriceAggregators,
	updateAggregatorRates,
} = require('./helpers');

const { setupAllContracts } = require('./setup');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
	defaults: { RATE_STALE_PERIOD, ATOMIC_TWAP_WINDOW },
} = require('../..');

const { toBN } = require('web3-utils');

const MockAggregator = artifacts.require('MockAggregatorV2V3');

contract('Exchange Rates', async accounts => {
	const [deployerAccount, owner, oracle, dexPriceAggregator, accountOne, accountTwo] = accounts;
	const [SNX, sJPY, sETH, sXTZ, sBNB, sUSD, sEUR, sAUD, GOLD, fastGasPrice] = [
		'SNX',
		'sJPY',
		'sETH',
		'sXTZ',
		'sBNB',
		'sUSD',
		'sEUR',
		'sAUD',
		'GOLD',
		'fastGasPrice',
	].map(toBytes32);
	let instance;
	let systemSettings;
	let aggregatorJPY;
	let aggregatorXTZ;
	let aggregatorFastGasPrice;
	let mockFlagsInterface;

	const itIncludesCorrectMutativeFunctions = contract => {
		const baseFunctions = ['addAggregator', 'removeAggregator'];
		const withDexPricingFunctions = baseFunctions.concat(['setDexPriceAggregator']);

		it('only expected functions should be mutative', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: instance.abi,
				ignoreParents: ['Owned', 'MixinResolver'],
				expected:
					contract === 'ExchangeRatesWithDexPricing' ? withDexPricingFunctions : baseFunctions,
			});
		});
	};

	const itIsConstructedCorrectly = contract => {
		describe('constructor', () => {
			it('should set constructor params on deployment', async () => {
				assert.equal(await instance.owner(), owner);
			});

			it('returns correct values for sUSD after deployment ', async () => {
				assert.bnEqual(await instance.rateForCurrency(sUSD), toUnit('1'));
				assert.equal(await instance.lastRateUpdateTimes(sUSD), 0);
			});
		});
	};

	const itCalculatesStaleRates = () => {
		describe('rateStalePeriod', () => {
			it('rateStalePeriod default is set correctly', async () => {
				assert.bnEqual(await instance.rateStalePeriod(), RATE_STALE_PERIOD);
			});
			describe('when rate stale is changed in the system settings', () => {
				const newRateStalePeriod = '3601';
				beforeEach(async () => {
					await systemSettings.setRateStalePeriod(newRateStalePeriod, { from: owner });
				});
				it('then rateStalePeriod is correctly updated', async () => {
					assert.bnEqual(await instance.rateStalePeriod(), newRateStalePeriod);
				});
			});
		});

		describe('rateIsStale()', () => {
			it('should never allow sUSD to go stale via rateIsStale', async () => {
				await fastForward(await instance.rateStalePeriod());
				const rateIsStale = await instance.rateIsStale(sUSD);
				assert.equal(rateIsStale, false);
			});

			// it('ensure reverts stale if not set', async () => {
			// 	// Set up rates for test
			// 	await systemSettings.setRateStalePeriod(30, { from: owner });
			// 	await assert.revert(instance.rateIsStale(toBytes32('GOLD')), 'invalid aggregator');
			// });

			it('ensure stale if not set', async () => {
				// Set up rates for test
				await systemSettings.setRateStalePeriod(30, { from: owner });
				assert.equal(await instance.rateIsStale(toBytes32('GOLD')), true);
			});

			it('make sure anyone can check if rate is stale', async () => {
				await instance.rateIsStale(sUSD, { from: oracle });
				await instance.rateIsStale(sUSD, { from: owner });
				await instance.rateIsStale(sUSD, { from: deployerAccount });
				await instance.rateIsStale(sUSD, { from: accountOne });
				await instance.rateIsStale(sUSD, { from: accountTwo });
			});
		});
	};

	const itCalculatesInvalidRates = () => {
		describe('anyRateIsInvalid()', () => {
			describe('stale scenarios', () => {
				it('anyRateIsInvalid conforms to rateStalePeriod', async () => {
					await setupAggregators([SNX, GOLD]);

					await updateRates([SNX, GOLD], [toUnit(0.1), toUnit(0.2)]);

					assert.equal(await instance.anyRateIsInvalid([SNX, GOLD]), false);

					await fastForward(await instance.rateStalePeriod());
					assert.equal(await instance.anyRateIsInvalid([SNX, GOLD]), true);

					await updateRates([SNX, GOLD], [toUnit(0.1), toUnit(0.2)]);
					assert.equal(await instance.anyRateIsInvalid([SNX, GOLD]), false);
				});

				it('should be able to confirm no rates are stale from a subset', async () => {
					// Set up rates for test
					await systemSettings.setRateStalePeriod(25, { from: owner });
					const encodedRateKeys1 = [
						toBytes32('ABC'),
						toBytes32('DEF'),
						toBytes32('GHI'),
						toBytes32('LMN'),
					];
					const encodedRateKeys2 = [
						toBytes32('OPQ'),
						toBytes32('RST'),
						toBytes32('UVW'),
						toBytes32('XYZ'),
					];
					const encodedRateKeys3 = [toBytes32('123'), toBytes32('456'), toBytes32('789')];
					const encodedRateValues1 = [
						web3.utils.toWei('1', 'ether'),
						web3.utils.toWei('2', 'ether'),
						web3.utils.toWei('3', 'ether'),
						web3.utils.toWei('4', 'ether'),
					];
					const encodedRateValues2 = [
						web3.utils.toWei('5', 'ether'),
						web3.utils.toWei('6', 'ether'),
						web3.utils.toWei('7', 'ether'),
						web3.utils.toWei('8', 'ether'),
					];
					const encodedRateValues3 = [
						web3.utils.toWei('9', 'ether'),
						web3.utils.toWei('10', 'ether'),
						web3.utils.toWei('11', 'ether'),
					];

					await setupAggregators([...encodedRateKeys1, ...encodedRateKeys2, ...encodedRateKeys3]);

					const updatedTime1 = await currentTime();
					await updateRates(encodedRateKeys1, encodedRateValues1, updatedTime1);

					await fastForward(5);
					const updatedTime2 = await currentTime();
					await updateRates(encodedRateKeys2, encodedRateValues2, updatedTime2);

					await fastForward(5);
					const updatedTime3 = await currentTime();
					await updateRates(encodedRateKeys3, encodedRateValues3, updatedTime3);

					await fastForward(12);
					const rateIsInvalid = await instance.anyRateIsInvalid([
						...encodedRateKeys2,
						...encodedRateKeys3,
					]);
					assert.equal(rateIsInvalid, false);
				});

				it('should be able to confirm a single rate is stale from a set of rates', async () => {
					// Set up rates for test
					await systemSettings.setRateStalePeriod(40, { from: owner });
					const encodedRateKeys1 = [
						toBytes32('ABC'),
						toBytes32('DEF'),
						toBytes32('GHI'),
						toBytes32('LMN'),
					];
					const encodedRateKeys2 = [toBytes32('OPQ')];
					const encodedRateKeys3 = [toBytes32('RST'), toBytes32('UVW'), toBytes32('XYZ')];
					const encodedRateValues1 = [
						web3.utils.toWei('1', 'ether'),
						web3.utils.toWei('2', 'ether'),
						web3.utils.toWei('3', 'ether'),
						web3.utils.toWei('4', 'ether'),
					];
					const encodedRateValues2 = [web3.utils.toWei('5', 'ether')];
					const encodedRateValues3 = [
						web3.utils.toWei('6', 'ether'),
						web3.utils.toWei('7', 'ether'),
						web3.utils.toWei('8', 'ether'),
					];

					await setupAggregators([...encodedRateKeys1, ...encodedRateKeys2, ...encodedRateKeys3]);

					const updatedTime2 = await currentTime();
					await updateRates(encodedRateKeys2, encodedRateValues2, updatedTime2);
					await fastForward(20);

					const updatedTime1 = await currentTime();
					await updateRates(encodedRateKeys1, encodedRateValues1, updatedTime1);
					await fastForward(15);

					const updatedTime3 = await currentTime();
					await updateRates(encodedRateKeys3, encodedRateValues3, updatedTime3);

					await fastForward(6);
					const rateIsInvalid = await instance.anyRateIsInvalid([
						...encodedRateKeys2,
						...encodedRateKeys3,
					]);
					assert.equal(rateIsInvalid, true);
				});

				it('should be able to confirm a single rate (from a set of 1) is stale', async () => {
					// Set up rates for test
					await systemSettings.setRateStalePeriod(40, { from: owner });
					const key = toBytes32('ABC');
					await setupAggregators([key]);
					await updateRates([key], [web3.utils.toWei('2', 'ether')]);
					await fastForward(41);

					const rateIsInvalid = await instance.anyRateIsInvalid([key]);
					assert.equal(rateIsInvalid, true);
				});

				it('make sure anyone can check if any rates are stale', async () => {
					const rateKey = toBytes32('ABC');
					await setupAggregators([rateKey]);
					await instance.anyRateIsInvalid([rateKey], { from: oracle });
					await instance.anyRateIsInvalid([rateKey], { from: owner });
					await instance.anyRateIsInvalid([rateKey], { from: deployerAccount });
					await instance.anyRateIsInvalid([rateKey], { from: accountOne });
					await instance.anyRateIsInvalid([rateKey], { from: accountTwo });
				});

				it('ensure rates are considered stale if not set', async () => {
					// Set up rates for test
					await systemSettings.setRateStalePeriod(40, { from: owner });
					const encodedRateKeys1 = [
						toBytes32('ABC'),
						toBytes32('DEF'),
						toBytes32('GHI'),
						toBytes32('LMN'),
					];
					const encodedRateValues1 = [
						web3.utils.toWei('1', 'ether'),
						web3.utils.toWei('2', 'ether'),
						web3.utils.toWei('3', 'ether'),
						web3.utils.toWei('4', 'ether'),
					];

					const staleKey = toBytes32('RST');
					const allKeys = [...encodedRateKeys1, staleKey];

					await setupAggregators(allKeys);
					await updateRates(encodedRateKeys1, encodedRateValues1);

					const rateIsInvalid = await instance.anyRateIsInvalid(allKeys);
					assert.equal(rateIsInvalid, true);
				});
			});

			describe('flagged scenarios', () => {
				describe('when sJPY aggregator is added', () => {
					beforeEach(async () => {
						await instance.addAggregator(sJPY, aggregatorJPY.address, {
							from: owner,
						});
					});
					describe('when aggregated synth has rates', () => {
						beforeEach(async () => {
							const timestamp = await currentTime();
							await aggregatorJPY.setLatestAnswer(convertToDecimals(100, 8), timestamp);
						});
						it('then rateIsInvalid is false', async () => {
							const rateIsInvalid = await instance.anyRateIsInvalid([sJPY, sUSD]);
							assert.equal(rateIsInvalid, false);
						});

						describe('when the flags interface is set', () => {
							beforeEach(async () => {
								// replace the FlagsInterface mock with a fully fledged mock that can
								// return arrays of information

								await systemSettings.setAggregatorWarningFlags(mockFlagsInterface.address, {
									from: owner,
								});
							});

							it('then rateIsInvalid is still false', async () => {
								const rateIsInvalid = await instance.anyRateIsInvalid([sJPY, sUSD]);
								assert.equal(rateIsInvalid, false);
							});

							describe('when the sJPY aggregator is flagged', () => {
								beforeEach(async () => {
									await mockFlagsInterface.flagAggregator(aggregatorJPY.address);
								});
								it('then rateIsInvalid is true', async () => {
									const rateIsInvalid = await instance.anyRateIsInvalid([sJPY, sUSD]);
									assert.equal(rateIsInvalid, true);
								});
							});
						});
					});
				});
			});
		});
	};

	const itCalculatesLastUpdateTime = () => {
		describe('lastRateUpdateTimesForCurrencies()', () => {
			it('should return correct last rate update times for specific currencies', async () => {
				const abc = toBytes32('lABC');
				const timeSent = await currentTime();
				const listOfKeys = [abc, toBytes32('lDEF'), toBytes32('lGHI')];
				await setupAggregators(listOfKeys);

				await updateRates(listOfKeys.slice(0, 2), [toUnit('1.3'), toUnit('2.4')], timeSent);

				await fastForward(100);
				const newTimeSent = await currentTime();
				await updateRates(listOfKeys.slice(2), [toUnit('3.5')], newTimeSent);

				const lastUpdateTimes = await instance.lastRateUpdateTimesForCurrencies(listOfKeys);
				assert.notEqual(timeSent, newTimeSent);
				assert.equal(lastUpdateTimes.length, listOfKeys.length);
				assert.equal(lastUpdateTimes[0], timeSent);
				assert.equal(lastUpdateTimes[1], timeSent);
				assert.equal(lastUpdateTimes[2], newTimeSent);
			});

			it('should return correct last rate update time for a specific currency', async () => {
				const abc = toBytes32('lABC');
				const def = toBytes32('lDEF');
				const ghi = toBytes32('lGHI');
				await setupAggregators([abc, def, ghi]);

				const timeSent = await currentTime();
				await updateRates([abc, def], [toUnit('1.3'), toUnit('2.4')], timeSent);

				await fastForward(10000);
				const timeSent2 = await currentTime();
				await updateRates([ghi], [toUnit('2.4')], timeSent2);

				const [firstTS, secondTS] = await Promise.all([
					instance.lastRateUpdateTimes(abc),
					instance.lastRateUpdateTimes(ghi),
				]);
				assert.equal(firstTS, timeSent);
				assert.equal(secondTS, timeSent2);
			});
		});
	};

	const itCalculatesEffectiveValue = () => {
		describe('effectiveValue() and effectiveValueAndRates()', () => {
			describe('when a price is sent to the oracle', () => {
				beforeEach(async () => {
					// Send a price update to guarantee we're not depending on values from outside this test.
					const keys = [sAUD, sEUR, SNX];
					await setupAggregators(keys);
					await updateRates(keys, ['0.5', '1.25', '0.1'].map(toUnit));
				});

				it('should correctly calculate an exchange rate in effectiveValue()', async () => {
					// 1 sUSD should be worth 2 sAUD.
					assert.bnEqual(await instance.effectiveValue(sUSD, toUnit('1'), sAUD), toUnit('2'));

					// 10 SNX should be worth 1 sUSD.
					assert.bnEqual(await instance.effectiveValue(SNX, toUnit('10'), sUSD), toUnit('1'));

					// 2 sEUR should be worth 2.50 sUSD
					assert.bnEqual(await instance.effectiveValue(sEUR, toUnit('2'), sUSD), toUnit('2.5'));
				});

				it('should calculate updated rates in effectiveValue()', async () => {
					// Add stale period to the time to ensure we go stale.
					await fastForward((await instance.rateStalePeriod()) + 1);

					// Update all rates except sUSD.
					await updateRates([sEUR, SNX], ['1.25', '0.1'].map(toUnit));

					const amountOfSynthetixs = toUnit('10');
					const amountOfEur = toUnit('0.8');

					// Should now be able to convert from SNX to sEUR since they are both not stale.
					assert.bnEqual(await instance.effectiveValue(SNX, amountOfSynthetixs, sEUR), amountOfEur);
				});

				// it('should revert when relying on a non-existant dest exchange rate in effectiveValue()', async () => {
				// 	await assert.revert(
				// 		instance.effectiveValue(SNX, toUnit('10'), toBytes32('XYZ')),
				// 		'invalid aggregator'
				// 	);
				// });

				it('should return 0 when relying on a non-existant dest exchange rate in effectiveValue()', async () => {
					assert.equal(await instance.effectiveValue(SNX, toUnit('10'), toBytes32('XYZ')), 0);
				});

				// it('should revert when relying on a non-existing src rate in effectiveValue', async () => {
				// 	await assert.revert(
				// 		instance.effectiveValue(toBytes32('XYZ'), toUnit('10'), SNX),
				// 		'invalid aggregator'
				// 	);
				// });

				it('should revert when relying on a non-existing src rate in effectiveValue', async () => {
					assert.equal(await instance.effectiveValue(toBytes32('XYZ'), toUnit('10'), SNX), 0);
				});

				it('effectiveValueAndRates() should return rates as well with sUSD on one side', async () => {
					const { value, sourceRate, destinationRate } = await instance.effectiveValueAndRates(
						sUSD,
						toUnit('1'),
						sAUD
					);

					assert.bnEqual(value, toUnit('2'));
					assert.bnEqual(sourceRate, toUnit('1'));
					assert.bnEqual(destinationRate, toUnit('0.5'));
				});

				it('effectiveValueAndRates() should return rates as well with sUSD on the other side', async () => {
					const { value, sourceRate, destinationRate } = await instance.effectiveValueAndRates(
						sAUD,
						toUnit('1'),
						sUSD
					);

					assert.bnEqual(value, toUnit('0.5'));
					assert.bnEqual(sourceRate, toUnit('0.5'));
					assert.bnEqual(destinationRate, toUnit('1'));
				});

				it('effectiveValueAndRates() should return rates as well with two live rates', async () => {
					const { value, sourceRate, destinationRate } = await instance.effectiveValueAndRates(
						sAUD,
						toUnit('1'),
						sEUR
					);

					assert.bnEqual(value, toUnit('0.4')); // 0.5/1.25 = 0.4
					assert.bnEqual(sourceRate, toUnit('0.5'));
					assert.bnEqual(destinationRate, toUnit('1.25'));
				});
			});
		});
	};

	const itReadsFromAggregator = () => {
		describe('when the flags interface is set', () => {
			beforeEach(async () => {
				// replace the FlagsInterface mock with a fully fledged mock that can
				// return arrays of information

				await systemSettings.setAggregatorWarningFlags(mockFlagsInterface.address, { from: owner });
			});
			describe('aggregatorWarningFlags', () => {
				it('is set correctly', async () => {
					assert.equal(await instance.aggregatorWarningFlags(), mockFlagsInterface.address);
				});
			});

			describe('pricing aggregators', () => {
				it('only an owner can add an aggregator', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: instance.addAggregator,
						args: [sJPY, aggregatorJPY.address],
						accounts,
						address: owner,
					});
				});

				describe('When an aggregator with more than 18 decimals is added', () => {
					it('an aggregator should return a value with 18 decimals or less', async () => {
						const newAggregator = await MockAggregator.new({ from: owner });
						await newAggregator.setDecimals('19');
						await assert.revert(
							instance.addAggregator(sJPY, newAggregator.address, {
								from: owner,
							}),
							'Aggregator decimals should be lower or equal to 18'
						);
					});
				});

				describe('when a user queries the first entry in aggregatorKeys', () => {
					it('then it is empty', async () => {
						await assert.invalidOpcode(instance.aggregatorKeys(0));
					});
				});

				describe('when the owner attempts to add an invalid address for sJPY ', () => {
					it('then zero address is invalid', async () => {
						await assert.revert(
							instance.addAggregator(sJPY, ZERO_ADDRESS, {
								from: owner,
							})
							// 'function call to a non-contract account' (this reason is not valid in Ganache so fails in coverage)
						);
					});
					it('and a non-aggregator address is invalid', async () => {
						await assert.revert(
							instance.addAggregator(sJPY, instance.address, {
								from: owner,
							})
							// 'function selector was not recognized'  (this reason is not valid in Ganache so fails in coverage)
						);
					});
				});

				it('currenciesUsingAggregator for a rate returns an empty', async () => {
					assert.deepEqual(await instance.currenciesUsingAggregator(aggregatorJPY.address), []);
					assert.deepEqual(await instance.currenciesUsingAggregator(ZERO_ADDRESS), []);
				});

				describe('when the owner adds sJPY added as an aggregator', () => {
					let txn;
					beforeEach(async () => {
						txn = await instance.addAggregator(sJPY, aggregatorJPY.address, {
							from: owner,
						});
					});

					it('then the list of aggregatorKeys lists it', async () => {
						assert.equal('sJPY', bytesToString(await instance.aggregatorKeys(0)));
						await assert.invalidOpcode(instance.aggregatorKeys(1));
					});

					it('and the AggregatorAdded event is emitted', () => {
						assert.eventEqual(txn, 'AggregatorAdded', {
							currencyKey: sJPY,
							aggregator: aggregatorJPY.address,
						});
					});

					it('only an owner can remove an aggregator', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.removeAggregator,
							args: [sJPY],
							accounts,
							address: owner,
						});
					});

					it('and currenciesUsingAggregator for that aggregator returns sJPY', async () => {
						assert.deepEqual(await instance.currenciesUsingAggregator(aggregatorJPY.address), [
							sJPY,
						]);
					});

					describe('when the owner adds the same aggregator to two other rates', () => {
						beforeEach(async () => {
							await instance.addAggregator(sEUR, aggregatorJPY.address, {
								from: owner,
							});
							await instance.addAggregator(sBNB, aggregatorJPY.address, {
								from: owner,
							});
						});
						it('and currenciesUsingAggregator for that aggregator returns sJPY', async () => {
							assert.deepEqual(await instance.currenciesUsingAggregator(aggregatorJPY.address), [
								sJPY,
								sEUR,
								sBNB,
							]);
						});
					});
					describe('when the owner tries to remove an invalid aggregator', () => {
						it('then it reverts', async () => {
							await assert.revert(
								instance.removeAggregator(sXTZ, { from: owner }),
								'No aggregator exists for key'
							);
						});
					});

					describe('when the owner adds sXTZ as an aggregator', () => {
						beforeEach(async () => {
							txn = await instance.addAggregator(sXTZ, aggregatorXTZ.address, {
								from: owner,
							});
						});

						it('then the list of aggregatorKeys lists it also', async () => {
							assert.equal('sJPY', bytesToString(await instance.aggregatorKeys(0)));
							assert.equal('sXTZ', bytesToString(await instance.aggregatorKeys(1)));
							await assert.invalidOpcode(instance.aggregatorKeys(2));
						});

						it('and the AggregatorAdded event is emitted', () => {
							assert.eventEqual(txn, 'AggregatorAdded', {
								currencyKey: sXTZ,
								aggregator: aggregatorXTZ.address,
							});
						});

						it('and currenciesUsingAggregator for that aggregator returns sXTZ', async () => {
							assert.deepEqual(await instance.currenciesUsingAggregator(aggregatorXTZ.address), [
								sXTZ,
							]);
						});

						describe('when the ratesAndInvalidForCurrencies is queried', () => {
							let response;
							beforeEach(async () => {
								response = await instance.ratesAndInvalidForCurrencies([sJPY, sXTZ]);
							});

							it('then the rates are invalid', () => {
								assert.equal(response[1], true);
							});

							it('and both are zero', () => {
								assert.equal(response[0][0], '0');
								assert.equal(response[0][1], '0');
							});
						});

						describe('when rateAndInvalid is queried', () => {
							let responseJPY;
							let responseXTZ;
							beforeEach(async () => {
								responseJPY = await instance.rateAndInvalid(sJPY);
								responseXTZ = await instance.rateAndInvalid(sXTZ);
							});

							it('then the rates are invalid', () => {
								assert.equal(responseJPY[1], true);
								assert.equal(responseXTZ[1], true);
							});

							it('and both are zero', () => {
								assert.equal(responseJPY[0], '0');
								assert.equal(responseXTZ[0], '0');
							});
						});

						describe('when the aggregator price is set for sJPY', () => {
							const newRate = 111;
							let timestamp;
							beforeEach(async () => {
								timestamp = await currentTime();
								// Multiply by 1e8 to match Chainlink's price aggregation
								await aggregatorJPY.setLatestAnswer(convertToDecimals(newRate, 8), timestamp);
							});
							describe('when the ratesAndInvalidForCurrencies is queried', () => {
								let response;
								beforeEach(async () => {
									response = await instance.ratesAndInvalidForCurrencies([sJPY, sXTZ]);
								});

								it('then the rates are still invalid', () => {
									assert.equal(response[1], true);
								});

								it('yet one price is populated', () => {
									assert.bnEqual(response[0][0], toUnit(newRate.toString()));
									assert.equal(response[0][1], '0');
								});
							});

							describe('when rateAndInvalid is queried', () => {
								let responseJPY;
								let responseXTZ;
								beforeEach(async () => {
									responseJPY = await instance.rateAndInvalid(sJPY);
									responseXTZ = await instance.rateAndInvalid(sXTZ);
								});

								it('then one rate is invalid', () => {
									assert.equal(responseJPY[1], false);
									assert.equal(responseXTZ[1], true);
								});

								it('and one rate is populated', () => {
									assert.bnEqual(responseJPY[0], toUnit(newRate.toString()));
									assert.bnEqual(responseXTZ[0], '0');
								});
							});

							describe('when the aggregator price is set for sXTZ', () => {
								const newRateXTZ = 222;
								let timestampXTZ;
								beforeEach(async () => {
									await fastForward(50);
									timestampXTZ = await currentTime();
									// Multiply by 1e8 to match Chainlink's price aggregation
									await aggregatorXTZ.setLatestAnswer(
										convertToDecimals(newRateXTZ, 8),
										timestampXTZ
									);
								});
								describe('when the ratesAndInvalidForCurrencies is queried', () => {
									let response;
									beforeEach(async () => {
										response = await instance.ratesAndInvalidForCurrencies([sJPY, sXTZ, sUSD]);
									});

									it('then the rates are no longer invalid', () => {
										assert.equal(response[1], false);
									});

									it('and all prices are populated', () => {
										assert.bnEqual(response[0][0], toUnit(newRate.toString()));
										assert.bnEqual(response[0][1], toUnit(newRateXTZ.toString()));
										assert.bnEqual(response[0][2], toUnit('1'));
									});
								});

								describe('when rateAndInvalid is queried', () => {
									let responseJPY;
									let responseXTZ;
									let responseUSD;
									beforeEach(async () => {
										responseJPY = await instance.rateAndInvalid(sJPY);
										responseXTZ = await instance.rateAndInvalid(sXTZ);
										responseUSD = await instance.rateAndInvalid(sUSD);
									});

									it('then both rates are valid', () => {
										assert.equal(responseJPY[1], false);
										assert.equal(responseXTZ[1], false);
										assert.equal(responseUSD[1], false);
									});

									it('and both rates are populated', () => {
										assert.bnEqual(responseJPY[0], toUnit(newRate.toString()));
										assert.bnEqual(responseXTZ[0], toUnit(newRateXTZ.toString()));
										assert.bnEqual(responseUSD[0], toUnit('1'));
									});
								});

								describe('when the flags return true for sJPY', () => {
									beforeEach(async () => {
										await mockFlagsInterface.flagAggregator(aggregatorJPY.address);
									});
									describe('when the ratesAndInvalidForCurrencies is queried', () => {
										let response;
										beforeEach(async () => {
											response = await instance.ratesAndInvalidForCurrencies([sJPY, sXTZ, sUSD]);
										});

										it('then the rates are invalid', () => {
											assert.equal(response[1], true);
										});
									});
									describe('when rateAndInvalid is queried', () => {
										let response;
										beforeEach(async () => {
											response = await instance.rateAndInvalid(sJPY);
										});

										it('then the rates are invalid', () => {
											assert.equal(response[1], true);
										});
									});
								});

								describe('when the aggregator is removed for sJPY', () => {
									beforeEach(async () => {
										txn = await instance.removeAggregator(sJPY, {
											from: owner,
										});
									});
									it('then the AggregatorRemoved event is emitted', () => {
										assert.eventEqual(txn, 'AggregatorRemoved', {
											currencyKey: sJPY,
											aggregator: aggregatorJPY.address,
										});
									});
									describe('when a user queries the aggregatorKeys', () => {
										it('then only sXTZ is left', async () => {
											assert.equal('sXTZ', bytesToString(await instance.aggregatorKeys(0)));
											await assert.invalidOpcode(instance.aggregatorKeys(1));
										});
									});
									// it('when the ratesAndInvalidForCurrencies is queried it reverts', async () => {
									// 	await assert.revert(
									// 		instance.ratesAndInvalidForCurrencies([sJPY, sXTZ, sUSD]),
									// 		'invalid aggregator'
									// 	);
									// });
									it('when the ratesAndInvalidForCurrencies is queried it returns 0', async () => {
										assert.deepEqual(
											await instance.ratesAndInvalidForCurrencies([sJPY, sXTZ, sUSD]),
											[[0, toUnit(newRateXTZ), toUnit(1)], true]
										);
									});
									describe('when rateAndInvalid is queried', () => {
										it('then JPY returns true', async () => {
											assert.deepEqual(await instance.rateAndInvalid(sJPY), [0, true]);
										});

										it('other rates are fine', async () => {
											const responseXTZ = await instance.rateAndInvalid(sXTZ);
											const responseUSD = await instance.rateAndInvalid(sUSD);

											assert.equal(responseXTZ[1], false);
											assert.equal(responseUSD[1], false);
											assert.bnEqual(responseXTZ[0], toUnit(newRateXTZ.toString()));
											assert.bnEqual(responseUSD[0], toUnit('1'));
										});
									});
								});
							});
						});
					});

					describe('when the aggregator price is set to set a specific number (with support for 8 decimals)', () => {
						const newRate = 123.456;
						let timestamp;
						beforeEach(async () => {
							timestamp = await currentTime();
							// Multiply by 1e8 to match Chainlink's price aggregation
							await aggregatorJPY.setLatestAnswer(convertToDecimals(newRate, 8), timestamp);
						});

						describe('when the price is fetched for sJPY', () => {
							it('the specific number is returned with 18 decimals', async () => {
								const result = await instance.rateForCurrency(sJPY, {
									from: accountOne,
								});
								assert.bnEqual(result, toUnit(newRate.toString()));
							});
							it('and the timestamp is the latest', async () => {
								const result = await instance.lastRateUpdateTimes(sJPY, {
									from: accountOne,
								});
								assert.bnEqual(result.toNumber(), timestamp);
							});
						});
					});

					describe('when the aggregator price is set to set a specific number, other than 8 decimals', () => {
						const gasPrice = 189.9;
						let timestamp;
						beforeEach(async () => {
							await instance.addAggregator(fastGasPrice, aggregatorFastGasPrice.address, {
								from: owner,
							});
							timestamp = await currentTime();
							// fastGasPrice has no decimals, so no conversion needed
							await aggregatorFastGasPrice.setLatestAnswer(
								web3.utils.toWei(gasPrice.toString(), 'gwei'),
								timestamp
							);
						});

						describe('when the price is fetched for fastGasPrice', () => {
							it('the specific number is returned with 18 decimals', async () => {
								const result = await instance.rateForCurrency(fastGasPrice, {
									from: accountOne,
								});
								assert.bnEqual(result, web3.utils.toWei(gasPrice.toString(), 'gwei'));
							});
							it('and the timestamp is the latest', async () => {
								const result = await instance.lastRateUpdateTimes(fastGasPrice, {
									from: accountOne,
								});
								assert.bnEqual(result.toNumber(), timestamp);
							});
						});
					});
				});

				describe('warning flags and invalid rates', () => {
					it('sUSD is never flagged / invalid.', async () => {
						assert.isFalse(await instance.rateIsFlagged(sUSD));
						assert.isFalse(await instance.rateIsInvalid(sUSD));
					});
					describe('when JPY is aggregated', () => {
						beforeEach(async () => {
							await instance.addAggregator(sJPY, aggregatorJPY.address, {
								from: owner,
							});
						});
						it('then the rate shows as stale', async () => {
							assert.equal(await instance.rateIsStale(sJPY), true);
						});
						it('then the rate shows as invalid', async () => {
							assert.equal(await instance.rateIsInvalid(sJPY), true);
							assert.equal((await instance.rateAndInvalid(sJPY))[1], true);
						});
						it('but the rate is not flagged', async () => {
							assert.equal(await instance.rateIsFlagged(sJPY), false);
						});
						describe('when the rate is set for sJPY', () => {
							const newRate = 123.456;
							let timestamp;
							beforeEach(async () => {
								timestamp = await currentTime();
								// Multiply by 1e8 to match Chainlink's price aggregation
								await aggregatorJPY.setLatestAnswer(convertToDecimals(newRate, 8), timestamp);
							});
							it('then the rate shows as not stale', async () => {
								assert.equal(await instance.rateIsStale(sJPY), false);
							});
							it('then the rate shows as not invalid', async () => {
								assert.equal(await instance.rateIsInvalid(sJPY), false);
								assert.equal((await instance.rateAndInvalid(sJPY))[1], false);
							});
							it('but the rate is not flagged', async () => {
								assert.equal(await instance.rateIsFlagged(sJPY), false);
							});
							describe('when the rate is flagged for sJPY', () => {
								beforeEach(async () => {
									await mockFlagsInterface.flagAggregator(aggregatorJPY.address);
								});
								it('then the rate shows as not stale', async () => {
									assert.equal(await instance.rateIsStale(sJPY), false);
								});
								it('then the rate shows as invalid', async () => {
									assert.equal(await instance.rateIsInvalid(sJPY), true);
									assert.equal((await instance.rateAndInvalid(sJPY))[1], true);
								});
								it('and the rate is not flagged', async () => {
									assert.equal(await instance.rateIsFlagged(sJPY), true);
								});
							});
						});
					});
				});
			});
		});

		describe('roundIds for historical rates', () => {
			// it('getCurrentRoundId() reverts for unknown currencies', async () => {
			// 	await assert.revert(instance.getCurrentRoundId(sJPY), 'invalid aggregator');
			// 	await assert.revert(instance.getCurrentRoundId(sBNB), 'invalid aggregator');
			// });
			it('getCurrentRoundId() returns 0 for unknown currencies', async () => {
				assert.equal(await instance.getCurrentRoundId(sJPY), 0);
				assert.equal(await instance.getCurrentRoundId(sBNB), 0);
			});

			it('getCurrentRoundId() is 0 for currencies with no updates', async () => {
				await setupAggregators([sJPY, sBNB]);
				assert.equal(await instance.getCurrentRoundId(sJPY), 0);
				assert.equal(await instance.getCurrentRoundId(sBNB), 0);
			});

			it('getCurrentRoundId() is 0 for sUSD', async () => {
				assert.equal(await instance.getCurrentRoundId(sUSD), 0);
			});

			it('ratesAndUpdatedTimeForCurrencyLastNRounds() shows first entry for sUSD', async () => {
				assert.deepEqual(await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sUSD, '3'), [
					[toUnit('1'), '0', '0'],
					[0, 0, 0],
				]);
			});
			it('ratesAndUpdatedTimeForCurrencyLastNRounds() returns 0s for other currencies without updates', async () => {
				const fiveZeros = new Array(5).fill('0');
				await setupAggregators([sJPY]);
				assert.deepEqual(await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sJPY, '5'), [
					fiveZeros,
					fiveZeros,
				]);
			});
			describe('given an aggregator exists for sJPY', () => {
				beforeEach(async () => {
					await instance.addAggregator(sJPY, aggregatorJPY.address, {
						from: owner,
					});
				});
				describe('and it has been given three successive rates a second apart', () => {
					let timestamp;

					beforeEach(async () => {
						timestamp = 1000;
						for (let i = 0; i < 3; i++) {
							await aggregatorJPY.setLatestAnswer(convertToDecimals(100 + i, 8), timestamp + i);
						}
					});

					describe('getCurrentRoundId())', () => {
						describe('when invoked for an aggregator', () => {
							it('getCurrentRound() returns the last entry', async () => {
								assert.equal((await instance.getCurrentRoundId(sJPY)).toString(), '3');
							});
						});
					});
					describe('rateAndTimestampAtRound()', () => {
						it('when invoked for no price returns 0', async () => {
							assert.deepEqual(await instance.rateAndTimestampAtRound(toBytes32('TEST'), '0'), [
								0,
								0,
							]);
						});
						it('when invoked for an aggregator', async () => {
							const assertRound = async ({ roundId }) => {
								const { rate, time } = await instance.rateAndTimestampAtRound(
									sJPY,
									roundId.toString()
								);
								assert.bnEqual(rate, toUnit((100 + roundId - 1).toString()));
								assert.bnEqual(time, toBN(1000 + roundId - 1));
							};
							await assertRound({ roundId: 1 });
							await assertRound({ roundId: 2 });
							await assertRound({ roundId: 3 });
						});
					});

					describe('ratesAndUpdatedTimeForCurrencyLastNRounds()', () => {
						describe('when invoked for a non-existant currency', () => {
							// it('then it reverts', async () => {
							// 	await assert.revert(
							// 		instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sAUD, '5'),
							// 		'invalid aggregator'
							// 	);
							// });
							it('then it returns zeros', async () => {
								const fiveZeros = new Array(5).fill('0');
								assert.deepEqual(
									await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sAUD, '5'),
									[fiveZeros, fiveZeros]
								);
							});
						});
						describe('when invoked for an aggregated price', () => {
							it('then it returns the rates as expected', async () => {
								assert.deepEqual(
									await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sJPY, '3'),
									[
										[toUnit('102'), toUnit('101'), toUnit('100')],
										['1002', '1001', '1000'],
									]
								);
							});

							it('then it returns the rates as expected, even over the edge', async () => {
								assert.deepEqual(
									await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sJPY, '5'),
									[
										[toUnit('102'), toUnit('101'), toUnit('100'), '0', '0'],
										['1002', '1001', '1000', '0', '0'],
									]
								);
							});
						});
					});
				});

				describe('and the aggregator has been given three rates, 30seconds apart', () => {
					beforeEach(async () => {
						await aggregatorJPY.setLatestAnswer(convertToDecimals(100, 8), 30); // round 1 for sJPY
						await aggregatorJPY.setLatestAnswer(convertToDecimals(200, 8), 60); // round 2 for sJPY
						await aggregatorJPY.setLatestAnswer(convertToDecimals(300, 8), 90); // round 3 for sJPY
					});

					describe('getLastRoundIdBeforeElapsedSecs()', () => {
						describe('when getLastRoundIdBeforeElapsedSecs() is invoked with the first round and a waiting time of less than 30s', () => {
							it('then it receives round 1 - no change ', async () => {
								assert.equal(
									(await instance.getLastRoundIdBeforeElapsedSecs(sJPY, '1', 40, 10)).toString(),
									'1'
								);
							});
						});

						describe('when getLastRoundIdBeforeElapsedSecs() is invoked with the first round and a waiting time of 30s exactly', () => {
							it('then it receives round 2 ', async () => {
								assert.equal(
									(await instance.getLastRoundIdBeforeElapsedSecs(sJPY, '1', 40, 20)).toString(),
									'2'
								);
							});
						});

						describe('when getLastRoundIdBeforeElapsedSecs() is invoked with the second round and a waiting time of 30s exactly', () => {
							it('then it receives round 3', async () => {
								assert.equal(
									(await instance.getLastRoundIdBeforeElapsedSecs(sJPY, '2', 65, 25)).toString(),
									'3'
								);
							});
						});

						describe('when getLastRoundIdBeforeElapsedSecs() is invoked with the first round and a waiting time between 30s to 60s', () => {
							it('then it receives round 2 ', async () => {
								assert.equal(
									(await instance.getLastRoundIdBeforeElapsedSecs(sJPY, '1', 40, 40)).toString(),
									'2'
								);
							});
						});
						describe('when getLastRoundIdBeforeElapsedSecs() is invoked with the first round and a waiting time of 60s exactly', () => {
							it('then it receives round 3 ', async () => {
								assert.equal(
									(await instance.getLastRoundIdBeforeElapsedSecs(sJPY, '1', 50, 40)).toString(),
									'3'
								);
							});
						});
						describe('when getLastRoundIdBeforeElapsedSecs() is invoked with the first round and a waiting time beyond 60s', () => {
							it('then it receives round 3 as well ', async () => {
								assert.equal(
									(await instance.getLastRoundIdBeforeElapsedSecs(sJPY, '1', 55, 6000)).toString(),
									'3'
								);
							});
						});
						describe('when getLastRoundIdBeforeElapsedSecs() is invoked with the third round and a waiting time beyond 60s', () => {
							it('then it still receives round 3', async () => {
								assert.equal(
									(await instance.getLastRoundIdBeforeElapsedSecs(sJPY, '3', 180, 9000)).toString(),
									'3'
								);
							});
						});
					});
				});

				describe('effectiveValueAtRound()', () => {
					describe('when both aggregated prices have been given three rates with current timestamps', () => {
						beforeEach(async () => {
							await setupAggregators([sBNB]);

							await updateRates([sJPY, sBNB], [convertToDecimals(100, 8), toUnit('1000')]);

							await fastForward(120);
							await updateRates([sJPY, sBNB], [convertToDecimals(200, 8), toUnit('2000')]);

							await fastForward(120);
							await updateRates([sJPY, sBNB], [convertToDecimals(300, 8), toUnit('4000')]);
						});
						it('accepts various changes to src roundId', async () => {
							assert.bnEqual(
								await instance.effectiveValueAtRound(sJPY, toUnit('1'), sBNB, '1', '1'),
								toUnit('0.1')
							);
							assert.bnEqual(
								await instance.effectiveValueAtRound(sJPY, toUnit('1'), sBNB, '2', '1'),
								toUnit('0.2')
							);
							assert.bnEqual(
								await instance.effectiveValueAtRound(sJPY, toUnit('1'), sBNB, '3', '1'),
								toUnit('0.3')
							);
						});
						it('accepts various changes to dest roundId', async () => {
							assert.bnEqual(
								await instance.effectiveValueAtRound(sJPY, toUnit('1'), sBNB, '1', '1'),
								toUnit('0.1')
							);
							assert.bnEqual(
								await instance.effectiveValueAtRound(sJPY, toUnit('1'), sBNB, '1', '2'),
								toUnit('0.05')
							);
							assert.bnEqual(
								await instance.effectiveValueAtRound(sJPY, toUnit('1'), sBNB, '1', '3'),
								toUnit('0.025')
							);
						});
						it('and combinations therein', async () => {
							assert.bnEqual(
								await instance.effectiveValueAtRound(sJPY, toUnit('1'), sBNB, '2', '2'),
								toUnit('0.1')
							);
							assert.bnEqual(
								await instance.effectiveValueAtRound(sJPY, toUnit('1'), sBNB, '3', '3'),
								toUnit('0.075')
							);
							assert.bnEqual(
								await instance.effectiveValueAtRound(sJPY, toUnit('1'), sBNB, '3', '2'),
								toUnit('0.15')
							);
						});
					});
				});
			});
		});
	};

	// Atomic pricing via DEX
	const itReadsAtomicPricesFromDex = () => {
		describe('setDexPriceAggregator()', () => {
			it('should not be set by default', async () => {
				assert.equal(await instance.dexPriceAggregator.call(), ZERO_ADDRESS);
			});

			it("only the owner should be able to change the dex price aggregator's address", async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.setDexPriceAggregator,
					args: [dexPriceAggregator],
					address: owner,
					accounts,
					skipPassCheck: true,
				});

				await instance.setDexPriceAggregator(accountOne, { from: owner });

				assert.equal(await instance.dexPriceAggregator.call(), accountOne);
				assert.notEqual(await instance.dexPriceAggregator.call(), dexPriceAggregator);
			});

			it('should emit event on successful address update', async () => {
				// Ensure initially set to intended address
				await instance.setDexPriceAggregator(dexPriceAggregator, { from: owner });
				assert.equal(await instance.dexPriceAggregator.call(), dexPriceAggregator);

				const txn = await instance.setDexPriceAggregator(accountOne, { from: owner });
				assert.eventEqual(txn, 'DexPriceAggregatorUpdated', {
					newDexPriceAggregator: accountOne,
				});
			});
		});

		describe('atomicTwapWindow', () => {
			it('atomicTwapWindow default is set correctly', async () => {
				assert.bnEqual(await instance.atomicTwapWindow(), ATOMIC_TWAP_WINDOW);
			});
			describe('when price window is changed in the system settings', () => {
				const newTwapWindow = toBN(ATOMIC_TWAP_WINDOW).add(toBN('1'));
				beforeEach(async () => {
					await systemSettings.setAtomicTwapWindow(newTwapWindow, { from: owner });
				});
				it('then atomicTwapWindow is correctly updated', async () => {
					assert.bnEqual(await instance.atomicTwapWindow(), newTwapWindow);
				});
			});
		});

		describe('atomicEquivalentForDexPricing', () => {
			const snxEquivalentAddr = accountOne;
			describe('when equivalent for SNX is changed in the system settings', () => {
				beforeEach(async () => {
					await systemSettings.setAtomicEquivalentForDexPricing(SNX, snxEquivalentAddr, {
						from: owner,
					});
				});
				it('then atomicEquivalentForDexPricing is correctly updated', async () => {
					assert.bnEqual(await instance.atomicEquivalentForDexPricing(SNX), snxEquivalentAddr);
				});
			});
		});

		describe('atomicPriceBuffer', () => {
			describe('when price buffer for SNX is changed in the system settings', () => {
				const priceBuffer = toUnit('0.003');
				beforeEach(async () => {
					await systemSettings.setAtomicPriceBuffer(SNX, priceBuffer, { from: owner });
				});
				it('then rateStalePeriod is correctly updated', async () => {
					assert.bnEqual(await instance.atomicPriceBuffer(SNX), priceBuffer);
				});
			});
		});

		describe('src/dest do not have an atomic equivalent for dex pricing', () => {
			beforeEach(async () => {
				const MockToken = artifacts.require('MockToken');
				const sethDexEquivalentToken = await MockToken.new('esETH equivalent', 'esETH', '18');
				// set sETH equivalent but don't set sUSD equivalent
				await systemSettings.setAtomicEquivalentForDexPricing(
					sETH,
					sethDexEquivalentToken.address,
					{ from: owner }
				);
			});

			it('reverts on src not having equivalent', async () => {
				await assert.revert(
					instance.effectiveAtomicValueAndRates(sUSD, toUnit('1'), sETH),
					'No atomic equivalent for src'
				);
			});
			it('reverts on dest not having equivalent', async () => {
				await assert.revert(
					instance.effectiveAtomicValueAndRates(sETH, toUnit('1'), sUSD),
					'No atomic equivalent for dest'
				);
			});
		});

		describe('effectiveAtomicValueAndRates', () => {
			const MockToken = artifacts.require('MockToken');
			const one = toUnit('1');
			const unitIn8 = convertToDecimals(1, 8);

			let dexPriceAggregator, ethAggregator;
			let susdDexEquivalentToken, sethDexEquivalentToken;

			function itGivesTheCorrectRates({
				inputs: { amountIn, srcToken, destToken },
				rates: { pDex, pCl: pClRaw },
				settings: { clBuffer },
				expected: { amountOut: expectedAmountOut, rateTypes: expectedRateTypes },
			}) {
				describe(`P_DEX of ${pDex}, P_CL of ${pClRaw}, and CL_BUFFER of ${clBuffer}bps`, () => {
					let rates;

					// Array-ify expected output types to allow for multiple rates types to be equivalent
					expectedRateTypes = Array.isArray(expectedRateTypes)
						? expectedRateTypes
						: [expectedRateTypes];

					// Adjust inputs to unit
					pDex = toUnit(pDex);
					clBuffer = toUnit(clBuffer).div(toBN('10000')); // bps to unit percentage

					const pClIn8 = convertToDecimals(pClRaw, 8);
					const pClIn18 = toUnit(pClRaw);

					// For simplicity and to align it with pDex, the given pCl rate is priced on the dest token.
					// Internally, however, the CL aggregators are expected to be priced in USD and with 8 decimals.
					// So if the source token is USD, we need to inverse the given CL rate for the CL aggregator.
					const pClInUsdIn8 = srcToken === sUSD ? divideDecimal(unitIn8, pClIn8, unitIn8) : pClIn8;
					const pClInUsdIn18 = divideDecimal(pClInUsdIn8, unitIn8); // divides with decimal base of 18

					// Get potential outputs based on given rates
					// Due to the 8-decimal precision limitation with chainlink, cl rates are calculated in a
					// manner mimicing the internal math to obtain the same results
					const pClOut =
						srcToken === sUSD
							? divideDecimal(amountIn, pClInUsdIn8, unitIn8) // x usd / rate (usd/dest)
							: multiplyDecimal(amountIn, pClIn18); // x dest * rate (usd/dest)
					const potentialOutputs = {
						pDex: multiplyDecimal(amountIn, pDex),
						pClBuf: multiplyDecimal(pClOut, one.sub(clBuffer)),
					};

					beforeEach(async () => {
						await dexPriceAggregator.setAssetToAssetRate(pDex);
						await ethAggregator.setLatestAnswer(pClInUsdIn8, await currentTime());

						await systemSettings.setAtomicPriceBuffer(destToken, clBuffer, { from: owner });

						rates = await instance.effectiveAtomicValueAndRates(srcToken, amountIn, destToken);
					});

					it(`selects ${
						expectedRateTypes.length ? expectedRateTypes : expectedRateTypes[0]
					}`, () => {
						for (const type of expectedRateTypes) {
							assert.bnEqual(rates.value, potentialOutputs[type]);
						}
					});

					it('provides the correct output', () => {
						assert.bnEqual(rates.value, expectedAmountOut);
					});

					it('provides the correct system value', () => {
						assert.bnEqual(rates.systemValue, pClOut);
					});

					it('provides the correct system source rate', () => {
						if (srcToken === sUSD) {
							assert.bnEqual(rates.systemSourceRate, one); // sUSD is always one
						} else {
							assert.bnEqual(rates.systemSourceRate, pClInUsdIn18); // system reports prices in 18 decimals
						}
					});

					it('provides the correct system destination rate', () => {
						if (destToken === sUSD) {
							assert.bnEqual(rates.systemDestinationRate, one); // sUSD is always one
						} else {
							assert.bnEqual(rates.systemDestinationRate, pClInUsdIn18); // system reports prices in 18 decimals
						}
					});
				});
			}

			beforeEach('set up mocks', async () => {
				ethAggregator = await MockAggregator.new({ from: owner });

				const MockDexPriceAggregator = artifacts.require('MockDexPriceAggregator');
				dexPriceAggregator = await MockDexPriceAggregator.new();

				susdDexEquivalentToken = await MockToken.new('esUSD equivalent', 'esUSD', '18');
				sethDexEquivalentToken = await MockToken.new('esETH equivalent', 'esETH', '18');
			});

			beforeEach('set initial configuration', async () => {
				await ethAggregator.setDecimals('8');
				await ethAggregator.setLatestAnswer(convertToDecimals(1, 8), await currentTime()); // this will be overwritten by the appropriate rate as needed
				await instance.addAggregator(sETH, ethAggregator.address, {
					from: owner,
				});
				await instance.setDexPriceAggregator(dexPriceAggregator.address, {
					from: owner,
				});
				await systemSettings.setAtomicEquivalentForDexPricing(
					sUSD,
					susdDexEquivalentToken.address,
					{
						from: owner,
					}
				);
				await systemSettings.setAtomicEquivalentForDexPricing(
					sETH,
					sethDexEquivalentToken.address,
					{
						from: owner,
					}
				);
			});

			describe('aggregator reverts on latestRoundData', () => {
				beforeEach(async () => {
					await ethAggregator.setLatestRoundDataShouldRevert(true);
				});
				it('reverts due to zero rates', async () => {
					await assert.revert(
						instance.effectiveAtomicValueAndRates(sUSD, one, sETH),
						'dex price returned 0'
					);
				});
			});

			describe('dexPriceAggregator reverts on assetToAsset', () => {
				beforeEach(async () => {
					await dexPriceAggregator.setAssetToAssetShouldRevert(true);
				});
				it('reverts', async () => {
					await assert.revert(
						instance.effectiveAtomicValueAndRates(sUSD, one, sETH),
						'mock assetToAsset() reverted'
					);
				});
			});

			describe('trades sUSD -> sETH', () => {
				const amountIn = toUnit('1000');
				const srcToken = sUSD;
				const destToken = sETH;

				// P_DEX of 0.01, P_CL of 0.011, and CL_BUFFER of 50bps
				itGivesTheCorrectRates({
					inputs: { amountIn, srcToken, destToken },
					rates: {
						pDex: '0.01',
						pCl: '0.011',
					},
					settings: {
						clBuffer: '50', // bps
					},
					expected: {
						amountOut: toUnit('10'),
						rateTypes: 'pDex',
					},
				});

				// P_DEX of 0.01, P_CL of 0.0099, and CL_BUFFER of 50bps
				itGivesTheCorrectRates({
					inputs: { amountIn, srcToken, destToken },
					rates: {
						pDex: '0.01',
						pCl: '0.0099',
					},
					settings: {
						clBuffer: '50', // bps
					},
					expected: {
						amountOut: toUnit('9.8505000000098505'), // precision required due to 8 decimal precision
						rateTypes: 'pClBuf',
					},
				});

				// Given P_DEX of 0.01, P_CL of 0.01, and CL_BUFFER of 50bps
				itGivesTheCorrectRates({
					inputs: { amountIn, srcToken, destToken },
					rates: {
						pDex: '0.01',
						pCl: '0.01',
					},
					settings: {
						clBuffer: '50', // bps
					},
					expected: {
						amountOut: toUnit('9.95'),
						rateTypes: 'pClBuf',
					},
				});

				// Given P_DEX of 0.0099, P_CL of 0.01, and CL_BUFFER of 200bps
				itGivesTheCorrectRates({
					inputs: { amountIn, srcToken, destToken },
					rates: {
						pDex: '0.0099',
						pCl: '0.01',
					},
					settings: {
						clBuffer: '200', // bps
					},
					expected: {
						amountOut: toUnit('9.8'),
						rateTypes: 'pClBuf',
					},
				});

				// Given P_DEX of 0.0099, P_CL of 0.01, and CL_BUFFER of 0bps
				itGivesTheCorrectRates({
					inputs: { amountIn, srcToken, destToken },
					rates: {
						pDex: '0.0099',
						pCl: '0.01',
					},
					settings: {
						clBuffer: '0', // bps
					},
					expected: {
						amountOut: toUnit('9.9'),
						rateTypes: 'pDex',
					},
				});

				// P_DEX of 0.01, P_SPOT of 0.01, P_CL of 0.01, and CL_BUFFER of 0bps
				itGivesTheCorrectRates({
					inputs: { amountIn, srcToken, destToken },
					rates: {
						pDex: '0.01',
						pCl: '0.01',
					},
					settings: {
						clBuffer: '0', // bps
					},
					expected: {
						amountOut: toUnit('10'),
						rateTypes: ['pDex', 'pClBuf'],
					},
				});
			});

			describe('trades sETH -> sUSD', () => {
				const amountIn = toUnit('10');
				const srcToken = sETH;
				const destToken = sUSD;

				// P_DEX of 100, P_CL of 110, and CL_BUFFER of 50bps
				itGivesTheCorrectRates({
					inputs: { amountIn, srcToken, destToken },
					rates: {
						pDex: '100',
						pCl: '110',
					},
					settings: {
						clBuffer: '50', // bps
					},
					expected: {
						amountOut: toUnit('1000'),
						rateTypes: 'pDex',
					},
				});

				// P_DEX of 100, P_CL of 99, and CL_BUFFER of 50bps
				itGivesTheCorrectRates({
					inputs: { amountIn, srcToken, destToken },
					rates: {
						pDex: '100',
						pCl: '99',
					},
					settings: {
						clBuffer: '50', // bps
					},
					expected: {
						amountOut: toUnit('985.05'),
						rateTypes: 'pClBuf',
					},
				});

				// P_DEX of 100, P_CL of 100, and CL_BUFFER of 50bps
				itGivesTheCorrectRates({
					inputs: { amountIn, srcToken, destToken },
					rates: {
						pDex: '100',
						pCl: '100',
					},
					settings: {
						clBuffer: '50', // bps
					},
					expected: {
						amountOut: toUnit('995'),
						rateTypes: 'pClBuf',
					},
				});

				// P_DEX of 99, P_CL of 100, and CL_BUFFER of 200bps
				itGivesTheCorrectRates({
					inputs: { amountIn, srcToken, destToken },
					rates: {
						pDex: '99',
						pCl: '100',
					},
					settings: {
						clBuffer: '200', // bps
					},
					expected: {
						amountOut: toUnit('980'),
						rateTypes: 'pClBuf',
					},
				});

				// P_DEX of 99, P_CL of 100, and CL_BUFFER of 0bps
				itGivesTheCorrectRates({
					inputs: { amountIn, srcToken, destToken },
					rates: {
						pDex: '99',
						pCl: '100',
					},
					settings: {
						clBuffer: '0', // bps
					},
					expected: {
						amountOut: toUnit('990'),
						rateTypes: 'pDex',
					},
				});

				// P_DEX of 100, P_CL of 100, and CL_BUFFER of 0bps
				itGivesTheCorrectRates({
					inputs: { amountIn, srcToken, destToken },
					rates: {
						pDex: '100',
						pCl: '100',
					},
					settings: {
						clBuffer: '0', // bps
					},
					expected: {
						amountOut: toUnit('1000'),
						rateTypes: ['pDex', 'pClBuf'],
					},
				});
			});

			describe('when both tokens have a price buffer set', () => {
				const pCl = toUnit('100');
				const pClAggregator = convertToDecimals(100, 8);
				const pDex = pCl.mul(toBN('2'));
				const susdBuffer = toUnit('0.003');
				const sethBuffer = toUnit('0.005');

				const amountIn = toUnit('10');

				beforeEach(async () => {
					await dexPriceAggregator.setAssetToAssetRate(pDex);
					await ethAggregator.setLatestAnswer(pClAggregator, await currentTime());

					await systemSettings.setAtomicPriceBuffer(sUSD, susdBuffer, { from: owner });
					await systemSettings.setAtomicPriceBuffer(sETH, sethBuffer, { from: owner });
				});

				it('prices pClBuf with the highest buffer', async () => {
					const rates = await instance.effectiveAtomicValueAndRates(sETH, amountIn, sUSD);
					const higherBuffer = susdBuffer.gt(sethBuffer) ? susdBuffer : sethBuffer;
					const expectedValue = multiplyDecimal(
						multiplyDecimal(amountIn, pCl),
						one.sub(higherBuffer)
					);
					assert.bnEqual(rates.value, expectedValue);
				});
			});

			describe('when tokens use non-18 decimals', () => {
				beforeEach('set up non-18 decimal tokens', async () => {
					susdDexEquivalentToken = await MockToken.new('sUSD equivalent', 'esUSD', '6'); // mimic USDC and USDT
					sethDexEquivalentToken = await MockToken.new('sETH equivalent', 'esETH', '8'); // mimic WBTC
					await systemSettings.setAtomicEquivalentForDexPricing(
						sUSD,
						susdDexEquivalentToken.address,
						{
							from: owner,
						}
					);
					await systemSettings.setAtomicEquivalentForDexPricing(
						sETH,
						sethDexEquivalentToken.address,
						{
							from: owner,
						}
					);
				});

				describe('sUSD -> sETH', () => {
					const rate = '0.01';
					// esETH has 8 decimals
					const rateIn8 = convertToDecimals(rate, 8);

					const amountIn = toUnit('1000');
					const amountIn6 = convertToDecimals(1000, 6); // in input token's decimals

					beforeEach('set up rates', async () => {
						await dexPriceAggregator.setAssetToAssetRate(rateIn8); // mock requires rate to be in output's decimals
						await ethAggregator.setLatestAnswer(rateIn8, await currentTime()); // CL requires 8 decimals

						await systemSettings.setAtomicPriceBuffer(sETH, '0', { from: owner });
					});

					it('dex aggregator mock provides expected results', async () => {
						const twapOutput = await dexPriceAggregator.assetToAsset(
							susdDexEquivalentToken.address,
							amountIn6,
							sethDexEquivalentToken.address,
							'2'
						);
						const expectedOutput = multiplyDecimal(amountIn, rateIn8); // uses UNIT as decimal base to get 6 decimals (output token's decimals)
						assert.bnEqual(twapOutput, expectedOutput);
					});

					it('still provides results in 18 decimals', async () => {
						const rates = await instance.effectiveAtomicValueAndRates(sUSD, amountIn, sETH);
						const expectedOutput = multiplyDecimal(amountIn, rateIn8, unitIn8); // use 8 as decimal base to get 18 decimals
						assert.bnEqual(rates.value, expectedOutput);
					});
				});

				describe('sETH -> sUSD', () => {
					const rate = '100';
					// esUSD has 6 decimals
					const rateIn6 = convertToDecimals(rate, 6);
					const rateIn8 = convertToDecimals(rate, 8);

					const amountIn = toUnit('10');
					const amountIn8 = convertToDecimals(10, 8); // in input token's decimals

					const unitIn6 = convertToDecimals(1, 6);

					beforeEach('set up rates', async () => {
						await dexPriceAggregator.setAssetToAssetRate(rateIn6); // mock requires rate to be in output's decimals
						await ethAggregator.setLatestAnswer(rateIn8, await currentTime()); // CL requires 8 decimals

						await systemSettings.setAtomicPriceBuffer(sETH, '0', { from: owner });
					});

					it('dex aggregator mock provides expected results', async () => {
						const twapOutput = await dexPriceAggregator.assetToAsset(
							sethDexEquivalentToken.address,
							amountIn8,
							susdDexEquivalentToken.address,
							'2'
						);
						const expectedOutput = multiplyDecimal(amountIn, rateIn6); // uses UNIT as decimal base to get 6 decimals (output token's decimals)
						assert.bnEqual(twapOutput, expectedOutput);
					});

					it('still provides results in 18 decimals', async () => {
						const rates = await instance.effectiveAtomicValueAndRates(sETH, amountIn, sUSD);
						const expectedOutput = multiplyDecimal(amountIn, rateIn6, unitIn6); // use 6 as decimal base to get 18 decimals
						assert.bnEqual(rates.value, expectedOutput);
					});
				});
			});
		});
	};

	const itDoesntReadAtomicPricesFromDex = () => {
		describe('Atomic exchange pricing', () => {
			it('errors with not implemented when attempting to fetch atomic rate', async () => {
				await assert.revert(
					instance.effectiveAtomicValueAndRates(sETH, toUnit('10'), sUSD),
					'Cannot be run on this layer'
				);
			});
		});
	};

	const itReportsRateTooVolatileForAtomicExchanges = () => {
		describe('atomicVolatilityConsiderationWindow', () => {
			describe('when consideration window is changed in the system settings', () => {
				const considerationWindow = toBN(600);
				beforeEach(async () => {
					await systemSettings.setAtomicVolatilityConsiderationWindow(SNX, considerationWindow, {
						from: owner,
					});
				});
				it('then atomicVolatilityConsiderationWindow is correctly updated', async () => {
					assert.bnEqual(
						await instance.atomicVolatilityConsiderationWindow(SNX),
						considerationWindow
					);
				});
			});
		});

		describe('atomicVolatilityUpdateThreshold', () => {
			describe('when threshold for SNX is changed in the system settings', () => {
				const updateThreshold = toBN(3);
				beforeEach(async () => {
					await systemSettings.setAtomicVolatilityUpdateThreshold(SNX, updateThreshold, {
						from: owner,
					});
				});
				it('then atomicVolatilityUpdateThreshold is correctly updated', async () => {
					assert.bnEqual(await instance.atomicVolatilityUpdateThreshold(SNX), updateThreshold);
				});
			});
		});

		describe('synthTooVolatileForAtomicExchange', async () => {
			const minute = 60;
			const synth = sETH;
			let aggregator;

			beforeEach('set up eth aggregator mock', async () => {
				aggregator = await MockAggregator.new({ from: owner });
				await aggregator.setDecimals('8');
				await instance.addAggregator(synth, aggregator.address, {
					from: owner,
				});
			});

			beforeEach('check related system systems', async () => {
				assert.bnEqual(await instance.atomicVolatilityConsiderationWindow(synth), '0');
				assert.bnEqual(await instance.atomicVolatilityUpdateThreshold(synth), '0');
			});

			describe('when consideration window is not set', () => {
				it('does not consider synth to be volatile', async () => {
					assert.isFalse(await instance.synthTooVolatileForAtomicExchange(synth));
				});
			});

			describe('when update threshold is not set', () => {
				it('does not consider synth to be volatile', async () => {
					assert.isFalse(await instance.synthTooVolatileForAtomicExchange(synth));
				});
			});

			describe('when consideration window and update threshold are set', () => {
				const considerationWindow = 10 * minute;

				beforeEach('set system settings', async () => {
					// Window of 10min and threshold of 2 (i.e. max two updates allowed)
					await systemSettings.setAtomicVolatilityConsiderationWindow(synth, considerationWindow, {
						from: owner,
					});
					await systemSettings.setAtomicVolatilityUpdateThreshold(synth, 2, {
						from: owner,
					});
				});

				describe('when last aggregator update is outside consideration window', () => {
					beforeEach('set last aggregator update', async () => {
						await aggregator.setLatestAnswer(
							convertToDecimals(1, 8),
							(await currentTime()) - (considerationWindow + 1 * minute)
						);
					});

					it('does not consider synth to be volatile', async () => {
						assert.isFalse(await instance.synthTooVolatileForAtomicExchange(synth));
					});
				});

				describe('when last aggregator update is inside consideration window', () => {
					function itReportsTheSynthsVolatilityBasedOnOracleUpdates({
						oracleUpdateTimesFromNow = [],
						volatile,
					}) {
						beforeEach('set aggregator updates', async () => {
							// JS footgun: .sort() sorts numbers as strings!
							oracleUpdateTimesFromNow.sort((a, b) => b - a); // ensure the update times go from farthest to most recent
							const now = await currentTime();
							for (const timeFromNow of oracleUpdateTimesFromNow) {
								await aggregator.setLatestAnswer(convertToDecimals(1, 8), now - timeFromNow);
							}
						});

						it(`${volatile ? 'considers' : 'does not consider'} synth to be volatile`, async () => {
							assert.equal(await instance.synthTooVolatileForAtomicExchange(synth), volatile);
						});
					}

					describe('when the allowed update threshold is not reached', () => {
						itReportsTheSynthsVolatilityBasedOnOracleUpdates({
							oracleUpdateTimesFromNow: [
								considerationWindow + 10 * minute,
								considerationWindow + 5 * minute,
								considerationWindow - 5 * minute,
							],
							volatile: false,
						});
					});

					describe('when the allowed update threshold is reached', () => {
						itReportsTheSynthsVolatilityBasedOnOracleUpdates({
							oracleUpdateTimesFromNow: [
								considerationWindow + 10 * minute,
								considerationWindow - 5 * minute,
								considerationWindow - 7 * minute,
							],
							volatile: true,
						});
					});

					describe('when the allowed update threshold is reached with updates at the edge of the consideration window', () => {
						// The consideration window is inclusive on both sides (i.e. [])
						itReportsTheSynthsVolatilityBasedOnOracleUpdates({
							oracleUpdateTimesFromNow: [
								considerationWindow + 10 * minute,
								considerationWindow - 5, // small 5s fudge for block times and querying speed
								0,
							],
							volatile: true,
						});
					});

					describe('when there is not enough oracle history to assess', () => {
						itReportsTheSynthsVolatilityBasedOnOracleUpdates({
							oracleUpdateTimesFromNow: [considerationWindow - 5 * minute],
							volatile: true,
						});
					});

					describe('when there is just enough oracle history to assess', () => {
						describe('when all updates are inside consideration window', () => {
							itReportsTheSynthsVolatilityBasedOnOracleUpdates({
								oracleUpdateTimesFromNow: [
									considerationWindow - 5 * minute,
									considerationWindow - 7 * minute,
								],
								volatile: true,
							});
						});

						describe('when not all updates are inside consideration window', () => {
							itReportsTheSynthsVolatilityBasedOnOracleUpdates({
								oracleUpdateTimesFromNow: [
									considerationWindow + 5 * minute,
									considerationWindow - 5 * minute,
								],
								volatile: false,
							});
						});
					});
				});

				describe('when aggregator fails', () => {
					describe('when aggregator returns no rate outside consideration window', () => {
						beforeEach('set aggregator updates', async () => {
							await aggregator.setLatestAnswer(
								'0',
								(await currentTime()) - (considerationWindow + 1 * minute)
							);
						});

						it('does not consider synth to be volatile', async () => {
							assert.isFalse(await instance.synthTooVolatileForAtomicExchange(synth));
						});
					});

					describe('when aggregator returns no rate inside consideration window', () => {
						beforeEach('set aggregator updates', async () => {
							await aggregator.setLatestAnswer(
								'0',
								(await currentTime()) - (considerationWindow - 1 * minute)
							);
						});

						it('considers synth to be volatile', async () => {
							assert.isTrue(await instance.synthTooVolatileForAtomicExchange(synth));
						});
					});

					describe('when aggregator reverts', () => {
						beforeEach('set aggregator to revert on getRoundData()', async () => {
							await aggregator.setAllRoundDataShouldRevert(true);
						});

						it('considers synth to be volatile', async () => {
							assert.isTrue(await instance.synthTooVolatileForAtomicExchange(synth));
						});
					});
				});
			});
		});
	};

	const itDoesntAssessRateTooVolatileForAtomicExchanges = () => {
		describe('Atomic exchange volatility control', () => {
			it('errors with not implemented when attempting to assess volatility for atomic exchanges', async () => {
				await assert.revert(
					instance.synthTooVolatileForAtomicExchange(sETH),
					'Cannot be run on this layer'
				);
			});
		});
	};

	// utility function to setup price aggregators
	async function setupAggregators(keys, decimalsArray = []) {
		await setupPriceAggregators(instance, owner, keys, decimalsArray);
	}

	// utility function update rates for aggregators that are already set up
	async function updateRates(keys, rates, timestamp = undefined) {
		await updateAggregatorRates(instance, keys, rates, timestamp);
	}

	describe('Using ExchangeRates', () => {
		const exchangeRatesContract = 'ExchangeRates';

		before(async () => {
			({ ExchangeRates: instance, SystemSettings: systemSettings } = await setupAllContracts({
				accounts,
				contracts: [exchangeRatesContract, 'SystemSettings', 'AddressResolver'],
			}));

			// remove the pre-configured aggregator
			await instance.removeAggregator(toBytes32('SNX'), { from: owner });

			aggregatorJPY = await MockAggregator.new({ from: owner });
			aggregatorXTZ = await MockAggregator.new({ from: owner });
			aggregatorFastGasPrice = await MockAggregator.new({ from: owner });

			aggregatorJPY.setDecimals('8');
			aggregatorXTZ.setDecimals('8');
			aggregatorFastGasPrice.setDecimals('0');

			// create but don't connect up the mock flags interface yet
			mockFlagsInterface = await artifacts.require('MockFlagsInterface').new();
		});

		addSnapshotBeforeRestoreAfterEach();

		itIncludesCorrectMutativeFunctions(exchangeRatesContract);

		itIsConstructedCorrectly(exchangeRatesContract);

		itCalculatesStaleRates();

		itCalculatesInvalidRates();

		itCalculatesLastUpdateTime();

		itCalculatesEffectiveValue();

		itReadsFromAggregator();

		itDoesntReadAtomicPricesFromDex();

		itDoesntAssessRateTooVolatileForAtomicExchanges();
	});

	describe('Using ExchangeRatesWithDexPricing', () => {
		const exchangeRatesContract = 'ExchangeRatesWithDexPricing';

		before(async () => {
			({ ExchangeRates: instance, SystemSettings: systemSettings } = await setupAllContracts({
				accounts,
				contracts: [exchangeRatesContract, 'SystemSettings', 'AddressResolver'],
			}));

			// remove the pre-configured aggregator
			await instance.removeAggregator(toBytes32('SNX'), { from: owner });

			aggregatorJPY = await MockAggregator.new({ from: owner });
			aggregatorXTZ = await MockAggregator.new({ from: owner });
			aggregatorFastGasPrice = await MockAggregator.new({ from: owner });

			aggregatorJPY.setDecimals('8');
			aggregatorXTZ.setDecimals('8');
			aggregatorFastGasPrice.setDecimals('0');

			// create but don't connect up the mock flags interface yet
			mockFlagsInterface = await artifacts.require('MockFlagsInterface').new();
		});

		addSnapshotBeforeRestoreAfterEach();

		itIncludesCorrectMutativeFunctions(exchangeRatesContract);

		itIsConstructedCorrectly(exchangeRatesContract);

		itCalculatesStaleRates();

		itCalculatesInvalidRates();

		itCalculatesLastUpdateTime();

		itCalculatesEffectiveValue();

		itReadsFromAggregator();

		itReadsAtomicPricesFromDex();

		itReportsRateTooVolatileForAtomicExchanges();
	});
});
