// 'use strict';

// const { artifacts, contract, web3, legacy } = require('@nomiclabs/buidler');

// const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

// const { currentTime, fastForward, toUnit, bytesToString } = require('../utils')();

// const {
// 	ensureOnlyExpectedMutativeFunctions,
// 	onlyGivenAddressCanInvoke,
// 	convertToAggregatorPrice,
// } = require('./helpers');

// const { setupContract, setupAllContracts } = require('./setup');

// const {
// 	toBytes32,
// 	constants: { ZERO_ADDRESS },
// 	defaults: { RATE_STALE_PERIOD },
// } = require('../..');

// const { toBN } = require('web3-utils');

// const MockAggregator = artifacts.require('MockAggregator');

// contract('Exchange Rates', async accounts => {
// 	const [deployerAccount, owner, , accountOne, accountTwo] = accounts;
// 	const [SNX, sJPY, sXTZ, sBNB, sUSD, sEUR, sAUD] = [
// 		'SNX',
// 		'sJPY',
// 		'sXTZ',
// 		'sBNB',
// 		'sUSD',
// 		'sEUR',
// 		'sAUD',
// 	].map(toBytes32);
// 	let instance;
// 	let systemSettings;
// 	let aggregatorJPY;
// 	let aggregatorXTZ;
// 	let initialTime;
// 	let timeSent;
// 	let resolver;
// 	let mockFlagsInterface;

// 	before(async () => {
// 		initialTime = await currentTime();
// 		({
// 			ExchangeRates: instance,
// 			SystemSettings: systemSettings,
// 			AddressResolver: resolver,
// 		} = await setupAllContracts({
// 			accounts,
// 			contracts: ['ExchangeRates', 'SystemSettings', 'AddressResolver'],
// 		}));

// 		aggregatorJPY = await MockAggregator.new({ from: owner });
// 		aggregatorXTZ = await MockAggregator.new({ from: owner });

// 		// create but don't connect up the mock flags interface yet
// 		mockFlagsInterface = await artifacts.require('MockFlagsInterface').new();
// 	});

// 	addSnapshotBeforeRestoreAfterEach();

// 	beforeEach(async () => {
// 		timeSent = await currentTime();
// 	});



	describe('lastRateUpdateTimesForCurrencies()', () => {
		it('should return correct last rate update times for specific currencies', async () => {
			const abc = toBytes32('lABC');
			const timeSent = await currentTime();
			const listOfKeys = [abc, toBytes32('lDEF'), toBytes32('lGHI')];
			await instance.updateRates(
				listOfKeys.slice(0, 2),
				[web3.utils.toWei('1.3', 'ether'), web3.utils.toWei('2.4', 'ether')],
				timeSent,
				{ from: oracle }
			);

			await fastForward(100);
			const newTimeSent = await currentTime();
			await instance.updateRates(
				listOfKeys.slice(2),
				[web3.utils.toWei('3.5', 'ether')],
				newTimeSent,
				{ from: oracle }
			);

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
			const timeSent = await currentTime();
			await instance.updateRates(
				[abc, def],
				[web3.utils.toWei('1.3', 'ether'), web3.utils.toWei('2.4', 'ether')],
				timeSent,
				{ from: oracle }
			);
			await fastForward(10000);
			const timeSent2 = await currentTime();
			await instance.updateRates([ghi], [web3.utils.toWei('2.4', 'ether')], timeSent2, {
				from: oracle,
			});

			const [firstTS, secondTS] = await Promise.all([
				instance.lastRateUpdateTimes(abc),
				instance.lastRateUpdateTimes(ghi),
			]);
			assert.equal(firstTS, timeSent);
			assert.equal(secondTS, timeSent2);
		});
	});

	describe('effectiveValue() and effectiveValueAndRates()', () => {
		let timestamp;
		beforeEach(async () => {
			timestamp = await currentTime();
		});

		describe('when a price is sent to the oracle', () => {
			beforeEach(async () => {
				// Send a price update to guarantee we're not depending on values from outside this test.
				await instance.updateRates(
					['sAUD', 'sEUR', 'SNX'].map(toBytes32),
					['0.5', '1.25', '0.1'].map(toUnit),
					timestamp,
					{ from: oracle }
				);
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

				timestamp = await currentTime();

				// Update all rates except sUSD.
				await instance.updateRates([sEUR, SNX], ['1.25', '0.1'].map(toUnit), timestamp, {
					from: oracle,
				});

				const amountOfSynthetixs = toUnit('10');
				const amountOfEur = toUnit('0.8');

				// Should now be able to convert from SNX to sEUR since they are both not stale.
				assert.bnEqual(await instance.effectiveValue(SNX, amountOfSynthetixs, sEUR), amountOfEur);
			});

			it('should revert when relying on a non-existant dest exchange rate in effectiveValue()', async () => {
				// Send a price update so we know what time we started with.
				await assert.revert(
					instance.effectiveValue(SNX, toUnit('10'), toBytes32('XYZ')),
					!legacy ? 'SafeMath: division by zero' : undefined
				);
			});

			it('should return 0 when relying on a non-existing src rate in effectiveValue', async () => {
				assert.equal(await instance.effectiveValue(toBytes32('XYZ'), toUnit('10'), SNX), '0');
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

	describe('inverted prices', () => {
		const inverseRates = ['iBTC', 'iETH', 'sEUR', 'sBNB'];
		const [iBTC, iETH, sEUR, sBNB] = inverseRates.map(toBytes32);
		it('rateIsFrozen for a regular synth returns false', async () => {
			assert.equal(false, await instance.rateIsFrozen(sEUR));
		});
		it('and list of invertedKeys is empty', async () => {
			await assert.invalidOpcode(instance.invertedKeys(0));
		});
		describe('when attempting to add inverse synths', () => {
			it('ensure only the owner can invoke', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.setInversePricing,
					args: [iBTC, toUnit('1'), toUnit('1.5'), toUnit('0.5'), false, false],
					accounts,
					address: owner,
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('ensure entryPoint be greater than 0', async () => {
				await assert.revert(
					instance.setInversePricing(iBTC, toUnit('0'), toUnit('150'), toUnit('10'), false, false, {
						from: owner,
					}),
					'upperLimit must be less than double entryPoint'
				);
			});
			it('ensure lowerLimit be greater than 0', async () => {
				await assert.revert(
					instance.setInversePricing(
						iBTC,
						toUnit('100'),
						toUnit('150'),
						toUnit('0'),
						false,
						false,
						{
							from: owner,
						}
					),
					'lowerLimit must be above 0'
				);
			});
			it('ensure upperLimit be greater than the entryPoint', async () => {
				await assert.revert(
					instance.setInversePricing(
						iBTC,
						toUnit('100'),
						toUnit('100'),
						toUnit('10'),
						false,
						false,
						{
							from: owner,
						}
					),
					'upperLimit must be above the entryPoint'
				);
			});
			it('ensure upperLimit be less than double the entryPoint', async () => {
				await assert.revert(
					instance.setInversePricing(
						iBTC,
						toUnit('100'),
						toUnit('200'),
						toUnit('10'),
						false,
						false,
						{
							from: owner,
						}
					),
					'upperLimit must be less than double entryPoint'
				);
			});
			it('ensure lowerLimit be less than the entryPoint', async () => {
				await assert.revert(
					instance.setInversePricing(
						iBTC,
						toUnit('100'),
						toUnit('150'),
						toUnit('100'),
						false,
						false,
						{
							from: owner,
						}
					),
					'lowerLimit must be below the entryPoint'
				);
			});
			it('ensure both freeze at upper and freeze at lower cannot both be true', async () => {
				await assert.revert(
					instance.setInversePricing(iBTC, toUnit('100'), toUnit('150'), toUnit('50'), true, true, {
						from: owner,
					}),
					'Cannot freeze at both limits'
				);
			});
		});

		describe('freezeRate()', () => {
			it('reverts when the currency key is not an inverse', async () => {
				await assert.revert(instance.freezeRate(sEUR), 'Cannot freeze non-inverse rate');
			});
			describe('when an inverse is added for iBTC already frozen at the upper limit', () => {
				beforeEach(async () => {
					await instance.setInversePricing(
						iBTC,
						toUnit(4000),
						toUnit(6500),
						toUnit(2300),
						true,
						false,
						{
							from: owner,
						}
					);
				});
				it('freezeRate reverts as its already frozen', async () => {
					await assert.revert(instance.freezeRate(iBTC), 'The rate is already frozen');
				});
			});
			describe('when an inverse is added for iBTC already frozen at the lower limit', () => {
				beforeEach(async () => {
					await instance.setInversePricing(
						iBTC,
						toUnit(4000),
						toUnit(6500),
						toUnit(2300),
						false,
						true,
						{
							from: owner,
						}
					);
				});
				it('freezeRate reverts as its already frozen', async () => {
					await assert.revert(instance.freezeRate(iBTC), 'The rate is already frozen');
				});
			});
			describe('when an inverse is added for iBTC yet not frozen', () => {
				beforeEach(async () => {
					await instance.setInversePricing(
						iBTC,
						toUnit(4000),
						toUnit(6500),
						toUnit(2300),
						false,
						false,
						{
							from: owner,
						}
					);
				});
				it('edge-case: freezeRate reverts as even though there is no price, it is not on bounds', async () => {
					await assert.revert(instance.freezeRate(iBTC), 'Rate within bounds');
				});
				describe('when an in-bounds rate arrives for iBTC', () => {
					beforeEach(async () => {
						await instance.updateRates([iBTC], [toUnit('5000')], await currentTime(), {
							from: oracle,
						});
					});
					it('freezeRate reverts as the price is within bounds', async () => {
						await assert.revert(instance.freezeRate(iBTC), 'Rate within bounds');
					});
				});
				describe('when an upper out-of-bounds rate arrives for iBTC', () => {
					beforeEach(async () => {
						await instance.updateRates([iBTC], [toUnit('6000')], await currentTime(), {
							from: oracle,
						});
					});
					describe('when freezeRate is invoked', () => {
						let txn;
						beforeEach(async () => {
							txn = await instance.freezeRate(iBTC, { from: accounts[2] });
						});
						it('and emits an InversePriceFrozen at the lower limit', async () => {
							assert.eventEqual(txn, 'InversePriceFrozen', {
								currencyKey: iBTC,
								rate: toUnit(2300),
								initiator: accounts[2],
							});
						});
						it('and the inverse pricing shows the frozen flag at lower', async () => {
							const { frozenAtUpperLimit, frozenAtLowerLimit } = await instance.inversePricing(
								iBTC
							);

							assert.notOk(frozenAtUpperLimit);
							assert.ok(frozenAtLowerLimit);
						});
					});
				});
				describe('when a lower out-of-bounds rate arrives for iBTC', () => {
					beforeEach(async () => {
						await instance.updateRates([iBTC], [toUnit('1000')], await currentTime(), {
							from: oracle,
						});
					});
					describe('when freezeRate is invoked', () => {
						let txn;
						beforeEach(async () => {
							txn = await instance.freezeRate(iBTC, { from: accounts[2] });
						});
						it('and emits an InversePriceFrozen at the upper limit', async () => {
							assert.eventEqual(txn, 'InversePriceFrozen', {
								currencyKey: iBTC,
								rate: toUnit(6500),
								initiator: accounts[2],
							});
						});
						it('and the inverse pricing shows the frozen flag at upper', async () => {
							const { frozenAtUpperLimit, frozenAtLowerLimit } = await instance.inversePricing(
								iBTC
							);

							assert.ok(frozenAtUpperLimit);
							assert.notOk(frozenAtLowerLimit);
						});
					});
				});
			});
		});

		describe('when two inverted synths are added', () => {
			// helper function to check rates are correct
			const assertRatesAreCorrect = async ({
				currencyKeys,
				expectedRates,
				txn,
				outOfBounds = [],
			}) => {
				// ensure all rates returned from contract are as expected
				const rates = await instance.ratesForCurrencies(currencyKeys);
				expectedRates.forEach((rate, i) => assert.bnEqual(rates[i], rate));

				const ratesUpdatedEvent = [
					'RatesUpdated',
					{
						currencyKeys,
					},
				];

				assert.eventEqual(txn, ...ratesUpdatedEvent);

				if (outOfBounds.length) {
					for (const currencyKey of outOfBounds) {
						assert.ok(await instance.canFreezeRate(currencyKey));
					}
					// now for all other currency keys, make sure canFreeze is false
					const keysInBounds = currencyKeys.filter(ccy => outOfBounds.indexOf(ccy) < 0);
					for (const currencyKey of keysInBounds) {
						assert.notOk(await instance.canFreezeRate(currencyKey));
					}
				}
			};

			const setTxns = [];
			beforeEach(async () => {
				setTxns.push(
					await instance.setInversePricing(
						iBTC,
						toUnit(4000),
						toUnit(6500),
						toUnit(2300),
						false,
						false,
						{
							from: owner,
						}
					)
				);
				setTxns.push(
					await instance.setInversePricing(
						iETH,
						toUnit(200),
						toUnit(350),
						toUnit(75),
						false,
						false,
						{
							from: owner,
						}
					)
				);
			});
			it('both emit InversePriceConfigured events', async () => {
				assert.eventEqual(setTxns[0], 'InversePriceConfigured', {
					currencyKey: iBTC,
					entryPoint: toUnit(4000),
					upperLimit: toUnit(6500),
					lowerLimit: toUnit(2300),
				});
				assert.eventEqual(setTxns[1], 'InversePriceConfigured', {
					currencyKey: iETH,
					entryPoint: toUnit(200),
					upperLimit: toUnit(350),
					lowerLimit: toUnit(75),
				});
			});
			it('and the list of invertedKeys lists them both', async () => {
				assert.equal('iBTC', bytesToString(await instance.invertedKeys(0)));
				assert.equal('iETH', bytesToString(await instance.invertedKeys(1)));
				await assert.invalidOpcode(instance.invertedKeys(2));
			});
			it('rateIsFrozen must be false for both', async () => {
				assert.equal(false, await instance.rateIsFrozen(iBTC));
				assert.equal(false, await instance.rateIsFrozen(iETH));
			});
			it('and canFreeze is false for the inverses as no rate yet given', async () => {
				assert.notOk(await instance.canFreezeRate(iBTC));
				assert.notOk(await instance.canFreezeRate(iETH));
			});
			it('and canFreeze is false for other synths', async () => {
				assert.notOk(await instance.canFreezeRate(sEUR));
				assert.notOk(await instance.canFreezeRate(sBNB));
				assert.notOk(await instance.canFreezeRate(toBytes32('ABC')));
			});

			describe('when another synth is added as frozen directly', () => {
				let txn;
				describe('with it set to freezeAtUpperLimit', () => {
					beforeEach(async () => {
						txn = await instance.setInversePricing(
							iBTC,
							toUnit(4000),
							toUnit(6500),
							toUnit(2300),
							true,
							false,
							{
								from: owner,
							}
						);
					});
					it('then the synth is frozen', async () => {
						assert.equal(true, await instance.rateIsFrozen(iBTC));
						assert.equal(false, await instance.rateIsFrozen(iETH));
					});
					it('and it emits a frozen event', () => {
						assert.eventEqual(txn.logs[0], 'InversePriceFrozen', {
							currencyKey: iBTC,
							rate: toUnit(6500),
							initiator: owner,
						});
					});
					it('yet the rate is 0 because there is no initial rate', async () => {
						assert.equal(await instance.ratesForCurrencies([iBTC]), '0');
					});
					it('and the inverse pricing struct is configured', async () => {
						const {
							entryPoint,
							upperLimit,
							lowerLimit,
							frozenAtUpperLimit,
							frozenAtLowerLimit,
						} = await instance.inversePricing(iBTC);

						assert.bnEqual(entryPoint, toUnit(4000));
						assert.bnEqual(upperLimit, toUnit(6500));
						assert.bnEqual(lowerLimit, toUnit(2300));
						assert.equal(frozenAtUpperLimit, true);
						assert.equal(frozenAtLowerLimit, false);
					});

					it('and canFreeze is false for the currency key is now frozen', async () => {
						assert.notOk(await instance.canFreezeRate(iBTC));
					});

					describe('when updateRates is called with an in-bounds update', () => {
						let txn;
						beforeEach(async () => {
							const rates = [toUnit('4500')];
							const timeSent = await currentTime();
							txn = await instance.updateRates([iBTC], rates, timeSent, {
								from: oracle,
							});
						});
						it('the inverted rate remains frozen at upper limit', async () => {
							await assertRatesAreCorrect({
								txn,
								currencyKeys: [iBTC],
								expectedRates: [toUnit('6500')],
							});
							assert.equal(true, await instance.rateIsFrozen(iBTC));
						});
						it('and canFreeze is still false for the currency key is now frozen', async () => {
							assert.notOk(await instance.canFreezeRate(iBTC));
						});
					});
				});
				describe('with it set to freezeAtLowerLimit', () => {
					beforeEach(async () => {
						txn = await instance.setInversePricing(
							iBTC,
							toUnit(4000),
							toUnit(6500),
							toUnit(2300),
							false,
							true,
							{
								from: owner,
							}
						);
					});
					it('then the synth is frozen', async () => {
						assert.equal(true, await instance.rateIsFrozen(iBTC));
						assert.equal(false, await instance.rateIsFrozen(iETH));
					});
					it('yet the rate is 0 because there is no initial rate', async () => {
						assert.equal(await instance.ratesForCurrencies([iBTC]), '0');
					});
					it('and it emits a frozen event', () => {
						assert.eventEqual(txn.logs[0], 'InversePriceFrozen', {
							currencyKey: iBTC,
							rate: toUnit(2300),
							initiator: owner,
						});
					});
					it('and the inverse pricing struct is configured', async () => {
						const {
							entryPoint,
							upperLimit,
							lowerLimit,
							frozenAtUpperLimit,
							frozenAtLowerLimit,
						} = await instance.inversePricing(iBTC);

						assert.bnEqual(entryPoint, toUnit(4000));
						assert.bnEqual(upperLimit, toUnit(6500));
						assert.bnEqual(lowerLimit, toUnit(2300));
						assert.equal(frozenAtUpperLimit, false);
						assert.equal(frozenAtLowerLimit, true);
					});
					it('and canFreeze is false for the currency key is now frozen', async () => {
						assert.notOk(await instance.canFreezeRate(iBTC));
					});
					describe('when updateRates is called with an in-bounds update', () => {
						let txn;
						beforeEach(async () => {
							const rates = [toUnit('4500')];
							const timeSent = await currentTime();
							txn = await instance.updateRates([iBTC], rates, timeSent, {
								from: oracle,
							});
						});
						it('the inverted rate remains frozen at lower limit', async () => {
							await assertRatesAreCorrect({
								txn,
								currencyKeys: [iBTC],
								expectedRates: [toUnit('2300')],
							});
							assert.equal(true, await instance.rateIsFrozen(iBTC));
						});
						it('and canFreeze is false for the currency key is now frozen', async () => {
							assert.notOk(await instance.canFreezeRate(iBTC));
						});
					});
				});
			});
			describe('when updateRates is called with an in-bounds update', () => {
				let txn;
				beforeEach(async () => {
					const rates = [4500.553, 225, 1.12, 4500.553].map(toUnit);
					const timeSent = await currentTime();
					txn = await instance.updateRates([iBTC, iETH, sEUR, sBNB], rates, timeSent, {
						from: oracle,
					});
				});
				it('regular and inverted rates should be updated correctly', async () => {
					await assertRatesAreCorrect({
						txn,
						currencyKeys: [iBTC, iETH, sEUR, sBNB],
						expectedRates: [3499.447, 175, 1.12, 4500.553].map(toUnit),
					});
				});
				it('rateIsFrozen must be false for both', async () => {
					assert.equal(false, await instance.rateIsFrozen(iBTC));
					assert.equal(false, await instance.rateIsFrozen(iETH));
				});
				it('and canFreeze is false for the currency keys as the rate is valid', async () => {
					assert.notOk(await instance.canFreezeRate(iBTC));
					assert.notOk(await instance.canFreezeRate(iETH));
				});
				describe('when setInversePricing is called to freeze a synth with a rate', () => {
					beforeEach(async () => {
						await instance.setInversePricing(
							iBTC,
							toUnit(4000),
							toUnit(6500),
							toUnit(2300),
							true,
							false,
							{
								from: owner,
							}
						);
					});
					it('then the synth is frozen', async () => {
						assert.equal(true, await instance.rateIsFrozen(iBTC));
						assert.equal(false, await instance.rateIsFrozen(iETH));
					});
					it('and the rate for the synth is the upperLimit - regardless of its old value', async () => {
						const actual = await instance.ratesForCurrencies([iBTC]);
						assert.bnEqual(actual, toUnit(6500));
					});
					it('and canFreeze is false for the currency keys as the rate is frozen', async () => {
						assert.notOk(await instance.canFreezeRate(iBTC));
					});
				});
			});
			describe('when updateRates is called with a lower out-of-bounds update', () => {
				let txn;
				beforeEach(async () => {
					const rates = [8050, 400, 1.12, 8050].map(toUnit);
					const timeSent = await currentTime();
					txn = await instance.updateRates([iBTC, iETH, sEUR, sBNB], rates, timeSent, {
						from: oracle,
					});
				});
				it('inverted rates return at the lower bounds', async () => {
					await assertRatesAreCorrect({
						txn,
						currencyKeys: [iBTC, iETH, sEUR, sBNB],
						expectedRates: [2300, 75, 1.12, 8050].map(toUnit),
						outOfBounds: [iBTC, iETH],
					});
				});
				it('and canFreeze is true for the currency keys as the rate is invalid', async () => {
					assert.ok(await instance.canFreezeRate(iBTC));
					assert.ok(await instance.canFreezeRate(iETH));
				});

				describe('when freezeRate is invoked for both', () => {
					beforeEach(async () => {
						await instance.freezeRate(iBTC, { from: accounts[2] });
						await instance.freezeRate(iETH, { from: accounts[3] });
					});
					describe('when another updateRates is called with an in bounds update', () => {
						beforeEach(async () => {
							const rates = [3500, 300, 2.12, 3500].map(toUnit);
							const timeSent = await currentTime();
							txn = await instance.updateRates([iBTC, iETH, sEUR, sBNB], rates, timeSent, {
								from: oracle,
							});
						});

						it('inverted rates must remain frozen at the lower bounds', async () => {
							await assertRatesAreCorrect({
								txn,
								currencyKeys: [iBTC, iETH, sEUR, sBNB],
								expectedRates: [2300, 75, 2.12, 3500].map(toUnit),
							});
						});
					});

					describe('when another updateRates is called with an out of bounds update the other way', () => {
						beforeEach(async () => {
							const rates = [1000, 50, 2.3, 1000].map(toUnit);
							const timeSent = await currentTime();
							txn = await instance.updateRates([iBTC, iETH, sEUR, sBNB], rates, timeSent, {
								from: oracle,
							});
						});

						it('inverted rates must remain frozen at the lower bounds', async () => {
							await assertRatesAreCorrect({
								txn,
								currencyKeys: [iBTC, iETH, sEUR, sBNB],
								expectedRates: [2300, 75, 2.3, 1000].map(toUnit),
							});
						});
					});

					describe('when setInversePricing is called again for one of the frozen synths', () => {
						let setTxn;
						beforeEach(async () => {
							setTxn = await instance.setInversePricing(
								iBTC,
								toUnit(5000),
								toUnit(8900),
								toUnit(3000),
								false,
								false,
								{
									from: owner,
								}
							);
						});

						it('it emits a InversePriceConfigured event', async () => {
							const currencyKey = 'iBTC';
							assert.eventEqual(setTxn, 'InversePriceConfigured', {
								currencyKey: toBytes32(currencyKey),
								entryPoint: toUnit(5000),
								upperLimit: toUnit(8900),
								lowerLimit: toUnit(3000),
							});
						});

						it('and the list of invertedKeys still lists them both', async () => {
							assert.equal('iBTC', bytesToString(await instance.invertedKeys(0)));
							assert.equal('iETH', bytesToString(await instance.invertedKeys(1)));
							await assert.invalidOpcode(instance.invertedKeys(2));
						});

						describe('when a price is received within bounds', () => {
							let txn;
							beforeEach(async () => {
								const rates = [1250, 201, 1.12, 1250].map(toUnit);
								const timeSent = await currentTime();
								txn = await instance.updateRates([iBTC, iETH, sEUR, sBNB], rates, timeSent, {
									from: oracle,
								});
							});
							it('then the inverted synth updates as it is no longer frozen and respects new entryPoint and limits', async () => {
								await assertRatesAreCorrect({
									txn,
									currencyKeys: [iBTC, iETH, sEUR, sBNB],
									expectedRates: [8750, 75, 1.12, 1250].map(toUnit),
								});
							});
							it('and canFreeze is false for the unfrozen and the already frozen one', async () => {
								assert.notOk(await instance.canFreezeRate(iBTC));
								assert.notOk(await instance.canFreezeRate(iETH));
							});

							describe('when a price is received out of bounds', () => {
								let txn;
								beforeEach(async () => {
									const rates = [1000, 201, 1.12, 1250].map(toUnit);
									const timeSent = await currentTime();
									txn = await instance.updateRates([iBTC, iETH, sEUR, sBNB], rates, timeSent, {
										from: oracle,
									});
								});
								it('then the inverted shows at new upper limit', async () => {
									await assertRatesAreCorrect({
										txn,
										currencyKeys: [iBTC, iETH, sEUR, sBNB],
										expectedRates: [8900, 75, 1.12, 1250].map(toUnit),
									});
								});
								it('and canFreeze is true for the currency key as the rate is invalid', async () => {
									assert.ok(await instance.canFreezeRate(iBTC));
								});
								it('but false for the already frozen one', async () => {
									assert.notOk(await instance.canFreezeRate(iETH));
								});
							});
						});
					});
				});
			});
			describe('when updateRates is called with an upper out-of-bounds update', () => {
				let txn;
				beforeEach(async () => {
					const rates = [1200, 45, 1.12, 1200].map(toUnit);
					const timeSent = await currentTime();
					txn = await instance.updateRates([iBTC, iETH, sEUR, sBNB], rates, timeSent, {
						from: oracle,
					});
				});
				it('inverted rates must be set to the upper bounds', async () => {
					await assertRatesAreCorrect({
						txn,
						currencyKeys: [iBTC, iETH, sEUR, sBNB],
						expectedRates: [6500, 350, 1.12, 1200].map(toUnit),
						outOfBounds: [iBTC, iETH],
					});
				});

				describe('when freezeRate is invoked', () => {
					beforeEach(async () => {
						await instance.freezeRate(iBTC, { from: accounts[2] });
						await instance.freezeRate(iETH, { from: accounts[2] });
					});
					describe('when another updateRates is called with an in bounds update', () => {
						beforeEach(async () => {
							const rates = [3500, 300, 2.12, 3500].map(toUnit);
							const timeSent = await currentTime();
							txn = await instance.updateRates([iBTC, iETH, sEUR, sBNB], rates, timeSent, {
								from: oracle,
							});
						});
						it('inverted rates must remain frozen at the upper bounds', async () => {
							await assertRatesAreCorrect({
								txn,
								currencyKeys: [iBTC, iETH, sEUR, sBNB],
								expectedRates: [6500, 350, 2.12, 3500].map(toUnit),
							});
						});
					});
				});

				describe('when iBTC is attempted removal by a non owner', () => {
					it('ensure only the owner can invoke', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.removeInversePricing,
							args: [iBTC],
							accounts,
							address: owner,
							reason: 'Only the contract owner may perform this action',
						});
					});
				});

				describe('when a regular (non-inverse) synth is removed by the owner', () => {
					it('then it reverts', async () => {
						await assert.revert(
							instance.removeInversePricing(sEUR, {
								from: owner,
							}),
							'No inverted price exists'
						);
						await assert.revert(
							instance.removeInversePricing(sBNB, {
								from: owner,
							}),
							'No inverted price exists'
						);
					});
				});

				describe('when iBTC is removed by the owner', () => {
					let removeTxn;
					beforeEach(async () => {
						removeTxn = await instance.removeInversePricing(iBTC, {
							from: owner,
						});
					});
					it('it emits a InversePriceConfigured event', async () => {
						assert.eventEqual(removeTxn, 'InversePriceConfigured', {
							currencyKey: iBTC,
							entryPoint: 0,
							upperLimit: 0,
							lowerLimit: 0,
						});
					});
					it('and the list of invertedKeys contains only iETH', async () => {
						assert.equal('iETH', bytesToString(await instance.invertedKeys(0)));
						await assert.invalidOpcode(instance.invertedKeys(1));
					});

					it('and inversePricing for iBTC returns an empty struct', async () => {
						const {
							entryPoint,
							upperLimit,
							lowerLimit,
							frozenAtUpperLimit,
							frozenAtLowerLimit,
						} = await instance.inversePricing(iBTC);

						assert.equal(entryPoint, '0');
						assert.equal(upperLimit, '0');
						assert.equal(lowerLimit, '0');
						assert.equal(frozenAtUpperLimit, false);
						assert.equal(frozenAtLowerLimit, false);
					});
				});
			});
		});
	});

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
					assert.deepEqual(await instance.currenciesUsingAggregator(aggregatorJPY.address), [sJPY]);
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

					describe('when the aggregator price is set for sJPY', () => {
						const newRate = 111;
						let timestamp;
						beforeEach(async () => {
							timestamp = await currentTime();
							// Multiply by 1e8 to match Chainlink's price aggregation
							await aggregatorJPY.setLatestAnswer(convertToAggregatorPrice(newRate), timestamp);
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
						describe('when the aggregator price is set for sXTZ', () => {
							const newRateXTZ = 222;
							let timestampXTZ;
							beforeEach(async () => {
								await fastForward(50);
								timestampXTZ = await currentTime();
								// Multiply by 1e8 to match Chainlink's price aggregation
								await aggregatorXTZ.setLatestAnswer(
									convertToAggregatorPrice(newRateXTZ),
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
								describe('when the ratesAndInvalidForCurrencies is queried', () => {
									let response;
									beforeEach(async () => {
										response = await instance.ratesAndInvalidForCurrencies([sJPY, sXTZ, sUSD]);
									});

									it('then the rates are invalid again', () => {
										assert.equal(response[1], true);
									});

									it('and JPY is 0 while the other is fine', () => {
										assert.equal(response[0][0], '0');
										assert.bnEqual(response[0][1], toUnit(newRateXTZ.toString()));
									});
								});
								describe('when sJPY has a non-aggregated rate', () => {});
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
						await aggregatorJPY.setLatestAnswer(convertToAggregatorPrice(newRate), timestamp);
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
			});

			describe('when a price already exists for sJPY', () => {
				const oldPrice = 100;
				let timeOldSent;
				beforeEach(async () => {
					timeOldSent = await currentTime();

					await instance.updateRates([sJPY], [web3.utils.toWei(oldPrice.toString())], timeOldSent, {
						from: oracle,
					});
				});
				describe('when the ratesAndInvalidForCurrencies is queried with sJPY', () => {
					let response;
					beforeEach(async () => {
						response = await instance.ratesAndInvalidForCurrencies([sJPY, sUSD]);
					});

					it('then the rates are NOT invalid', () => {
						assert.equal(response[1], false);
					});

					it('and equal to the value', () => {
						assert.bnEqual(response[0][0], web3.utils.toWei(oldPrice.toString()));
					});
				});
				describe('when the price is inspected for sJPY', () => {
					it('then the price is returned as expected', async () => {
						const result = await instance.rateForCurrency(sJPY, {
							from: accountOne,
						});
						assert.equal(result.toString(), toUnit(oldPrice));
					});
					it('then the timestamp is returned as expected', async () => {
						const result = await instance.lastRateUpdateTimes(sJPY, {
							from: accountOne,
						});
						assert.equal(result.toNumber(), timeOldSent);
					});
				});

				describe('when sJPY added as an aggregator (replacing existing)', () => {
					beforeEach(async () => {
						await instance.addAggregator(sJPY, aggregatorJPY.address, {
							from: owner,
						});
					});
					describe('when the price is fetched for sJPY', () => {
						it('0 is returned', async () => {
							const result = await instance.rateForCurrency(sJPY, {
								from: accountOne,
							});
							assert.equal(result.toNumber(), 0);
						});
					});
					describe('when the timestamp is fetched for sJPY', () => {
						it('0 is returned', async () => {
							const result = await instance.lastRateUpdateTimes(sJPY, {
								from: accountOne,
							});
							assert.equal(result.toNumber(), 0);
						});
					});
					describe('when the ratesAndInvalidForCurrencies is queried with sJPY', () => {
						let response;
						beforeEach(async () => {
							response = await instance.ratesAndInvalidForCurrencies([sJPY]);
						});

						it('then the rates are invalid', () => {
							assert.equal(response[1], true);
						});

						it('with no value', () => {
							assert.bnEqual(response[0][0], '0');
						});
					});

					describe('when the aggregator price is set to set a specific number (with support for 8 decimals)', () => {
						const newRate = 9.55;
						let timestamp;
						beforeEach(async () => {
							await fastForward(50);
							timestamp = await currentTime();
							await aggregatorJPY.setLatestAnswer(convertToAggregatorPrice(newRate), timestamp);
						});

						describe('when the price is fetched for sJPY', () => {
							it('the new aggregator rate is returned instead of the old price', async () => {
								const result = await instance.rateForCurrency(sJPY, {
									from: accountOne,
								});
								assert.bnEqual(result, toUnit(newRate.toString()));
							});
							it('and the timestamp is the new one', async () => {
								const result = await instance.lastRateUpdateTimes(sJPY, {
									from: accountOne,
								});
								assert.bnEqual(result.toNumber(), timestamp);
							});
						});

						describe('when the ratesAndInvalidForCurrencies is queried with sJPY', () => {
							let response;
							beforeEach(async () => {
								response = await instance.ratesAndInvalidForCurrencies([sJPY, sUSD]);
							});

							it('then the rates are NOT invalid', () => {
								assert.equal(response[1], false);
							});

							it('and equal to the value', () => {
								assert.bnEqual(response[0][0], toUnit(newRate.toString()));
							});
						});

						describe('when the aggregator is removed for sJPY', () => {
							beforeEach(async () => {
								await instance.removeAggregator(sJPY, {
									from: owner,
								});
							});
							describe('when a user queries the first entry in aggregatorKeys', () => {
								it('then they are empty', async () => {
									await assert.invalidOpcode(instance.aggregatorKeys(0));
								});
							});
							describe('when the price is inspected for sJPY', () => {
								it('then the old price is returned', async () => {
									const result = await instance.rateForCurrency(sJPY, {
										from: accountOne,
									});
									assert.equal(result.toString(), toUnit(oldPrice));
								});
								it('and the timestamp is returned as expected', async () => {
									const result = await instance.lastRateUpdateTimes(sJPY, {
										from: accountOne,
									});
									assert.equal(result.toNumber(), timeOldSent);
								});
							});
							describe('when the ratesAndInvalidForCurrencies is queried with sJPY', () => {
								let response;
								beforeEach(async () => {
									response = await instance.ratesAndInvalidForCurrencies([sJPY, sUSD]);
								});

								it('then the rates are NOT invalid', () => {
									assert.equal(response[1], false);
								});

								it('and equal to the old value', () => {
									assert.bnEqual(response[0][0], web3.utils.toWei(oldPrice.toString()));
								});
							});
						});
					});
				});

				describe('when sXTZ added as an aggregator', () => {
					beforeEach(async () => {
						await instance.addAggregator(sXTZ, aggregatorXTZ.address, {
							from: owner,
						});
					});
					describe('when the ratesAndInvalidForCurrencies is queried with sJPY and sXTZ', () => {
						let response;
						beforeEach(async () => {
							response = await instance.ratesAndInvalidForCurrencies([sJPY, sXTZ, sUSD]);
						});

						it('then the rates are invalid', () => {
							assert.equal(response[1], true);
						});

						it('with sXTZ having no value', () => {
							assert.bnEqual(response[0][0], web3.utils.toWei(oldPrice.toString()));
							assert.bnEqual(response[0][1], '0');
						});
					});

					describe('when the aggregator price is set to set for sXTZ', () => {
						const newRate = 99;
						let timestamp;
						beforeEach(async () => {
							await fastForward(50);
							timestamp = await currentTime();
							await aggregatorXTZ.setLatestAnswer(convertToAggregatorPrice(newRate), timestamp);
						});

						describe('when the ratesAndInvalidForCurrencies is queried with sJPY and sXTZ', () => {
							let response;
							beforeEach(async () => {
								response = await instance.ratesAndInvalidForCurrencies([sJPY, sXTZ, sUSD]);
							});

							it('then the rates are NOT invalid', () => {
								assert.equal(response[1], false);
							});

							it('and equal to the values', () => {
								assert.bnEqual(response[0][0], toUnit(oldPrice.toString()));
								assert.bnEqual(response[0][1], toUnit(newRate.toString()));
							});
						});
					});
				});
			});
			describe('warning flags and invalid rates', () => {
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
							await aggregatorJPY.setLatestAnswer(convertToAggregatorPrice(newRate), timestamp);
						});
						it('then the rate shows as not stale', async () => {
							assert.equal(await instance.rateIsStale(sJPY), false);
						});
						it('then the rate shows as not invalid', async () => {
							assert.equal(await instance.rateIsInvalid(sJPY), false);
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
		it('getCurrentRoundId() by default is 0 for all synths except sUSD which is 1', async () => {
			// Note: rates that were set in the truffle migration will be at 1, so we need to check
			// other synths
			assert.equal(await instance.getCurrentRoundId(sJPY), '0');
			assert.equal(await instance.getCurrentRoundId(sBNB), '0');
			assert.equal(await instance.getCurrentRoundId(sUSD), '1');
		});

		it('ratesAndUpdatedTimeForCurrencyLastNRounds() shows first entry for sUSD', async () => {
			const timeOfsUSDRateSetOnInit = await instance.lastRateUpdateTimes(sUSD);
			assert.deepEqual(await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sUSD, '3'), [
				[toUnit('1'), '0', '0'],
				[timeOfsUSDRateSetOnInit, '0', '0'],
			]);
		});
		it('ratesAndUpdatedTimeForCurrencyLastNRounds() returns 0s for other currency keys', async () => {
			const fiveZeros = new Array(5).fill('0');
			assert.deepEqual(await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sAUD, '5'), [
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
						await aggregatorJPY.setLatestAnswer(convertToAggregatorPrice(100 + i), timestamp + i);
					}
				});

				describe('and the sBNB rate (non-aggregator) has been set three times directly also', () => {
					let timestamp;

					beforeEach(async () => {
						for (let i = 0; i < 3; i++) {
							timestamp = 10000;
							await instance.updateRates([sBNB], [toUnit((1000 + i).toString())], timestamp + i, {
								from: oracle,
							});
						}
					});
					describe('getCurrentRoundId())', () => {
						describe('when invoked for an aggregator', () => {
							it('getCurrentRound() returns the last entry', async () => {
								await assert.equal((await instance.getCurrentRoundId(sJPY)).toString(), '3');
							});
						});
						describe('when invoked for a regular price', () => {
							it('getCurrentRound() returns the last entry', async () => {
								await assert.equal((await instance.getCurrentRoundId(sBNB)).toString(), '3');
							});
						});
					});
					describe('rateAndTimestampAtRound()', () => {
						it('when invoked for no price, returns no rate and no tme', async () => {
							const { rate, time } = await instance.rateAndTimestampAtRound(toBytes32('TEST'), '0');
							assert.equal(rate, '0');
							assert.equal(time, '0');
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
						it('when invoked for a regular price', async () => {
							const assertRound = async ({ roundId }) => {
								const { rate, time } = await instance.rateAndTimestampAtRound(
									sBNB,
									roundId.toString()
								);
								assert.bnEqual(rate, toUnit((1000 + roundId - 1).toString()));
								assert.bnEqual(time, toBN(10000 + roundId - 1));
							};
							await assertRound({ roundId: 1 });
							await assertRound({ roundId: 2 });
							await assertRound({ roundId: 3 });
						});
					});

					describe('ratesAndUpdatedTimeForCurrencyLastNRounds()', () => {
						describe('when invoked for a non-existant currency', () => {
							it('then it returns 0s', async () => {
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

						describe('when invoked for a regular price', () => {
							it('then it returns the rates as expected', async () => {
								assert.deepEqual(
									await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sBNB, '3'),
									[
										[toUnit('1002'), toUnit('1001'), toUnit('1000')],
										['10002', '10001', '10000'],
									]
								);
							});
							it('then it returns the rates as expected, even over the edge', async () => {
								assert.deepEqual(
									await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sBNB, '5'),
									[
										[toUnit('1002'), toUnit('1001'), toUnit('1000'), '0', '0'],
										['10002', '10001', '10000', '0', '0'],
									]
								);
							});
						});
					});
				});
			});

			describe('and both the aggregator and regular prices have been given three rates, 30seconds apart', () => {
				beforeEach(async () => {
					await aggregatorJPY.setLatestAnswer(convertToAggregatorPrice(100), 30); // round 1 for sJPY
					await aggregatorJPY.setLatestAnswer(convertToAggregatorPrice(200), 60); // round 2 for sJPY
					await aggregatorJPY.setLatestAnswer(convertToAggregatorPrice(300), 90); // round 3 for sJPY

					await instance.updateRates([sBNB], [toUnit('1000')], '30', { from: oracle }); // round 1 for sBNB
					await instance.updateRates([sBNB], [toUnit('2000')], '60', { from: oracle }); // round 2 for sBNB
					await instance.updateRates([sBNB], [toUnit('3000')], '90', { from: oracle }); // round 3 for sBNB
				});

				describe('getLastRoundIdBeforeElapsedSecs()', () => {
					describe('when getLastRoundIdBeforeElapsedSecs() is invoked with the first round and a waiting time of less than 30s', () => {
						it('then it receives round 1 - no change ', async () => {
							// assert both aggregated price and regular prices work as expected
							assert.equal(
								(await instance.getLastRoundIdBeforeElapsedSecs(sJPY, '1', 40, 10)).toString(),
								'1'
							);
							assert.equal(
								(await instance.getLastRoundIdBeforeElapsedSecs(sBNB, '1', 40, 10)).toString(),
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
							assert.equal(
								(await instance.getLastRoundIdBeforeElapsedSecs(sBNB, '1', 40, 20)).toString(),
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
							assert.equal(
								(await instance.getLastRoundIdBeforeElapsedSecs(sBNB, '2', 65, 25)).toString(),
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
							assert.equal(
								(await instance.getLastRoundIdBeforeElapsedSecs(sBNB, '1', 40, 40)).toString(),
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
							assert.equal(
								(await instance.getLastRoundIdBeforeElapsedSecs(sBNB, '1', 50, 40)).toString(),
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
							assert.equal(
								(await instance.getLastRoundIdBeforeElapsedSecs(sBNB, '1', 50, 40)).toString(),
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
							assert.equal(
								(await instance.getLastRoundIdBeforeElapsedSecs(sBNB, '1', 50, 40)).toString(),
								'3'
							);
						});
					});
				});
			});
			describe('effectiveValueAtRound()', () => {
				describe('when both the aggregator and regular prices have been give three rates with current timestamps', () => {
					beforeEach(async () => {
						let timestamp = await currentTime();
						await aggregatorJPY.setLatestAnswer(convertToAggregatorPrice(100), timestamp); // round 1 for sJPY
						await instance.updateRates([sBNB], [toUnit('1000')], timestamp, { from: oracle }); // round 1 for sBNB

						await fastForward(120);
						timestamp = await currentTime();
						await aggregatorJPY.setLatestAnswer(convertToAggregatorPrice(200), timestamp); // round 2 for sJPY
						await instance.updateRates([sBNB], [toUnit('2000')], timestamp, { from: oracle }); // round 2 for sBNB

						await fastForward(120);
						timestamp = await currentTime();
						await aggregatorJPY.setLatestAnswer(convertToAggregatorPrice(300), timestamp); // round 3 for sJPY
						await instance.updateRates([sBNB], [toUnit('4000')], timestamp, { from: oracle }); // round 3 for sBNB
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
});
