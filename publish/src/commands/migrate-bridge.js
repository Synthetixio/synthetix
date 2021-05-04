const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const assert = require('assert');
const { ensureNetwork, loadConnections, confirmAction } = require('../util');
const { wrap } = require('../../..');

let signer;
let deployer, pdao;
let getTarget, getUsers;
let snx, oldBridge, newBridge, newEscrow;
let txParams;
let migrator;

const migrateBridge = async ({
	network,
	useFork,
	gasPrice,
	deployedMigrator,
}) => {
	await _connect({ network, useFork, gasPrice });
	_identify({ network });

	await _deploy({ network, deployedMigrator });
	await _verify();

	await _nominate();

	await _execute();
};

async function _nominate() {
	await confirmAction(chalk.yellow(`Please nominate SynthetixBridgeToOptimism (${oldBridge}) ownership to ${migrator.options.address}. When done, press "y" to continue.`));

	await confirmAction(chalk.yellow(`Please nominate SynthetixBridgeEscrow (${newEscrow}) ownership to ${migrator.options.address}. When done, press "y" to continue.`));
}

async function _execute() {
	await confirmAction(chalk.yellow.bold('Execute the migration? (type "y" to continue)'));

	console.log(chalk.gray.bold('Executing the migration...'));

	const tx = await migrator.execute(txParams);
	console.log(chalk.gray(tx.hash));
	const receipt = await tx.wait();
	console.log(chalk.gray(`Gas used: ${receipt.gasUsed.toString()}`));
}

async function _verify() {
	console.log(chalk.gray('Validating contract parameters...'))

	const _snx = await migrator.snx();
	const _oldBridge = await migrator.oldBridge();
	const _newBridge = await migrator.newBridge();
	const _newEscrow = await migrator.newEscrow();
	console.log(`Contract's snx: ${_snx}`)
	console.log(`Contract's old bridge: ${_oldBridge}`)
	console.log(`Contract's new bridge: ${_newBridge}`)
	console.log(`Contract's new escrow: ${_newEscrow}`)

	assert(_snx === snx, 'Unexpected snx address');
	assert(_oldBridge === oldBridge, 'Unexpected old bridge address');
	assert(_newBridge === newBridge, 'Unexpected new bridge address');
	assert(_newEscrow === newEscrow, 'Unexpected new escrow address');
}

async function _deploy({ network, deployedMigrator }) {
	const artifacts = JSON.parse(
		fs.readFileSync('build/artifacts/contracts/BridgeMigrator.sol/BridgeMigrator.json')
	);

	if (!deployedMigrator) {
		await confirmAction(chalk.yellow('Type "y" to deploy the migrator contract'));

		console.log(chalk.gray('Deploying BridgeMigrator...'))

		const Migrator = new ethers.ContractFactory(artifacts.abi, artifacts.bytecode, signer);
		migrator = await Migrator.deploy(
			newBridge,
			newEscrow,
			network,
		  txParams
		);

		const tx = migrator.deployTransaction;
		console.log(chalk.gray(tx.hash));
		const receipt = await migrator.deployTransaction.wait();
		console.log(chalk.gray(`Gas used: ${receipt.gasUsed.toString()}`));
	} else {
		migrator = new ethers.Contract(deployedMigrator, artifacts.abi, signer);
	}

	console.log(chalk.gray(`Migrator: ${migrator.address}`))
}

function _identify({ network }) {
	const users = getUsers({ network });

	deployer = users.find(u => u.name === 'deployer').address;
	pdao = users.find(u => u.name === 'owner').address;
	console.log(chalk.gray(`Deployer: ${deployer}`));
	console.log(chalk.gray(`pDAO: ${pdao}`));

	snx = getTarget({ network, contract: 'Synthetix' }).address;
	newBridge = getTarget({ network, contract: 'SynthetixBridgeToOptimism' }).address;
	newEscrow = getTarget({ network, contract: 'SynthetixBridgeEscrow' }).address;
	console.log(chalk.gray(`Synthetix: ${snx}`));
	console.log(chalk.gray(`New bridge: ${newBridge}`));
	console.log(chalk.gray(`New escrow: ${newEscrow}`));

	if (network === 'mainnet') {
		oldBridge = '0x045e507925d2e05D114534D0810a1abD94aca8d6';
	} else if (network === 'kovan') {
		oldBridge = '0xE8Bf8fe5ce9e15D30F478E1647A57CB6B0271228';
	} else {
		throw new Error('Unsupported network');
	}
	console.log(chalk.gray(`Old bridge: ${oldBridge}`));

	assert(newBridge !== oldBridge, 'Bridge addresses must be different');
}

async function _connect({ network, useFork, gasPrice }) {
	ensureNetwork(network);
	console.log(chalk.gray(`Network: ${network}${ useFork ? '(FORKED)' : '' }`));

	if (useFork && network !== 'mainnet') {
		throw new Error('Command can only run on a fork if network is mainnet');
	}

	const { providerUrl, privateKey } = loadConnections({
		network,
		useFork,
	});
	console.log(chalk.gray(`Provider: ${providerUrl}`))

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);
	signer = new ethers.Wallet(privateKey, provider);
	console.log(chalk.gray(`Signer: ${await signer.getAddress()}`));

	({ getUsers, getTarget } = wrap({ network, fs, path }));

	txParams = {
		gasPrice: ethers.utils.parseUnits(`${gasPrice}`, 'gwei'),
		gasLimit: 8000000,
	};
	console.log(chalk.gray(`Gas price: ${gasPrice} gwei (${txParams.gasPrice.toString()} wei)`));
	console.log(chalk.gray(`Gas limit: ${txParams.gas}`));
}

module.exports = {
	migrateBridge,
	cmd: program =>
		program
			.command('migrate-bridge')
			.description(
				'Migrates a SynthetixBridgeToOptimism (v1) to a SynthetixBridgeToOptimism + SynthetixBridgeEscrow (v2) via a BridgeMigrator contract.'
			)
			.option('--network <value>', 'The target network', network => network.toLowerCase())
			.option('--use-fork', 'Run the migration on a fork of mainnet', false)
			.option('--gas-price <value>', 'Gas price in GWEI to use in all transactions', parseFloat, 100)
			.option('--deployed-migrator <value>', 'Use already deployed migrator contract')
			.action(async (...args) => {
				try {
					await migrateBridge(...args);
				} catch (err) {
					console.error(chalk.red(err));
					console.log(err.stack);
					process.exitCode = 1;
				}
			}),
};
