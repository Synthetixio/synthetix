'use strict';

const { ensureNetwork } = require('../util');
const { getUsers, networkToChainId } = require('../../..');
const ganache = require('ganache-core');
const { red, green, gray, yellow } = require('chalk');
const path = require('path');
const fs = require('fs');

const dbPath = '.db/';

const forkChain = async ({ network, reset }) => {
	ensureNetwork(network);

	const dbNetworkPath = path.join(dbPath, network);

	if (reset) {
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
		.filter(address => address !== zero.address);

	const providerUrl = process.env.PROVIDER_URL.replace('network', network);
	const server = ganache.server({
		fork: providerUrl,
		gasLimit: 12e6,
		mnemonic: 'ability air report ranch fiber derive impulse wheat design raccoon moon upset',
		keepAliveTimeout: 0,
		unlocked_accounts: pwnedAddresses,
		logger: console,
		network_id: chainId,
		db_path: `.db/${network}/`,
		default_balance_ether: 100000,
	});

	server.listen(8545, (error, state) => {
		if (error) {
			console.error(error);
			process.exit(1);
		} else {
			console.log(
				yellow(`Successfully forked ${network} at block ${state.blockchain.forkBlockNumber}`)
			);

			console.log(gray('gasLimit:', state.options.gasLimit));
			console.log(gray('gasPrice:', state.options.gasPrice));
			console.log(green('unlocked_accounts:', state.options.unlocked_accounts));

			console.log(gray('Waiting for txs...'));
		}
	});
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
			.option('-r, --reset', 'Reset local database', false)
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
