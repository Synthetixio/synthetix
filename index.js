#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const program = require('commander');
require('pretty-error').start();

const loadDeploymentFile = ({ network }) => {
	const pathToDeployment = path.join(__dirname, 'publish', 'deployed', network, 'deployment.json');
	if (!fs.existsSync(pathToDeployment)) {
		throw Error(`Cannot find deployment for network: ${network}.`);
	}
	return JSON.parse(fs.readFileSync(pathToDeployment));
};
const getTarget = ({ network = 'mainnet', contract }) => {
	const deployment = loadDeploymentFile({ network });
	if (contract) return deployment.targets[contract];
	else return deployment.targets;
};

const getSource = ({ network = 'mainnet', contract }) => {
	const deployment = loadDeploymentFile({ network });
	if (contract) return deployment.sources[contract];
	else return deployment.sources;
};

const getSynths = () => {
	const pathToSynthList = path.join(__dirname, 'publish', 'synths.json');
	if (!fs.existsSync(pathToSynthList)) {
		throw Error(`Cannot find synth list.`);
	}
	return JSON.parse(fs.readFileSync(pathToSynthList));
};

module.exports = { getTarget, getSource, getSynths };

program
	.command('target')
	.description('Get deployed target files for an environment')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
	.option('-c, --contract [value]', 'The name of the contract')
	.option('-k, --key [value]', 'A specific key wanted')
	.action(async ({ network, contract, key }) => {
		const target = getTarget({ network, contract });
		console.log(JSON.stringify(key in target ? target[key] : target, null, 2));
	});

program
	.command('source')
	.description('Get source files for an environment')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
	.option('-c, --contract [value]', 'The name of the contract')
	.option('-k, --key [value]', 'A specific key wanted')
	.action(async ({ network, contract, key }) => {
		const source = getSource({ network, contract });
		console.log(JSON.stringify(key in source ? source[key] : source, null, 2));
	});

program
	.command('synths')
	.description('Get the list of synths')
	.action(async () => {
		console.log(JSON.stringify(getSynths()));
	});

// perform as CLI tool if args given
if (process.argv.length > 1) {
	program.parse(process.argv);
}
