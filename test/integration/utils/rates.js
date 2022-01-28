const ethers = require('ethers');
const { setSystemSetting } = require('./settings');
const { toBytes32 } = require('../../..');
const { createMockAggregatorFactory } = require('../../utils')();

async function increaseStalePeriodAndCheckRatesAndCache({ ctx }) {
	await setSystemSetting({ ctx, settingName: 'rateStalePeriod', newValue: '1000000000' });

	if (await _areRatesInvalid({ ctx })) {
		// try to add the missing rates
		await _setMissingRates({ ctx });
		// check again
		if (await _areRatesInvalid({ ctx })) {
			await _printRatesInfo({ ctx });
			throw new Error('Rates are still invalid after updating.');
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

/// this creates and adds a new aggregator (even if a previous one exists) and sets the latest rate in it
async function addAggregatorAndSetRate({ ctx, currencyKey, rate }) {
	const owner = ctx.users.owner;
	const exchangeRates = ctx.contracts.ExchangeRates.connect(owner);

	// factory for price aggregators contracts
	const MockAggregatorFactory = await createMockAggregatorFactory(owner);

	// deploy an aggregator
	const aggregator = (await MockAggregatorFactory.deploy()).connect(owner);

	// set decimals
	await (await aggregator.setDecimals(18)).wait();
	// push the new price
	const { timestamp } = await ctx.provider.getBlock();
	await (await aggregator.setLatestAnswer(rate, timestamp)).wait();
	// set the aggregator in ExchangeRates
	await (await exchangeRates.addAggregator(currencyKey, aggregator.address)).wait();
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

async function _setMissingRates({ ctx }) {
	let currencyKeys;
	if (ctx.fork) {
		// this adds a rate for only e.g. sREDEEMER in fork mode (which is not an existing synth
		// but is added to test the redeeming functionality)
		// All other synths should have feeds in fork mode
		currencyKeys = (ctx.addedSynths || []).map(o => toBytes32(o.name));
	} else {
		// set missing rates for all synths, since not in fork mode we don't have existing feeds
		currencyKeys = await _getAvailableCurrencyKeys({ ctx });
	}

	// got over all rates and add aggregators if rate is missing
	for (const currencyKey of currencyKeys) {
		const rate = await ctx.contracts.ExchangeRates.rateForCurrency(currencyKey);
		if (rate.toString() === '0') {
			await addAggregatorAndSetRate({ ctx, currencyKey, rate: ethers.utils.parseEther('1') });
		}
	}
}

async function _updateCache({ ctx }) {
	let { DebtCache } = ctx.contracts;

	DebtCache = DebtCache.connect(ctx.users.owner);

	const tx = await DebtCache.takeDebtSnapshot();
	await tx.wait();
}

async function updateCache({ ctx }) {
	await _updateCache({ ctx });
}

async function getRate({ ctx, symbol }) {
	const { ExchangeRates } = ctx.contracts;

	return ExchangeRates.rateForCurrency(toBytes32(symbol));
}

module.exports = {
	increaseStalePeriodAndCheckRatesAndCache,
	addAggregatorAndSetRate,
	getRate,
	updateCache,
};
