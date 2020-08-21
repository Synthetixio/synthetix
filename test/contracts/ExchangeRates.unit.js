'use strict';

const { artifacts, contract, web3, legacy } = require('@nomiclabs/buidler');

const { assert } = require('./common');

const { currentTime, fastForward, toUnit, bytesToString } = require('../utils')();

const behaviors = require('./ExchangeRates.behaviors');

const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	timeIsClose,
	convertToAggregatorPrice,
} = require('./helpers');

const { setupContract, setupAllContracts, mockGenericContractFnc } = require('./setup');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
	defaults: { RATE_STALE_PERIOD },
} = require('../..');

const { toBN } = require('web3-utils');

const ExchangeRates = artifacts.require('ExchangeRates');
const FakeExchangeRates = artifacts.require('FakeExchangeRates');
const MockAggregator = artifacts.require('MockAggregator');

contract('Exchange Rates (unit tests)', async accounts => {
	const [deployerAccount, owner, , accountOne, accountTwo] = accounts;
	const [sUSD, SNX, sETH, sOIL, UNKNOWN] = ['sUSD', 'SNX', 'sETH', 'sOIL', 'UNKNOWN'].map(
		toBytes32
	);
	// const [SNX, sJPY, sXTZ, sBNB, sUSD, sEUR, sAUD] = [
	// 	'SNX',
	// 	'sJPY',
	// 	'sXTZ',
	// 	'sBNB',
	// 	'sUSD',
	// 	'sEUR',
	// 	'sAUD',
	// ].map(toBytes32);
	// let instance;
	// let systemSettings;
	// let aggregatorJPY;
	// let aggregatorXTZ;
	// let timeSent;
	// let resolver;
	// let mockFlagsInterface;

	it('only expected functions should be mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: ExchangeRates.abi,
			ignoreParents: ['SelfDestructible', 'MixinResolver'],
			expected: [
				'addAggregator',
				'freezeRate',
				'removeAggregator',
				'removeInversePricing',
				'setInversePricing',
			],
		});
	});

	describe('when a fake is instantiated, swapping out external contracts', () => {
		// destruct all behaviors, binding them by default to "this", which is the mocha
		// context, used to share state between layers
		const {
			whenRateStalePeriodExpires,
			whenTimeIsMovedForwardBy,
			whenAggregatorAdded,
			whenAggregatorHasRate,
			whenAggregatorFlagged,
			thenRateIsStale,
			thenRateNotStale,
			thenRateInvalid,
			thenRateValid,
			thenRateSet,
		} = Object.keys(behaviors).reduce((memo, cur) => {
			memo[cur] = behaviors[cur].bind(this);
			return memo;
		}, {});

		let instance;
		before(async () => {
			FakeExchangeRates.link(await artifacts.require('SafeDecimalMath').new());
			this.owner = owner;
		});
		beforeEach(async () => {
			instance = await FakeExchangeRates.new(owner, ZERO_ADDRESS);
			this.instance = instance;
			// set rate stale period in fake to match system default
			await instance.setRateStalePeriod(RATE_STALE_PERIOD);
		});

		describe('constructor', () => {
			it('should set constructor params on deployment', async () => {
				assert.equal(await instance.owner(), owner);
				assert.equal(await instance.selfDestructBeneficiary(), owner);
			});
		});

		describe('is SelfDestructible', () => {
			it('should be destructable', async () => {
				// Check if the instance adheres to the destructable interface
				assert.exists(instance.initiateSelfDestruct);
				assert.exists(instance.setSelfDestructBeneficiary);
				assert.exists(instance.terminateSelfDestruct);
				assert.exists(instance.selfDestruct);

				assert.exists(instance.initiationTime);
				assert.exists(instance.selfDestructInitiated);
				assert.exists(instance.selfDestructBeneficiary);
			});
		});

		describe('rateStalePeriod() view', () => {
			it('rateStalePeriod default is set correctly', async () => {
				assert.bnEqual(await instance.rateStalePeriod(), RATE_STALE_PERIOD);
			});
			describe('when rate stale is changed in the fake', () => {
				const newRateStalePeriod = '3601';
				beforeEach(async () => {
					await instance.setRateStalePeriod(newRateStalePeriod);
				});
				it('then rateStalePeriod returns correctly', async () => {
					assert.bnEqual(await instance.rateStalePeriod(), newRateStalePeriod);
				});
			});
		});

		describe('rateIsStale() view', () => {
			describe('sUSD is never stale', () => {
				const currencyKey = sUSD;
				thenRateNotStale({ currencyKey });

				whenTimeIsMovedForwardBy({ seconds: 60 }, () => {
					thenRateNotStale({ currencyKey });
				});

				whenTimeIsMovedForwardBy({ seconds: RATE_STALE_PERIOD }, () => {
					thenRateNotStale({ currencyKey });
				});

				whenTimeIsMovedForwardBy({ seconds: 999999999 }, () => {
					thenRateNotStale({ currencyKey });
				});
			});

			it('an unknown rate is always true', async () => {
				thenRateIsStale({ currencyKey: UNKNOWN });
			});

			const currencyKey = sETH;

			whenAggregatorAdded({ currencyKey }, () => {
				whenAggregatorHasRate({ currencyKey, rate: 125 }, () => {
					thenRateNotStale({ currencyKey });
					whenTimeIsMovedForwardBy({ seconds: 60 }, () => {
						thenRateNotStale({ currencyKey });
					});
					whenTimeIsMovedForwardBy({ seconds: RATE_STALE_PERIOD - 1 }, () => {
						thenRateNotStale({ currencyKey });
					});
					whenRateStalePeriodExpires(() => {
						thenRateIsStale({ currencyKey });
					});
				});
			});
		});

		describe('rateIsInvalid() view', () => {
			describe('sUSD is never invalid', () => {
				const currencyKey = sUSD;
				thenRateValid({ currencyKey });

				whenTimeIsMovedForwardBy({ seconds: 60 }, () => {
					thenRateValid({ currencyKey });
				});

				whenTimeIsMovedForwardBy({ seconds: RATE_STALE_PERIOD }, () => {
					thenRateValid({ currencyKey });
				});

				whenTimeIsMovedForwardBy({ seconds: 999999999 }, () => {
					thenRateValid({ currencyKey });
				});

				// Cannot check if sUSD is flagged because addAggregator prevents sUSD being added
			});

			it('an unknown rate is always true', async () => {
				thenRateInvalid({ currencyKey: UNKNOWN });
			});

			const currencyKey = sETH;

			whenAggregatorAdded({ currencyKey }, () => {
				// no rate, so invalid
				thenRateInvalid({ currencyKey });

				whenAggregatorHasRate({ currencyKey, rate: 125 }, () => {
					thenRateValid({ currencyKey });

					whenAggregatorFlagged({ currencyKey }, () => {
						thenRateInvalid({ currencyKey });
					});

					whenTimeIsMovedForwardBy({ seconds: 60 }, () => {
						thenRateValid({ currencyKey });
						whenAggregatorFlagged({ currencyKey }, () => {
							thenRateInvalid({ currencyKey });
						});
					});

					whenTimeIsMovedForwardBy({ seconds: RATE_STALE_PERIOD - 1 }, () => {
						thenRateValid({ currencyKey });
						whenAggregatorFlagged({ currencyKey }, () => {
							thenRateInvalid({ currencyKey });
						});
					});

					whenRateStalePeriodExpires(() => {
						thenRateInvalid({ currencyKey });
						whenAggregatorFlagged({ currencyKey }, () => {
							thenRateInvalid({ currencyKey });
						});
					});
				});
			});
		});

		describe('rateForCurrency() view', () => {
			it('non existant rate must return 0', async () => {
				assert.equal(await instance.rateForCurrency(UNKNOWN), '0');
			});
			it('sUSD must always return 1', async () => {
				assert.bnEqual(await instance.rateForCurrency(sUSD), toUnit('1'));
			});
			const currencyKey = sOIL;
			whenAggregatorAdded({ currencyKey }, () => {
				whenAggregatorHasRate({ currencyKey, rate: 125 }, () => {
					thenRateSet({ currencyKey, rate: 125 });
				});
			});
		});

		describe('lastRateUpdateTimes() view', () => {
			it('non existant rate must return 0', async () => {
				assert.equal(await instance.lastRateUpdateTimes(UNKNOWN), '0');
			});
			it('sUSD must always return a time close to now', async () => {
				const timestamp = await currentTime();
				timeIsClose({ actual: await instance.lastRateUpdateTimes(sUSD), expected: timestamp });
			});
			const currencyKey = sOIL;
			whenAggregatorAdded({ currencyKey }, () => {
				let timestamp;
				beforeEach(async () => {
					timestamp = await currentTime();
				});
				whenAggregatorHasRate({ currencyKey, rate: 125 }, () => {
					it('then the time is close to when the rate was set', async () => {
						timeIsClose({ actual: await instance.lastRateUpdateTimes(sOIL), expected: timestamp });
					});
				});
			});
		});

		describe('anyRateIsInvalid() view', () => {
			describe('sUSD is never invalid', () => {
				thenRateValid({ currencyKey: sUSD });
			});

			const currencyKey = sETH;
			whenAggregatorAdded({ currencyKey }, () => {
				whenAggregatorHasRate({ currencyKey, rate: 300 }, () => {
					// TODO
				});
			});

			describe('stale scenarios', () => {
				it('should be able to confirm no rates are stale from a subset', async () => {});

				it('should be able to confirm a single rate is stale from a set of rates', async () => {});

				it('should be able to confirm a single rate (from a set of 1) is stale', async () => {});

				it('ensure rates are considered stale if not set', async () => {});
			});

			// describe('flagged scenarios', () => {
			// 	describe('when sJPY aggregator is added', () => {
			// 		beforeEach(async () => {
			// 			await instance.addAggregator(sJPY, aggregatorJPY.address, {
			// 				from: owner,
			// 			});
			// 		});
			// 		describe('when a regular and aggregated synth have rates', () => {
			// 			beforeEach(async () => {
			// 				const timestamp = await currentTime();
			// 				await instance.updateRates([toBytes32('sGOLD')], [web3.utils.toWei('1')], timestamp, {
			// 					from: oracle,
			// 				});
			// 				await aggregatorJPY.setLatestAnswer(convertToAggregatorPrice(100), timestamp);
			// 			});
			// 			it('then rateIsInvalid for both is false', async () => {
			// 				const rateIsInvalid = await instance.anyRateIsInvalid([
			// 					toBytes32('sGOLD'),
			// 					sJPY,
			// 					sUSD,
			// 				]);
			// 				assert.equal(rateIsInvalid, false);
			// 			});

			// 			describe('when the flags interface is set', () => {
			// 				beforeEach(async () => {
			// 					// replace the FlagsInterface mock with a fully fledged mock that can
			// 					// return arrays of information

			// 					await systemSettings.setAggregatorWarningFlags(mockFlagsInterface.address, {
			// 						from: owner,
			// 					});
			// 				});

			// 				it('then rateIsInvalid for both is still false', async () => {
			// 					const rateIsInvalid = await instance.anyRateIsInvalid([
			// 						toBytes32('sGOLD'),
			// 						sJPY,
			// 						sUSD,
			// 					]);
			// 					assert.equal(rateIsInvalid, false);
			// 				});

			// 				describe('when the sJPY aggregator is flagged', () => {
			// 					beforeEach(async () => {
			// 						await mockFlagsInterface.flagAggregator(aggregatorJPY.address);
			// 					});
			// 					it('then rateIsInvalid for both is true', async () => {
			// 						const rateIsInvalid = await instance.anyRateIsInvalid([
			// 							toBytes32('sGOLD'),
			// 							sJPY,
			// 							sUSD,
			// 						]);
			// 						assert.equal(rateIsInvalid, true);
			// 					});
			// 				});
			// 			});
			// 		});
			// 	});
			// });
		});

		describe('addAggregator() restricted function', () => {
			let mockAggregator;
			beforeEach(async () => {
				mockAggregator = await MockAggregator.new();
			});
			it('only an owner can add an aggregator', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.addAggregator,
					args: [sETH, mockAggregator.address],
					accounts,
					address: owner,
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('the owner cannot add sUSD as an aggregator', async () => {
				await assert.revert(
					instance.addAggregator(sUSD, mockAggregator.address, { from: owner }),
					'Cannot replace sUSD'
				);
			});
			it('the owner cannot add a contract that doesnt conform to the aggregator interface', async () => {
				await assert.revert(instance.addAggregator(sUSD, ZERO_ADDRESS, { from: owner }));
			});
		});
	});
});
