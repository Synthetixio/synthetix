const ExchangeRates = artifacts.require('ExchangeRates');

contract('Exchange Rates', async function(accounts) {
	const [deployerAccount, owner, oracle] = accounts;

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
		assert.etherEqual(await instance.rateForCurrency(web3.utils.asciiToHex('OTHER')), '0');
	});
});
