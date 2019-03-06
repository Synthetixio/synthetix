'use strict';

const path = require('path');
const fs = require('fs');
const program = require('commander');
const { gray, green, yellow, red } = require('chalk');
const { table } = require('table');
require('pretty-error').start();
require('dotenv').config();
const axios = require('axios');
const qs = require('querystring');
const solc = require('solc');

const { findSolFiles, flatten, compile } = require('./solidity');
const Deployer = require('./deployer');

const COMPILED_FOLDER = 'compiled';
const FLATTENED_FOLDER = 'flattened';
const ZERO_ADDRESS = '0x' + '0'.repeat(40);

const ensureNetwork = network => {
	if (!/^(kovan|rinkeby|ropsten|mainnet)$/.test(network)) {
		throw Error(
			`Invalid network name of "${network}" supplied. Must be one of kovan, rinkeby, ropsten or mainnet`
		);
	}
};

// Load up all contracts in the flagged source, get their deployed addresses (if any) and compiled sources
const loadAndCheckRequiredSources = ({ contractFlagSource, buildPath, outputPath, network }) => {
	console.log(gray(`Loading the list of contracts to deploy on ${network.toUpperCase()}...`));
	const contractFlags = JSON.parse(fs.readFileSync(contractFlagSource));

	console.log(
		gray(`Loading the list of contracts already deployed for ${network.toUpperCase()}...`)
	);
	const deployedContractAddressFile = path.join(outputPath, network, 'contracts.json');
	const deployedContractAddresses = JSON.parse(fs.readFileSync(deployedContractAddressFile));

	console.log(gray('Loading the compiled contracts locally...'));
	const compiledSourcePath = path.join(buildPath, COMPILED_FOLDER);

	const compiled = Object.entries(contractFlags).reduce(
		(memo, [contractName, { deploy, contract }]) => {
			const sourceFile = path.join(compiledSourcePath, `${contract}.json`);
			if (!fs.existsSync(sourceFile)) {
				throw Error(
					`Cannot find compiled contract code for: ${contract}. Did you run the "build" step first?`
				);
			}
			memo[contractName] = JSON.parse(fs.readFileSync(sourceFile));
			return memo;
		},
		{}
	);

	return { compiled, contractFlags, deployedContractAddresses, deployedContractAddressFile };
};

program
	.command('build')
	.description('Build (flatten and compile) solidity files')
	.option(
		'-b, --build-path [value]',
		'Build path for built files',
		path.join(__dirname, '..', 'build')
	)
	.action(async ({ buildPath }) => {
		console.log(gray('Starting build...'));

		// Flatten all the contracts.
		// Start with the libraries, then copy our own contracts on top to ensure
		// if there's a naming clash our code wins.
		console.log(gray('Finding .sol files...'));
		const libraries = findSolFiles('node_modules');
		const contracts = findSolFiles('contracts');
		const allSolFiles = { ...libraries, ...contracts };

		console.log(gray('Flattening contracts...'));
		const sources = await flatten({ files: allSolFiles, contracts });

		const flattenedPath = path.join(buildPath, FLATTENED_FOLDER);
		Object.entries(sources).forEach(([key, { content }]) => {
			const toWrite = path.join(flattenedPath, key);
			try {
				// try make path for sub-folders (note: recursive flag only from nodejs 10.12.0)
				fs.mkdirSync(path.dirname(toWrite), { recursive: true });
			} catch (e) {}
			fs.writeFileSync(toWrite, content);
		});

		// Ok, now we need to compile all the files.
		console.log(gray('Compiling contracts...'));
		const { artifacts, errors, warnings } = compile({ sources });
		const compiledPath = path.join(buildPath, COMPILED_FOLDER);
		Object.entries(artifacts).forEach(([key, value]) => {
			const toWrite = path.join(compiledPath, key);
			try {
				// try make path for sub-folders (note: recursive flag only from nodejs 10.12.0)
				fs.mkdirSync(path.dirname(toWrite), { recursive: true });
			} catch (e) {}
			fs.writeFileSync(`${toWrite}.json`, JSON.stringify(value, null, 2));
		});

		console.log(yellow(`Compiled with ${warnings.length} warnings and ${errors.length} errors`));
		if (errors.length > 0) {
			console.error(red(errors));
			console.error();
			console.error(gray('Exiting because of compile errors.'));
			process.exit(1);
		}

		// We're built!
		console.log(green('Build succeeded'));
	});

program
	.command('deploy')
	.description('Deploy compiled solidity files')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
	.option(
		'-c, --contract-deployment-gas-limit <value>',
		'Contract deployment gas limit',
		parseInt,
		7e6
	)
	.option('-m, --method-call-gas-limit <value>', 'Method call gas limit', parseInt, 15e4)
	.option('-g, --gas-price <value>', 'Gas price in GWEI', '1')
	.option(
		'-s, --synth-list <value>',
		'Path to a JSON file containing a list of synths',
		path.join(__dirname, 'synths.json')
	)
	.option(
		'-f, --contract-flag-source <value>',
		'Path to a JSON file containing a list of contract flags - this is a mapping of full contract names to a deploy flag and the source solidity file. Only files in this mapping will be deployed.',
		path.join(__dirname, 'contract-flags.json')
	)
	.option(
		'-o, --output-path <value>',
		'Path to a folder hosting network-foldered deployed contract addresses',
		path.join(__dirname, 'out')
	)
	.option(
		'-b, --build-path [value]',
		'Path to a folder hosting compiled files from the "build" step in this script',
		path.join(__dirname, '..', 'build')
	)
	.action(
		async ({
			contractFlagSource,
			gasPrice,
			methodCallGasLimit,
			contractDeploymentGasLimit,
			network,
			buildPath,
			outputPath,
			synthList,
		}) => {
			ensureNetwork(network);

			const {
				compiled,
				contractFlags,
				deployedContractAddresses,
				deployedContractAddressFile,
			} = loadAndCheckRequiredSources({
				contractFlagSource,
				buildPath,
				outputPath,
				network,
			});

			console.log(
				gray('Checking all contracts not flagged for deployment have addresses in this network...')
			);
			const missingDeployments = Object.keys(contractFlags).filter(contractName => {
				return !contractFlags[contractName].deploy && !deployedContractAddresses[contractName];
			});

			if (missingDeployments.length) {
				throw Error(
					`Cannot use existing contracts for deployment as addresses not found for the following contracts on ${network}:\n` +
						missingDeployments.join('\n') +
						'\n' +
						gray(`Used: ${deployedContractAddressFile} as source`)
				);
			}

			// now clone these so we can update and write them after each deployment but keep the original
			// flags available
			const updatedContractFlags = JSON.parse(JSON.stringify(contractFlags));

			console.log(gray(`Starting deployment to ${network.toUpperCase()} via Infura...`));

			const providerUrl = process.env.INFURA_PROJECT_ID
				? `https://${network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
				: `https://${network}.infura.io/${process.env.INFURA_KEY}`;
			const privateKey = process.env.DEPLOY_PRIVATE_KEY;
			const deployer = new Deployer({
				compiled,
				contractFlags,
				gasPrice,
				methodCallGasLimit,
				contractDeploymentGasLimit,
				deployedContractAddresses,
				privateKey,
				providerUrl,
			});

			const { account, web3 } = deployer;
			console.log(gray(`Using account with public key ${account}`));

			const deployContract = async ({ name, args, deps }) => {
				const deployedContract = await deployer.deploy({ name, args, deps });

				// now update the deployed contract addresses
				deployedContractAddresses[name] = deployedContract.options.address;
				fs.writeFileSync(
					deployedContractAddressFile,
					JSON.stringify(deployedContractAddresses, null, 2)
				);

				// now update the flags to indicate it no longer needs deployment
				updatedContractFlags[name].deploy = false;
				fs.writeFileSync(contractFlagSource, JSON.stringify(updatedContractFlags, null, 2));
				return deployedContract;
			};

			await deployContract({
				name: 'SafeDecimalMath',
			});

			const exchangeRates = await deployContract({
				name: 'ExchangeRates',
				args: [
					account,
					account,
					[web3.utils.asciiToHex('SNX')],
					[web3.utils.toWei('0.2', 'ether')],
				],
			});

			const proxyFeePool = await deployContract({
				name: 'ProxyFeePool',
				args: [account],
			});

			const feePool = await deployContract({
				name: 'FeePool',
				deps: ['ProxyFeePool'],
				args: [
					proxyFeePool ? proxyFeePool.options.address : '',
					account,
					account,
					account,
					web3.utils.toWei('0.0015', 'ether'),
					web3.utils.toWei('0.0015', 'ether'),
				],
			});

			if (proxyFeePool && feePool) {
				const target = await proxyFeePool.methods.target().call();

				if (target !== feePool.options.address) {
					console.log(yellow('Setting target on ProxyFeePool...'));

					await proxyFeePool.methods
						.setTarget(feePool.options.address)
						.send(deployer.sendParameters());
				}
			}

			const synthetixState = await deployContract({
				name: 'SynthetixState',
				args: [account, account],
			});
			const proxySynthetix = await deployContract({ name: 'ProxySynthetix', args: [account] });
			const tokenStateSynthetix = await deployContract({
				name: 'TokenStateSynthetix',
				args: [account, account],
			});
			const synthetix = await deployContract({
				name: 'Synthetix',
				deps: [
					'ProxySynthetix',
					'TokenStateSynthetix',
					'SynthetixState',
					'ExchangeRates',
					'FeePool',
				],
				args: [
					proxySynthetix ? proxySynthetix.options.address : '',
					tokenStateSynthetix ? tokenStateSynthetix.options.address : '',
					synthetixState ? synthetixState.options.address : '',
					account,
					exchangeRates ? exchangeRates.options.address : '',
					feePool ? feePool.options.address : '',
				],
			});

			const synthetixAddress = synthetix.options.address;

			if (proxySynthetix && synthetix) {
				const target = await proxySynthetix.methods.target().call();
				if (target !== synthetixAddress) {
					console.log(yellow('Setting target on ProxySynthetix...'));
					await proxySynthetix.methods.setTarget(synthetixAddress).send(deployer.sendParameters());
				}
			}

			if (tokenStateSynthetix) {
				const balance = await tokenStateSynthetix.methods.balanceOf(account).call();
				const initialIssuance = web3.utils.toWei('100000000');
				if (balance !== initialIssuance) {
					console.log(yellow('Setting initial 100M balance on TokenStateSynthetix...'));
					await tokenStateSynthetix.methods
						.setBalanceOf(account, initialIssuance)
						.send(deployer.sendParameters());
				}
			}

			if (tokenStateSynthetix && synthetix) {
				const associatedTSContract = await tokenStateSynthetix.methods.associatedContract().call();
				if (associatedTSContract !== synthetixAddress) {
					console.log(yellow('Setting associated contract on TokenStateSynthetix...'));
					await tokenStateSynthetix.methods
						.setAssociatedContract(synthetixAddress)
						.send(deployer.sendParameters());
				}
				const associatedSSContract = await synthetixState.methods.associatedContract().call();
				if (associatedSSContract !== synthetixAddress) {
					console.log(yellow('Setting associated contract on Synthetix State...'));
					await synthetixState.methods
						.setAssociatedContract(synthetixAddress)
						.send(deployer.sendParameters());
				}
			}

			const synthetixEscrow = await deployContract({
				name: 'SynthetixEscrow',
				deps: ['Synthetix'],
				args: [account, synthetix ? synthetixAddress : ''],
			});

			if (synthetix && synthetixEscrow) {
				const escrowAddress = await synthetix.methods.escrow().call();
				if (escrowAddress !== synthetixEscrow.options.address) {
					console.log(yellow('Setting escrow on Synthetix...'));
					await synthetix.methods
						.setEscrow(synthetixEscrow.options.address)
						.send(deployer.sendParameters());
				}
				// Cannot run on mainnet, as it needs to be run by the owner of synthetixEscrow contract
				if (network !== 'mainnet') {
					const escrowSNXAddress = await synthetixEscrow.methods.synthetix().call();
					if (escrowSNXAddress !== synthetixAddress) {
						console.log(yellow('Setting deployed Synthetix on escrow...'));
						await synthetixEscrow.methods
							.setSynthetix(synthetixAddress)
							.send(deployer.sendParameters());
					}
				}
			}

			// Cannot run on mainnet, as it needs to be run by the owner of feePool contract
			if (network !== 'mainnet') {
				if (feePool && synthetix) {
					const fpSNXAddress = await feePool.methods.synthetix().call();
					if (fpSNXAddress !== synthetixAddress) {
						console.log(yellow('Setting Synthetix on Fee Pool...'));
						await feePool.methods.setSynthetix(synthetixAddress).send(deployer.sendParameters());
					}
				}
			}

			// ----------------
			// Synths
			// ----------------
			const synths = JSON.parse(fs.readFileSync(synthList));
			for (const currencyKey of synths) {
				const tokenStateForSynth = await deployContract({
					name: `TokenState${currencyKey}`,
					args: [account, ZERO_ADDRESS],
				});
				const proxyForSynth = await deployContract({
					name: `Proxy${currencyKey}`,
					args: [account],
				});
				const synth = await deployContract({
					name: `Synth${currencyKey}`,
					deps: [`TokenState${currencyKey}`, `Proxy${currencyKey}`, 'Synthetix', 'FeePool'],
					args: [
						proxyForSynth ? proxyForSynth.options.address : '',
						tokenStateForSynth ? tokenStateForSynth.options.address : '',
						synthetix ? synthetixAddress : '',
						feePool ? feePool.options.address : '',
						`Synth ${currencyKey}`,
						currencyKey,
						account,
						web3.utils.asciiToHex(currencyKey),
					],
				});
				const synthAddress = synth.options.address;
				if (synth && tokenStateForSynth) {
					const tsAssociatedContract = await tokenStateForSynth.methods.associatedContract().call();
					if (tsAssociatedContract !== synthAddress) {
						console.log(yellow(`Setting associated contract for ${currencyKey} TokenState...`));

						await tokenStateForSynth.methods
							.setAssociatedContract(synthAddress)
							.send(deployer.sendParameters());
					}
				}
				if (proxyForSynth && synth) {
					const target = await proxyForSynth.methods.target().call();
					if (target !== synthAddress) {
						console.log(yellow(`Setting proxy target for ${currencyKey} Proxy...`));

						await proxyForSynth.methods.setTarget(synthAddress).send(deployer.sendParameters());
					}
				}

				// Cannot run on mainnet, as it needs to be owner of existing Synthetix & Synth contracts
				if (network !== 'mainnet') {
					if (synth && synthetix) {
						const currentSynthInSNX = await synthetix.methods
							.synths(web3.utils.asciiToHex(currencyKey))
							.call();
						if (currentSynthInSNX !== synthAddress) {
							console.log(yellow(`Adding ${currencyKey} to Synthetix contract...`));
							await synthetix.methods.addSynth(synthAddress).send(deployer.sendParameters());
						}

						const synthSNXAddress = await synth.methods.synthetix().call();

						if (synthSNXAddress !== synthetixAddress) {
							console.log(yellow(`Adding Synthetix contract on ${currencyKey} contract...`));
							await synth.methods.setSynthetix(synthetixAddress).send(deployer.sendParameters());
						}
					}
				}
			}

			const depot = await deployContract({
				name: 'Depot',
				deps: ['Synthetix', 'SynthsUSD', 'FeePool'],
				args: [
					account,
					account,
					synthetix ? synthetixAddress : '',
					deployer.deployedContracts['SynthsUSD']
						? deployer.deployedContracts['SynthsUSD'].options.address
						: '',
					feePool ? feePool.options.address : '',
					account,
					web3.utils.toWei('500'),
					web3.utils.toWei('.10'),
				],
			});

			// Comment out if deploying on mainnet - Needs to be owner of Depot contract
			if (network !== 'mainnet') {
				if (synthetix && depot) {
					const depotSNXAddress = await depot.methods.synthetix().call();
					if (depotSNXAddress !== synthetixAddress) {
						console.log(yellow(`Setting synthetix on depot contract...`));

						await depot.methods.setSynthetix(synthetixAddress).send(deployer.sendParameters());
					}
				}
			}

			console.log();
			console.log(green('Successfully deployed all contracts!'));
			console.log();

			console.log(gray('Overwriting ABIs to file contracts.abi.json under network folder'));
			const abiFile = path.join(outputPath, network, 'contracts.abi.json');
			const abiData = Object.keys(deployer.deployedContracts)
				.sort()
				.map(name => {
					return {
						name,
						address: deployer.deployedContracts[name].options.address,
						source: contractFlags[name].contract,
						link: `https://${network !== 'mainnet' ? network + '.' : ''}etherscan.io/address/${
							deployer.deployedContracts[name].options.address
						}`,
						network,
						// Note: we can add a timestamp during the verification phase
						// timestamp: contractFlags[name].deploy
						// 	? new Date()
						// 	: '(unknown from previous deployment)', // Note: we can overright these during the verification phase
						abi: compiled[name].abi,
					};
				});
			fs.writeFileSync(abiFile, JSON.stringify(abiData, null, 2));

			// JJM: Honestly this can be combined with the ABIs file in the future
			console.log(gray('Overwriting addresses to file contracts.json under network folder'));
			const contractAddressesFile = path.join(outputPath, network, 'contracts.json');
			const contractAddresses = Object.keys(deployer.deployedContracts)
				.sort()
				.reduce((memo, name) => {
					memo[name] = deployer.deployedContracts[name].options.address;
					return memo;
				}, {});
			fs.writeFileSync(contractAddressesFile, JSON.stringify(contractAddresses, null, 2));

			const tableData = Object.keys(deployer.deployedContracts).map(key => [
				key,
				deployer.deployedContracts[key].options.address,
			]);
			console.log();
			console.log(gray(`Tabular data of all contracts on ${network}`));
			console.log(table(tableData));
		}
	);

program
	.command('verify')
	.description('Verify deployed sources on etherscan')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
	.option(
		'-f, --contract-flag-source <value>',
		'Path to a JSON file containing a list of contract flags - this is a mapping of full contract names to a deploy flag and the source solidity file. Only files in this mapping will be deployed.',
		path.join(__dirname, 'contract-flags.json')
	)
	.option(
		'-o, --output-path <value>',
		'Path to a folder hosting network-foldered deployed contract addresses',
		path.join(__dirname, 'out')
	)
	.option(
		'-b, --build-path [value]',
		'Path to a folder hosting compiled files from the "build" step in this script',
		path.join(__dirname, '..', 'build')
	)
	.action(async ({ contractFlagSource, network, outputPath, buildPath }) => {
		ensureNetwork(network);

		const {
			compiled,
			contractFlags,
			deployedContractAddresses,
			deployedContractAddressFile,
		} = loadAndCheckRequiredSources({
			contractFlagSource,
			buildPath,
			outputPath,
			network,
		});

		// ensure that every contract in the flag file has a matching deployed address
		const missingDeployments = Object.keys(contractFlags).filter(contractName => {
			return !deployedContractAddresses[contractName];
		});

		if (missingDeployments.length) {
			throw Error(
				`Cannot use existing contracts for verification as addresses not found for the following contracts on ${network}:\n` +
					missingDeployments.join('\n') +
					'\n' +
					gray(`Used: ${deployedContractAddressFile} as source`)
			);
		}

		const etherscanUrl =
			network === 'mainnet'
				? 'https://api.etherscan.io/api'
				: `https://api-${network}.etherscan.io/api`;
		console.log(gray(`Starting ${network.toUpperCase()} contract verification on Etherscan...`));

		const tableData = [];

		for (const name of Object.keys(contractFlags)) {
			const address = deployedContractAddresses[name];
			// Check if this contract already has been verified.

			let result = await axios.get(etherscanUrl, {
				params: {
					module: 'contract',
					action: 'getabi',
					address,
					apikey: process.env.ETHERSCAN_KEY,
				},
			});

			if (result.data.result === 'Contract source code not verified') {
				const contractName = contractFlags[name].contract;
				console.log(
					gray(
						` - Contract ${name} not yet verified (source of "${contractName}.sol"). Verifying...`
					)
				);

				// Get the transaction that created the contract with its resulting bytecode.
				result = await axios.get(etherscanUrl, {
					params: {
						module: 'account',
						action: 'txlist',
						address,
						sort: 'asc',
						apikey: process.env.ETHERSCAN_KEY,
					},
				});

				// Get the bytecode that was in that transaction.
				const deployedBytecode = result.data.result[0].input;

				// TODO - add these to the JSON file for the deployment
				const deployedAt = new Date(result.data.result[0].timeStamp * 1000);
				const deployedTxn = `https://${network}.etherscan.io/tx/${result.data.result[0].hash}`;

				console.log(gray(` - Deployed at ${deployedAt}, see ${deployedTxn}`));

				// Grab the last 50 characters of the compiled bytecode
				const compiledBytecode = compiled[name].evm.bytecode.object.slice(-50);

				const pattern = new RegExp(`${compiledBytecode}(.*)$`);
				const constructorArguments = pattern.exec(deployedBytecode)[1];

				console.log(gray(' - Constructor arguments', constructorArguments));

				const readFlattened = () => {
					const flattenedFilename = path.join(buildPath, FLATTENED_FOLDER, `${contractName}.sol`);
					try {
						return fs.readFileSync(flattenedFilename).toString();
					} catch (err) {
						throw Error(
							`Cannot read file ${flattenedFilename} - have you run the build step yet???`
						);
					}
				};
				result = await axios.post(
					etherscanUrl,
					qs.stringify({
						module: 'contract',
						action: 'verifysourcecode',
						contractaddress: address,
						sourceCode: readFlattened(),
						contractname: contractName,
						// note: spelling mistake is on etherscan's side
						constructorArguements: constructorArguments,
						compilerversion: 'v' + solc.version().replace('.Emscripten.clang', ''), // The version reported by solc-js is too verbose and needs a v at the front
						optimizationUsed: 1,
						runs: 200,
						libraryname1: 'SafeDecimalMath',
						libraryaddress1: deployedContractAddresses['SafeDecimalMath'],
						apikey: process.env.ETHERSCAN_KEY,
					}),
					{
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
						},
					}
				);

				console.log(gray(' - Got result:', result.data.result));

				if (result.data.result === 'Contract source code already verified') {
					console.log(green(` - Verified ${name}`));
					// Ugh, ok, you lie, but fine, skip and continue.
					tableData.push([name, address, 'Successfully verified']);
					continue;
				}
				const guid = result.data.result;

				if (!result.data.status) {
					tableData.push([name, address, `Unable to verify, Etherscan returned "${guid}`]);
					continue;
				}

				let status = '';
				while (status !== 'Pass - Verified') {
					console.log(gray(' - Checking verification status...'));

					result = await axios.get(etherscanUrl, {
						params: {
							module: 'contract',
							action: 'checkverifystatus',
							guid,
						},
					});
					status = result.data.result;

					console.log(gray(` - "${status}" response from Etherscan`));

					if (status === 'Fail - Unable to verify') {
						console.log(red(` - Unable to verify ${name}.`));
						tableData.push([name, address, 'Unable to verify']);

						break;
					}

					if (status !== 'Pass - Verified') {
						console.log(gray(' - Sleeping for 5 seconds and re-checking.'));
						await new Promise(resolve => setTimeout(resolve, 5000));
					} else {
						console.log(green(` - Verified ${name}`));
						tableData.push([name, address, 'Successfully verified']);
					}
				}
			} else {
				console.log(gray(` - Already verified ${name}`));
				tableData.push([name, address, 'Already verified']);
			}
		}

		console.log(gray('Verification state'));
		console.log(table(tableData));
	});

program.parse(process.argv);
