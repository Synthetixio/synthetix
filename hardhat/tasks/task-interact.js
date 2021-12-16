const { subtask } = require('hardhat/config');
const fs = require('fs');
const path = require('path');

const ethers = require('ethers');

const synthetix = require('../..');

const {
	loadAndCheckRequiredSources,
	appendOwnerActionGenerator,
} = require('../../publish/src/util');

subtask('interact:load-contracts').setAction(async (args, hre, runSuper) => {
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

		contracts[target] = new ethers.Contract(targetData.address, sourceData.abi, args.provider);
	}

	return { ...contracts, ...(await runSuper(args)) };
});

subtask('interact:stage-txn').setAction(async ({ txn, contract, functionSignature, args }, hre) => {
	const { getPathToNetwork } = synthetix.wrap({
		network: hre.network.name,
		useOvm: false,
		fs,
		path,
	});

	// always appending to mainnet owner actions now
	const { ownerActions, ownerActionsFile } = loadAndCheckRequiredSources({
		deploymentPath: getPathToNetwork({ network: hre.network.name, useOvm: false }),
		network: hre.network.name,
	});

	// append to owner actions if supplied
	const appendOwnerAction = appendOwnerActionGenerator({
		ownerActions,
		ownerActionsFile,
		// 'https://',
	});

	const actionName = `${contract.address}.${functionSignature}:${args.join(',')}`;

	const ownerAction = {
		key: actionName,
		target: txn.to,
		action: actionName,
		data: txn.data,
	};

	appendOwnerAction(ownerAction);
});
