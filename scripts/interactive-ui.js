require('dotenv').config();

const program = require('commander');
const { green, cyan, red } = require('chalk');
// const { formatEther, formatBytes32String } = require('ethers').utils;
const fs = require('fs');
const path = require('path');
const { setupProvider } = require('./utils');
const { constants, wrap, getTarget, getSource } = require('..');
const inquirer = require('inquirer');
const ethers = require('ethers');

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

	const { provider } = await setupProvider({ providerUrl });

	const { getPathToNetwork } = wrap({ network, useOvm, fs, path });

	const deploymentData = JSON.parse(fs.readFileSync(
		getPathToNetwork({ network, useOvm, file: constants.DEPLOYMENT_FILENAME })
	));

	async function interact() {
		const targets = Object.keys(deploymentData.targets)

		async function searchTargets(matches, query) {
			matches; // Not needed atm.
			return new Promise(resolve => {
				resolve(
					targets.filter(target => target.includes(query))
				);
			});
		}

		let { contractName } = await inquirer.prompt([{
			type: 'autocomplete',
			name: 'contractName',
			message: 'Pick a contract',
			source: (matches, query) => searchTargets(matches, query)
		}]);

		const target = await getTarget({ contract: contractName, network, useOvm });
		// console.log(target);

		const source = await getSource({ contract: target.source, network, useOvm });
		// console.log(JSON.stringify(source.abi, null, 2));

		async function searchAbi(matches, query) {
			matches; // Not needed atm.
			return new Promise(resolve => {
				resolve(
					source.abi.filter(item => {
						if (item.name && item.type === 'function' && item.stateMutability === 'view') {
							return item.name.includes(query);
						}
						return false;
					})
				);
			});
		}

		let { abiItemName } = await inquirer.prompt([{
			type: 'autocomplete',
			name: 'abiItemName',
			message: 'Pick a view function',
			source: (matches, query) => searchAbi(matches, query)
		}]);

		const abiItem = source.abi.find(item => item.name === abiItemName);
		// console.log(JSON.stringify(abiItem, null, 2));

		const contract = new ethers.Contract(target.address, source.abi, provider);

		const inputs = [];
		if (abiItem.inputs.length > 0) {
			for (const input of abiItem.inputs) {
				const answer = await inquirer.prompt([{
					type: 'input',
					message: `${input.name}:`,
					name: input.name,
				}]);

				inputs.push(answer[input.name]);
			}

			// console.log('inputs', inputs);
		}

		const result = await contract[abiItemName](...inputs);

		if (ethers.BigNumber.isBigNumber(result)) {
			console.log(ethers.utils.formatEther(result));
		} else {
			console.log(result);
		}

		await interact();
	}

	await interact();
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
