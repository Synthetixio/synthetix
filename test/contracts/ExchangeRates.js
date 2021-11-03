'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { currentTime, fastForward, toUnit, bytesToString } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	convertToDecimals,
} = require('./helpers');

const { setupContract, setupAllContracts } = require('./setup');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
	defaults: { RATE_STALE_PERIOD },
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
	const [deployerAccount, owner, oracle, accountOne, accountTwo] = accounts;
	const [SNX, sJPY, sXTZ, sBNB, sUSD, sEUR, sAUD, fastGasPrice] = [
		'SNX',
		'sJPY',
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

	before(async () => {
		initialTime = await currentTime();
		({
			ExchangeRates: instance,
			SystemSettings: systemSettings,
			AddressResolver: resolver,
		} = await setupAllContracts({
			accounts,
			contracts: ['ExchangeRates', 'SystemSettings', 'AddressResolver'],
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

	it('only expected functions should be mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: instance.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['addAggregator', 'deleteRate', 'removeAggregator', 'setOracle', 'updateRates'],
		});
	});

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
				contract: 'ExchangeRates',
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
					contract: 'ExchangeRates',
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
				contract: 'ExchangeRates',
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
					contract: 'ExchangeRates',
					args: [owner, oracle, resolver.address, [SNX], ['0']],
				}),
				'Zero is not a valid rate, please call deleteRate instead'
			);
		});

		it('should be able to handle lots of currencies on creation', async () => {
			const creationTime = await currentTime();
			const numberOfCurrencies = 100;
			const { currencyKeys, rates } = createRandomKeysAndRates(numberOfCurrencies);

			const instance = await setupContract({
				accounts,
				contract: 'ExchangeRates',
				args: [owner, oracle, resolver.address, currencyKeys, rates],
			});

			for (let i = 0; i < currencyKeys.length; i++) {
				assert.bnEqual(await instance.rateForCurrency(currencyKeys[i]), rates[i]);
				const lastUpdatedTime = await instance.lastRateUpdateTimes.call(currencyKeys[i]);
				assert.isAtLeast(lastUpdatedTime.toNumber(), creationTime);
			}
		});
	});

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
						const rateIsInvalid = await instance.anyRateIsInvalid([toBytes32('sGOLD'), sJPY, sUSD]);
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
								await aggregatorXTZ.setLatestAnswer(convertToDecimals(newRateXTZ, 8), timestampXTZ);
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
				describe('when rateAndInvalid is queried with sJPY', () => {
					let response;
					beforeEach(async () => {
						response = await instance.rateAndInvalid(sJPY);
					});

					it('then the rate is NOT invalid', () => {
						assert.equal(response[1], false);
					});

					it('and equal to the value', () => {
						assert.bnEqual(response[0], web3.utils.toWei(oldPrice.toString()));
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

							describe('when the rateAndInvalid is queried with sJPY', () => {
								let response;
								beforeEach(async () => {
									response = await instance.rateAndInvalid(sJPY);
								});

								it('then the rates are NOT invalid', () => {
									assert.equal(response[1], false);
								});

								it('and equal to the old value', () => {
									assert.bnEqual(response[0], web3.utils.toWei(oldPrice.toString()));
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
							assert.bnEqual(responseJPY[0], web3.utils.toWei(oldPrice.toString()));
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
								assert.bnEqual(response[0][0], toUnit(oldPrice.toString()));
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
});
