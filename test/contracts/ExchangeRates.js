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
} = require('./helpers');

const { setupContract, setupAllContracts } = require('./setup');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
	defaults: { RATE_STALE_PERIOD, ATOMIC_TWAP_WINDOW },
} = require('../..');

const { toBN } = require('web3-utils');

const MockAggregator = artifacts.require('MockAggregatorV2V3');

const getRandomCurrencyKey = () =>
	Math.random()
		.toString(36)
		.substring(2, 6)
		.toUpperCase();

const createRandomKeysAndRates = quantity => {
	const uniqueCurrencyKeys = {};
	for (let i = 0; i < quantity; i++) {
		const rate = Math.random() * 100;
		const key = toBytes32(getRandomCurrencyKey());
		uniqueCurrencyKeys[key] = web3.utils.toWei(rate.toFixed(18), 'ether');
	}

	const rates = [];
	const currencyKeys = [];
	Object.entries(uniqueCurrencyKeys).forEach(([key, rate]) => {
		currencyKeys.push(key);
		rates.push(rate);
	});

	return { currencyKeys, rates };
};

contract('Exchange Rates', async accounts => {
	const [deployerAccount, owner, oracle, dexPriceAggregator, accountOne, accountTwo] = accounts;
	const [SNX, sJPY, sETH, sXTZ, sBNB, sUSD, sEUR, sAUD, fastGasPrice] = [
		'SNX',
		'sJPY',
		'sETH',
		'sXTZ',
		'sBNB',
		'sUSD',
		'sEUR',
		'sAUD',
		'fastGasPrice',
	].map(toBytes32);
	let instance;
	let systemSettings;
	let aggregatorJPY;
	let aggregatorXTZ;
	let aggregatorFastGasPrice;
	let initialTime;
	let timeSent;
	let resolver;
	let mockFlagsInterface;

	const itIncludesCorrectMutativeFunctions = contract => {
		const baseFunctions = [
			'addAggregator',
			'deleteRate',
			'removeAggregator',
			'setOracle',
			'updateRates',
			'mutativeEffectiveValueAndRatesAtRound',
		];
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
				assert.equal(await instance.oracle(), oracle);

				assert.etherEqual(await instance.rateForCurrency(sUSD), '1');
				assert.etherEqual(await instance.rateForCurrency(SNX), '0.2');

				// Ensure that when the rate isn't found, 0 is returned as the exchange rate.
				assert.etherEqual(await instance.rateForCurrency(toBytes32('OTHER')), '0');

				const lastUpdatedTimeSUSD = await instance.lastRateUpdateTimes.call(sUSD);
				assert.isAtLeast(lastUpdatedTimeSUSD.toNumber(), initialTime);

				const lastUpdatedTimeOTHER = await instance.lastRateUpdateTimes.call(toBytes32('OTHER'));
				assert.equal(lastUpdatedTimeOTHER.toNumber(), 0);

				const lastUpdatedTimeSNX = await instance.lastRateUpdateTimes.call(SNX);
				assert.isAtLeast(lastUpdatedTimeSNX.toNumber(), initialTime);

				const sUSDRate = await instance.rateForCurrency(sUSD);
				assert.bnEqual(sUSDRate, toUnit('1'));
			});

			it('two different currencies in same array should mean that the second one overrides', async () => {
				const creationTime = await currentTime();
				const firstAmount = '4.33';
				const secondAmount = firstAmount + 10;
				const instance = await setupContract({
					accounts,
					contract,
					args: [
						owner,
						oracle,
						resolver.address,
						[toBytes32('CARTER'), toBytes32('CARTOON')],
						[web3.utils.toWei(firstAmount, 'ether'), web3.utils.toWei(secondAmount, 'ether')],
					],
				});

				assert.etherEqual(await instance.rateForCurrency(toBytes32('CARTER')), firstAmount);
				assert.etherEqual(await instance.rateForCurrency(toBytes32('CARTOON')), secondAmount);

				const lastUpdatedTime = await instance.lastRateUpdateTimes.call(toBytes32('CARTER'));
				assert.isAtLeast(lastUpdatedTime.toNumber(), creationTime);
			});

			it('should revert when number of currency keys > new rates length on create', async () => {
				await assert.revert(
					setupContract({
						accounts,
						contract,
						args: [
							owner,
							oracle,
							resolver.address,
							[SNX, toBytes32('GOLD')],
							[web3.utils.toWei('0.2', 'ether')],
						],
					}),
					'Currency key length and rate length must match'
				);
			});

			it('should limit to 32 bytes if currency key > 32 bytes on create', async () => {
				const creationTime = await currentTime();
				const amount = '4.33';
				const instance = await setupContract({
					accounts,
					contract,
					args: [
						owner,
						oracle,
						resolver.address,
						[toBytes32('ABCDEFGHIJKLMNOPQRSTUVXYZ1234567')],
						[web3.utils.toWei(amount, 'ether')],
					],
				});

				assert.etherEqual(
					await instance.rateForCurrency(toBytes32('ABCDEFGHIJKLMNOPQRSTUVXYZ1234567')),
					amount
				);
				assert.etherNotEqual(
					await instance.rateForCurrency(toBytes32('ABCDEFGHIJKLMNOPQRSTUVXYZ123456')),
					amount
				);

				const lastUpdatedTime = await instance.lastRateUpdateTimes.call(
					toBytes32('ABCDEFGHIJKLMNOPQRSTUVXYZ1234567')
				);
				assert.isAtLeast(lastUpdatedTime.toNumber(), creationTime);
			});

			it("shouldn't be able to set exchange rate to 0 on create", async () => {
				await assert.revert(
					setupContract({
						accounts,
						contract,
						args: [owner, oracle, resolver.address, [SNX], ['0']],
					}),
					'Zero is not a valid rate, please call deleteRate instead'
				);
			});

			it('should be able to handle lots of currencies on creation', async () => {
				const creationTime = await currentTime();
				const numberOfCurrencies = 80;
				const { currencyKeys, rates } = createRandomKeysAndRates(numberOfCurrencies);

				const instance = await setupContract({
					accounts,
					contract,
					args: [owner, oracle, resolver.address, currencyKeys, rates],
				});

				for (let i = 0; i < currencyKeys.length; i++) {
					assert.bnEqual(await instance.rateForCurrency(currencyKeys[i]), rates[i]);
					const lastUpdatedTime = await instance.lastRateUpdateTimes.call(currencyKeys[i]);
					assert.isAtLeast(lastUpdatedTime.toNumber(), creationTime);
				}
			});
		});
	};

	// Oracle rates

	const itUpdatesRates = () => {
		describe('updateRates()', () => {
			it('should be able to update rates of only one currency without affecting other rates', async () => {
				await fastForward(1);

				await instance.updateRates(
					[toBytes32('lABC'), toBytes32('lDEF'), toBytes32('lGHI')],
					[
						web3.utils.toWei('1.3', 'ether'),
						web3.utils.toWei('2.4', 'ether'),
						web3.utils.toWei('3.5', 'ether'),
					],
					timeSent,
					{ from: oracle }
				);

				await fastForward(10);
				const updatedTime = timeSent + 10;

				const updatedRate = '64.33';
				await instance.updateRates(
					[toBytes32('lABC')],
					[web3.utils.toWei(updatedRate, 'ether')],
					updatedTime,
					{ from: oracle }
				);

				const updatedTimelDEF = await instance.lastRateUpdateTimes.call(toBytes32('lDEF'));
				const updatedTimelGHI = await instance.lastRateUpdateTimes.call(toBytes32('lGHI'));

				assert.etherEqual(await instance.rateForCurrency(toBytes32('lABC')), updatedRate);
				assert.etherEqual(await instance.rateForCurrency(toBytes32('lDEF')), '2.4');
				assert.etherEqual(await instance.rateForCurrency(toBytes32('lGHI')), '3.5');

				const lastUpdatedTimeLABC = await instance.lastRateUpdateTimes.call(toBytes32('lABC'));
				assert.equal(lastUpdatedTimeLABC.toNumber(), updatedTime);
				const lastUpdatedTimeLDEF = await instance.lastRateUpdateTimes.call(toBytes32('lDEF'));
				assert.equal(lastUpdatedTimeLDEF.toNumber(), updatedTimelDEF.toNumber());
				const lastUpdatedTimeLGHI = await instance.lastRateUpdateTimes.call(toBytes32('lGHI'));
				assert.equal(lastUpdatedTimeLGHI.toNumber(), updatedTimelGHI.toNumber());
			});

			it('should be able to update rates of all currencies', async () => {
				await fastForward(1);

				await instance.updateRates(
					[toBytes32('lABC'), toBytes32('lDEF'), toBytes32('lGHI')],
					[
						web3.utils.toWei('1.3', 'ether'),
						web3.utils.toWei('2.4', 'ether'),
						web3.utils.toWei('3.5', 'ether'),
					],
					timeSent,
					{ from: oracle }
				);

				await fastForward(5);
				const updatedTime = timeSent + 5;

				const updatedRate1 = '64.33';
				const updatedRate2 = '2.54';
				const updatedRate3 = '10.99';
				await instance.updateRates(
					[toBytes32('lABC'), toBytes32('lDEF'), toBytes32('lGHI')],
					[
						web3.utils.toWei(updatedRate1, 'ether'),
						web3.utils.toWei(updatedRate2, 'ether'),
						web3.utils.toWei(updatedRate3, 'ether'),
					],
					updatedTime,
					{ from: oracle }
				);

				assert.etherEqual(await instance.rateForCurrency(toBytes32('lABC')), updatedRate1);
				assert.etherEqual(await instance.rateForCurrency(toBytes32('lDEF')), updatedRate2);
				assert.etherEqual(await instance.rateForCurrency(toBytes32('lGHI')), updatedRate3);

				const lastUpdatedTimeLABC = await instance.lastRateUpdateTimes.call(toBytes32('lABC'));
				assert.equal(lastUpdatedTimeLABC.toNumber(), updatedTime);
				const lastUpdatedTimeLDEF = await instance.lastRateUpdateTimes.call(toBytes32('lDEF'));
				assert.equal(lastUpdatedTimeLDEF.toNumber(), updatedTime);
				const lastUpdatedTimeLGHI = await instance.lastRateUpdateTimes.call(toBytes32('lGHI'));
				assert.equal(lastUpdatedTimeLGHI.toNumber(), updatedTime);
			});

			it('should revert when trying to set sUSD price', async () => {
				await fastForward(1);

				await assert.revert(
					instance.updateRates([sUSD], [web3.utils.toWei('1.0', 'ether')], timeSent, {
						from: oracle,
					}),
					"Rate of sUSD cannot be updated, it's always UNIT"
				);
			});

			it('should emit RatesUpdated event when rate updated', async () => {
				const rates = [
					web3.utils.toWei('1.3', 'ether'),
					web3.utils.toWei('2.4', 'ether'),
					web3.utils.toWei('3.5', 'ether'),
				];

				const keys = ['lABC', 'lDEF', 'lGHI'];
				const currencyKeys = keys.map(toBytes32);
				const txn = await instance.updateRates(currencyKeys, rates, await currentTime(), {
					from: oracle,
				});

				assert.eventEqual(txn, 'RatesUpdated', {
					currencyKeys,
					newRates: rates,
				});
			});

			it('should be able to handle lots of currency updates', async () => {
				const numberOfCurrencies = 150;
				const { currencyKeys, rates } = createRandomKeysAndRates(numberOfCurrencies);

				const updatedTime = await currentTime();
				await instance.updateRates(currencyKeys, rates, updatedTime, { from: oracle });

				for (let i = 0; i < currencyKeys.length; i++) {
					assert.equal(await instance.rateForCurrency(currencyKeys[i]), rates[i]);
					const lastUpdatedTime = await instance.lastRateUpdateTimes.call(currencyKeys[i]);
					assert.equal(lastUpdatedTime.toNumber(), updatedTime);
				}
			});

			it('should revert when currency keys length != new rates length on update', async () => {
				await assert.revert(
					instance.updateRates(
						[sUSD, SNX, toBytes32('GOLD')],
						[web3.utils.toWei('1', 'ether'), web3.utils.toWei('0.2', 'ether')],
						await currentTime(),
						{ from: oracle }
					),
					'Currency key array length must match rates array length'
				);
			});

			it('should not be able to set exchange rate to 0 on update', async () => {
				await assert.revert(
					instance.updateRates(
						[toBytes32('ZERO')],
						[web3.utils.toWei('0', 'ether')],
						await currentTime(),
						{ from: oracle }
					),
					'Zero is not a valid rate, please call deleteRate instead'
				);
			});

			it('only oracle can update exchange rates', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.updateRates,
					args: [
						[toBytes32('GOLD'), toBytes32('FOOL')],
						[web3.utils.toWei('10', 'ether'), web3.utils.toWei('0.9', 'ether')],
						timeSent,
					],
					address: oracle,
					accounts,
					skipPassCheck: true,
					reason: 'Only the oracle can perform this action',
				});

				assert.etherNotEqual(await instance.rateForCurrency(toBytes32('GOLD')), '10');
				assert.etherNotEqual(await instance.rateForCurrency(toBytes32('FOOL')), '0.9');

				const updatedTime = await currentTime();

				await instance.updateRates(
					[toBytes32('GOLD'), toBytes32('FOOL')],
					[web3.utils.toWei('10', 'ether'), web3.utils.toWei('0.9', 'ether')],
					updatedTime,
					{ from: oracle }
				);
				assert.etherEqual(await instance.rateForCurrency(toBytes32('GOLD')), '10');
				assert.etherEqual(await instance.rateForCurrency(toBytes32('FOOL')), '0.9');

				const lastUpdatedTimeGOLD = await instance.lastRateUpdateTimes.call(toBytes32('GOLD'));
				assert.equal(lastUpdatedTimeGOLD.toNumber(), updatedTime);
				const lastUpdatedTimeFOOL = await instance.lastRateUpdateTimes.call(toBytes32('FOOL'));
				assert.equal(lastUpdatedTimeFOOL.toNumber(), updatedTime);
			});

			it('should not be able to update rates if they are too far in the future', async () => {
				const timeTooFarInFuture = (await currentTime()) + 10 * 61;
				await assert.revert(
					instance.updateRates(
						[toBytes32('GOLD')],
						[web3.utils.toWei('1', 'ether')],
						timeTooFarInFuture,
						{ from: oracle }
					),
					'Time is too far into the future'
				);
			});
		});
	};

	const itSetsOracle = () => {
		describe('setOracle()', () => {
			it("only the owner should be able to change the oracle's address", async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.setOracle,
					args: [oracle],
					address: owner,
					accounts,
					skipPassCheck: true,
				});

				await instance.setOracle(accountOne, { from: owner });

				assert.equal(await instance.oracle.call(), accountOne);
				assert.notEqual(await instance.oracle.call(), oracle);
			});

			it('should emit event on successful oracle address update', async () => {
				// Ensure oracle is set to oracle address originally
				await instance.setOracle(oracle, { from: owner });
				assert.equal(await instance.oracle.call(), oracle);

				const txn = await instance.setOracle(accountOne, { from: owner });
				assert.eventEqual(txn, 'OracleUpdated', {
					newOracle: accountOne,
				});
			});
		});
	};

	const itDeletesRates = () => {
		describe('deleteRate()', () => {
			it('should be able to remove specific rate', async () => {
				const foolsRate = '0.002';
				const encodedRateGOLD = toBytes32('GOLD');

				await instance.updateRates(
					[encodedRateGOLD, toBytes32('FOOL')],
					[web3.utils.toWei('10.123', 'ether'), web3.utils.toWei(foolsRate, 'ether')],
					timeSent,
					{ from: oracle }
				);

				const beforeRate = await instance.rateForCurrency(encodedRateGOLD);
				const beforeRateUpdatedTime = await instance.lastRateUpdateTimes.call(encodedRateGOLD);

				await instance.deleteRate(encodedRateGOLD, { from: oracle });

				const afterRate = await instance.rateForCurrency(encodedRateGOLD);
				const afterRateUpdatedTime = await instance.lastRateUpdateTimes.call(encodedRateGOLD);
				assert.notEqual(afterRate, beforeRate);
				assert.equal(afterRate, '0');
				assert.notEqual(afterRateUpdatedTime, beforeRateUpdatedTime);
				assert.equal(afterRateUpdatedTime, '0');

				// Other rates are unaffected
				assert.etherEqual(await instance.rateForCurrency(toBytes32('FOOL')), foolsRate);
			});

			it('only oracle can delete a rate', async () => {
				// Assume that the contract is already set up with a valid oracle account called 'oracle'

				const encodedRateName = toBytes32('COOL');
				await instance.updateRates(
					[encodedRateName],
					[web3.utils.toWei('10.123', 'ether')],
					await currentTime(),
					{ from: oracle }
				);

				await onlyGivenAddressCanInvoke({
					fnc: instance.deleteRate,
					args: [encodedRateName],
					accounts,
					address: oracle,
					reason: 'Only the oracle can perform this action',
				});
			});

			it("deleting rate that doesn't exist causes revert", async () => {
				// This key shouldn't exist but let's do the best we can to ensure that it doesn't
				const encodedCurrencyKey = toBytes32('7NEQ');
				const currentRate = await instance.rateForCurrency(encodedCurrencyKey);
				if (currentRate > 0) {
					await instance.deleteRate(encodedCurrencyKey, { from: oracle });
				}

				// Ensure rate deletion attempt results in revert
				await assert.revert(
					instance.deleteRate(encodedCurrencyKey, { from: oracle }),
					'Rate is zero'
				);
				assert.etherEqual(await instance.rateForCurrency(encodedCurrencyKey), '0');
			});

			it('should emit RateDeleted event when rate deleted', async () => {
				const updatedTime = await currentTime();
				const rate = 'GOLD';
				const encodedRate = toBytes32(rate);
				await instance.updateRates(
					[encodedRate],
					[web3.utils.toWei('10.123', 'ether')],
					updatedTime,
					{
						from: oracle,
					}
				);

				const txn = await instance.deleteRate(encodedRate, { from: oracle });
				assert.eventEqual(txn, 'RateDeleted', { currencyKey: encodedRate });
			});
		});
	};

	const itReturnsRates = () => {
		describe('getting rates', () => {
			it('should be able to get exchange rate with key', async () => {
				const updatedTime = await currentTime();
				const encodedRate = toBytes32('GOLD');
				const rateValueEncodedStr = web3.utils.toWei('10.123', 'ether');
				await instance.updateRates([encodedRate], [rateValueEncodedStr], updatedTime, {
					from: oracle,
				});

				const rate = await instance.rateForCurrency(encodedRate);
				assert.equal(rate, rateValueEncodedStr);
			});

			it('all users should be able to get exchange rate with key', async () => {
				const updatedTime = await currentTime();
				const encodedRate = toBytes32('FETC');
				const rateValueEncodedStr = web3.utils.toWei('910.6661293879', 'ether');
				await instance.updateRates([encodedRate], [rateValueEncodedStr], updatedTime, {
					from: oracle,
				});

				await instance.rateForCurrency(encodedRate, { from: accountOne });
				await instance.rateForCurrency(encodedRate, { from: accountTwo });
				await instance.rateForCurrency(encodedRate, { from: oracle });
				await instance.rateForCurrency(encodedRate, { from: owner });
				await instance.rateForCurrency(encodedRate, { from: deployerAccount });
			});

			it('Fetching non-existent rate returns 0', async () => {
				const encodedRateKey = toBytes32('GOLD');
				const currentRate = await instance.rateForCurrency(encodedRateKey);
				if (currentRate > 0) {
					await instance.deleteRate(encodedRateKey, { from: oracle });
				}

				const rate = await instance.rateForCurrency(encodedRateKey);
				assert.equal(rate.toString(), '0');
			});

			it('should be able to get the latest exchange rate and updated time', async () => {
				const updatedTime = await currentTime();
				const encodedRate = toBytes32('GOLD');
				const rateValueEncodedStr = web3.utils.toWei('10.123', 'ether');
				await instance.updateRates([encodedRate], [rateValueEncodedStr], updatedTime, {
					from: oracle,
				});

				const rateAndTime = await instance.rateAndUpdatedTime(encodedRate);
				assert.equal(rateAndTime.rate, rateValueEncodedStr);
				assert.bnEqual(rateAndTime.time, updatedTime);
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

			it('check if a single rate is stale', async () => {
				// Set up rates for test
				await systemSettings.setRateStalePeriod(30, { from: owner });
				const updatedTime = await currentTime();
				await instance.updateRates(
					[toBytes32('ABC')],
					[web3.utils.toWei('2', 'ether')],
					updatedTime,
					{
						from: oracle,
					}
				);
				await fastForward(31);

				const rateIsStale = await instance.rateIsStale(toBytes32('ABC'));
				assert.equal(rateIsStale, true);
			});

			it('check if a single rate is not stale', async () => {
				// Set up rates for test
				await systemSettings.setRateStalePeriod(30, { from: owner });
				const updatedTime = await currentTime();
				await instance.updateRates(
					[toBytes32('ABC')],
					[web3.utils.toWei('2', 'ether')],
					updatedTime,
					{
						from: oracle,
					}
				);
				await fastForward(28);

				const rateIsStale = await instance.rateIsStale(toBytes32('ABC'));
				assert.equal(rateIsStale, false);
			});

			it('ensure rate is considered stale if not set', async () => {
				// Set up rates for test
				await systemSettings.setRateStalePeriod(30, { from: owner });
				const encodedRateKey = toBytes32('GOLD');
				const currentRate = await instance.rateForCurrency(encodedRateKey);
				if (currentRate > 0) {
					await instance.deleteRate(encodedRateKey, { from: oracle });
				}

				const rateIsStale = await instance.rateIsStale(encodedRateKey);
				assert.equal(rateIsStale, true);
			});

			it('make sure anyone can check if rate is stale', async () => {
				const rateKey = toBytes32('ABC');
				await instance.rateIsStale(rateKey, { from: oracle });
				await instance.rateIsStale(rateKey, { from: owner });
				await instance.rateIsStale(rateKey, { from: deployerAccount });
				await instance.rateIsStale(rateKey, { from: accountOne });
				await instance.rateIsStale(rateKey, { from: accountTwo });
			});
		});
	};

	const itCalculatesInvalidRates = () => {
		describe('anyRateIsInvalid()', () => {
			describe('stale scenarios', () => {
				it('should never allow sUSD to go stale via anyRateIsInvalid', async () => {
					const keysArray = [SNX, toBytes32('GOLD')];

					await instance.updateRates(
						keysArray,
						[web3.utils.toWei('0.1', 'ether'), web3.utils.toWei('0.2', 'ether')],
						await currentTime(),
						{ from: oracle }
					);
					assert.equal(await instance.anyRateIsInvalid(keysArray), false);

					await fastForward(await instance.rateStalePeriod());

					await instance.updateRates(
						[SNX, toBytes32('GOLD')],
						[web3.utils.toWei('0.1', 'ether'), web3.utils.toWei('0.2', 'ether')],
						await currentTime(),
						{ from: oracle }
					);

					// Even though sUSD hasn't been updated since the stale rate period has expired,
					// we expect that sUSD remains "not stale"
					assert.equal(await instance.anyRateIsInvalid(keysArray), false);
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
					const updatedTime1 = await currentTime();
					await instance.updateRates(encodedRateKeys1, encodedRateValues1, updatedTime1, {
						from: oracle,
					});
					await fastForward(5);
					const updatedTime2 = await currentTime();
					await instance.updateRates(encodedRateKeys2, encodedRateValues2, updatedTime2, {
						from: oracle,
					});
					await fastForward(5);
					const updatedTime3 = await currentTime();
					await instance.updateRates(encodedRateKeys3, encodedRateValues3, updatedTime3, {
						from: oracle,
					});

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

					const updatedTime2 = await currentTime();
					await instance.updateRates(encodedRateKeys2, encodedRateValues2, updatedTime2, {
						from: oracle,
					});
					await fastForward(20);

					const updatedTime1 = await currentTime();
					await instance.updateRates(encodedRateKeys1, encodedRateValues1, updatedTime1, {
						from: oracle,
					});
					await fastForward(15);
					const updatedTime3 = await currentTime();
					await instance.updateRates(encodedRateKeys3, encodedRateValues3, updatedTime3, {
						from: oracle,
					});

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
					const updatedTime = await currentTime();
					await instance.updateRates(
						[toBytes32('ABC')],
						[web3.utils.toWei('2', 'ether')],
						updatedTime,
						{
							from: oracle,
						}
					);
					await fastForward(41);

					const rateIsInvalid = await instance.anyRateIsInvalid([toBytes32('ABC')]);
					assert.equal(rateIsInvalid, true);
				});

				it('make sure anyone can check if any rates are stale', async () => {
					const rateKey = toBytes32('ABC');
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

					const updatedTime1 = await currentTime();
					await instance.updateRates(encodedRateKeys1, encodedRateValues1, updatedTime1, {
						from: oracle,
					});
					const rateIsInvalid = await instance.anyRateIsInvalid([
						...encodedRateKeys1,
						toBytes32('RST'),
					]);
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
					describe('when a regular and aggregated synth have rates', () => {
						beforeEach(async () => {
							const timestamp = await currentTime();
							await instance.updateRates([toBytes32('sGOLD')], [web3.utils.toWei('1')], timestamp, {
								from: oracle,
							});
							await aggregatorJPY.setLatestAnswer(convertToDecimals(100, 8), timestamp);
						});
						it('then rateIsInvalid for both is false', async () => {
							const rateIsInvalid = await instance.anyRateIsInvalid([
								toBytes32('sGOLD'),
								sJPY,
								sUSD,
							]);
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

							it('then rateIsInvalid for both is still false', async () => {
								const rateIsInvalid = await instance.anyRateIsInvalid([
									toBytes32('sGOLD'),
									sJPY,
									sUSD,
								]);
								assert.equal(rateIsInvalid, false);
							});

							describe('when the sJPY aggregator is flagged', () => {
								beforeEach(async () => {
									await mockFlagsInterface.flagAggregator(aggregatorJPY.address);
								});
								it('then rateIsInvalid for both is true', async () => {
									const rateIsInvalid = await instance.anyRateIsInvalid([
										toBytes32('sGOLD'),
										sJPY,
										sUSD,
									]);
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
	};

	const itCalculatesEffectiveValue = () => {
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

				it('should return 0 when relying on a non-existant dest exchange rate in effectiveValue()', async () => {
					assert.equal(await instance.effectiveValue(SNX, toUnit('10'), toBytes32('XYZ')), '0');
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
	};

	// Aggregator rates and flags

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
									describe('when rateAndInvalid is queried', () => {
										let responseJPY;
										let responseXTZ;
										let responseUSD;
										beforeEach(async () => {
											responseJPY = await instance.rateAndInvalid(sJPY);
											responseXTZ = await instance.rateAndInvalid(sXTZ);
											responseUSD = await instance.rateAndInvalid(sUSD);
										});

										it('then the rates are invalid again', () => {
											assert.equal(responseJPY[1], true);
											assert.equal(responseXTZ[1], false);
											assert.equal(responseUSD[1], false);
										});

										it('and JPY is 0 while the other is fine', () => {
											assert.bnEqual(responseJPY[0], toUnit('0'));
											assert.bnEqual(responseXTZ[0], toUnit(newRateXTZ.toString()));
											assert.bnEqual(responseUSD[0], toUnit('1'));
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

				describe('when a price already exists for sJPY', () => {
					const oldPrice = toUnit(100);
					let timeOldSent;
					beforeEach(async () => {
						timeOldSent = await currentTime();

						await instance.updateRates([sJPY], [oldPrice], timeOldSent, {
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
							assert.bnEqual(response[0][0], oldPrice);
						});
					});
					describe('when rateAndInvalid is queried with sJPY', () => {
						let response;
						beforeEach(async () => {
							response = await instance.rateAndInvalid(sJPY);
						});

						it('then the rate is NOT invalid', () => {
							assert.equal(response[1], false);
						});

						it('and equal to the value', () => {
							assert.bnEqual(response[0], oldPrice);
						});
					});

					describe('when the price is inspected for sJPY', () => {
						it('then the price is returned as expected', async () => {
							const result = await instance.rateForCurrency(sJPY, {
								from: accountOne,
							});
							assert.equal(result.toString(), oldPrice);
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
						describe('when the rateAndInvalid is queried with sJPY', () => {
							let response;
							beforeEach(async () => {
								response = await instance.rateAndInvalid(sJPY);
							});

							it('then the rate is invalid', () => {
								assert.equal(response[1], true);
							});

							it('with no value', () => {
								assert.bnEqual(response[0], '0');
							});
						});

						describe('when the aggregator price is set to set a specific number (with support for 8 decimals)', () => {
							const newRate = 9.55;
							let timestamp;
							beforeEach(async () => {
								await fastForward(50);
								timestamp = await currentTime();
								// Need to set twice in order to increase the roundId in aggregator
								// to be greater than the one in the cache
								await aggregatorJPY.setLatestAnswer(convertToDecimals(newRate, 8), timestamp);
								await aggregatorJPY.setLatestAnswer(convertToDecimals(newRate, 8), timestamp);
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

							describe('when rateAndInvalid is queried with sJPY', () => {
								let response;
								beforeEach(async () => {
									response = await instance.rateAndInvalid(sJPY);
								});

								it('then the rates are NOT invalid', () => {
									assert.equal(response[1], false);
								});

								it('and equal to the value', () => {
									assert.bnEqual(response[0], toUnit(newRate.toString()));
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
										assert.equal(result.toString(), oldPrice);
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
										assert.bnEqual(response[0][0], oldPrice);
									});
								});

								describe('when the rateAndInvalid is queried with sJPY', () => {
									let response;
									beforeEach(async () => {
										response = await instance.rateAndInvalid(sJPY);
									});

									it('then the rates are NOT invalid', () => {
										assert.equal(response[1], false);
									});

									it('and equal to the old value', () => {
										assert.bnEqual(response[0], oldPrice);
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
								assert.bnEqual(response[0][0], oldPrice);
								assert.bnEqual(response[0][1], '0');
							});
						});
						describe('when the rateAndInvalid is queried with sJPY and sXTZ', () => {
							let responseJPY;
							let responseXTZ;
							beforeEach(async () => {
								responseJPY = await instance.rateAndInvalid(sJPY);
								responseXTZ = await instance.rateAndInvalid(sXTZ);
							});

							it('then the XTZ rate is invalid', () => {
								assert.equal(responseJPY[1], false);
								assert.equal(responseXTZ[1], true);
							});

							it('with sXTZ having no value', () => {
								assert.bnEqual(responseJPY[0], oldPrice);
								assert.bnEqual(responseXTZ[0], '0');
							});
						});

						describe('when the aggregator price is set to set for sXTZ', () => {
							const newRate = 99;
							let timestamp;
							beforeEach(async () => {
								await fastForward(50);
								timestamp = await currentTime();
								await aggregatorXTZ.setLatestAnswer(convertToDecimals(newRate, 8), timestamp);
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
									assert.bnEqual(response[0][0], oldPrice);
									assert.bnEqual(response[0][1], toUnit(newRate.toString()));
								});
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
			it('getCurrentRoundId() by default is 0 for all synths except sUSD which is 1', async () => {
				// Note: rates that were set in the truffle migration will be at 1, so we need to check
				// other synths
				assert.equal(await instance.getCurrentRoundId(sJPY), '0');
				assert.equal(await instance.getCurrentRoundId(sBNB), '0');
				assert.equal(await instance.getCurrentRoundId(sUSD), '1');
			});

			it('ratesAndUpdatedTimeForCurrencyLastNRounds() shows first entry for sUSD', async () => {
				const timeOfsUSDRateSetOnInit = await instance.lastRateUpdateTimes(sUSD);
				assert.deepEqual(await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sUSD, '3', '0'), [
					[toUnit('1'), '0', '0'],
					[timeOfsUSDRateSetOnInit, '0', '0'],
				]);
			});
			it('ratesAndUpdatedTimeForCurrencyLastNRounds() returns 0s for other currency keys', async () => {
				const fiveZeros = new Array(5).fill('0');
				assert.deepEqual(await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sAUD, '5', '0'), [
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
								const { rate, time } = await instance.rateAndTimestampAtRound(
									toBytes32('TEST'),
									'0'
								);
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
										await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sAUD, '5', '0'),
										[fiveZeros, fiveZeros]
									);
								});
							});
							describe('when invoked for an aggregated price', () => {
								it('then it returns the rates as expected', async () => {
									assert.deepEqual(
										await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sJPY, '3', '0'),
										[
											[toUnit('102'), toUnit('101'), toUnit('100')],
											['1002', '1001', '1000'],
										]
									);
								});

								it('then it returns the rates as expected, even over the edge', async () => {
									assert.deepEqual(
										await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sJPY, '5', '0'),
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
										await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sBNB, '3', '0'),
										[
											[toUnit('1002'), toUnit('1001'), toUnit('1000')],
											['10002', '10001', '10000'],
										]
									);
								});
								it('then it returns the rates as expected, even over the edge', async () => {
									assert.deepEqual(
										await instance.ratesAndUpdatedTimeForCurrencyLastNRounds(sBNB, '5', '0'),
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
						await aggregatorJPY.setLatestAnswer(convertToDecimals(100, 8), 30); // round 1 for sJPY
						await aggregatorJPY.setLatestAnswer(convertToDecimals(200, 8), 60); // round 2 for sJPY
						await aggregatorJPY.setLatestAnswer(convertToDecimals(300, 8), 90); // round 3 for sJPY

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
							await aggregatorJPY.setLatestAnswer(convertToDecimals(100, 8), timestamp); // round 1 for sJPY
							await instance.updateRates([sBNB], [toUnit('1000')], timestamp, { from: oracle }); // round 1 for sBNB

							await fastForward(120);
							timestamp = await currentTime();
							await aggregatorJPY.setLatestAnswer(convertToDecimals(200, 8), timestamp); // round 2 for sJPY
							await instance.updateRates([sBNB], [toUnit('2000')], timestamp, { from: oracle }); // round 2 for sBNB

							await fastForward(120);
							timestamp = await currentTime();
							await aggregatorJPY.setLatestAnswer(convertToDecimals(300, 8), timestamp); // round 3 for sJPY
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

	describe('Using ExchangeRates', () => {
		const exchangeRatesContract = 'ExchangeRates';

		before(async () => {
			initialTime = await currentTime();
			({
				ExchangeRates: instance,
				SystemSettings: systemSettings,
				AddressResolver: resolver,
			} = await setupAllContracts({
				accounts,
				contracts: [exchangeRatesContract, 'SystemSettings', 'AddressResolver'],
			}));

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

		beforeEach(async () => {
			timeSent = await currentTime();
		});

		itIncludesCorrectMutativeFunctions(exchangeRatesContract);

		itIsConstructedCorrectly(exchangeRatesContract);

		itUpdatesRates();

		itSetsOracle();

		itDeletesRates();

		itReturnsRates();

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
			initialTime = await currentTime();
			({
				ExchangeRates: instance,
				SystemSettings: systemSettings,
				AddressResolver: resolver,
			} = await setupAllContracts({
				accounts,
				contracts: [exchangeRatesContract, 'SystemSettings', 'AddressResolver'],
			}));

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

		beforeEach(async () => {
			timeSent = await currentTime();
		});

		itIncludesCorrectMutativeFunctions(exchangeRatesContract);

		itIsConstructedCorrectly(exchangeRatesContract);

		itUpdatesRates();

		itSetsOracle();

		itDeletesRates();

		itReturnsRates();

		itCalculatesStaleRates();

		itCalculatesInvalidRates();

		itCalculatesLastUpdateTime();

		itCalculatesEffectiveValue();

		itReadsFromAggregator();

		itReadsAtomicPricesFromDex();

		itReportsRateTooVolatileForAtomicExchanges();
	});
});
