const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const { gray, red, yellow } = require('chalk');
const { wrap, toBytes32 } = require('../../..');
const { confirmAction } = require('../util');
const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadConnections,
} = require('../util');

const connectBridge = async ({
	l1Network,
	l2Network,
	l1ProviderUrl,
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
	// ---------------------------------
	// Setup L1 instance
	// ---------------------------------

	console.log(gray('* Setting up L1 instance...'));
	const {
		AddressResolver: AddressResolverL1,
		SynthetixBridge: SynthetixBridgeToOptimism,
		account: accountL1,
	} = await setupInstance({
		network: l1Network,
		providerUrl: l1ProviderUrl,
		deploymentPath: l1DeploymentPath,
		privateKey: l1PrivateKey,
		useFork: l1UseFork,
		messenger: l1Messenger,
		useOvm: false,
	});

	// ---------------------------------
	// Setup L2 instance
	// ---------------------------------

	console.log(gray('* Setting up L2 instance...'));
	const {
		AddressResolver: AddressResolverL2,
		SynthetixBridge: SynthetixBridgeToBase,
		account: accountL2,
	} = await setupInstance({
		network: l2Network,
		providerUrl: l2ProviderUrl,
		deploymentPath: l2DeploymentPath,
		privateKey: l2PrivateKey,
		useFork: l2UseFork,
		messenger: l2Messenger,
		useOvm: true,
	});

	// ---------------------------------
	// Connect L1 instance
	// ---------------------------------

	console.log(gray('* Connecting bridge on L1...'));
	await connectLayer({
		account: accountL1,
		gasPrice: l1GasPrice,
		gasLimit,
		names: ['ext:Messenger', 'ovm:SynthetixBridgeToBase'],
		addresses: [l1Messenger, SynthetixBridgeToBase.options.address],
		AddressResolver: AddressResolverL1,
		SynthetixBridge: SynthetixBridgeToOptimism,
		dryRun,
	});

	// ---------------------------------
	// Connect L2 instance
	// ---------------------------------

	console.log(gray('* Connecting bridge on L2...'));
	await connectLayer({
		account: accountL2,
		gasPrice: l2GasPrice,
		gasLimit,
		names: ['ext:Messenger', 'base:SynthetixBridgeToOptimism'],
		addresses: [l2Messenger, SynthetixBridgeToOptimism.options.address],
		AddressResolver: AddressResolverL2,
		SynthetixBridge: SynthetixBridgeToBase,
		dryRun,
	});
};

const connectLayer = async ({
	account,
	gasPrice,
	gasLimit,
	names,
	addresses,
	AddressResolver,
	SynthetixBridge,
	dryRun,
}) => {
	// ---------------------------------
	// Check if the AddressResolver has all the correct addresses
	// ---------------------------------

	const filteredNames = [];
	const filteredAddresses = [];
	for (let i = 0; i < names.length; i++) {
		const name = names[i];
		const address = addresses[i];
		console.log(gray(`  * Checking if ${name} is already set to ${address}`));

		const readAddress = await AddressResolver.methods.getAddress(toBytes32(name)).call();

		if (readAddress.toLowerCase() !== address.toLowerCase()) {
			console.log(yellow(`    > ${name} is not set, including it...`));
			filteredNames.push(name);
			filteredAddresses.push(address);
		}
	}

	const needToImportAddresses = filteredNames.length > 0;

	// ---------------------------------
	// Update AddressResolver if needed
	// ---------------------------------

	const params = {
		from: account,
		gasPrice: Web3.utils.toWei(gasPrice.toString(), 'gwei'),
		gas: gasLimit,
	};

	let tx;

	if (needToImportAddresses) {
		const ids = names.map(toBytes32);

		console.log(yellow('  * Setting these values:'));
		names.map((_, idx) => console.log(yellow(`    > ${names[idx]} => ${addresses[idx]}`)));

		if (!dryRun) {
			console.log(
				yellow.inverse(`  * CALLING AddressResolver.importAddresses([${ids}], [${addresses}])`)
			);

			const owner = await AddressResolver.methods.owner().call();
			if (account.toLowerCase() !== owner.toLowerCase()) {
				await confirmAction(
					yellow(
						`    ⚠️  AddressResolver is owned by ${owner} and the current signer is $${account}. Please execute the above transaction and press "y" when done.`
					)
				);
			} else {
				tx = await AddressResolver.methods
					.importAddresses(names.map(toBytes32), addresses)
					.send(params);
				console.log(gray(`    > tx hash: ${tx.transactionHash}`));
			}
		} else {
			console.log(yellow('  * Skipping, since this is a DRY RUN'));
		}
	} else {
		console.log(
			gray('  * Bridge is already does not need to import any addresses in this layer. Skipping...')
		);
	}

	// ---------------------------------
	// Sync cache on bridge if needed
	// ---------------------------------

	let needToSyncCacheOnBridge = needToImportAddresses;
	if (!needToSyncCacheOnBridge) {
		const isResolverCached = await SynthetixBridge.methods.isResolverCached().call();
		if (!isResolverCached) {
			needToSyncCacheOnBridge = true;
		}
	}

	if (needToSyncCacheOnBridge) {
		console.log(yellow('  * Rebuilding caches...'));

		if (!dryRun) {
			console.log(yellow.inverse('  * CALLING SynthetixBridge.rebuildCache()...'));
			tx = await SynthetixBridge.methods.rebuildCache().send(params);
			console.log(gray(`    > tx hash: ${tx.transactionHash}`));
		} else {
			console.log(yellow('  * Skipping, since this is a DRY RUN'));
		}
	} else {
		console.log(gray('  * Bridge cache is synced in this layer. Skipping...'));
	}
};

const setupInstance = async ({
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

	const { web3, getSource, getTarget, providerUrl, account } = bootstrapConnection({
		network,
		providerUrl: specifiedProviderUrl,
		deploymentPath,
		privateKey,
		useFork,
		useOvm,
	});
	console.log(gray('  > provider:', providerUrl));
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
	if (network !== 'local' && !privateKey) {
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
			.option('--l1-provider-url <value>', 'The L1 provider to use', undefined)
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
