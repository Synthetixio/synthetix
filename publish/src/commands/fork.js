'use strict';

const { ensureNetwork } = require('../util');
const { getUsers } = require('../../../index.js');
const ganache = require('ganache-core');

const forkChain = async ({ network }) => {
	ensureNetwork(network);

	console.log(`Forking ${network}...`);

	const protocolDaoAddress = getUsers({ network, user: 'owner' }).address;
	console.log(`Unlocking account ${protocolDaoAddress} (protocolDAO)`);

	const providerUrl = `https://${network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
	const server = ganache.server({
		fork: providerUrl,
		gasLimit: 12e6,
		keepAliveTimeout: 0,
		unlocked_accounts: [protocolDaoAddress],
		logger: console,
		network_id: 1,
	});

	server.listen(8545, (error, state) => {
		if (error) {
			console.error(error);
			process.exit(1);
		} else {
			console.log(`Successfully forked ${network} at block ${state.blockchain.forkBlockNumber}`);

			console.log('gasLimit:', state.options.gasLimit);
			console.log('gasPrice:', state.options.gasPrice);
			console.log('unlocked_accounts:', state.options.unlocked_accounts);

			console.log('Waiting for txs...');
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
			.action(forkChain),
};
