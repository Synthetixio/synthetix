const ExchangeRates = artifacts.require('ExchangeRates');
const { currentTime } = require('../utils/testUtils');

// Helper functions

const getRandomCurrencyKey = () =>
	Math.random()
		.toString(36)
		.substring(2, 6)
		.toUpperCase();

contract('Exchange Rates', async function(accounts) {
	const [deployerAccount, owner, oracle] = accounts;

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

	it('should revert when number of currency keys > new rates length', async function() {
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

	it('should truncate to 4 bytes if currency key > 4 bytes', async function() {
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

	it('shouldnt be able to set exchange rate to 0', async function() {
		await assert.revert(
			ExchangeRates.new(
				owner,
				oracle,
				[web3.utils.asciiToHex('nUSD'), web3.utils.asciiToHex('HAV')],
				[web3.utils.toWei('1', 'ether'), web3.utils.toWei('0', 'ether')],
				{
					from: deployerAccount,
				}
			)
		);
	});

	it('should be able to handle lots of currencies', async function() {
		let amounts = [];
		let currencyKeys = [];
		const numberOfCurrencies = 100;
		for (i = 0; i < numberOfCurrencies; i++) {
			const amount = Math.random() * 100;
			amounts[i] = web3.utils.toWei(amount.toString(), 'ether');
			currencyKeys[i] = web3.utils.asciiToHex(getRandomCurrencyKey());
		}

		const instance = await ExchangeRates.new(owner, oracle, currencyKeys, amounts, {
			from: deployerAccount,
		});

		for (i = 0; i < numberOfCurrencies; i++) {
			assert.equal(await instance.rates.call(currencyKeys[i]), amounts[i]);
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

		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lABC')), updatedRate);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lDEF')), updatedRate2);
		assert.etherEqual(await instance.rates.call(web3.utils.asciiToHex('lGHI')), updatedRate3);
	});

	it.only('should emit RatesUpdated event when rate updated', async function() {
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

	// it('should revert if currency keys not an array', async function() { // dup
	// });

	// it('should revert if new rates not an array', async function() { // dup
	// });

	// it('should be able to handle 100 currencies', async function() { // dup
	// });

	// it('should revert if at least one new rate negative', async function() { // dup
	// });

	// it('should revert if at least one new rate negative', async function() { // dup
	// });

	// it('should revert if currency key > 4 bytes', async function() { // dup
	// });

	// it('should revert when currency keys length != new rates length', async function() { // dup
	// });

	// it('exchange rate of currency not recorded is 0', async function() {
	// });

	// it('only oracle can update exchange rates', async function() {
	// });

	// it('should emit rates updated event', async function() {
	// });

	//

	// Basic destructable features

	it('', async function() {});
});
