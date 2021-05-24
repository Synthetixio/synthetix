const ethers = require('ethers');
const { toBytes32 } = require('../../..');

async function simulateExchangeRates({ ctx }) {
	const currencyKeys = (await ctx.contracts.Issuer.availableCurrencyKeys())
		.filter(key => key !== toBytes32('sUSD'))
		.concat(['SNX', 'ETH'].map(toBytes32));

	const { timestamp } = await ctx.provider.getBlock();
	const rates = currencyKeys.map(() => ethers.utils.parseEther('1'));

	ctx.contracts.ExchangeRates = ctx.contracts.ExchangeRates.connect(ctx.owner);

	const tx = await ctx.contracts.ExchangeRates.updateRates(currencyKeys, rates, timestamp);
	await tx.wait();
}

module.exports = {
	simulateExchangeRates,
};
