const testUtils = require('../../utils/index');
const { toBytes32 } = require('../../..');
const { connectContract } = require('./connectContract');
const { web3 } = require('@nomiclabs/buidler');
const { toWei } = require('web3-utils');

const network = 'local';

async function simulateExchangeRates() {
	const Issuer = await connectContract({
		network,
		contractName: 'Issuer',
	});

	let currencyKeys = await Issuer.availableCurrencyKeys();
	currencyKeys = currencyKeys.filter(key => key !== toBytes32('sUSD'));

	const ExchangeRates = await connectContract({
		network,
		contractName: 'ExchangeRates',
	});

	const { currentTime } = testUtils({ web3 });
	const now = await currentTime();

	await ExchangeRates.updateRates(
		currencyKeys,
		currencyKeys.map(() => toWei('1')),
		now
	);
}

async function takeDebtSnapshot() {
	const DebtCache = await connectContract({
		network,
		contractName: 'DebtCache',
	});

	await DebtCache.takeDebtSnapshot();
}

async function bootstrapLocal() {
	await simulateExchangeRates();
	await takeDebtSnapshot();
}

module.exports = {
	bootstrapLocal,
};
