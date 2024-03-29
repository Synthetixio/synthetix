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

async function deployInstance({
	addNewSynths,
	buildPath,
	signer,
	freshDeploy,
	generateSolidity = false,
	ignoreCustomParameters = false,
	network,
	skipFeedChecks = true,
	useFork = false,
	useOvm,
	provider,
}) {
	await commands.deploy({
		addNewSynths,
		buildPath,
		concurrency: 1,
		freshDeploy: freshDeploy,
		generateSolidity,
		ignoreCustomParameters,
		network,
		signer: signer,
		skipFeedChecks,
		useFork,
		useOvm,
		provider,
		maxFeePerGas: 100,
		maxPriorityFeePerGas: 2,
		yes: true,
	});
}

async function deploy(runtime, networkVariant) {
	if (
		networkVariant !== 'local' &&
		networkVariant !== 'local-ovm' &&
		networkVariant !== hre.network.name
	) {
		throw new Error(
			`Wrong network: set to "${networkVariant}". It should be "${hre.network.name}".`
		);
	}

	let network = networkVariant;
	let useOvm = false;
	if (networkVariant.endsWith('-ovm')) {
		useOvm = true;
		network = networkVariant.slice(0, networkVariant.length - 4);
	}
	const buildPath = path.join(__dirname, '..', synthetix.constants.BUILD_FOLDER);

	// get the signer that we want to have for the deployer
	let cannonSigner = await runtime.getDefaultSigner({});
	try {
		// if cannon can give us the signer for the owner address, we should use that
		const ownerAddress = synthetix.getUsers({ network, useOvm, user: 'owner' }).address;
		cannonSigner = await runtime.getSigner(ownerAddress);
	} catch (err) {
		// otherwise we want to use the cannon default signer, which is set above
		console.log(err);
	}

	const provider = new hre.ethers.providers.Web3Provider(runtime.provider);
	const signer = provider.getSigner(cannonSigner.address);

	await deployInstance({
		addNewSynths: true,
		buildPath,
		useOvm,
		network,
		freshDeploy: networkVariant.startsWith('local'),
		provider,
		signer,
	});

	// pull deployed contract information

	const allTargets = synthetix.getTarget({ fs, path, network, useOvm });

	const contracts = {};
	for (const [name, target] of Object.entries(allTargets)) {
		try {
			const artifactData = await runtime.getArtifact(target.source);
			contracts[name] = {
				address: target.address,
				sourceName: artifactData.sourceName,
				contractName: artifactData.contractName,
				abi: synthetix.getSource({ fs, path, network, useOvm, contract: target.source }).abi,
				deployTxn: target.txn,
			};
		} catch (e) {
			console.log(e);
		}
	}

	return { contracts };
}

if (module === require.main) {
	deploy();
}

module.exports = {
	deploy,
};
