const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const assert = require('assert');
const { ensureNetwork, loadConnections, confirmAction } = require('../util');
const { wrap } = require('../../..');

let web3;
let deployer, pdao;
let getTarget, getUsers;
let snx, oldBridge, newBridge, newEscrow;
let txParams;
let migrator;

const migrateBridge = async ({
	network,
	useFork,
	gasPrice
}) => {
	_connect({ network, useFork, gasPrice });
	_identify({ network });

	await confirmAction(chalk.yellow('Deploy the migrator contract?'));
	await _deploy();
	await _verify();

	await confirmAction('Execute the migration?');
	await _execute();
};

async function _execute() {
	const receipt = await migrator.methods.execute().send(txParams);
}

async function _verify() {
	assert(snx === await migrator.methods.snx().call(), 'Unexpected snx address');
	assert(oldBridge === await migrator.methods.oldBridge().call(), 'Unexpected old bridge address');
	assert(newBridge === await migrator.methods.newBridge().call(), 'Unexpected new bridge address');
	assert(newEscrow === await migrator.methods.newEscrow().call(), 'Unexpected new escrow address');
}

async function _deploy() {
	const artifacts = JSON.parse(
		fs.readFileSync('build/artifacts/contracts/BridgeMigrator.sol/BridgeMigrator.json')
	);

	const Migrator = new web3.eth.Contract(artifacts.abi);

	migrator = await Migrator.deploy({
		data: artifacts.bytecode,
		arguments: [
			newBridge,
			newEscrow,
		]
	})
		.send(txParams);
}

function _identify({ network }) {
	const users = getUsers({ network });

	deployer = users.find(u => u.name === 'deployer').address;
	pdao = users.find(u => u.name === 'owner').address;
	console.log(chalk.gray(`Deployer: ${deployer}`));
	console.log(chalk.gray(`pdao: ${pdao}`));

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

	txParams.from = deployer;
}

function _connect({ network, useFork, gasPrice }) {
	ensureNetwork(network);
	console.log(chalk.gray(`Network: ${network}${ useFork ? '(FORKED)' : '' }`));

	if (useFork && network !== 'mainnet') {
		throw new Error('Command can only run on a fork if network is mainnet');
	}

	const { providerUrl, privateKey } = loadConnections({
		network,
		useFork,
	});

	web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

	({ getUsers, getTarget } = wrap({ network, fs, path }));

	txParams = {
		gasPrice: web3.utils.toWei(gasPrice.toString(), 'gwei'),
		gas: 8000000,
	};
	console.log(chalk.gray(`Gas price: ${gasPrice} gwei (${txParams.gasPrice} wei)`));
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
			.action(async (...args) => {
				try {
					await migrateBridge(...args);
				} catch (err) {
					console.error(chalk.red(err));
					process.exitCode = 1;
				}
			}),
};
