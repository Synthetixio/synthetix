const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { gray, red, yellow } = require('chalk');
const {
	wrap,
	toBytes32,
	constants: { OVM_GAS_PRICE_GWEI },
} = require('../../..');
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
	l1GasLimit,
}) => {
	// ---------------------------------
	// Setup L1 instance
	// ---------------------------------

	console.log(gray('* Setting up L1 instance...'));
	const {
		wallet: walletL1,
		AddressResolver: AddressResolverL1,
		SynthetixBridge: SynthetixBridgeToOptimism,
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
		wallet: walletL2,
		AddressResolver: AddressResolverL2,
		SynthetixBridge: SynthetixBridgeToBase,
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
		wallet: walletL1,
		gasPrice: l1GasPrice,
		gasLimit: l1GasLimit,
		names: ['ext:Messenger', 'ovm:SynthetixBridgeToBase'],
		addresses: [l1Messenger, SynthetixBridgeToBase.address],
		AddressResolver: AddressResolverL1,
		SynthetixBridge: SynthetixBridgeToOptimism,
		dryRun,
	});

	// ---------------------------------
	// Connect L2 instance
	// ---------------------------------

	console.log(gray('* Connecting bridge on L2...'));
	await connectLayer({
		wallet: walletL2,
		gasPrice: OVM_GAS_PRICE_GWEI,
		gasLimit: undefined,
		names: ['ext:Messenger', 'base:SynthetixBridgeToOptimism'],
		addresses: [l2Messenger, SynthetixBridgeToOptimism.address],
		AddressResolver: AddressResolverL2,
		SynthetixBridge: SynthetixBridgeToBase,
		dryRun,
	});
};

const connectLayer = async ({
	wallet,
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

		const readAddress = await AddressResolver.getAddress(toBytes32(name));

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
		gasPrice: ethers.utils.parseUnits(gasPrice.toString(), 'gwei'),
		gas: gasLimit,
	};

	let tx, receipt;

	if (needToImportAddresses) {
		const ids = names.map(toBytes32);

		console.log(yellow('  * Setting these values:'));
		names.map((_, idx) => console.log(yellow(`    > ${names[idx]} => ${addresses[idx]}`)));

		if (!dryRun) {
			console.log(
				yellow.inverse(`  * CALLING AddressResolver.importAddresses([${ids}], [${addresses}])`)
			);

			const owner = await AddressResolver.owner();
			if (wallet.address.toLowerCase() !== owner.toLowerCase()) {
				await confirmAction(
					yellow(
						`    ⚠️  AddressResolver is owned by ${owner} and the current signer is $${wallet.address}. Please execute the above transaction and press "y" when done.`
					)
				);
			} else {
				tx = await AddressResolver.importAddresses(names.map(toBytes32), addresses, params);
				receipt = await tx.wait();
				console.log(gray(`    > tx hash: ${receipt.transactionHash}`));
			}
		} else {
			console.log(yellow('  * Skipping, since this is a DRY RUN'));
		}
	} else {
		console.log(
			gray('  * Bridge does not need to import any addresses in this layer. Skipping...')
		);
	}

	// ---------------------------------
	// Sync cache on bridge if needed
	// ---------------------------------

	let needToSyncCacheOnBridge = needToImportAddresses;
	if (!needToSyncCacheOnBridge) {
		const isResolverCached = await SynthetixBridge.isResolverCached();
		if (!isResolverCached) {
			needToSyncCacheOnBridge = true;
		}
	}

	if (needToSyncCacheOnBridge) {
		console.log(yellow('  * Rebuilding caches...'));

		if (!dryRun) {
			console.log(yellow.inverse('  * CALLING SynthetixBridge.rebuildCache()...'));
			tx = await SynthetixBridge.rebuildCache(params);
			receipt = await tx.wait();
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

	const { wallet, provider, getSource, getTarget } = bootstrapConnection({
		network,
		providerUrl: specifiedProviderUrl,
		deploymentPath,
		privateKey,
		useFork,
		useOvm,
	});
	console.log(gray('  > provider:', provider.url));
	console.log(gray('  > account:', wallet.address));

	const AddressResolver = getContract({
		contract: 'AddressResolver',
		getTarget,
		getSource,
		deploymentPath,
		wallet,
	});
	console.log(gray('  > AddressResolver:', AddressResolver.address));

	const bridgeName = useOvm ? 'SynthetixBridgeToBase' : 'SynthetixBridgeToOptimism';
	const SynthetixBridge = getContract({
		contract: bridgeName,
		getTarget,
		getSource,
		deploymentPath,
		wallet,
	});
	console.log(gray(`  > ${bridgeName}:`, SynthetixBridge.address));

	return {
		wallet,
		AddressResolver,
		SynthetixBridge,
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
	const provider = new ethers.providers.WebSocketProvider(providerUrl);

	const { getUsers, getTarget, getSource } = wrap({ network, useOvm, fs, path });

	let wallet;
	if (useFork) {
		const account = getUsers({ network, user: 'owner' }).address;
		wallet = provider.getSigner(account);
	} else {
		wallet = new ethers.Wallet(privateKey, provider);
	}

	return {
		deploymentPath,
		providerUrl,
		privateKey,
		provider,
		wallet,
		getTarget,
		getSource,
		getUsers,
	};
};

const getContract = ({ contract, deploymentPath, getTarget, getSource, wallet }) => {
	const target = getTarget({ deploymentPath, contract });
	if (!target) {
		throw new Error(`Unable to find deployed target for ${contract} in ${deploymentPath}`);
	}

	const source = getSource({ deploymentPath, contract });
	if (!source) {
		throw new Error(`Unable to find source for ${contract}`);
	}

	return new ethers.Contract(target.address, source.abi, wallet);
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
			.option('--l1-gas-price <value>', 'Gas price to set when performing transfers in L1', 1)
			.option('--l1-gas-limit <value>', 'Max gas to use when signing transactions to l1', 8000000)
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
