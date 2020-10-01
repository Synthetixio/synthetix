require('dotenv').config();

const path = require('path');
const program = require('commander');
const { green, red } = require('chalk');
const fs = require('fs');
const { setupProvider } = require('./utils');
const { constants, wrap, getTarget, getSource } = require('..');
const inquirer = require('inquirer');
const ethers = require('ethers');
const autocomplete = require('inquirer-list-search-prompt');

async function interactiveUi({ network, useOvm, providerUrl }) {
	providerUrl = providerUrl.replace('network', network);
	if (!providerUrl) throw new Error('Cannot set up a provider.');

	const { provider } = await setupProvider({ providerUrl });

	const { getPathToNetwork } = wrap({ network, useOvm, fs, path });

	const deploymentData = JSON.parse(
		fs.readFileSync(getPathToNetwork({ network, useOvm, file: constants.DEPLOYMENT_FILENAME }))
	);

	inquirer.registerPrompt('autocomplete', autocomplete);

	async function interact() {
		console.log(green('()==[:::::::::::::> What is your query?'));

		// -----------------
		// Pick a contract
		// -----------------

		const targets = Object.keys(deploymentData.targets);

		function prioritizeTarget(itemName) {
			targets.splice(targets.indexOf(itemName), 1);
			targets.unshift(itemName);
		}

		prioritizeTarget('Synthetix');

		async function searchTargets(matches, query) {
			return new Promise(resolve => {
				resolve(targets.filter(target => target.includes(query)));
			});
		}

		const { contractName } = await inquirer.prompt([
			{
				type: 'autocomplete',
				name: 'contractName',
				message: 'Pick a contract:',
				source: (matches, query) => searchTargets(matches, query),
			},
		]);

		const target = await getTarget({ contract: contractName, network, useOvm });
		const source = await getSource({ contract: target.source, network, useOvm });

		const contract = new ethers.Contract(target.address, source.abi, provider);

		// -----------------
		// Pick a function
		// -----------------

		function reduceSignature(item) {
			const inputs = [];
			if (item.inputs && item.inputs.length > 0) {
				item.inputs.map(input => inputs.push(`${input.type} ${input.name}`));
			}

			return `${item.name}(${inputs.join(', ')})`;
		}

		async function searchAbi(matches, query) {
			return new Promise(resolve => {
				const abiMatches = source.abi.filter(item => {
					if (item.name && item.type === 'function' && item.stateMutability === 'view') {
						return item.name.includes(query);
					}
					return false;
				});

				resolve(abiMatches.map(match => reduceSignature(match)));
			});
		}

		// Prompt function to call
		const { abiItemSignature } = await inquirer.prompt([
			{
				type: 'autocomplete',
				name: 'abiItemSignature',
				message: 'Pick a function:',
				source: (matches, query) => searchAbi(matches, query),
			},
		]);

		const abiItemName = abiItemSignature.split('(')[0];
		const abiItem = source.abi.find(item => item.name === abiItemName);

		// -----------------
		// Process inputs
		// -----------------

		// Prompt inputs for function
		const inputs = [];
		if (abiItem.inputs.length > 0) {
			for (const input of abiItem.inputs) {
				const name = input.name || input.type;

				const answer = await inquirer.prompt([
					{
						type: 'input',
						message: `${name}:`,
						name,
					},
				]);

				inputs.push(answer[name]);
			}
		}

		// -----------------
		// Call function
		// -----------------

		// Call function
		let result;
		try {
			result = await contract[abiItemName](...inputs);
		} catch (e) {
			console.error(red(`Error: ${e}`));
		}

		function printResult(result) {
			if (ethers.BigNumber.isBigNumber(result)) {
				return result.toString();
			} else {
				return result;
			}
		}

		if (result !== undefined) {
			let idx = 0;
			for (const output of abiItem.outputs) {
				const value = Array.isArray(result) ? result[idx] : result;
				idx++;

				console.log(`↪${output.name}(${output.type}): ${printResult(value)}`);
			}
		}

		// Call indefinitely
		await interact();
	}

	// First call
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
