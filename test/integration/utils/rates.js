const ethers = require('ethers');
const { toBytes32 } = require('../../..');

async function updateExchangeRatesIfNeeded({ ctx }) {
	const { Synthetix, DebtCache } = ctx.contracts;

	if (await Synthetix.anySynthOrSNXRateIsInvalid()) {
		console.log('SIMULATING EXCHANGE RATES...');
		await _simulateExchangeRates({ ctx });
		console.log(await Synthetix.anySynthOrSNXRateIsInvalid());
	}

	const { isInvalid, isStale } = await DebtCache.cacheInfo();
	if (isInvalid || isStale) {
		console.log('UPDATING CACHE');
		await _updateCache({ ctx });
		console.log(await DebtCache.cacheInfo());
	}
}

async function _simulateExchangeRates({ ctx }) {
	const { Issuer } = ctx.contracts;
	let { ExchangeRates } = ctx.contracts;
	const oracle = await ExchangeRates.oracle();

	const signer = ctx.fork ? ctx.provider.getSigner(oracle) : ctx.users.owner;
	ExchangeRates = ExchangeRates.connect(signer);

	const currencyKeys = (await Issuer.availableCurrencyKeys())
		.filter(key => key !== toBytes32('sUSD'))
		.concat(['SNX', 'ETH'].map(toBytes32));

	const { timestamp } = await ctx.provider.getBlock();
	const rates = currencyKeys.map(key => {
		if (key === toBytes32('SNX')) {
			return ethers.utils.parseEther('1');
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
