const { subtask, types } = require('hardhat/config');
const fs = require('fs');
const path = require('path');

const synthetix = require('../..');

subtask('interact:load-contracts')
.setAction(async ({ provider }, hre) => {
	// build hardhat-deploy style deployments
	if (!fs.existsSync('deployments')) {
		fs.mkdirSync('deployments');
	}
	if (!fs.existsSync(`deployments/${hre.network.name}`)) {
		fs.mkdirSync(`deployments/${hre.network.name}`);
	}

	// Wrap Synthetix utils for current network
	const { getPathToNetwork, getTarget, getSource } = synthetix.wrap({
		network: hre.network.name,
		useOvm: false,
		fs,
		path,
	});

	// Derive target build path and retrieve deployment artifacts
	const file = synthetix.constants.DEPLOYMENT_FILENAME;
	const deploymentFilePath = getPathToNetwork({ network: hre.network.name, useOvm: false, file });

	const deploymentData = JSON.parse(fs.readFileSync(deploymentFilePath));
	const targets = Object.keys(deploymentData.targets);

	const contracts = {};

	for (const target of targets) {
		const targetData = getTarget({
			contract: target,
			network: hre.network.name,
			useOvm: false,
			deploymentFilePath,
		});

		const sourceData = getSource({
			contract: targetData.source,
			network: hre.network.name,
			useOvm: false,
			deploymentFilePath,
		});

		contracts[target] = new ethers.Contract(targetData.address, sourceData.abi, provider);
	}

	return contracts;
});
