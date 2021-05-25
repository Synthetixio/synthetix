const ethers = require('ethers');
const { toBytes32 } = require('../../..');

async function updateExchangeRatesIfNeeded({ ctx }) {
	const { Synthetix, DebtCache } = ctx.contracts;

	if (await Synthetix.anySynthOrSNXRateIsInvalid()) {
		await _simulateExchangeRates({ ctx });
	}

	const { isInvalid, isStale } = await DebtCache.cacheInfo();
	if (isInvalid || isStale) {
		_updateCache({ ctx });
	}
}

async function _simulateExchangeRates({ ctx }) {
	const { Issuer } = ctx.contracts;
	let { ExchangeRates } = ctx.contracts;

	const currencyKeys = (await Issuer.availableCurrencyKeys())
		.filter(key => key !== toBytes32('sUSD'))
		.concat(['SNX', 'ETH'].map(toBytes32));

	const { timestamp } = await ctx.provider.getBlock();
	const rates = currencyKeys.map(() => ethers.utils.parseEther('1'));

	const oracle = await ExchangeRates.oracle();
	ExchangeRates = ExchangeRates.connect(await ctx.provider.getSigner(oracle));

	const tx = await ExchangeRates.updateRates(currencyKeys, rates, timestamp);
	await tx.wait();
}

async function _updateCache({ ctx }) {
	let { DebtCache } = ctx.contracts;

	DebtCache = DebtCache.connect(ctx.users.owner);

	const tx = await DebtCache.takeDebtSnapshot();
	await tx.wait();
}

module.exports = {
	updateExchangeRatesIfNeeded,
};
