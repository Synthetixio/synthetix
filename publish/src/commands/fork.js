'use strict';

const { ensureNetwork } = require('../util');
const { getUsers } = require('../../../index.js');
const ganache = require('ganache-core');
const { red, green, gray, yellow } = require('chalk');

const forkChain = async ({ network }) => {
	ensureNetwork(network);

	console.log(gray(`Forking ${network}...`));

	const users = getUsers({ network });

	const fee = users.find(user => user.name === 'fee');
	const zero = users.find(user => user.name === 'zero');

	const pwnedAddresses = users
		.map(user => user.address)
		.filter(address => address !== fee.address)
		.filter(address => address !== zero.address);

	const providerUrl = `https://${network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
	const server = ganache.server({
		fork: providerUrl,
		gasLimit: 12e6,
		keepAliveTimeout: 0,
		unlocked_accounts: pwnedAddresses,
		logger: console,
		network_id: 1,
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
