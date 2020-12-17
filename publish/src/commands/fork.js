'use strict';

const { ensureNetwork, loadConnections } = require('../util');
const { wrap, networkToChainId } = require('../../..');
const { red, gray } = require('chalk');
const fs = require('fs');
const path = require('path');

const hre = require('hardhat');

const forkChain = async ({ network, providerUrl, unlockAccounts = [] }) => {
	if (network !== 'mainnet') {
		throw new Error(`Hardhat does not support forking ${network}`);
	}

	ensureNetwork(network);

	const chainId = networkToChainId[network];
	console.log(gray(`Forking ${network} (id=${chainId})...`));

	const { getUsers } = wrap({ network, fs, path });
	const users = getUsers({ network });

	const fee = users.find(user => user.name === 'fee');
	const zero = users.find(user => user.name === 'zero');

	const unlockedAccounts = users
		.map(user => user.address)
		.filter(address => address !== fee.address)
		.filter(address => address !== zero.address)
		.concat(unlockAccounts)
		.join(',');

	const { providerUrl: envProviderUrl } = loadConnections({ network });

	if (!providerUrl) {
		if (!envProviderUrl) {
			throw new Error('Missing .env key of PROVIDER_URL. Please add and retry.');
		}

		providerUrl = envProviderUrl;
	}

	await hre.run('node', { fork: providerUrl, unlockedAccounts });
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
