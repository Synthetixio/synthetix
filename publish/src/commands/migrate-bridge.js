const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const { gray, red, yellow } = require('chalk');
const { wrap } = require('../../..');
const {
	ensureNetwork,
	confirmAction,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadConnections,
} = require('../util');

const migrateBridge = async ({
	network,
	deploymentPath,
	privateKey,
	useFork,
	gasPrice,
	gasLimit,
}) => {
	let web3, account, getSource, getTarget;

	({ deploymentPath, privateKey, web3, account, getSource, getTarget } = bootstrapConnection({
		network,
		deploymentPath,
		privateKey,
		useFork,
	}));

	console.log(yellow('Configuration...'));
	console.log(gray(`  > Nework: ${deploymentPath}`));
	console.log(gray(`  > Deployment path: ${deploymentPath}`));

	// -----------------------------------
	// Get the old bridge address from versions.js
	// -----------------------------------

	const { getVersions } = wrap({ network, fs, path });

	const bridgeVersions = getVersions({ network, deploymentPath, byContract: true })
		.SynthetixBridgeToOptimism;
	if (bridgeVersions.length < 2) {
		throw new Error(
			red(
				'❌ At least two bridge versions are needed for a migration. Please make sure to deploy new versions before migrating, and that they are registered versions'
			)
		);
	}

	const oldBridgeAddress = bridgeVersions[bridgeVersions.length - 1].address;

	// -----------------------------------
	// Get the new bridge address from deployment.js
	// -----------------------------------

	const newBridgeAddress = getTarget({ deploymentPath, contract: 'SynthetixBridgeToOptimism' });

	// -----------------------------------
	// Ultra-paranoid validation
	// -----------------------------------

	console.log(yellow('Validations...'));

	// Valid address
	if (!web3.utils.isAddress(newBridgeAddress.toLowerCase())) {
		throw new Error(red(`New bridge address ${newBridgeAddress} is invalid`));
	}
	console.log(gray(`  ✅ New bridge address is a valid address`));

	// Is contract
	const code = await web3.eth.getCode(newBridgeAddress);
	if (code === '0x') {
		throw new Error(red(`❌ New bridge address ${newBridgeAddress} is not a contract`));
	}
	console.log(gray(`  ✅ New bridge address is a contract`));

	// Not same address
	const oldBridge = getContract({
		contract: 'SynthetixBridgeToOptimism',
		deploymentPath,
		getTarget,
		getSource,
		address: oldBridgeAddress,
		web3,
	});
	const newBridge = getContract({
		contract: 'SynthetixBridgeToOptimism',
		deploymentPath,
		getTarget,
		getSource,
		address: newBridgeAddress,
		web3,
	});
	if (newBridge.options.address === oldBridge.options.address) {
		throw new Error(red(`❌ New bridge address is the same as the old bridge address`));
	}
	console.log(gray(`  ✅ New bridge address is different than the old bridge address`));

	// Same owner
	const oldOwner = await oldBridge.methods.owner().call();
	const newOwner = await newBridge.methods.owner().call();
	if (newOwner !== oldOwner) {
		throw new Error(red(`❌ New bridge does not have the same owner as the old bridge`));
	}
	console.log(gray(`  ✅ New bridge address owner is the same owner: ${newOwner}`));

	// Correct contract address
	if (newBridgeAddress !== newBridge.options.address) {
		throw new Error(
			red(
				`❌ Something is wrong, newBridgeAddress is ${newBridgeAddress}, and newBridge.options.address is ${newBridge.options.address}`
			)
		);
	}

	// New bridge should not have SNX balance
	// but old bridge should have a positive balance
	const snx = getContract({
		contract: 'Synthetix',
		deploymentPath,
		getTarget,
		getSource,
		web3,
	});
	const newBalance = web3.utils.fromWei(
		await snx.methods.balanceOf(newBridgeAddress).call(),
		'ether'
	);
	if (newBalance > 0) {
		throw new Error(
			red(`❌ New bridge already has a positive SNX balance of ${newBalance.toString()} SNX`)
		);
	}
	const oldBalance = web3.utils.fromWei(
		await snx.methods.balanceOf(oldBridgeAddress).call(),
		'ether'
	);
	if (oldBalance === 0) {
		throw new Error(red('❌ Old bridge balance is zero'));
	}
	console.log(gray(`  ✅ Old bridge has a positive balance: ${oldBalance}`));
	console.log(gray(`  ✅ New bridge has zero balance: ${newBalance}`));

	// New bridge should be activated
	const activated = newBridge.methods.activated().call();
	if (!activated) {
		throw new Error(red('❌ New bridge is not activated'));
	}
	console.log(gray(`  ✅ New bridge is activated`));

	// Resolver addresses
	const newAddresses = newBridge.methods.resolverAddressesRequired().call();
	const oldAddresses = oldBridge.methods.resolverAddressesRequired().call();
	if (newAddresses.toString() !== oldAddresses.toString()) {
		throw new Error(red('❌ Bridge resolver addresses do not match'));
	}
	console.log(gray(`  ✅ Bridge resolver addresses look good`));

	// Signature checks
	const newCode = await web3.eth.getCode(newBridgeAddress);
	function hasFunction(signature) {
		const selector = web3.eth.encodeFunctionSignature(signature);
		const has = newCode.indexOf(selector.slice(2, selector.length)) > 0;
		if (!has) {
			throw new Error(red(`❌ New bridge lacks ${signature} signature`));
		}
	}
	hasFunction('migrateBridge(address)');
	hasFunction('finalizeWithdrawal(address,unit256)');
	hasFunction('depositReward(unit256)');
	hasFunction('deposit(unit256)');
	hasFunction('depositTo(address,unit256)');
	hasFunction('notifyRewardAmount(unit256)');

	// -----------------------------------
	// Confirmation
	// -----------------------------------

	console.log(yellow('Tx params...'));

	// Bridge addresses
	console.log(yellow(`  > New bridge: ${newBridgeAddress}`));
	console.log(yellow(`  > Old bridge: ${oldBridgeAddress}`));

	// Tx params
	const params = {
		gasPrice: web3.utils.toWei(gasPrice.toString(), 'gwei'),
		gas: gasLimit,
		from: account,
	};
	console.log(gray(`  > Gas price to use: ${gasPrice} gwei (${params.gasPrice} wei)`));
	console.log(gray(`  > Gas limit to use: ${gasLimit} wei`));

	// Account
	console.log(gray(`  > Sender account: ${account}`));

	// Confirmation
	try {
		await confirmAction(
			yellow('⚠⚠⚠ WARNING: Youre about to perform the SNX migration. Are you sure?')
		);
	} catch (err) {}

	// -----------------------------------
	// Ok, let's migrate...
	// -----------------------------------

	const tx = await oldBridge.methods.migrateBridge(newBridge.options.address).send(params);
	console.log(tx);
};

const bootstrapConnection = ({ network, deploymentPath, privateKey, useFork }) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network });
	ensureDeploymentPath(deploymentPath);

	const { providerUrl, privateKey: envPrivateKey } = loadConnections({
		network,
		useFork,
	});

	// allow local deployments to use the private key passed as a CLI option
	if (network === 'local' || !privateKey) {
		privateKey = envPrivateKey;
	}

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

	const { getUsers, getTarget, getSource } = wrap({ network, fs, path });

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

const getContract = ({ contract, deploymentPath, getTarget, getSource, web3, address }) => {
	if (!address) {
		const target = getTarget({ deploymentPath, contract });
		if (!target) {
			throw new Error(`Unable to find deployed target for ${contract} in ${deploymentPath}`);
		}

		address = target.address;
	}

	const source = getSource({ deploymentPath, contract });
	if (!source) {
		throw new Error(`Unable to find source for ${contract}`);
	}

	return new web3.eth.Contract(source.abi, address);
};

module.exports = {
	migrateBridge,
	cmd: program =>
		program
			.command('migrate-bridge')
			.description('Migrates snx from an L2 deposit contract into another')
			.option('--network <value>', 'The name of the target network', 'goerli')
			.option('--deployment-path <value>', 'The path of the deployment to target')
			.option('--private-key <value>', 'Optional private key for signing transactions')
			.option('--use-fork', 'Wether to use a fork for the migration', false)
			.option('-g, --gas-price <value>', 'Gas price to set when signing transactions', 1)
			.option('-l, --gas-limit <value>', 'Max gas to use when signing transactions', 8000000)
			.action(async (...args) => {
				try {
					await migrateBridge(...args);
				} catch (err) {
					console.log(err.stack);
					process.exitCode = 1;
				}
			}),
};
