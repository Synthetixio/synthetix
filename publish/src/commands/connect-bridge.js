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
	l2ProviderUrl,
	l1DeploymentPath,
	l2DeploymentPath,
	l1PrivateKey,
	l2PrivateKey,
	l1UseFork,
	l2UseFork,
	l1Messenger,
	l2Messenger,
	dryRun,
	l1GasPrice,
	l2GasPrice,
	gasLimit,
}) => {
	console.log(gray('> Connecting with L1 instance...'));
	const {
		AddressResolver: AddressResolverL1,
		SynthetixBridge: SynthetixBridgeToOptimism,
		account: accountL1,
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
		account: accountL2,
	} = await connectInstance({
		network: l2Network,
		providerUrl: l2ProviderUrl,
		deploymentPath: l2DeploymentPath,
		privateKey: l2PrivateKey,
		useFork: l2UseFork,
		messenger: l2Messenger,
		useOvm: true,
	});

	let tx;
	let names;
	let addresses;

	console.log(gray('> Connecting bridge on L1...'));
	names = ['ext:Messenger', 'ovm:SynthetixBridgeToBase'];
	addresses = [l1Messenger, SynthetixBridgeToBase.options.address];
	console.log(gray(names, addresses));
	if (!dryRun) {
		const params = {
			from: accountL1,
			gasPrice: Web3.utils.toWei(l1GasPrice.toString(), 'gwei'),
			gas: gasLimit,
		};
		console.log(gray('> tx params:', JSON.stringify(params)));

		console.log('AddressResolverL1.importAddresses()...');
		tx = await AddressResolverL1.methods
			.importAddresses(names.map(toBytes32), addresses)
			.send(params);
		console.log(JSON.stringify(tx, null, 2));

		console.log('SynthetixBridgeToOptimism.setResolverAndSyncCache()...');
		tx = await SynthetixBridgeToOptimism.methods
			.setResolverAndSyncCache(AddressResolverL1.options.address)
			.send(params);
		console.log(JSON.stringify(tx, null, 2));
	}

	console.log(gray('> Connecting bridge on L2...'));
	names = ['ext:Messenger', 'base:SynthetixBridgeToOptimism'];
	addresses = [l2Messenger, SynthetixBridgeToOptimism.options.address];
	console.log(gray(names, addresses));
	if (!dryRun) {
		const params = {
			from: accountL2,
			gasPrice: Web3.utils.toWei(l2GasPrice.toString(), 'gwei'),
			gas: gasLimit,
		};
		console.log(gray('> tx params:', JSON.stringify(params)));

		console.log('AddressResolverL2.importAddresses()...');
		tx = await AddressResolverL2.methods
			.importAddresses(names.map(toBytes32), addresses)
			.send(params);
		console.log(JSON.stringify(tx, null, 2));

		console.log('SynthetixBridgeToBase.setResolverAndSyncCache()...');
		tx = await SynthetixBridgeToBase.methods
			.setResolverAndSyncCache(AddressResolverL2.options.address)
			.send(params);
		console.log(JSON.stringify(tx, null, 2));
	}
};

const connectInstance = async ({
	network,
	providerUrl: specifiedProviderUrl,
	deploymentPath,
	privateKey,
	useFork,
	useOvm,
}) => {
	console.log(gray('  > network:', network));
	console.log(gray('  > deploymentPath:', deploymentPath));
	console.log(gray('  > privateKey:', privateKey));
	console.log(gray('  > useFork:', useFork));
	console.log(gray('  > useOvm:', useOvm));

	const { web3, getSource, getTarget, providerUrl } = bootstrapConnection({
		network,
		providerUrl: specifiedProviderUrl,
		deploymentPath,
		privateKey,
		useFork,
		useOvm,
	});
	console.log(gray('  > provider:', providerUrl));

	let account;
	if (privateKey) {
		web3.eth.accounts.wallet.add(privateKey);
		web3.eth.defaultAccount = web3.eth.accounts.wallet[0].address;
		account = web3.eth.defaultAccount;
	}
	console.log(gray('  > account:', account));

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
		account,
	};
};

const bootstrapConnection = ({
	network,
	providerUrl: specifiedProviderUrl,
	deploymentPath,
	privateKey,
	useFork,
	useOvm,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	const { providerUrl: defaultProviderUrl, privateKey: envPrivateKey } = loadConnections({
		network,
		useFork,
	});

	// allow local deployments to use the private key passed as a CLI option
	if (network === 'local' || !privateKey) {
		privateKey = envPrivateKey;
	}

	const providerUrl = specifiedProviderUrl || defaultProviderUrl;
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
		providerUrl,
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
			.option('--l2-provider-url <value>', 'The L2 provider to use', 'https://goerli.optimism.io')
			.option('--l1-deployment-path <value>', 'The path of the L1 deployment to target')
			.option('--l2-deployment-path <value>', 'The path of the L2 deployment to target')
			.option('--l1-private-key <value>', 'Optional private key for signing L1 transactions')
			.option('--l2-private-key <value>', 'Optional private key for signing L2 transactions')
			.option('--l1-use-fork', 'Wether to use a fork for the L1 connection', false)
			.option('--l2-use-fork', 'Wether to use a fork for the L2 connection', false)
			.option('--l1-messenger <value>', 'L1 cross domain messenger to use')
			.option('--l2-messenger <value>', 'L2 cross domain messenger to use')
			.option('-g, --l1-gas-price <value>', 'Gas price to set when performing transfers in L1', 1)
			.option('-g, --l2-gas-price <value>', 'Gas price to set when performing transfers in L2', 1)
			.option('-l, --gas-limit <value>', 'Max gas to use when signing transactions', 8000000)
			.option('--dry-run', 'Do not execute any transactions')
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
