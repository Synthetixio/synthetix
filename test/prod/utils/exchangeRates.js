const testUtils = require('../../utils/index');
const { toBytes32 } = require('../../..');
const { web3 } = require('@nomiclabs/buidler');
const { toWei } = require('web3-utils');
const { connectContract } = require('./connectContract');
const { ensureAccountHasEther } = require('./ensureAccountHasBalance');
const { readSetting, writeSetting } = require('./systemSettings');
const { takeDebtSnapshot } = require('./debtSnapshot');
const { toUnit } = require('../../utils')();
const { gray } = require('chalk');

async function checkRates({ network, deploymentPath }) {
	const Synthetix = await connectContract({
		network,
		deploymentPath,
		contractName: 'Synthetix',
	});

	const rateInvalid = await Synthetix.anySynthOrSNXRateIsInvalid();

	return !rateInvalid;
}

async function simulateExchangeRates({ network, deploymentPath }) {
	if (await checkRates({ network, deploymentPath })) {
		return;
	}

	const Issuer = await connectContract({
		network,
		deploymentPath,
		contractName: 'Issuer',
	});

	let currencyKeys = await Issuer.availableCurrencyKeys();
	currencyKeys = currencyKeys.filter(key => key !== toBytes32('sUSD'));
	const additionalKeys = ['SNX', 'ETH'].map(toBytes32); // The Depot uses the key "ETH" as opposed to "sETH" for its ether price
	currencyKeys.push(...additionalKeys);
	console.log(gray(`    > Updating ${currencyKeys.length} exchange rates...`));

	const ExchangeRates = await connectContract({
		network,
		deploymentPath,
		contractName: 'ExchangeRates',
	});

	const { currentTime } = testUtils({ web3 });
	const now = await currentTime();

	const oracle = await ExchangeRates.oracle();

	await ensureAccountHasEther({
		amount: toUnit('1'),
		account: oracle,
		network,
		deploymentPath,
	});

	await ExchangeRates.updateRates(
		currencyKeys,
		currencyKeys.map(() => toWei('1')),
		now,
		{
			from: oracle,
		}
	);

	await takeDebtSnapshot({ network, deploymentPath });
}

async function avoidStaleRates({ owner, network, deploymentPath }) {
	const currentValue = (
		await readSetting({
			setting: 'rateStalePeriod',
			network,
			deploymentPath,
		})
	).toString();

	const targetValue = '1000000000';

	if (currentValue === targetValue) {
		return;
	}

	await writeSetting({
		setting: 'setRateStalePeriod',
		value: targetValue,
		owner,
		network,
		deploymentPath,
	});
}

module.exports = {
	simulateExchangeRates,
	avoidStaleRates,
};
