const fs = require('fs');
const path = require('path');
const hre = require('hardhat');
const { wrap } = require('../../..');
const { getPathToNetwork } = require('../../..');
const { simulateExchangeRates } = require('./exchangeRates');
const { takeDebtSnapshot } = require('./debtSnapshot');
const { mockOptimismBridge } = require('./optimismBridge');

async function setup({ network }) {
	const deploymentPath = hre.config.deploymentPath || getPathToNetwork({ network, fs, path });

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
