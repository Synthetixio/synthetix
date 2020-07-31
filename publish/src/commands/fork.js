'use strict';

const ganache = require('ganache-core');

const forkChain = async ({ network, blockNumber }) => {
	// TODO: Remove or improve
	console.log('Forking:', network, 'at:', blockNumber);

	// TODO: Validate incoming network?

	const providerUrl = `https://${network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
	const server = ganache.server({
		fork: providerUrl,
		gasLimit: 12e6,
		unlocked_accounts: [
			'0xeb3107117fead7de89cd14d463d340a2e6917769', // Synthetix protocolDAO
		],
		logger: console.log, // TODO: Pipe ganache output to command output?
		network_id: 1, // TODO: Dynamically set according to network?
	});

	// TODO: port as option.
	// TODO: what is "blockchain"?
	server.listen(8445, (error, chain) => {
		if (error) {
			console.error(error);
			process.exit(1);
		} else {
			console.log('Forked chain running...', chain);
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
			.option(
				'-b, --block-number <value>',
				'Block number to perform the fork on. Latest block is used if -1.',
				-1
			)
			.action(forkChain),
};
