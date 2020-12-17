const fs = require('fs');
const path = require('path');
const hre = require('hardhat');
const { wrap } = require('../../..');
const { getPathToNetwork } = require('../../..');
const { simulateExchangeRates } = require('./exchangeRates');
const { takeDebtSnapshot } = require('./debtSnapshot');
const { mockOptimismBridge } = require('./optimismBridge');
const { gray } = require('chalk');

async function setup({ network }) {
	console.log(gray(`  > network: ${network}`));

	const deploymentPath = hre.config.deploymentPath || getPathToNetwork({ network, fs, path });
	console.log(gray(`  > deployentPath: ${deploymentPath}`));

	const { getUsers } = wrap({ network, fs, path });
	const synthetixAccounts = getUsers({ network });
	const owner = synthetixAccounts.find(a => a.name === 'owner').address;

	if (hre.config.patchFreshDeployment) {
		await simulateExchangeRates({ network, deploymentPath });
		await takeDebtSnapshot({ network, deploymentPath });
		await mockOptimismBridge({ network, deploymentPath });
	}

	return {
		owner,
		deploymentPath,
	};
}

module.exports = {
	setup,
};
