const fs = require('fs');
const hre = require('hardhat');

const path = require('path');

const synthetix = require('..');

const commands = {
	build: require('./src/commands/build').build,
	deploy: require('./src/commands/deploy').deploy,
	prepareDeploy: require('./src/commands/prepare-deploy').prepareDeploy,
	connectBridge: require('./src/commands/connect-bridge').connectBridge,
};

async function prepareDeploy(...args) {
	await commands.prepareDeploy(...args);
}

async function deployInstance({
	addNewSynths,
	buildPath,
	freshDeploy = true,
	generateSolidity = false,
	ignoreCustomParameters = false,
	network = 'local',
	skipFeedChecks = true,
	useFork = false,
	useOvm,
	provider,
}) {
	const privateKey = (await hre.ethers.getSigners())[0].privateKey;

	await commands.deploy({
		addNewSynths,
		buildPath,
		concurrency: 1,
		freshDeploy,
		generateSolidity,
		ignoreCustomParameters,
		network,
		privateKey,
		skipFeedChecks,
		useFork,
		useOvm,
		providerUrl: provider.connection.url,
		maxFeePerGas: 1,
		maxPriorityFeePerGas: 1,
		yes: true,
	});
}

async function deploy(runtime, networkVariant) {
	const network = 'local';

	if (networkVariant !== 'mainnet' && networkVariant !== 'optimism') {
		throw new Error(
			`invalid network specified "${networkVariant}". please use either "mainnet" or "optimism" to specify the network variant to deploy.`
		);
	}

	const useOvm = networkVariant === 'optimism';
	const buildPath = path.join(__dirname, '..', synthetix.constants.BUILD_FOLDER);

	// prepare the synths but skip preparing releases (as this isn't a fork)
	const synthsToAdd = [{ name: 'sREDEEMER', asset: 'USD' }];
	// const synthsToAdd = [];
	await prepareDeploy({ network, synthsToAdd, useOvm, useReleases: false, useSips: false });
	await deployInstance({
		addNewSynths: true,
		buildPath,
		useOvm,
		provider: runtime.provider,
	});

	// pull deployed contract information

	const allTargets = synthetix.getTarget({ fs, path, network, useOvm });

	const contracts = {};
	Object.entries(allTargets).map(([name, target]) => {
		contracts[name] = {
			address: target.address,
			abi: synthetix.getSource({ fs, path, network, useOvm, contract: target.source }).abi,
			deployTxn: target.txn,
		};
	});

	return { contracts };
}

if (module === require.main) {
	deploy();
}

module.exports = {
	deploy,
};
