const ethers = require('ethers');
const { setSystemSetting } = require('./settings');
const { toBytes32 } = require('../../..');

async function updateExchangeRatesIfNeeded({ ctx }) {
	await setSystemSetting({ ctx, settingName: 'rateStalePeriod', newValue: '1000000000' });

	if (await _areRatesInvalid({ ctx })) {
		await _setNewRates({ ctx });
		if (await _areRatesInvalid({ ctx })) {
			await _printRatesInfo({ ctx });
			throw new Error('Rates are still invalid after updating them.');
		}
	}

	if (await _isCacheInvalid({ ctx })) {
		await _updateCache({ ctx });
		if (await _isCacheInvalid({ ctx })) {
			await _printCacheInfo({ ctx });
			throw new Error('Cache is still invalid after updating it.');
		}
	}
}

async function _isCacheInvalid({ ctx }) {
	const { DebtCache } = ctx.contracts;

	const { isInvalid, isStale } = await DebtCache.cacheInfo();

	return isInvalid || isStale;
}

async function _areRatesInvalid({ ctx }) {
	const { Synthetix } = ctx.contracts;

	return Synthetix.anySynthOrSNXRateIsInvalid();
}

async function _printCacheInfo({ ctx }) {
	const { DebtCache } = ctx.contracts;

	console.log(await DebtCache.cacheInfo());
}

async function _printRatesInfo({ ctx }) {
	const { ExchangeRates } = ctx.contracts;

	const currencyKeys = await _getAvailableCurrencyKeys({ ctx });

	for (const currencyKey of currencyKeys) {
		const currency = ethers.utils.toUtf8String(currencyKey);

		const rate = await ExchangeRates.rateForCurrency(currencyKey);
		const isInvalid = await ExchangeRates.rateIsInvalid(currencyKey);
		const updated = await ExchangeRates.lastRateUpdateTimes(currencyKey);
		const stale = await ExchangeRates.rateIsStale(currencyKey);

		console.log(
			`${currency} - rate: ${rate}, invalid: ${isInvalid}, updated: ${updated}, stale: ${stale}`
		);
	}
}

async function _getAvailableCurrencyKeys({ ctx }) {
	const { Issuer } = ctx.contracts;

	const availableCurrencyKeys = await Issuer.availableCurrencyKeys();

	return availableCurrencyKeys
		.filter(key => key !== toBytes32('sUSD'))
		.concat(['SNX', 'ETH'].map(toBytes32));
}

async function _getCurrentRates({ ctx, currencyKeys }) {
	const { ExchangeRates } = ctx.contracts;

	const rates = [];
	for (const currencyKey of currencyKeys) {
		const rate = await ExchangeRates.rateForCurrency(currencyKey);

		// Simualte any exchange rates that are 0.
		const newRate = rate.toString() === '0' ? ethers.utils.parseEther('1') : rate;

		rates.push(newRate);
	}

	return rates;
}

async function _setNewRates({ ctx }) {
	let { ExchangeRates } = ctx.contracts;
	const oracle = await ExchangeRates.oracle();
	const signer = ctx.fork ? ctx.provider.getSigner(oracle) : ctx.users.owner;
	ExchangeRates = ExchangeRates.connect(signer);

	const currencyKeys = await _getAvailableCurrencyKeys({ ctx });
	const { timestamp } = await ctx.provider.getBlock();

	const rates = await _getCurrentRates({ ctx, currencyKeys });

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
