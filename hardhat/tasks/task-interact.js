const fs = require('fs');
const path = require('path');

const { types, task } = require('hardhat/config');
const levenshtein = require('js-levenshtein');
const ethers = require('ethers');
const inquirer = require('inquirer');
const autocomplete = require('inquirer-list-search-prompt');
const { yellow, green, red, cyan, gray } = require('chalk');
const synthetixPackage = require('../../package.json');
const synthetix = require('../..');

task('interact', 'Interact with a deployed Synthetix instance from the command line')
	.addFlag('useFork', 'Use a local fork')
	.addFlag('useOvm', 'Use an Optimism chain')
	.addOptionalParam('targetNetwork', 'Target the instance deployed in this network', 'mainnet')
	.addOptionalParam('gasLimit', 'Max gas to use when signing transactions', 8000000, types.int)
	.addOptionalParam('privateKey', 'Private key to use to sign txs')
	.addOptionalParam('providerUrl', 'The http provider to use for communicating with the blockchain')
	.addOptionalParam('deploymentPath', 'Specify the path to the deployment data directory')
	.addOptionalParam('blockTag', 'Specify the block tag to interact at, per ethers.js specification')
	.setAction(async (taskArguments, hre) => {
		const { useOvm, useFork, deploymentPath, targetNetwork } = taskArguments;
		let { providerUrl, gasLimit, privateKey, blockTag } = taskArguments;
		// ------------------
		// Default values per network
		// ------------------

		const key = `${targetNetwork}${useOvm ? '-ovm' : ''}`;
		const defaults = DEFAULTS[key];
		providerUrl = providerUrl || defaults.providerUrl;
		if (useOvm) {
			gasLimit = undefined;
		}
		blockTag = blockTag || 'latest';
		if (!isNaN(blockTag)) {
			blockTag = parseInt(blockTag);
		}

		// ------------------
		// Setup
		// ------------------

		// Wrap Synthetix utils for current network
		const { getPathToNetwork, getUsers, getTarget, getSource } = synthetix.wrap({
			network: targetNetwork,
			useOvm,
			fs,
			path,
		});

		// Derive target build path and retrieve deployment artifacts
		const file = synthetix.constants.DEPLOYMENT_FILENAME;
		let deploymentFilePath;
		if (deploymentPath) {
			deploymentFilePath = path.join(deploymentPath, file);
		} else {
			deploymentFilePath = getPathToNetwork({ network: targetNetwork, useOvm, file });
		}
		const deploymentData = JSON.parse(fs.readFileSync(deploymentFilePath));

		// Determine private/public keys
		let publicKey;
		if (useFork) {
			if (!privateKey) {
				publicKey = getUsers({ user: 'owner' }).address;
			}
		}
		const envPrivateKey =
			targetNetwork === 'mainnet'
				? process.env.DEPLOY_PRIVATE_KEY
				: process.env.TESTNET_DEPLOY_PRIVATE_KEY;
		if (!privateKey && envPrivateKey) {
			privateKey = envPrivateKey;
		}

		// Determine provider url
		if (useFork) {
			providerUrl = 'http://localhost:8545';
		}

		if (!providerUrl && process.env.PROVIDER_URL) {
			const envProviderUrl = process.env.PROVIDER_URL;
			if (targetNetwork === 'mainnet' && process.env.PROVIDER_URL_MAINNET) {
				providerUrl = process.env.PROVIDER_URL_MAINNET;
			} else if (envProviderUrl.includes('infura')) {
				providerUrl = process.env.PROVIDER_URL.replace('network', targetNetwork);
			} else {
				providerUrl = envProviderUrl;
			}
		}

		// Construct provider and signer
		const { provider, wallet } = _setupProvider({
			providerUrl,
			privateKey,
			publicKey,
		});

		// Set up inquirer
		inquirer.registerPrompt('autocomplete', autocomplete);

		// Set up cache
		const activeContract = {};
		const recentContracts = [];

		// -----------------
		// Start interaction
		// -----------------

		await _printHeader({
			useOvm,
			providerUrl,
			network: targetNetwork,
			deploymentFilePath,
			wallet,
			blockTag,
		});

		async function pickContract() {
			const targets = Object.keys(deploymentData.targets);

			function prioritizeTarget(itemName) {
				targets.splice(targets.indexOf(itemName), 1);
				targets.unshift(itemName);
			}

			prioritizeTarget('Synthetix');

			async function searchTargets(matches, query = '') {
				return new Promise(resolve => {
					resolve(targets.filter(target => target.toLowerCase().includes(query.toLowerCase())));
				});
			}

			const { contractName } = await inquirer.prompt([
				{
					type: 'autocomplete',
					name: 'contractName',
					message: 'Pick a CONTRACT:',
					source: (matches, query) => searchTargets(matches, query),
				},
			]);

			const target = await getTarget({
				contract: contractName,
				network: targetNetwork,
				useOvm,
				deploymentPath,
			});

			const source = await getSource({
				contract: target.source,
				network: targetNetwork,
				useOvm,
				deploymentPath,
			});

			activeContract.name = contractName;
			activeContract.address = target.address;
			if (!recentContracts.some(entry => entry.name === contractName)) {
				recentContracts.push({ ...activeContract });
			}

			_printCheatsheet({ activeContract, recentContracts, wallet });

			const contract = new ethers.Contract(target.address, source.abi, wallet || provider);
			if (source.bytecode === '') {
				const code = await provider.getCode(target.address, blockTag);
				console.log(red(`  > No code at ${target.address}, code: ${code}`));
			}

			// -----------------
			// Pick a function
			// -----------------

			async function pickFunction() {
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

					return `${inputPart}${outputPart} ${gray(item.signature)}`;
				}

				const escItem = '↩ BACK';

				async function searchAbi(matches, query = '') {
					return new Promise(resolve => {
						let abiMatches = source.abi.filter(item => {
							if (item.name && item.type === 'function') {
								return item.name.toLowerCase().includes(query.toLowerCase());
							}

							return false;
						});

						// Sort matches by proximity to query
						abiMatches = abiMatches.sort((a, b) => {
							const aProximity = levenshtein(a.name, query);
							const bProximity = levenshtein(b.name, query);
							return aProximity - bProximity;
						});

						const signatures = abiMatches.map(match => reduceSignature(match));
						if (query === '') {
							signatures.splice(0, 0, escItem);
						}

						resolve(signatures);
					});
				}

				// Prompt function to call
				const prompt = inquirer.prompt([
					{
						type: 'autocomplete',
						name: 'abiItemSignature',
						message: '>>> Pick a FUNCTION:',
						source: (matches, query) => searchAbi(matches, query),
					},
				]);
				const { abiItemSignature } = await prompt;

				if (abiItemSignature === escItem) {
					prompt.ui.close();

					await pickContract();
				}

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
							message = `${message} (uses toBytes32${
								isArray ? ' - if array, use ["a","b","c"] syntax' : ''
							})`;
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
							try {
								processed = JSON.parse(processed);
							} catch (err) {
								console.log(red(`Error parsing array input. Please use the indicated syntax.`));

								await pickFunction();
							}
						}

						if (requiresBytes32Util) {
							if (isArray) {
								processed = processed.map(item => _bytes32ify(item));
							} else {
								processed = _bytes32ify(processed);
							}
						}

						if (isArray) {
							processed = processed.map(value => _boolify(value));
						} else {
							processed = _boolify(processed);
						}

						console.log(
							gray(`  > processed inputs (${isArray ? processed.length : '1'}):`, processed)
						);

						inputs.push(processed);
					}
				}

				// -----------------
				// Call function
				// -----------------

				// Call function
				let result, error;
				// READ ONLY
				if (abiItem.stateMutability === 'view' || abiItem.stateMutability === 'pure') {
					console.log(gray('  > Querying...'));
					const overrides = {
						blockTag,
					};

					try {
						result = await contract[abiItemName](...inputs, overrides);
					} catch (err) {
						error = err;
					}
					// SEND TX
				} else {
					const overrides = {
						gasLimit,
					};

					let preview;
					try {
						preview = await contract.populateTransaction[abiItemName](...inputs, overrides);
					} catch (err) {
						console.log(yellow(`Warning: tx will probably fail!`));
					}
					if (preview && preview.data) {
						console.log(gray(`  > calldata: ${preview.data}`));
					}

					const { confirmation } = await inquirer.prompt([
						{
							type: 'confirm',
							name: 'confirmation',
							message: 'Send transaction?',
						},
					]);
					if (!confirmation) {
						await pickFunction();

						return;
					}

					console.log(gray(`  > Staging transaction... ${new Date()}`));
					const txPromise = contract[abiItemName](...inputs, overrides);
					result = await _sendTx({
						txPromise,
					});

					if (result.success) {
						console.log(gray(`  > Sending transaction... ${result.tx.hash}`));
						result = await _confirmTx({
							tx: result.tx,
							provider,
							blockTag,
						});

						if (result.success) {
							result = result.receipt;
						} else {
							error = result.error;
						}
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
					_logError(error);
				} else {
					_logReceipt(result, contract);

					if (
						(abiItem.stateMutability === 'view' || abiItem.stateMutability === 'pure') &&
						result !== undefined
					) {
						if (Array.isArray(result) && result.length === 0) {
							console.log(gray(`  ↪ Call returned no data`));
						} else {
							if (abiItem.outputs.length > 1) {
								for (let i = 0; i < abiItem.outputs.length; i++) {
									const output = abiItem.outputs[i];
									console.log(
										cyan(`  ↪${output.name}(${output.type}):`),
										printReturnedValue(result[i])
									);
								}
							} else {
								const output = abiItem.outputs[0];
								console.log(cyan(`  ↪${output.name}(${output.type}):`), printReturnedValue(result));
							}
						}
					}
				}

				// Call indefinitely
				await pickFunction();
			}

			// First function pick
			await pickFunction();
		}

		// First contract pick
		await pickContract();
	});

const DEFAULTS = {
	mainnet: {},
	'mainnet-ovm': {
		providerUrl: 'https://mainnet.optimism.io',
	},
	kovan: {},
	'kovan-ovm': {
		providerUrl: 'https://kovan.optimism.io',
	},
	'kovan-ovm-futures': {
		providerUrl: 'https://kovan.optimism.io',
		gasPrice: undefined,
	},
	local: {
		providerUrl: 'http://localhost:9545',
	},
	'local-ovm': {
		providerUrl: 'http://localhost:8545',
	},
	rinkeby: {},
	ropsten: {},
};

async function _printHeader({
	useOvm,
	providerUrl,
	network,
	deploymentFilePath,
	wallet,
	blockTag,
}) {
	console.clear();
	console.log(green(`Interactive Synthetix CLI (v${synthetixPackage.version})`));
	console.log(gray('Please review this information before you interact with the system:'));
	console.log(
		gray('================================================================================')
	);
	console.log(
		gray(
			`> Provider: ${providerUrl ? `${providerUrl.slice(0, 25)}...` : 'Ethers default provider'}`
		)
	);
	console.log(gray(`> Network: ${network}`));
	console.log(gray(`> Gas price: provider default`));
	console.log(gray(`> OVM: ${useOvm}`));
	console.log(gray(`> Block tag: ${blockTag}`));
	console.log(yellow(`> Target deployment: ${path.dirname(deploymentFilePath)}`));

	if (wallet) {
		console.log(yellow(`> Signer: ${wallet.address || wallet}`));
	} else {
		console.log(gray('> Read only'));
	}

	console.log(
		gray('================================================================================')
	);
	console.log('\n');
}

function _printCheatsheet({ activeContract, recentContracts, wallet }) {
	console.log(gray.inverse(`${activeContract.name} => ${activeContract.address}`));
	console.log(gray(`  * Signer: ${wallet ? `${wallet.address}` : 'Read only'}`));

	console.log(gray('  * Recent contracts:'));
	for (let i = 0; i < recentContracts.length; i++) {
		const contract = recentContracts[i];
		console.log(gray(`    ${contract.name}: ${contract.address}`));
	}
}

function _bytes32ify(value) {
	if (ethers.utils.isHexString(value)) {
		console.log('isHex');
		return value;
	} else {
		return synthetix.toBytes32(value);
	}
}

// Avoid 'false' and '0' being interpreted as bool = true
function _boolify(value) {
	if (value === 'false' || value === '0') return 0;
	return value;
}

function _logReceipt(receipt, contract) {
	console.log(green('  ✅ Success'));
	// console.log('receipt', JSON.stringify(receipt, null, 2));

	// Print tx hash
	if (receipt.transactionHash) console.log(gray(`    tx hash: ${receipt.transactionHash}`));

	// Print gas used
	if (receipt.gasUsed) {
		console.log(gray(`    gas used: ${receipt.gasUsed.toString()}`));
	}

	// Print emitted events
	if (contract && receipt.logs && receipt.logs.length > 0) {
		for (let i = 0; i < receipt.logs.length; i++) {
			const log = receipt.logs[i];

			try {
				const parsedLog = contract.interface.parseLog(log);
				console.log(gray(`    log ${i}:`), cyan(parsedLog.name));
			} catch (err) {
				console.log(gray(`    log ${i}: unable to decode log - ${JSON.stringify(log)}`));
			}
		}
	}
}

function _logError(error) {
	console.log(red('  ❌ Error'));

	function findReason(error) {
		if (typeof error === 'string') {
			return error;
		} else {
			if (error.hasOwnProperty('reason')) {
				return error.reason;
			} else if (error.hasOwnProperty('error')) {
				return findReason(error.error);
			}
		}
	}

	const reason = findReason(error);
	if (reason) console.log(red(`    Reason: ${reason}`));

	console.log(gray(JSON.stringify(error, null, 2)));
}

function _setupProvider({ providerUrl, privateKey, publicKey }) {
	let provider;
	if (providerUrl) {
		provider = new ethers.providers.JsonRpcProvider(providerUrl);
	} else {
		// eslint-disable-next-line new-cap
		provider = new ethers.getDefaultProvider();
	}

	let wallet;
	if (publicKey) {
		wallet = provider.getSigner(publicKey);
		wallet.address = publicKey;
	} else if (privateKey) {
		wallet = new ethers.Wallet(privateKey, provider);
	}

	return {
		provider,
		wallet: wallet || undefined,
	};
}

async function _sendTx({ txPromise }) {
	try {
		const tx = await txPromise;

		return {
			success: true,
			tx,
		};
	} catch (error) {
		return {
			success: false,
			error,
		};
	}
}

async function _confirmTx({ tx, provider, blockTag }) {
	try {
		const receipt = await tx.wait();

		return {
			success: true,
			receipt,
		};
	} catch (error) {
		try {
			error.reason = await _getRevertReason({ tx, provider, blockTag });

			return {
				success: false,
				error,
			};
		} catch (suberror) {
			error.error = suberror;

			return {
				success: false,
				error,
			};
		}
	}
}

function _hexToString(hex) {
	let str = '';

	const terminator = '**zÛ';
	for (var i = 0; i < hex.length; i += 2) {
		str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));

		if (str.includes(terminator)) {
			break;
		}
	}

	return str.substring(0, str.length - 4);
}

async function _getRevertReason({ tx, provider, blockTag }) {
	const code = (await provider.call(tx, blockTag)).substr(138);
	const hex = `0x${code}`;

	if (code.length === '64') {
		return ethers.utils.parseBytes32String(hex);
	} else {
		return _hexToString(hex);
	}
}
