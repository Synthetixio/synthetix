const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const { ensureNetwork, loadConnections } = require('../util');
const { wrap } = require('../../..');

let web3;
let deployer, pdao;
let getTarget, getUsers;
let snx, newBridge, newEscrow;

const migrateBridge = async ({ network, useFork }) => {
	_connect({ network, useFork });
	_identify({ network });
};

function _identify({ network }) {
	const users = getUsers({ network });

	deployer = users.deployer;
	pdao = users.owner;

	snx = getTarget({ network, contract: 'Synthetix' }).address;
	newBridge = getTarget({ network, contract: 'SynthetixBridgeToOptimism' }).address;
	newEscrow = getTarget({ network, contract: 'SynthetixBridgeEscrow' }).address;
}

function _connect({ network, useFork }) {
	ensureNetwork(network);

	if (useFork && network !== 'mainnet') {
		throw new Error('Command can only run on a fork if network is mainnet');
	}

	const { providerUrl, privateKey } = loadConnections({
		network,
		useFork,
	});

	web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

	({ getUsers, getTarget } = wrap({ network, fs, path }));

	if (useFork) {
		account = getUsers({ network, user: 'deployer' }).address;
	} else {
		web3.eth.accounts.wallet.add(privateKey);
		account = web3.eth.accounts.wallet[0].address;
	}
}

module.exports = {
	migrateBridge,
	cmd: program =>
		program
			.command('migrate-bridge')
			.description(
				'Migrates a SynthetixBridgeToOptimism (v1) to a SynthetixBridgeToOptimism + SynthetixBridgeEscrow (v2) via a BridgeMigrator contract.'
			)
			.option('--network <value>', 'The target network', network => network.toLowerCase(), 'kovan')
			.option('--use-fork', 'Run the migration on a fork of mainnet', false)
			.action(async (...args) => {
				try {
					await migrateBridge(...args);
				} catch (err) {
					console.error(red(err));
					console.log(err.stack);
					process.exitCode = 1;
				}
			}),
};
