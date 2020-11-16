const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const { gray, red } = require('chalk');
const { wrap, toBytes32 } = require('../../..');
const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadConnections,
} = require('../util');

const connectBridge = async ({
	l1Network,
	l2Network,
	l1DeploymentPath,
	l2DeploymentPath,
	l1PrivateKey,
	l2PrivateKey,
	l1UseFork,
	l2UseFork,
	l1Messenger,
	l2Messenger,
}) => {
	console.log(gray('> Connecting with L1 instance...'));
	const {
		AddressResolver: AddressResolverL1,
		SynthetixBridge: SynthetixBridgeToOptimism,
	} = await connectInstance({
		network: l1Network,
		deploymentPath: l1DeploymentPath,
		privateKey: l1PrivateKey,
		useFork: l1UseFork,
		messenger: l1Messenger,
		useOvm: false,
	});

	console.log(gray('> Connecting with L2 instance...'));
	const {
		AddressResolver: AddressResolverL2,
		SynthetixBridge: SynthetixBridgeToBase,
	} = await connectInstance({
		network: l2Network,
		deploymentPath: l2DeploymentPath,
		privateKey: l2PrivateKey,
		useFork: l2UseFork,
		messenger: l2Messenger,
		useOvm: true,
	});

	console.log(gray('> Connecting bridge on L1...'));
	await AddressResolverL1.importAddresses(
		[toBytes32('ext:Messenger'), toBytes32('ovm:SynthetixBridgeToBase')],
		l1Messenger,
		SynthetixBridgeToBase.options.address
	);
	await SynthetixBridgeToBase.setResolverAndSyncCache(AddressResolverL1.options.address);

	console.log(gray('> Connecting bridge on L2...'));
	await AddressResolverL2.importAddresses(
		[toBytes32('ext:Messenger'), toBytes32('base:SynthetixBridgeToOptimism')],
		l2Messenger,
		SynthetixBridgeToOptimism.options.address
	);
	await SynthetixBridgeToOptimism.setResolverAndSyncCache(AddressResolverL2.options.address);
};

const connectInstance = async ({ network, deploymentPath, privateKey, useFork, useOvm }) => {
	console.log(gray('  > network:', network));
	console.log(gray('  > deploymentPath:', deploymentPath));
	console.log(gray('  > privateKey:', privateKey));
	console.log(gray('  > useFork:', useFork));
	console.log(gray('  > useOvm:', useOvm));

	const { web3, getSource, getTarget } = bootstrapConnection({
		network,
		deploymentPath,
		privateKey,
		useFork,
		useOvm,
	});

	const AddressResolver = getContract({
		contract: 'AddressResolver',
		getTarget,
		getSource,
		deploymentPath,
		web3,
	});
	console.log(gray('  > AddressResolver:', AddressResolver.options.address));

	const bridgeName = useOvm ? 'SynthetixBridgeToBase' : 'SynthetixBridgeToOptimism';
	const SynthetixBridge = getContract({
		contract: bridgeName,
		getTarget,
		getSource,
		deploymentPath,
		web3,
	});
	console.log(gray(`  > ${bridgeName}:`, SynthetixBridge.options.address));

	return {
		AddressResolver,
		SynthetixBridge,
	};
};

const bootstrapConnection = ({ network, deploymentPath, privateKey, useFork, useOvm }) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	const { providerUrl, privateKey: envPrivateKey } = loadConnections({
		network,
		useFork,
	});

	// allow local deployments to use the private key passed as a CLI option
	if (network !== 'local' || !privateKey) {
		privateKey = envPrivateKey;
	}

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

	const { getUsers, getTarget, getSource } = wrap({ network, useOvm, fs, path });

	let account;
	if (useFork) {
		account = getUsers({ network, user: 'owner' }).address; // protocolDAO
	} else {
		web3.eth.accounts.wallet.add(privateKey);
		account = web3.eth.accounts.wallet[0].address;
	}

	return {
		deploymentPath,
		privateKey,
		web3,
		account,
		getTarget,
		getSource,
		getUsers,
	};
};

const getContract = ({ contract, deploymentPath, getTarget, getSource, web3 }) => {
	const target = getTarget({ deploymentPath, contract });
	if (!target) {
		throw new Error(`Unable to find deployed target for ${contract} in ${deploymentPath}`);
	}

	const source = getSource({ deploymentPath, contract });
	if (!source) {
		throw new Error(`Unable to find source for ${contract}`);
	}

	return new web3.eth.Contract(source.abi, target.address);
};

module.exports = {
	connectBridge,
	cmd: program =>
		program
			.command('connect-bridge')
			.description('Configures the bridge between an L1-L2 instance pair.')
			.option('--l1-network <value>', 'The name of the target L1 network', 'goerli')
			.option('--l2-network <value>', 'The name of the target L2 network', 'goerli')
			.option('--l1-deployment-path <value>', 'The path of the L1 deployment to target')
			.option('--l2-deployment-path <value>', 'The path of the L2 deployment to target')
			.option('--l1-private-key <value>', 'Optional private key for signing L1 transactions')
			.option('--l2-private-key <value>', 'Optional private key for signing L2 transactions')
			.option('--l1-use-fork', 'Wether to use a fork for the L1 connection', false)
			.option('--l2-use-fork', 'Wether to use a fork for the L2 connection', false)
			.option('--l1-messenger <value>', 'L1 cross domain messenger to use')
			.option('--l2-messenger <value>', 'L2 cross domain messenger to use')
			.action(async (...args) => {
				try {
					await connectBridge(...args);
				} catch (err) {
					console.error(red(err));
					console.log(err.stack);
					process.exitCode = 1;
				}
			}),
};
