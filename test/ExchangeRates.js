const ExchangeRates = artifacts.require('ExchangeRates');
const { currentTime, fastForward, toUnit } = require('../utils/testUtils');

// Helper functions

const getRandomCurrencyKey = () =>
	Math.random()
		.toString(36)
		.substring(2, 6)
		.toUpperCase();

const createRandomKeysAndRates = quantity => {
	let rates = [];
	let currencyKeys = [];
	for (let i = 0; i < quantity; i++) {
		const rate = Math.random() * 100;
		rates[i] = web3.utils.toWei(rate.toString(), 'ether');
		currencyKeys[i] = web3.utils.asciiToHex(getRandomCurrencyKey());
	}
	return { currencyKeys, rates };
};

// Contract tests

contract('Exchange Rates', async function(accounts) {
	const [deployerAccount, owner, oracle, accountOne, accountTwo] = accounts;

	// Contract Creation

	it('should set constructor params on deployment', async function() {
		const creationTime = await currentTime();
		const instance = await ExchangeRates.new(
			owner,
			oracle,
			[web3.utils.asciiToHex('SNX')],
			[web3.utils.toWei('0.2', 'ether')],
			{
				from: deployerAccount,
			}
		);

		assert.equal(await instance.owner(), owner);
		assert.equal(await instance.selfDestructBeneficiary(), owner);
		assert.equal(await instance.oracle(), oracle);

		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('sUSD')), '1');
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('SNX')), '0.2');

		// Ensure that when the rate isn't found, 0 is returned as the exchange rate.
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('OTHER')), '0');

		const lastUpdatedTimeSUSD = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('sUSD')
		);
		assert.isAtLeast(lastUpdatedTimeSUSD.toNumber(), creationTime);

		const lastUpdatedTimeOTHER = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('OTHER')
		);
		assert.equal(lastUpdatedTimeOTHER.toNumber(), 0);

		const lastUpdatedTimeSNX = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('SNX')
		);
		assert.isAtLeast(lastUpdatedTimeSNX.toNumber(), creationTime);

		const expectedXdrParticipants = ['sUSD', 'sAUD', 'sCHF', 'sEUR', 'sGBP'].map(
			web3.utils.asciiToHex
		);
		let xdrParticipants = [];
		for (let i = 0; i < 5; i++) {
			xdrParticipants.push(await instance.xdrParticipants(i));
		}
		for (let i = 0; i < 5; i++) {
			assert.equal(xdrParticipants[i], expectedXdrParticipants[i]);
		}

		const sUSDRate = await instance.rateForCurrency(web3.utils.asciiToHex('sUSD'));
		assert.bnEqual(sUSDRate, toUnit('1'));
	});

	it('two of the same currencies in same array should mean that the second one overrides', async function() {
		const creationTime = await currentTime();
		const firstAmount = '4.33';
		const secondAmount = firstAmount + 10;
		const instance = await ExchangeRates.new(
			owner,
			oracle,
			[web3.utils.asciiToHex('CARTER'), web3.utils.asciiToHex('CARTOON')],
			[web3.utils.toWei(firstAmount, 'ether'), web3.utils.toWei(secondAmount, 'ether')],
			{
				from: deployerAccount,
			}
		);

		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('CART')), secondAmount);
		assert.etherNotEqual(await instance.rates.call(web3.utils.asciiToHex('CART')), firstAmount);

		const lastUpdatedTime = await instance.lastRateUpdateTimes.call(web3.utils.asciiToHex('CART'));
		assert.isAtLeast(lastUpdatedTime.toNumber(), creationTime);
	});

	it('should revert when number of currency keys > new rates length on create', async function() {
		await assert.revert(
			ExchangeRates.new(
				owner,
				oracle,
				[web3.utils.asciiToHex('SNX'), web3.utils.asciiToHex('GOLD')],
				[web3.utils.toWei('0.2', 'ether')],
				{
					from: deployerAccount,
				}
			)
		);
	});

	it('should truncate to 4 bytes if currency key > 4 bytes on create', async function() {
		const creationTime = await currentTime();
		const amount = '4.33';
		const instance = await ExchangeRates.new(
			owner,
			oracle,
			[web3.utils.asciiToHex('CATHERINE')],
			[web3.utils.toWei(amount, 'ether')],
			{
				from: deployerAccount,
			}
		);

		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('CATHERINE')), amount);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('CATH')), amount);
		assert.etherNotEqual(await instance.rates.call(web3.utils.asciiToHex('CAT')), amount);

		const lastUpdatedTime = await instance.lastRateUpdateTimes.call(web3.utils.asciiToHex('CATH'));
		assert.isAtLeast(lastUpdatedTime.toNumber(), creationTime);
	});

	it("shouldn't be able to set exchange rate to 0 on create", async function() {
		await assert.revert(
			ExchangeRates.new(
				owner,
				oracle,
				[web3.utils.asciiToHex('SNX')],
				[web3.utils.toWei('0', 'ether')],
				{
					from: deployerAccount,
				}
			)
		);
	});

	it('should be able to handle lots of currencies on creation', async function() {
		const creationTime = await currentTime();
		const numberOfCurrencies = 100;
		const { currencyKeys, rates } = createRandomKeysAndRates(numberOfCurrencies);

		const instance = await ExchangeRates.new(owner, oracle, currencyKeys, rates, {
			from: deployerAccount,
		});

		for (let i = 0; i < numberOfCurrencies; i++) {
			assert.bnEqual(await instance.rates.call(currencyKeys[i]), rates[i]);
			const lastUpdatedTime = await instance.lastRateUpdateTimes.call(currencyKeys[i]);
			assert.isAtLeast(lastUpdatedTime.toNumber(), creationTime);
		}
	});

	// Update the exchange rates

	it('should be able to update rates of only one currency without affecting other rates', async function() {
		const instance = await ExchangeRates.deployed();
		const timeSent = await currentTime();

		await fastForward(1);

		await instance.updateRates(
			[web3.utils.asciiToHex('lABC'), web3.utils.asciiToHex('lDEF'), web3.utils.asciiToHex('lGHI')],
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
			[web3.utils.asciiToHex('lABC')],
			[web3.utils.toWei(updatedRate, 'ether')],
			updatedTime,
			{ from: oracle }
		);

		const updatedTimelDEF = await instance.lastRateUpdateTimes.call(web3.utils.asciiToHex('lDEF'));
		const updatedTimelGHI = await instance.lastRateUpdateTimes.call(web3.utils.asciiToHex('lGHI'));

		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lABC')), updatedRate);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lDEF')), '2.4');
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lGHI')), '3.5');

		const lastUpdatedTimeLABC = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('lABC')
		);
		assert.equal(lastUpdatedTimeLABC.toNumber(), updatedTime);
		const lastUpdatedTimeLDEF = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('lDEF')
		);
		assert.equal(lastUpdatedTimeLDEF.toNumber(), updatedTimelDEF.toNumber());
		const lastUpdatedTimeLGHI = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('lGHI')
		);
		assert.equal(lastUpdatedTimeLGHI.toNumber(), updatedTimelGHI.toNumber());
	});

	it('should be able to update rates of all currencies', async function() {
		const instance = await ExchangeRates.deployed();
		const timeSent = await currentTime();

		await fastForward(1);

		await instance.updateRates(
			[web3.utils.asciiToHex('lABC'), web3.utils.asciiToHex('lDEF'), web3.utils.asciiToHex('lGHI')],
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
			[web3.utils.asciiToHex('lABC'), web3.utils.asciiToHex('lDEF'), web3.utils.asciiToHex('lGHI')],
			[
				web3.utils.toWei(updatedRate1, 'ether'),
				web3.utils.toWei(updatedRate2, 'ether'),
				web3.utils.toWei(updatedRate3, 'ether'),
			],
			updatedTime,
			{ from: oracle }
		);

		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lABC')), updatedRate1);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lDEF')), updatedRate2);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lGHI')), updatedRate3);

		const lastUpdatedTimeLABC = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('lABC')
		);
		assert.equal(lastUpdatedTimeLABC.toNumber(), updatedTime);
		const lastUpdatedTimeLDEF = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('lDEF')
		);
		assert.equal(lastUpdatedTimeLDEF.toNumber(), updatedTime);
		const lastUpdatedTimeLGHI = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('lGHI')
		);
		assert.equal(lastUpdatedTimeLGHI.toNumber(), updatedTime);
	});

	it('should revert when trying to set sUSD price', async function() {
		const instance = await ExchangeRates.deployed();
		const timeSent = await currentTime();

		await fastForward(1);

		await assert.revert(
			instance.updateRates(
				[web3.utils.asciiToHex('sUSD')],
				[web3.utils.toWei('1.0', 'ether')],
				timeSent,
				{ from: oracle }
			)
		);
	});

	it('should emit RatesUpdated event when rate updated', async function() {
		const instance = await ExchangeRates.deployed();

		const rates = [
			web3.utils.toWei('1.3', 'ether'),
			web3.utils.toWei('2.4', 'ether'),
			web3.utils.toWei('3.5', 'ether'),
		];

		const currencyKeys = [
			web3.utils.asciiToHex('lABC'),
			web3.utils.asciiToHex('lDEF'),
			web3.utils.asciiToHex('lGHI'),
		];
		const txn = await instance.updateRates(currencyKeys, rates, await currentTime(), {
			from: oracle,
		});

		assert.eventEqual(txn, 'RatesUpdated', {
			currencyKeys,
			newRates: rates,
		});
	});

	it('should be able to handle lots of currency updates', async function() {
		const instance = await ExchangeRates.deployed();
		const numberOfCurrencies = 150;
		const { currencyKeys, rates } = createRandomKeysAndRates(numberOfCurrencies);

		const updatedTime = await currentTime();
		await instance.updateRates(currencyKeys, rates, updatedTime, { from: oracle });

		for (let i = 0; i < numberOfCurrencies; i++) {
			assert.equal(await instance.rates.call(currencyKeys[i]), rates[i]);
			const lastUpdatedTime = await instance.lastRateUpdateTimes.call(currencyKeys[i]);
			assert.equal(lastUpdatedTime.toNumber(), updatedTime);
		}
	});

	it('should truncate to 4 bytes if currency key > 4 bytes on update', async function() {
		const instance = await ExchangeRates.deployed();
		const rate = '4.33';
		const timeSent = await currentTime();
		const beforeUpdateTime = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('CATHERINE')
		);

		await instance.updateRates(
			[web3.utils.asciiToHex('CATHERINE')],
			[web3.utils.toWei(rate, 'ether')],
			timeSent,
			{ from: oracle }
		);

		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('CATHERINE')), rate);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('CATH')), rate);
		assert.etherNotEqual(await instance.rates.call(web3.utils.asciiToHex('CAT')), rate);

		const lastUpdatedTime = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('CATHERINE')
		);
		assert.equal(lastUpdatedTime.toNumber(), timeSent);
		assert.notEqual(lastUpdatedTime.toNumber(), beforeUpdateTime);
	});

	it('should revert when currency keys length != new rates length on update', async function() {
		const instance = await ExchangeRates.deployed();
		await assert.revert(
			instance.updateRates(
				[
					web3.utils.asciiToHex('sUSD'),
					web3.utils.asciiToHex('SNX'),
					web3.utils.asciiToHex('GOLD'),
				],
				[web3.utils.toWei('1', 'ether'), web3.utils.toWei('0.2', 'ether')],
				await currentTime(),
				{ from: oracle }
			)
		);
	});

	it('should not be able to set exchange rate to 0 on update', async function() {
		const instance = await ExchangeRates.deployed();
		await assert.revert(
			instance.updateRates(
				[web3.utils.asciiToHex('ZERO')],
				[web3.utils.toWei('0', 'ether')],
				await currentTime(),
				{ from: oracle }
			)
		);
	});

	it('only oracle can update exchange rates', async function() {
		const instance = await ExchangeRates.deployed();

		// Check not allowed from deployer
		await assert.revert(
			instance.updateRates(
				[web3.utils.asciiToHex('GOLD'), web3.utils.asciiToHex('FOOL')],
				[web3.utils.toWei('10', 'ether'), web3.utils.toWei('0.9', 'ether')],
				await currentTime(),
				{ from: deployerAccount }
			)
		);
		// Check not allowed from owner
		await assert.revert(
			instance.updateRates(
				[web3.utils.asciiToHex('GOLD'), web3.utils.asciiToHex('FOOL')],
				[web3.utils.toWei('10', 'ether'), web3.utils.toWei('0.9', 'ether')],
				await currentTime(),
				{ from: owner }
			)
		);
		// Check not allowed from a random account
		await assert.revert(
			instance.updateRates(
				[web3.utils.asciiToHex('GOLD'), web3.utils.asciiToHex('FOOL')],
				[web3.utils.toWei('10', 'ether'), web3.utils.toWei('0.9', 'ether')],
				await currentTime(),
				{ from: accountOne }
			)
		);

		assert.etherNotEqual(await instance.rates.call(web3.utils.asciiToHex('GOLD')), '10');
		assert.etherNotEqual(await instance.rates.call(web3.utils.asciiToHex('FOOL')), '0.9');

		const updatedTime = await currentTime();

		await instance.updateRates(
			[web3.utils.asciiToHex('GOLD'), web3.utils.asciiToHex('FOOL')],
			[web3.utils.toWei('10', 'ether'), web3.utils.toWei('0.9', 'ether')],
			updatedTime,
			{ from: oracle }
		);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('GOLD')), '10');
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('FOOL')), '0.9');

		const lastUpdatedTimeGOLD = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('GOLD')
		);
		assert.equal(lastUpdatedTimeGOLD.toNumber(), updatedTime);
		const lastUpdatedTimeFOOL = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('FOOL')
		);
		assert.equal(lastUpdatedTimeFOOL.toNumber(), updatedTime);
	});

	it('should not be able to update rates if they are too far in the future', async function() {
		const instance = await ExchangeRates.deployed();
		const timeTooFarInFuture = (await currentTime()) + 10 * 61;
		await assert.revert(
			instance.updateRates(
				[web3.utils.asciiToHex('GOLD')],
				[web3.utils.toWei('1', 'ether')],
				timeTooFarInFuture,
				{ from: oracle }
			)
		);
	});

	// Changing the Oracle address

	it("should be able to change the oracle's address", async function() {
		const instance = await ExchangeRates.deployed();

		// Ensure oracle is set to oracle address originally
		await instance.setOracle(oracle, { from: owner });
		assert.equal(await instance.oracle.call(), oracle);

		await instance.setOracle(accountOne, { from: owner });

		assert.equal(await instance.oracle.call(), accountOne);
		assert.notEqual(await instance.oracle.call(), oracle);
	});

	it("only owner is permitted to change the oracle's address", async function() {
		const instance = await ExchangeRates.deployed();

		// Ensure oracle is set to oracle address originally
		await instance.setOracle(oracle, { from: owner });
		assert.equal(await instance.oracle.call(), oracle);

		// Check not allowed from deployer
		await assert.revert(instance.setOracle(accountOne, { from: deployerAccount }));
		await assert.revert(instance.setOracle(accountOne, { from: oracle }));
		await assert.revert(instance.setOracle(accountOne, { from: accountOne }));
		await instance.setOracle(accountOne, { from: owner });
	});

	it('should emit event on successful oracle address update', async function() {
		const instance = await ExchangeRates.deployed();

		// Ensure oracle is set to oracle address originally
		await instance.setOracle(oracle, { from: owner });
		assert.equal(await instance.oracle.call(), oracle);

		const txn = await instance.setOracle(accountOne, { from: owner });
		assert.eventEqual(txn, 'OracleUpdated', {
			newOracle: accountOne,
		});
	});

	// Removing rates

	it('should be able to remove specific rate', async function() {
		const instance = await ExchangeRates.deployed();
		const updatedTime = await currentTime();
		const foolsRate = '0.002';
		const encodedRateGOLD = web3.utils.asciiToHex('GOLD');

		await instance.updateRates(
			[encodedRateGOLD, web3.utils.asciiToHex('FOOL')],
			[web3.utils.toWei('10.123', 'ether'), web3.utils.toWei(foolsRate, 'ether')],
			updatedTime,
			{ from: oracle }
		);

		const beforeRate = await instance.rates.call(encodedRateGOLD);
		const beforeRateUpdatedTime = await instance.lastRateUpdateTimes.call(encodedRateGOLD);

		await instance.deleteRate(encodedRateGOLD, { from: oracle });

		const afterRate = await instance.rates.call(encodedRateGOLD);
		const afterRateUpdatedTime = await instance.lastRateUpdateTimes.call(encodedRateGOLD);
		assert.notEqual(afterRate, beforeRate);
		assert.equal(afterRate, '0');
		assert.notEqual(afterRateUpdatedTime, beforeRateUpdatedTime);
		assert.equal(afterRateUpdatedTime, '0');

		// Other rates are unaffected
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('FOOL')), foolsRate);
	});

	it('only oracle can delete a rate', async function() {
		const instance = await ExchangeRates.deployed();

		// Assume that the contract is already set up with a valid oracle account called 'oracle'

		await instance.updateRates(
			[web3.utils.asciiToHex('COOL')],
			[web3.utils.toWei('10.123', 'ether')],
			await currentTime(),
			{ from: oracle }
		);

		const encodedRateName = web3.utils.asciiToHex('COOL');
		await assert.revert(instance.deleteRate(encodedRateName, { from: deployerAccount }));
		await assert.revert(instance.deleteRate(encodedRateName, { from: accountOne }));
		await assert.revert(instance.deleteRate(encodedRateName, { from: owner }));
		await instance.deleteRate(encodedRateName, { from: oracle });
	});

	it("deleting rate that doesn't exist causes revert", async function() {
		const instance = await ExchangeRates.deployed();

		// This key shouldn't exist but let's do the best we can to ensure that it doesn't
		const encodedCurrencyKey = web3.utils.asciiToHex('7NEQ');
		const currentRate = await instance.rates.call(encodedCurrencyKey);
		if (currentRate > 0) {
			await instance.deleteRate(encodedCurrencyKey, { from: oracle });
		}

		// Ensure rate deletion attempt results in revert
		await assert.revert(instance.deleteRate(encodedCurrencyKey, { from: oracle }));
		assert.etherEqual(await instance.rates.call(encodedCurrencyKey), '0');
	});

	it('should emit RateDeleted event when rate deleted', async function() {
		const instance = await ExchangeRates.deployed();
		const updatedTime = await currentTime();
		const encodedRate = web3.utils.asciiToHex('GOLD');
		await instance.updateRates([encodedRate], [web3.utils.toWei('10.123', 'ether')], updatedTime, {
			from: oracle,
		});

		const txn = await instance.deleteRate(encodedRate, { from: oracle });
		assert.eventEqual(txn, 'RateDeleted', { currencyKey: encodedRate });
	});

	// Getting rates

	it('should be able to get exchange rate with key', async function() {
		const instance = await ExchangeRates.deployed();
		const updatedTime = await currentTime();
		const encodedRate = web3.utils.asciiToHex('GOLD');
		const rateValueEncodedStr = web3.utils.toWei('10.123', 'ether');
		await instance.updateRates([encodedRate], [rateValueEncodedStr], updatedTime, {
			from: oracle,
		});

		const rate = await instance.rateForCurrency(encodedRate);
		assert.equal(rate, rateValueEncodedStr);
	});

	it('all users should be able to get exchange rate with key', async function() {
		const instance = await ExchangeRates.deployed();
		const updatedTime = await currentTime();
		const encodedRate = web3.utils.asciiToHex('FETC');
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

	it('Fetching non-existent rate returns 0', async function() {
		const instance = await ExchangeRates.deployed();
		const encodedRateKey = web3.utils.asciiToHex('GOLD');
		const currentRate = await instance.rates.call(encodedRateKey);
		if (currentRate > 0) {
			await instance.deleteRate(encodedRateKey, { from: oracle });
		}

		const rate = await instance.rateForCurrency(encodedRateKey);
		assert.equal(rate.toString(), '0');
	});

	// Changing the rate stale period

	it('should be able to change the rate stale period', async function() {
		const instance = await ExchangeRates.deployed();
		const rateStalePeriod = 2010 * 2 * 60;

		const originalRateStalePeriod = await instance.rateStalePeriod.call();
		await instance.setRateStalePeriod(rateStalePeriod, { from: owner });
		const newRateStalePeriod = await instance.rateStalePeriod.call();
		assert.equal(newRateStalePeriod, rateStalePeriod);
		assert.notEqual(newRateStalePeriod, originalRateStalePeriod);
	});

	it('only owner is permitted to change the rate stale period', async function() {
		const instance = await ExchangeRates.deployed();
		const rateStalePeriod = 2010 * 2 * 60;

		// Check not allowed from deployer
		await assert.revert(instance.setRateStalePeriod(rateStalePeriod, { from: deployerAccount }));
		await assert.revert(instance.setRateStalePeriod(rateStalePeriod, { from: oracle }));
		await assert.revert(instance.setRateStalePeriod(rateStalePeriod, { from: accountOne }));
		await instance.setRateStalePeriod(rateStalePeriod, { from: owner });
	});

	it('should emit event on successful rate stale period change', async function() {
		const instance = await ExchangeRates.deployed();
		const rateStalePeriod = 2010 * 2 * 60;

		// Ensure oracle is set to oracle address originally
		const txn = await instance.setRateStalePeriod(rateStalePeriod, { from: owner });
		assert.eventEqual(txn, 'RateStalePeriodUpdated', {
			rateStalePeriod,
		});
	});

	// Checking if a single rate is stale

	it('should never allow sUSD to go stale via rateIsStale', async function() {
		const instance = await ExchangeRates.deployed();
		await fastForward(await instance.rateStalePeriod());
		const rateIsStale = await instance.rateIsStale(web3.utils.asciiToHex('sUSD'));
		assert.equal(rateIsStale, false);
	});

	it('should never allow sUSD to go stale via anyRateIsStale', async function() {
		const instance = await ExchangeRates.deployed();
		const keysArray = [web3.utils.asciiToHex('SNX'), web3.utils.asciiToHex('GOLD')];

		await instance.updateRates(
			keysArray,
			[web3.utils.toWei('0.1', 'ether'), web3.utils.toWei('0.2', 'ether')],
			await currentTime(),
			{ from: oracle }
		);
		assert.equal(await instance.anyRateIsStale(keysArray), false);

		await fastForward(await instance.rateStalePeriod());

		await instance.updateRates(
			[web3.utils.asciiToHex('SNX'), web3.utils.asciiToHex('GOLD')],
			[web3.utils.toWei('0.1', 'ether'), web3.utils.toWei('0.2', 'ether')],
			await currentTime(),
			{ from: oracle }
		);

		// Even though sUSD hasn't been updated since the stale rate period has expired,
		// we expect that sUSD remains "not stale"
		assert.equal(await instance.anyRateIsStale(keysArray), false);
	});

	it('check if a single rate is stale', async function() {
		const instance = await ExchangeRates.deployed();

		// Set up rates for test
		await instance.setRateStalePeriod(30, { from: owner });
		const updatedTime = await currentTime();
		await instance.updateRates(
			[web3.utils.asciiToHex('ABC')],
			[web3.utils.toWei('2', 'ether')],
			updatedTime,
			{
				from: oracle,
			}
		);
		await fastForward(31);

		const rateIsStale = await instance.rateIsStale(web3.utils.asciiToHex('ABC'));
		assert.equal(rateIsStale, true);
	});

	it('check if a single rate is not stale', async function() {
		const instance = await ExchangeRates.deployed();

		// Set up rates for test
		await instance.setRateStalePeriod(30, { from: owner });
		const updatedTime = await currentTime();
		await instance.updateRates(
			[web3.utils.asciiToHex('ABC')],
			[web3.utils.toWei('2', 'ether')],
			updatedTime,
			{
				from: oracle,
			}
		);
		await fastForward(29);

		const rateIsStale = await instance.rateIsStale(web3.utils.asciiToHex('ABC'));
		assert.equal(rateIsStale, false);
	});

	it('ensure rate is considered stale if not set', async function() {
		const instance = await ExchangeRates.deployed();

		// Set up rates for test
		await instance.setRateStalePeriod(30, { from: owner });
		const encodedRateKey = web3.utils.asciiToHex('GOLD');
		const currentRate = await instance.rates.call(encodedRateKey);
		if (currentRate > 0) {
			await instance.deleteRate(encodedRateKey, { from: oracle });
		}

		const rateIsStale = await instance.rateIsStale(encodedRateKey);
		assert.equal(rateIsStale, true);
	});

	it('make sure anyone can check if rate is stale', async function() {
		const instance = await ExchangeRates.deployed();
		const rateKey = web3.utils.asciiToHex('ABC');
		await instance.rateIsStale(rateKey, { from: oracle });
		await instance.rateIsStale(rateKey, { from: owner });
		await instance.rateIsStale(rateKey, { from: deployerAccount });
		await instance.rateIsStale(rateKey, { from: accountOne });
		await instance.rateIsStale(rateKey, { from: accountTwo });
	});

	// Checking if any rate is stale

	it('should be able to confirm no rates are stale from a subset', async function() {
		const instance = await ExchangeRates.deployed();

		// Set up rates for test
		await instance.setRateStalePeriod(20, { from: owner });
		const encodedRateKeys1 = [
			web3.utils.asciiToHex('ABC'),
			web3.utils.asciiToHex('DEF'),
			web3.utils.asciiToHex('GHI'),
			web3.utils.asciiToHex('LMN'),
		];
		const encodedRateKeys2 = [
			web3.utils.asciiToHex('OPQ'),
			web3.utils.asciiToHex('RST'),
			web3.utils.asciiToHex('UVW'),
			web3.utils.asciiToHex('XYZ'),
		];
		const encodedRateKeys3 = [
			web3.utils.asciiToHex('123'),
			web3.utils.asciiToHex('456'),
			web3.utils.asciiToHex('789'),
		];
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

		await fastForward(14);
		const rateIsStale = await instance.anyRateIsStale([...encodedRateKeys2, ...encodedRateKeys3]);
		assert.equal(rateIsStale, false);
	});

	it('should be able to confirm a single rate is stale from a set of rates', async function() {
		const instance = await ExchangeRates.deployed();

		// Set up rates for test
		await instance.setRateStalePeriod(40, { from: owner });
		const encodedRateKeys1 = [
			web3.utils.asciiToHex('ABC'),
			web3.utils.asciiToHex('DEF'),
			web3.utils.asciiToHex('GHI'),
			web3.utils.asciiToHex('LMN'),
		];
		const encodedRateKeys2 = [web3.utils.asciiToHex('OPQ')];
		const encodedRateKeys3 = [
			web3.utils.asciiToHex('RST'),
			web3.utils.asciiToHex('UVW'),
			web3.utils.asciiToHex('XYZ'),
		];
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
		const rateIsStale = await instance.anyRateIsStale([...encodedRateKeys2, ...encodedRateKeys3]);
		assert.equal(rateIsStale, true);
	});

	it('should be able to confirm a single rate (from a set of 1) is stale', async function() {
		const instance = await ExchangeRates.deployed();

		// Set up rates for test
		await instance.setRateStalePeriod(40, { from: owner });
		const updatedTime = await currentTime();
		await instance.updateRates(
			[web3.utils.asciiToHex('ABC')],
			[web3.utils.toWei('2', 'ether')],
			updatedTime,
			{
				from: oracle,
			}
		);
		await fastForward(41);

		const rateIsStale = await instance.anyRateIsStale([web3.utils.asciiToHex('ABC')]);
		assert.equal(rateIsStale, true);
	});

	it('make sure anyone can check if any rates are stale', async function() {
		const instance = await ExchangeRates.deployed();
		const rateKey = web3.utils.asciiToHex('ABC');
		await instance.anyRateIsStale([rateKey], { from: oracle });
		await instance.anyRateIsStale([rateKey], { from: owner });
		await instance.anyRateIsStale([rateKey], { from: deployerAccount });
		await instance.anyRateIsStale([rateKey], { from: accountOne });
		await instance.anyRateIsStale([rateKey], { from: accountTwo });
	});

	it('ensure rates are considered stale if not set', async function() {
		const instance = await ExchangeRates.deployed();

		// Set up rates for test
		await instance.setRateStalePeriod(40, { from: owner });
		const encodedRateKeys1 = [
			web3.utils.asciiToHex('ABC'),
			web3.utils.asciiToHex('DEF'),
			web3.utils.asciiToHex('GHI'),
			web3.utils.asciiToHex('LMN'),
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
		const rateIsStale = await instance.anyRateIsStale([
			...encodedRateKeys1,
			web3.utils.asciiToHex('RST'),
		]);
		assert.equal(rateIsStale, true);
	});

	// Ensure contract is destructable

	it('should be destructable', async function() {
		// Check if the instance adheres to the destructable interface
		const instance = await ExchangeRates.deployed();
		assert.exists(instance.initiateSelfDestruct);
		assert.exists(instance.setSelfDestructBeneficiary);
		assert.exists(instance.terminateSelfDestruct);
		assert.exists(instance.selfDestruct);

		assert.exists(instance.initiationTime);
		assert.exists(instance.selfDestructInitiated);
		assert.exists(instance.selfDestructBeneficiary);
	});

	// Last rate update times

	it('should return correct last rate update time for specific currencies', async function() {
		const abc = web3.utils.asciiToHex('lABC');
		const instance = await ExchangeRates.deployed();
		const timeSent = await currentTime();
		await instance.updateRates(
			[abc, web3.utils.asciiToHex('lDEF'), web3.utils.asciiToHex('lGHI')],
			[
				web3.utils.toWei('1.3', 'ether'),
				web3.utils.toWei('2.4', 'ether'),
				web3.utils.toWei('3.5', 'ether'),
			],
			timeSent,
			{ from: oracle }
		);

		const lastUpdateTime = await instance.lastRateUpdateTimeForCurrency(abc);
		assert.equal(lastUpdateTime, timeSent);
	});

	it('should return correct last rate update time for a specific currency', async function() {
		const abc = web3.utils.asciiToHex('lABC');
		const def = web3.utils.asciiToHex('lDEF');
		const ghi = web3.utils.asciiToHex('lGHI');
		const instance = await ExchangeRates.deployed();
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

		const lastUpdateTimes = await instance.lastRateUpdateTimesForCurrencies([abc, ghi]);
		assert.equal(lastUpdateTimes[0], timeSent);
		assert.equal(lastUpdateTimes[1], timeSent2);
	});

	it('should update the XDR rate correctly with all exchange rates', async function() {
		const instance = await ExchangeRates.deployed();
		const timeSent = await currentTime();
		const keysArray = ['sAUD', 'sEUR', 'sCHF', 'sGBP'].map(web3.utils.asciiToHex);
		const rates = ['0.4', '1.2', '3.3', '1.95'].map(toUnit);
		await instance.updateRates(keysArray, rates, timeSent, {
			from: oracle,
		});

		const lastUpdatedTimeXDR = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('XDR')
		);
		assert.equal(lastUpdatedTimeXDR, timeSent);

		const lastUpdatedCurrencyXDR = await instance.rates.call(web3.utils.asciiToHex('XDR'));
		let ratesTotal = toUnit('1'); // sUSD is always UNIT
		for (const rate of rates) {
			ratesTotal = ratesTotal.add(rate);
		}
		assert.bnEqual(lastUpdatedCurrencyXDR, ratesTotal);
	});

	it('should update the XDR rates correctly with a subset of exchange rates', async function() {
		const keysArray = ['sCHF', 'sGBP'].map(web3.utils.asciiToHex);
		const rates = ['3.3', '1.95'].map(toUnit);
		const instance = await ExchangeRates.new(owner, oracle, keysArray, rates, {
			from: deployerAccount,
		});

		const { blockNumber } = await web3.eth.getTransaction(instance.transactionHash);
		const { timestamp } = await web3.eth.getBlock(blockNumber);

		const lastUpdatedTimeXDR = await instance.lastRateUpdateTimes.call(
			web3.utils.asciiToHex('XDR')
		);
		assert.bnEqual(lastUpdatedTimeXDR, web3.utils.toBN(timestamp));

		const lastUpdatedCurrencyXDR = await instance.rates.call(web3.utils.asciiToHex('XDR'));
		let ratesTotal = toUnit('1'); // sUSD is always UNIT
		for (let rate of rates) {
			ratesTotal = ratesTotal.add(rate);
		}
		assert.bnEqual(lastUpdatedCurrencyXDR, ratesTotal);
	});
});
