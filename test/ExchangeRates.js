const ExchangeRates = artifacts.require('ExchangeRates');
const { currentTime } = require('../utils/testUtils');

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
	const [deployerAccount, owner, oracle, accountOne] = accounts;

	// Contract Creation

	it('should set constructor params on deployment', async function() {
		const instance = await ExchangeRates.new(
			owner,
			oracle,
			[web3.utils.asciiToHex('nUSD'), web3.utils.asciiToHex('HAV')],
			[web3.utils.toWei('1', 'ether'), web3.utils.toWei('0.2', 'ether')],
			{
				from: deployerAccount,
			}
		);

		assert.equal(await instance.owner(), owner);
		assert.equal(await instance.oracle(), oracle);

		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('nUSD')), '1');
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('HAV')), '0.2');

		// Ensure that when the rate isn't found, 0 is returned as the exchange rate.
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('OTHER')), '0');
	});

	it('two of the same currencies in same array should mean that the second one overrides', async function() {
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
	});

	it('should revert when number of currency keys > new rates length on create', async function() {
		await assert.revert(
			ExchangeRates.new(
				owner,
				oracle,
				[
					web3.utils.asciiToHex('nUSD'),
					web3.utils.asciiToHex('HAV'),
					web3.utils.asciiToHex('GOLD'),
				],
				[web3.utils.toWei('1', 'ether'), web3.utils.toWei('0.2', 'ether')],
				{
					from: deployerAccount,
				}
			)
		);
	});

	it('should truncate to 4 bytes if currency key > 4 bytes on create', async function() {
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
	});

	it('shouldnt be able to set exchange rate to 0 on create', async function() {
		await assert.revert(
			ExchangeRates.new(
				owner,
				oracle,
				[web3.utils.asciiToHex('HAV')],
				[web3.utils.toWei('0', 'ether')],
				{
					from: deployerAccount,
				}
			)
		);
	});

	it('should be able to handle lots of currencies on creation', async function() {
		const numberOfCurrencies = 100;
		const { currencyKeys, rates } = createRandomKeysAndRates(numberOfCurrencies);

		const instance = await ExchangeRates.new(owner, oracle, currencyKeys, rates, {
			from: deployerAccount,
		});

		for (let i = 0; i < numberOfCurrencies; i++) {
			assert.equal(await instance.rates.call(currencyKeys[i]), rates[i]);
		}
	});

	// Update the exchange rates

	it('should be able to update rates of only one currency without affecting other rates', async function() {
		const instance = await ExchangeRates.deployed();
		const timeSent = currentTime();

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

		const updatedRate = '64.33';
		await instance.updateRates(
			[web3.utils.asciiToHex('lABC')],
			[web3.utils.toWei(updatedRate, 'ether')],
			timeSent,
			{ from: oracle }
		);

		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lABC')), updatedRate);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lDEF')), '2.4');
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lGHI')), '3.5');
	});

	it('should be able to update rates of all currencies', async function() {
		const instance = await ExchangeRates.deployed();

		await instance.updateRates(
			[web3.utils.asciiToHex('lABC'), web3.utils.asciiToHex('lDEF'), web3.utils.asciiToHex('lGHI')],
			[
				web3.utils.toWei('1.3', 'ether'),
				web3.utils.toWei('2.4', 'ether'),
				web3.utils.toWei('3.5', 'ether'),
			],
			currentTime(),
			{ from: oracle }
		);

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
			currentTime(),
			{ from: oracle }
		);

		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lABC')), updatedRate1);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lDEF')), updatedRate2);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lGHI')), updatedRate3);
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
		const txn = await instance.updateRates(currencyKeys, rates, currentTime(), { from: oracle });

		assert.eventEqual(txn, 'RatesUpdated', {
			currencyKeys,
			newRates: rates,
		});
	});

	it('should be able to handle lots of currency updates', async function() {
		const instance = await ExchangeRates.deployed();
		const numberOfCurrencies = 150;
		const { currencyKeys, rates } = createRandomKeysAndRates(numberOfCurrencies);

		await instance.updateRates(currencyKeys, rates, currentTime(), { from: oracle });

		for (let i = 0; i < numberOfCurrencies; i++) {
			assert.equal(await instance.rates.call(currencyKeys[i]), rates[i]);
		}
	});

	it('should truncate to 4 bytes if currency key > 4 bytes on update', async function() {
		const instance = await ExchangeRates.deployed();
		const rate = '4.33';
		await instance.updateRates(
			[web3.utils.asciiToHex('CATHERINE')],
			[web3.utils.toWei(rate, 'ether')],
			currentTime(),
			{ from: oracle }
		);

		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('CATHERINE')), rate);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('CATH')), rate);
		assert.etherNotEqual(await instance.rates.call(web3.utils.asciiToHex('CAT')), rate);
	});

	it('should revert when currency keys length != new rates length on update', async function() {
		const instance = await ExchangeRates.deployed();
		await assert.revert(
			instance.updateRates(
				[
					web3.utils.asciiToHex('nUSD'),
					web3.utils.asciiToHex('HAV'),
					web3.utils.asciiToHex('GOLD'),
				],
				[web3.utils.toWei('1', 'ether'), web3.utils.toWei('0.2', 'ether')],
				currentTime(),
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
				currentTime(),
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
				currentTime(),
				{ from: deployerAccount }
			)
		);
		// Check not allowed from owner
		await assert.revert(
			instance.updateRates(
				[web3.utils.asciiToHex('GOLD'), web3.utils.asciiToHex('FOOL')],
				[web3.utils.toWei('10', 'ether'), web3.utils.toWei('0.9', 'ether')],
				currentTime(),
				{ from: owner }
			)
		);
		// Check not allowed from a random account
		await assert.revert(
			instance.updateRates(
				[web3.utils.asciiToHex('GOLD'), web3.utils.asciiToHex('FOOL')],
				[web3.utils.toWei('10', 'ether'), web3.utils.toWei('0.9', 'ether')],
				currentTime(),
				{ from: accountOne }
			)
		);

		assert.etherNotEqual(await instance.rates.call(web3.utils.asciiToHex('GOLD')), '10');
		assert.etherNotEqual(await instance.rates.call(web3.utils.asciiToHex('FOOL')), '0.9');

		await instance.updateRates(
			[web3.utils.asciiToHex('GOLD'), web3.utils.asciiToHex('FOOL')],
			[web3.utils.toWei('10', 'ether'), web3.utils.toWei('0.9', 'ether')],
			currentTime(),
			{ from: oracle }
		);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('GOLD')), '10');
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('FOOL')), '0.9');
	});

	it('should not be able to update rates if they are too far in the future', async function() {
		const instance = await ExchangeRates.deployed();
		const timeTooFarInFuture = currentTime() + 10 * 61;
		await assert.revert(
			instance.updateRates(
				[web3.utils.asciiToHex('GOLD')],
				[web3.utils.toWei('1', 'ether')],
				timeTooFarInFuture,
				{ from: oracle }
			)
		);
	});

	// TODO: Check that lastRateUpdateTimes has been updated

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

	it("only owner can change the oracle's address", async function() {
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

	// Changing the rate stale period

	// Checking if a rate is stale

	// Basic destructable features
});
