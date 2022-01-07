'use strict';

const solidity = require('./solidity.js');
// const ovmIgnored = require('../ovm-ignore.json');

const data = {
	kovan: require('../deployed/kovan'),
	mainnet: require('../deployed/mainnet'),
	'kovan-ovm': require('../deployed/kovan-ovm'),
	'mainnet-ovm': require('../deployed/mainnet-ovm'),
};

const DEPLOYMENT_FILENAME = 'deployment.json';

const getFolderNameForNetwork = ({ network, useOvm = false }) => {
	if (network.includes('ovm')) {
		return network;
	}

	return useOvm ? `${network}-ovm` : network;
};

const getPathToNetwork = ({ network = 'mainnet', file = '', useOvm = false, path } = {}) =>
	path.join(__dirname, 'publish', 'deployed', getFolderNameForNetwork({ network, useOvm }), file);

// Pass in fs and path to avoid webpack wrapping those
const loadDeploymentFile = ({ network, path, fs, deploymentPath, useOvm = false }) => {
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

/*
 * Retrieve the list of solidity sources for the network - returning the abi and bytecode
 */
const getSource = ({
	network = 'mainnet',
	useOvm = false,
	contract,
	path,
	fs,
	deploymentPath,
} = {}) => {
	const deployment = loadDeploymentFile({ network, useOvm, path, fs, deploymentPath });
	if (contract) return deployment.sources[contract];
	else return deployment.sources;
};

/*
 * Update deployment.json to replace all the bytecode with the evm versions.
 * Post OVM 2.0 regenesis cleanup for kovan and mainnet.
 */
module.exports = {
	migrateBytecode({ network = 'kovan', path, fs } = {}) {
		// 1. Get the sources that are deployed on the OVM.
		// Get the deployed bytecode from etherscan. (remove constuctor args)
		// TODO: Make sure all the contracts are properly verified.

		const ovmSources = getSource({ network, path, fs, useOvm: true });

		// TODO: Use getSource or getTarget? 🤔
		// 2. Compile each OVM contract source with the solc EVM compiler.
		const sources = {};
		Object.keys(ovmSources).forEach(s => {
			sources[s + '.sol'] = {
				urls: s,
			};
		});

		const { artifacts, errors, warnings } = solidity.compile({
			sources, // TODO: how to format this
			runs: 200,
			useOvm: false,
		});
		console.log(errors);
		console.log(warnings);
		console.log(artifacts);

		// 3. Replace the OVM-compiled bytecode with the newly EVM-compiled bytcode.

		/*
		for (const sourceKey of Object.keys(ovmSources)) {
			console.log(sourceKey);
			const evmBytecode = evmSources[sourceKey].bytecode;
			ovmSources[sourceKey].bytecode = evmBytecode;	
		}
		*/
	},
};

module.exports.migrateBytecode();
