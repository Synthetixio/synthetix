require('dotenv').config();

const program = require('commander');
const { green, cyan, red } = require('chalk');
// const { formatEther, formatBytes32String } = require('ethers').utils;
const fs = require('fs');
const path = require('path');
const { setupProvider } = require('./utils');
const { constants, wrap, getTarget, getSource } = require('..');
const inquirer = require('inquirer');

inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

async function interactiveUi({ network, useOvm, providerUrl, addresses }) {
	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Input ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	providerUrl = providerUrl.replace('network', network);
	if (!providerUrl) throw new Error('Cannot set up a provider.');

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Setup ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	// const { provider } = await setupProvider({ providerUrl });

	const { getPathToNetwork } = wrap({ network, useOvm, fs, path });

	const deploymentData = JSON.parse(fs.readFileSync(
		getPathToNetwork({ network, useOvm, file: constants.DEPLOYMENT_FILENAME })
	));

	const targets = Object.keys(deploymentData.targets)

	async function searchTargets(matches, query) {
		matches; // Not needed atm.
		return new Promise(resolve => {
			resolve(
				targets.filter(target => target.includes(query))
			);
		});
	}

	let { contract } = await inquirer.prompt([{
		type: 'autocomplete',
		name: 'contract',
		message: 'Pick a contract',
		source: (matches, query) => searchTargets(matches, query)
	}]);
	// console.log(contract);

	target = await getTarget({ contract, network, useOvm });
	console.log(target);

	const source = await getSource({ contract: target.source, network, useOvm });
	// console.log(source.abi);

	async function searchAbi(matches, query) {
		matches; // Not needed atm.
		return new Promise(resolve => {
			resolve(
				source.abi.filter(item => {
					// console.log(item);

					if (item.name && item.type === 'function') {
						return item.name.includes(query);
					}

					return false;
				})
			);
		});
	}

	let { item } = await inquirer.prompt([{
		type: 'autocomplete',
		name: 'item',
		message: 'Pick a view function',
		source: (matches, query) => searchAbi(matches, query)
	}]);
	console.log(item);
}

program
	.description('Interact with a deployed Synthetix instance from the command line')
	.option('-n, --network <value>', 'The network to run off', x => x.toLowerCase(), 'mainnet')
	.option(
		'-p, --provider-url <value>',
		'The http provider to use for communicating with the blockchain',
		process.env.PROVIDER_URL
	)
	.option('-z, --use-ovm', 'Use an Optimism chain', false)
	.action(async (...args) => {
		try {
			await interactiveUi(...args);
		} catch (err) {
			console.error(red(err));
			console.log(err.stack);

			process.exitCode = 1;
		}
	});

if (require.main === module) {
	require('pretty-error').start();

	program.parse(process.argv);
}
