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
			thenAnyRateInvalidTrue,
			thenAnyRateInvalidFalse,
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

		// ------- VIEWS

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

		describe('rateAndUpdatedTime() view', () => {});

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

		describe('rateIsInvalid() and anyRateIsInvalid() views', () => {
			describe('sUSD is never invalid', () => {
				const currencyKey = sUSD;
				const currencyKeys = [sUSD];
				thenRateValid({ currencyKey });
				thenAnyRateInvalidFalse({ currencyKeys });

				whenTimeIsMovedForwardBy({ seconds: 60 }, () => {
					thenRateValid({ currencyKey });
					thenAnyRateInvalidFalse({ currencyKeys });
				});

				whenTimeIsMovedForwardBy({ seconds: RATE_STALE_PERIOD }, () => {
					thenRateValid({ currencyKey });
					thenAnyRateInvalidFalse({ currencyKeys });
				});

				whenTimeIsMovedForwardBy({ seconds: 999999999 }, () => {
					thenRateValid({ currencyKey });
					thenAnyRateInvalidFalse({ currencyKeys });
				});

				// Cannot check if sUSD is flagged because addAggregator prevents sUSD being added
			});

			it('an unknown rate is always true', async () => {
				thenRateInvalid({ currencyKey: UNKNOWN });
				thenAnyRateInvalidTrue({ currencyKeys: [UNKNOWN] });
			});

			const currencyKey = sETH;
			const currencyKeys = [sETH, sUSD];
			whenAggregatorAdded({ currencyKey }, () => {
				// no rate, so invalid
				thenRateInvalid({ currencyKey });
				thenAnyRateInvalidTrue({ currencyKeys });

				whenAggregatorHasRate({ currencyKey, rate: 125 }, () => {
					thenRateValid({ currencyKey });
					thenAnyRateInvalidFalse({ currencyKeys });

					whenAggregatorFlagged({ currencyKey }, () => {
						thenRateInvalid({ currencyKey });
						thenAnyRateInvalidTrue({ currencyKeys });
					});

					whenTimeIsMovedForwardBy({ seconds: 60 }, () => {
						thenRateValid({ currencyKey });
						thenAnyRateInvalidFalse({ currencyKeys });

						whenAggregatorFlagged({ currencyKey }, () => {
							thenRateInvalid({ currencyKey });
							thenAnyRateInvalidTrue({ currencyKeys });
						});
					});

					whenTimeIsMovedForwardBy({ seconds: RATE_STALE_PERIOD - 1 }, () => {
						thenRateValid({ currencyKey });
						thenAnyRateInvalidFalse({ currencyKeys });

						whenAggregatorFlagged({ currencyKey }, () => {
							thenRateInvalid({ currencyKey });
							thenAnyRateInvalidTrue({ currencyKeys });
						});
					});

					whenRateStalePeriodExpires(() => {
						thenRateInvalid({ currencyKey });
						thenAnyRateInvalidTrue({ currencyKeys });

						whenAggregatorFlagged({ currencyKey }, () => {
							thenRateInvalid({ currencyKey });
							thenAnyRateInvalidTrue({ currencyKeys });
						});
					});
				});
			});
		});

		describe('rateIsFrozen');

		describe('canFreezeRate() view', () => {});

		describe('aggregatorWarningFlags() view', () => {
			describe('when warning flags set in fake', () => {
				beforeEach(async () => {
					await instance.setAggregatorWarningFlags(accountTwo);
				});
				it('then aggregatorWarningFlags() returns this set flags address', async () => {
					assert.equal(await instance.aggregatorWarningFlags(), accountTwo);
				});
			});
		});
		describe('currenciesUsingAggregator() view', () => {});

		describe('getLastRoundIdBeforeElapsedSecs() view', () => {});

		describe('getCurrentRoundId() view', () => {});

		describe('effectiveValue() view', () => {});
		describe('effectiveValueAndRates() view', () => {});
		describe('effectiveValueAtRound() view', () => {});

		describe('ratesForCurrencies() view', () => {});
		describe('ratesAndInvalidForCurrencies() view', () => {});
		describe('ratesAndUpdatedTimeForCurrencyLastNRounds() view', () => {});

		describe('aggregators() view', () => {});
		describe('aggregatorKeys() view', () => {});
		describe('inversePricing() view', () => {});
		describe('invertedKeys() view', () => {});

		// ----- EXTERNAL FUNCTIONS

		describe('freezeRate() external function', () => {});

		// ----- RESTRICTED FUNCTIONS

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

	describe('removAggrator() restricted function', () => {});

	describe('setInversePricing() restricted function', () => {});
	describe('removeInversePricing() restricted function', () => {});
});
