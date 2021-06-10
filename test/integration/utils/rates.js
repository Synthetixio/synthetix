const ethers = require('ethers');
const { toBytes32 } = require('../../..');

async function updateExchangeRatesIfNeeded({ ctx }) {
	const { DebtCache } = ctx.contracts;

	if (await Synthetix.anySynthOrSNXRateIsInvalid()) {
	await _simulateExchangeRates({ ctx });
	}

	const { isInvalid, isStale } = await DebtCache.cacheInfo();
	if (isInvalid || isStale) {
		await _updateCache({ ctx });
	}
}

async function _simulateExchangeRates({ ctx }) {
	const { Issuer } = ctx.contracts;
	let { ExchangeRates } = ctx.contracts;
	ExchangeRates = ExchangeRates.connect(ctx.users.owner);

	const currencyKeys = (await Issuer.availableCurrencyKeys())
		.filter(key => key !== toBytes32('sUSD'))
		// Manually add the futures assets: ETH, BTC and LINK.
		// These are not added to the issuer yet, but their prices
		// are needed in the futures markets.
		.concat(['SNX', 'ETH', 'sETH', 'sBTC', 'sLINK'].map(toBytes32));

	const { timestamp } = await ctx.provider.getBlock();
	const rates = currencyKeys.map(key => {
		if (key === toBytes32('SNX')) {
			return ethers.utils.parseEther('2192');
		} else {
			return ethers.utils.parseEther('1');
		}
	});

	const tx = await ExchangeRates.updateRates(currencyKeys, rates, timestamp);
	await tx.wait();
}

async function _updateCache({ ctx }) {
	let { DebtCache } = ctx.contracts;

	DebtCache = DebtCache.connect(ctx.users.owner);

	const tx = await DebtCache.takeDebtSnapshot();
	await tx.wait();
}

async function getRate({ ctx, symbol }) {
	const { ExchangeRates } = ctx.contracts;

	return ExchangeRates.rateForCurrency(toBytes32(symbol));
}

module.exports = {
	updateExchangeRatesIfNeeded,
	getRate,
};
