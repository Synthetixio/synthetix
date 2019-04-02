#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const program = require('commander');
require('pretty-error').start();

const getDeployment = ({ network = 'mainnet', contract }) => {
	const pathToDeployment = path.join(__dirname, 'publish', 'deployed', network, 'deployment.json');
	if (!fs.existsSync(pathToDeployment)) {
		throw Error(`Cannot find deployment for network: ${network}.`);
	}
	const deployment = JSON.parse(fs.readFileSync(pathToDeployment));

	if (contract) return deployment[contract];
	else return deployment;
};

module.exports = { getDeployment };

program
	.command('get')
	.description('Get deployed files for an environment')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
	.option('-c, --contract [value]', 'The name of the contract')
	.option('-k, --key [value]', 'A specific key wanted')
	.action(async ({ network, contract, key }) => {
		const deployment = getDeployment({ network, contract });
		console.log(JSON.stringify(key in deployment ? deployment[key] : deployment, null, 2));
	});

// perform as CLI tool if args given
if (process.argv.length > 1) {
	program.parse(process.argv);
}
