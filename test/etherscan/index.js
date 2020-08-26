'use strict';

const path = require('path');
const Mocha = require('mocha');

const commander = require('commander');
const program = new commander.Command();

program
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-g, --grep <value>', 'Any grep string')
	.action(async ({ network, grep }) => {
		// setup the network as an env variable
		process.env.ETH_NETWORK = network;

		const mocha = new Mocha({
			timeout: 10e3, // 10 secs
			grep,
		});

		// Add each .js file to the mocha instance
		mocha.addFile(path.join(__dirname, 'spec.js'));

		// Run the tests, this way we can pass CLI args in as env variables
		mocha.run(failures => {
			process.exitCode = failures ? 1 : 0; // exit with non-zero status if there were failures
		});
	});

if (require.main === module) {
	program.parse(process.argv);
}
