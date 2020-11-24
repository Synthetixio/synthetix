'use strict';

const { ensureNetwork, loadConnections } = require('../util');
const { getUsers, networkToChainId } = require('../../..');
const { red, gray, yellow } = require('chalk');
const path = require('path');
const fs = require('fs');

const hre = require('hardhat');

const dbPath = '.db/';

const forkChain = async ({ network, reset, providerUrl, unlockAccounts = [] }) => {
	ensureNetwork(network);

	const dbNetworkPath = path.join(dbPath, network);

	if (reset && fs.existsSync(dbPath)) {
		console.log(yellow(`Clearing database at ${dbNetworkPath}!`));

		fs.rmdirSync(dbPath, { recursive: true });
	}

	const chainId = networkToChainId[network];
	console.log(gray(`Forking ${network} (id=${chainId})...`));

	const users = getUsers({ network });

	const fee = users.find(user => user.name === 'fee');
	const zero = users.find(user => user.name === 'zero');

	const pwnedAddresses = users
		.map(user => user.address)
		.filter(address => address !== fee.address)
		.filter(address => address !== zero.address)
		.concat(unlockAccounts);

	const { providerUrl: envProviderUrl } = loadConnections({ network });

	if (!providerUrl) {
		if (!envProviderUrl) {
			throw new Error('Missing .env key of PROVIDER_URL. Please add and retry.');
		}

		providerUrl = envProviderUrl;
	}

	// NOTEs:
	// 1. No reset support
	// 2. No network support

	await hre.run('node', { fork: providerUrl, unlockedAccounts: pwnedAddresses.join(',') });
};

module.exports = {
	forkChain,
	cmd: program =>
		program
			.command('fork')
			.description('Starts a local chain, forking the specified network.')
			.option(
				'-n, --network <value>',
				'Network name. E.g: mainnet, ropsten, rinkeby, etc.',
				'mainnet'
			)
			.option(
				'-p, --provider-url <value>',
				'Ethereum network provider URL. If default, will use PROVIDER_URL found in the .env file.'
			)
			.option('-r, --reset', 'Reset local database', false)
			.option(
				'-u, --unlock-accounts <account>',
				'Unlock a specific account (or accounts, comma-delimit no space)',
				input => input.split(','),
				[]
			)
			.action(async (...args) => {
				try {
					await forkChain(...args);
				} catch (err) {
					// show pretty errors for CLI users
					console.error(red(err));
					process.exitCode = 1;
				}
			}),
};
