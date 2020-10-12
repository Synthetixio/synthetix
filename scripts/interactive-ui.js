require('dotenv').config();

const program = require('commander');
const { yellow, green, red, cyan, gray } = require('chalk');
const fs = require('fs');
const path = require('path');
const { setupProvider, runTx, logReceipt, logError } = require('./utils');
const { constants, wrap } = require('..');
const inquirer = require('inquirer');
const ethers = require('ethers');
const { toBytes32 } = require('../');
const autocomplete = require('inquirer-list-search-prompt');

async function interactiveUi({
	network,
	useOvm,
	providerUrl,
	useFork,
	gasPrice,
	gasLimit,
	deploymentPath,
	privateKey,
}) {
	console.clear();
	console.log('\n');
	console.log(cyan('Please review this information before you interact with the system:'));
	console.log(
		gray('================================================================================')
	);

	providerUrl = providerUrl.replace('network', network);
	if (!providerUrl) throw new Error('Cannot set up a provider.');
	console.log(gray(`> Provider: ${providerUrl}`));

	const { getPathToNetwork, getUsers, getTarget, getSource } = wrap({ network, useOvm, fs, path });

	let publicKey;
	if (useFork) {
		providerUrl = 'http://localhost:8545';
		publicKey = getUsers({ user: 'owner' }).address;
		console.log(gray(`> Using fork - Signer address: ${publicKey}`));
	}

	const { provider, wallet } = setupProvider({ providerUrl, privateKey, publicKey });

	const file = constants.DEPLOYMENT_FILENAME;

	let deploymentFilePath;
	if (deploymentPath) {
		deploymentFilePath = path.join(deploymentPath, file);
	} else {
		deploymentFilePath = getPathToNetwork({ network, useOvm, file });
	}

	console.log(gray(`> Network: ${network}`));
	console.log(gray(`> Gas price: ${gasPrice}`));
	console.log(gray(`> OVM: ${useOvm}`));
	console.log(yellow(`> Target deployment: ${path.dirname(deploymentFilePath)}`));
	if (wallet) {
		console.log(yellow(`> Signer: ${wallet.address || wallet}`));
	} else console.log(gray('> Read only'));

	const deploymentData = JSON.parse(fs.readFileSync(deploymentFilePath));

	inquirer.registerPrompt('autocomplete', autocomplete);

	console.log(
		gray('================================================================================')
	);
	console.log('\n');

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

		const target = await getTarget({ contract: contractName, network, useOvm, deploymentPath });
		const source = await getSource({ contract: target.source, network, useOvm, deploymentPath });
		console.log(gray(`  > ${contractName} => ${target.address}`));

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

				const requiresBytes32Util = input.type.includes('bytes32');
				const isArray = input.type.includes('[]');

				if (requiresBytes32Util) {
					message = `${message} (uses toBytes32${isArray ? ' - if array, use a,b,c syntax' : ''})`;
				}

				const answer = await inquirer.prompt([
					{
						type: 'input',
						message,
						name,
					},
				]);

				let processed = answer[name];
				console.log(gray('  > raw inputs:', processed));

				if (isArray) {
					processed = processed.split(',');
				}

				if (requiresBytes32Util) {
					if (isArray) {
						processed = processed.map(item => toBytes32(item));
					} else {
						processed = toBytes32(processed);
					}
				}
				console.log(gray(`  > processed inputs (${isArray ? processed.length : '1'}):`, processed));

				inputs.push(processed);
			}
		}

		// -----------------
		// Call function
		// -----------------

		const overrides = {
			gasPrice: ethers.utils.parseUnits(`${gasPrice}`, 'gwei'),
			gasLimit,
		};

		// Call function
		let result, error;
		if (abiItem.stateMutability === 'view') {
			console.log(gray(`  > Querying...`));

			try {
				result = await contract[abiItemName](...inputs);
			} catch (err) {
				error = err;
			}
		} else {
			const { confirmation } = await inquirer.prompt([
				{
					type: 'confirm',
					name: 'confirmation',
					message: 'Send transaction?',
				},
			]);
			if (!confirmation) await interact();

			console.log(gray(`  > Sending transaction... ${new Date()}`));
			const txPromise = contract[abiItemName](...inputs, overrides);

			result = await runTx({
				txPromise,
				provider,
			});

			if (result.success) {
				result = result.receipt;
			} else {
				error = result.error;
			}
		}

		function printReturnedValue(value) {
			if (ethers.BigNumber.isBigNumber(value)) {
				return `${value.toString()} (${ethers.utils.formatEther(value)})`;
			} else if (Array.isArray(value)) {
				return value.map(item => `${item}`);
			} else {
				return value;
			}
		}

		console.log(gray(`  > Transaction sent... ${new Date()}`));

		if (error) {
			logError(error);
		} else {
			logReceipt(result, contract);

			if (abiItem.stateMutability === 'view' && result !== undefined) {
				if (abiItem.outputs.length > 1) {
					for (let i = 0; i < abiItem.outputs.length; i++) {
						const output = abiItem.outputs[i];
						console.log(cyan(`  ↪${output.name}(${output.type}):`), printReturnedValue(result[i]));
					}
				} else {
					const output = abiItem.outputs[0];
					console.log(cyan(`  ↪${output.name}(${output.type}):`), printReturnedValue(result));
				}
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
	.option('-k, --private-key <value>', 'Private key to use to sign txs')
	.option('-l, --gas-limit <value>', 'Max gas to use when signing transactions', 8000000)
	.option('-n, --network <value>', 'The network to run off', x => x.toLowerCase(), 'mainnet')
	.option(
		'-p, --provider-url <value>',
		'The http provider to use for communicating with the blockchain',
		process.env.PROVIDER_URL
	)
	.option('-y, --deployment-path <value>', 'Specify the path to the deployment data directory')
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
