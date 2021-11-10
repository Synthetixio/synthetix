const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { table } = require('table');

require('dotenv').config();

const DEPLOYMENT_FILENAME = 'deployment.json';

const NETWORK = 'kovan';
const data = {
	'kovan-ovm': require('./publish/deployed/kovan-ovm'),
	'mainnet-ovm': require('./publish/deployed/mainnet-ovm'),
};

const { stringify } = require('./publish/src/util');

const getFolderNameForNetwork = ({ network, useOvm = true }) => {
	if (network.includes('ovm')) {
		return network;
	}
	return useOvm ? `${network}-ovm` : network;
};

const getPathToNetwork = ({ network = 'kovan', file = '', useOvm = true, path } = {}) =>
	path.join(__dirname, 'publish', 'deployed', getFolderNameForNetwork({ network, useOvm }), file);

const loadDeploymentFile = ({ network, path, fs, deploymentPath, useOvm = true }) => {
	if (!deploymentPath && network !== 'local' && (!path || !fs)) {
		return data[getFolderNameForNetwork({ network, useOvm })].deployment;
	}
	const pathToDeployment = deploymentPath
		? path.join(deploymentPath, DEPLOYMENT_FILENAME)
		: getPathToNetwork({ network, useOvm, path, file: DEPLOYMENT_FILENAME });

	if (!fs.existsSync(pathToDeployment)) {
		throw Error(`Cannot find deployment for network: ${network}.`);
	}
	return JSON.parse(fs.readFileSync(pathToDeployment));
};

/**
 * Retrieve the list of targets for the network - returning the name, address, source file and link to etherscan
 */
const getTarget = ({
	network = 'kovan',
	useOvm = true,
	contract,
	path,
	fs,
	deploymentPath,
} = {}) => {
	const deployment = loadDeploymentFile({ network, useOvm, path, fs, deploymentPath });
	if (contract) return deployment.targets[contract];
	else return deployment.targets;
};

/*
 * Post OVM 2.0 regenesis bytecode cleanup for kovan and mainnet.
 *
 * 1. Get all deployed OVM contract addresses.
 * 2. Loop through each of the addresses and download the constructor args and bytecode.
 * 3. Replace the bytecode in deployment.json with the downloaded bytecode (cutting off constructor args).
 */
async function updateBytecode() {
	// Get the deployed OVM contracts.
	const ovmTargets = getTarget({ NETWORK, path, fs, useOvm: true });

	console.log(`Fetching ${NETWORK}-ovm sources from Etherscan...`);
	const etherscanUrl = `https://api-${NETWORK}-optimistic.etherscan.io/api`;

	const tableData = [];
	const deployedContracts = {};
	for (const s of Object.keys(ovmTargets)) {
		const address = ovmTargets[s].address;

		// Get the constructor args from etherscan.
		let response = await axios.get(etherscanUrl, {
			params: {
				module: 'contract',
				action: 'getsourcecode',
				address,
				apikey: process.env.ETHERSCAN_KEY,
			},
		});
		const constructorArgs = response.data.result[0].ConstructorArguments;

		if (response.data.result[0].ABI !== 'Contract source code not verified') {
			// Get the transaction that created the contract with its resulting bytecode.
			response = await axios.get(etherscanUrl, {
				params: {
					module: 'account',
					action: 'txlist',
					address,
					sort: 'asc',
					apikey: process.env.ETHERSCAN_KEY,
				},
			});

			// Get the bytecode that was in that transaction.
			const deployedBytecode = response.data.result[0].input;

			deployedContracts[s] = {
				address: address,
				constructorArgs: constructorArgs,
				deployedBytecode: deployedBytecode,
			};
		} else {
			tableData.push([s, address, 'Contract source code not verified']);
		}
	}

	console.log(`Got ${Object.keys(deployedContracts).length} sources.`);

	const deploymentFile = getPathToNetwork({
		network: NETWORK,
		useOvm: true,
		path,
		file: DEPLOYMENT_FILENAME,
	});
	const deploymentJSON = JSON.parse(fs.readFileSync(deploymentFile));

	console.log(`Writing bytecode to ${deploymentFile}...`);

	// Replace the OVM-compiled bytecode with the post-regenesis (downloaded) bytecode.
	for (const s of Object.keys(deploymentJSON['sources'])) {
		if (deployedContracts[s]) {
			deploymentJSON['sources'][s].bytecode = deployedContracts[s].deployedBytecode;
			tableData.push([s, deployedContracts[s].address, 'Updated Bytecode']);
		}
	}

	// Write the changes to deployment.json.
	fs.writeFileSync(deploymentFile, stringify(deploymentJSON));

	console.log('Done!');
	console.log(table(tableData));
}

updateBytecode();
