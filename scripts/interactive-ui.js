require('dotenv').config();

const program = require('commander');
const { green, red, cyan, gray } = require('chalk');
const fs = require('fs');
const path = require('path');
const { setupProvider, runTx } = require('./utils');
const { constants, wrap, getTarget, getSource } = require('..');
const inquirer = require('inquirer');
const ethers = require('ethers');
const { toBytes32 } = require('../');
const autocomplete = require('inquirer-list-search-prompt');

async function interactiveUi({ network, useOvm, providerUrl, useFork, gasPrice, gasLimit }) {
	providerUrl = providerUrl.replace('network', network);
	if (!providerUrl) throw new Error('Cannot set up a provider.');

	const { getPathToNetwork, getUsers } = wrap({ network, useOvm, fs, path });

	let publicKey;
	if (useFork) {
		providerUrl = 'http://localhost:8545';
		publicKey = getUsers({ user: 'owner' }).address;
		console.log(gray(`  > Using fork - Signer address: ${publicKey}`));
	}

	const { provider, wallet } = await setupProvider({ providerUrl, publicKey });

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
		console.log(gray(`> ${contractName} => ${target.address}`));

		const contract = new ethers.Contract(target.address, source.abi, wallet || provider);

		// -----------------
		// Pick a function
		// -----------------

		function combineNameAndType(items) {
			const combined = [];
			if (items && items.length > 0) {
				items.map(item => {
					if (item.name) combined.push(`${item.type} ${item.name}`);
					else combined.push(item.type);
				});
			}

			return combined;
		}

		function reduceSignature(item) {
			const inputs = combineNameAndType(item.inputs);
			const inputPart = `${item.name}(${inputs.join(', ')})`;

			const outputs = combineNameAndType(item.outputs);
			let outputPart = outputs.length > 0 ? ` returns(${outputs.join(', ')})` : '';
			outputPart = item.stateMutability === 'view' ? ` view${outputPart}` : outputPart;

			return `${inputPart}${outputPart}`;
		}

		async function searchAbi(matches, query) {
			return new Promise(resolve => {
				const abiMatches = source.abi.filter(item => {
					if (item.name && item.type === 'function') {
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

				let message = name;
				if (input.type === 'bytes32') {
					message = `${message} (uses toBytes32)`;
				}

				const answer = await inquirer.prompt([
					{
						type: 'input',
						message,
						name,
					},
				]);

				let processed = answer[name];
				if (input.type === 'bytes32') {
					processed = toBytes32(processed);
				}

				inputs.push(processed);
			}
		}

		// -----------------
		// Call function
		// -----------------

		const overrides = {
			gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei'),
			gasLimit,
		};

		// Call function
		let result;
		try {
			if (abiItem.stateMutability === 'view') {
				result = await contract[abiItemName](...inputs);
			} else {
				await runTx({
					tx: await contract[abiItemName](...inputs, overrides),
					provider,
				});
			}
		} catch (e) {
			console.error(red(`Error: ${e}`));
		}

		function printResult(result) {
			if (ethers.BigNumber.isBigNumber(result)) {
				return `${result.toString()} (${ethers.utils.formatEther(result)})`;
			} else if (Array.isArray(result)) {
				return result.map(item => `${item}`);
			} else {
				return result;
			}
		}

		if (result !== undefined) {
			if (abiItem.outputs.length > 1) {
				for (let i = 0; i < abiItem.outputs.length; i++) {
					const output = abiItem.outputs[i];
					console.log(cyan(`↪${output.name}(${output.type}):`), printResult(result[i]));
				}
			} else {
				const output = abiItem.outputs[0];
				console.log(cyan(`↪${output.name}(${output.type}):`), printResult(result));
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
	.option('-f, --use-fork', 'Use a local fork', false)
	.option('-g, --gas-price <value>', 'Gas price to set when performing transfers', 1)
	.option('-l, --gas-limit <value>', 'Max gas to use when signing transactions', 8000000)
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
