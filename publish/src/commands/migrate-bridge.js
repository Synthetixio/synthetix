const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const chalk = require('chalk');
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

	console.log(chalk.yellow('Configuration...'));
	console.log(chalk.gray(`  > Network: ${network}`));
	console.log(chalk.gray(`  > Deployment path: ${deploymentPath}`));

	// -----------------------------------
	// Get the old bridge address from versions.js
	// -----------------------------------

	const { getVersions } = wrap({ network, fs, path });

	const bridgeVersions = getVersions({ network, deploymentPath, byContract: true })
		.SynthetixBridgeToOptimism;
	if (bridgeVersions.length < 1) {
		throw new Error(
			chalk.red(
				'❌ Unable to find old bridge version. Old version needs to exist in versions.json.'
			)
		);
	}

	const oldBridgeAddress = bridgeVersions[bridgeVersions.length - 1].address;

	// -----------------------------------
	// Get the new bridge address from deployment.js
	// -----------------------------------

	const newBridgeData = getTarget({ deploymentPath, contract: 'SynthetixBridgeToOptimism' });
	if (!newBridgeData) {
		throw new Error(
			chalk.red(
				'❌ Unable to find new bridge version. New version needs to exist in deployments.json.'
			)
		);
	}
	const newBridgeAddress = newBridgeData.address;

	// -----------------------------------
	// Ultra-paranoid validation
	// -----------------------------------

	console.log(chalk.yellow('Validations...'));

	// Valid address
	if (!web3.utils.isAddress(newBridgeAddress.toLowerCase())) {
		throw new Error(chalk.red(`New bridge address ${newBridgeAddress} is invalid`));
	}
	console.log(chalk.gray(`  ✅ New bridge address is a valid address`));

	// Is contract
	const code = await web3.eth.getCode(newBridgeAddress);
	if (code === '0x') {
		throw new Error(chalk.red(`❌ New bridge address ${newBridgeAddress} is not a contract`));
	}
	console.log(chalk.gray(`  ✅ New bridge address is a contract`));

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
		throw new Error(chalk.red(`❌ New bridge address is the same as the old bridge address`));
	}
	console.log(chalk.gray(`  ✅ New bridge address is different than the old bridge address`));

	// Same owner
	const oldOwner = await oldBridge.methods.owner().call();
	const newOwner = await newBridge.methods.owner().call();
	if (newOwner !== oldOwner) {
		throw new Error(chalk.red(`❌ New bridge does not have the same owner as the old bridge`));
	}
	console.log(chalk.gray(`  ✅ New bridge address owner is the same owner: ${newOwner}`));

	// Correct contract address
	if (newBridgeAddress !== newBridge.options.address) {
		throw new Error(
			chalk.red(
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
	let newBalance = web3.utils.fromWei(
		await snx.methods.balanceOf(newBridgeAddress).call(),
		'ether'
	);
	if (newBalance > 0) {
		throw new Error(
			chalk.red(`❌ New bridge already has a positive SNX balance of ${newBalance.toString()} SNX`)
		);
	}
	let oldBalance = web3.utils.fromWei(
		await snx.methods.balanceOf(oldBridgeAddress).call(),
		'ether'
	);
	if (oldBalance === 0) {
		throw new Error(chalk.red('❌ Old bridge balance is zero'));
	}
	console.log(chalk.gray(`  ✅ Old bridge has a positive balance: ${oldBalance}`));
	console.log(chalk.gray(`  ✅ New bridge has zero balance: ${newBalance}`));

	// New bridge should be activated
	const activated = newBridge.methods.activated().call();
	if (!activated) {
		throw new Error(chalk.red('❌ New bridge is not activated'));
	}
	console.log(chalk.gray(`  ✅ New bridge is activated`));

	// Resolver addresses
	const newAddresses = newBridge.methods.resolverAddressesRequired().call();
	const oldAddresses = oldBridge.methods.resolverAddressesRequired().call();
	if (newAddresses.toString() !== oldAddresses.toString()) {
		throw new Error(chalk.red('❌ Bridge resolver addresses do not match'));
	}
	console.log(chalk.gray(`  ✅ Bridge resolver addresses match old bridge resolver addresses`));

	// Signature checks
	const newCode = await web3.eth.getCode(newBridgeAddress);
	function hasFunction(signature) {
		const selector = web3.eth.abi.encodeFunctionSignature(signature);
		const has = newCode.indexOf(selector.slice(2, selector.length)) > 0;

		if (!has) {
			throw new Error(chalk.red(`❌ New bridge lacks function ${signature}`));
		}

		console.log(chalk.gray(`  ✅ New bridge has function ${signature}`));
	}
	hasFunction('migrateBridge(address)');
	hasFunction('finalizeWithdrawal(address,uint256)');
	hasFunction('depositReward(uint256)');
	hasFunction('deposit(uint256)');
	hasFunction('depositTo(address,uint256)');
	hasFunction('notifyRewardAmount(uint256)');

	// -----------------------------------
	// Confirmation
	// -----------------------------------

	console.log(chalk.yellow('Tx params...'));

	// Bridge addresses
	console.log(chalk.yellow.inverse(`  > Old bridge: ${oldBridgeAddress} - ${oldBalance} SNX`));
	console.log(chalk.yellow.inverse(`  > New bridge: ${newBridgeAddress} - ${newBalance} SNX`));

	// Tx params
	const params = {
		gasPrice: web3.utils.toWei(gasPrice.toString(), 'gwei'),
		gas: gasLimit,
		from: account,
	};
	console.log(chalk.gray(`  > Gas price to use: ${gasPrice} gwei (${params.gasPrice} wei)`));
	console.log(chalk.gray(`  > Gas limit to use: ${gasLimit} wei`));

	// Account
	console.log(chalk.gray(`  > Sender account: ${account}`));

	// Confirmation
	console.log(chalk.red.bold(`⚠⚠⚠ WARNING: Youre about to perform the SNX migration!!!`));
	const msg = `SynthetixBridgeToOptimism<${oldBridge.options.address}>.migrateBridge(${newBridge.options.address})`;
	console.log(chalk.yellow(`Will call ${msg}`));
	try {
		await confirmAction(chalk.yellow.inverse('Continue?'));
	} catch (err) {}

	// -----------------------------------
	// Ok, let's migrate...
	// -----------------------------------

	console.log(chalk.yellow(`Calling ${msg}`));

	const tx = await oldBridge.methods.migrateBridge(newBridge.options.address).send(params);

	console.log(chalk.green(`Tx executed ${tx.hash}`));
	console.log(chalk.gray(JSON.stringify(tx, null, 2)));

	oldBalance = web3.utils.fromWei(await snx.methods.balanceOf(oldBridgeAddress).call(), 'ether');
	newBalance = web3.utils.fromWei(await snx.methods.balanceOf(newBridgeAddress).call(), 'ether');

	console.log(chalk.yellow.inverse(`  > Old bridge: ${oldBridgeAddress} - ${oldBalance} SNX`));
	console.log(chalk.yellow.inverse(`  > New bridge: ${newBridgeAddress} - ${newBalance} SNX`));
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
