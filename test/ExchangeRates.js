const ExchangeRates = artifacts.require('ExchangeRates');

// Helper functions

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

		assert.etherEqual(await instance.rateForCurrency(web3.utils.asciiToHex('nUSD')), '1');
		assert.etherEqual(await instance.rateForCurrency(web3.utils.asciiToHex('HAV')), '0.2');

		// Ensure that when the rate isn't found, 0 is returned as the exchange rate.
		assert.etherEqual(await instance.rateForCurrency(web3.utils.asciiToHex('OTHER')), '0');
	});

	it('should revert when currency keys > new rates length', async function() {
		await assert.revert(
			ExchangeRates.new(
				owner,
				oracle,
				[web3.utils.asciiToHex('nUSD'), web3.utils.asciiToHex('HAV')],
				[
					web3.utils.toWei('1', 'ether'),
					web3.utils.toWei('0.2', 'ether'),
					web3.utils.toWei('0', 'ether'),
				],
				{
					from: deployerAccount,
				}
			)
		);
	});

	// ?? Revert of truncate?
	it('should revert if currency key > 4 bytes', async function() {
		await ExchangeRates.deployed();
	});

	// it('should revert if at least one new rate negative', async function() {
	// });

	// it('should revert if currency keys not an array', async function() {
	// });

	// it('should revert if new rates not an array', async function() {
	// });

	// it('should be able to handle 100 currencies', async function() {
	// });

	// // Update the exchange rates

	// it('should be able to update rates of only one currency', async function() {
	// });

	// it('should be able to update rates of all currencies', async function() {
	// });

	// it('should emit RatesUpdated event when rate updated', async function() {
	// });

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

	// it('should emit rates updated event', async function() {
	// });

	//

	// Basic destructable features

	it('', async function() {});
});
