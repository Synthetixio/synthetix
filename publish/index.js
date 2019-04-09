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
const CONFIG_FILENAME = 'config.json';
const SYNTHS_FILENAME = 'synths.json';
const DEPLOYMENT_FILENAME = 'deployment.json';
const ZERO_ADDRESS = '0x' + '0'.repeat(40);

const ensureNetwork = network => {
	if (!/^(kovan|rinkeby|ropsten|mainnet)$/.test(network)) {
		throw Error(
			`Invalid network name of "${network}" supplied. Must be one of kovan, rinkeby, ropsten or mainnet`
		);
	}
};
const ensureDeploymentPath = deploymentPath => {
	if (!fs.existsSync(deploymentPath)) {
		throw Error(
			`Invalid deployment path. Please provide a folder with a compatible ${CONFIG_FILENAME}`
		);
	}
};

// Load up all contracts in the flagged source, get their deployed addresses (if any) and compiled sources
const loadAndCheckRequiredSources = ({ deploymentPath, network }) => {
	console.log(gray(`Loading the list of synths for ${network.toUpperCase()}...`));
	const synthsFile = path.join(deploymentPath, SYNTHS_FILENAME);
	const synths = JSON.parse(fs.readFileSync(synthsFile)).map(({ name }) => name);
	console.log(gray(`Loading the list of contracts to deploy on ${network.toUpperCase()}...`));
	const configFile = path.join(deploymentPath, CONFIG_FILENAME);
	const config = JSON.parse(fs.readFileSync(configFile));

	console.log(
		gray(`Loading the list of contracts already deployed for ${network.toUpperCase()}...`)
	);
	const deploymentFile = path.join(deploymentPath, DEPLOYMENT_FILENAME);
	if (!fs.existsSync(deploymentFile)) {
		fs.writeFileSync(deploymentFile, JSON.stringify({ targets: {}, sources: {} }, null, 2));
	}
	const deployment = JSON.parse(fs.readFileSync(deploymentFile));

	return {
		config,
		configFile,
		synths,
		deployment,
		deploymentFile,
	};
};

program
	.command('build')
	.description('Build (flatten and compile) solidity files')
	.option(
		'-b, --build-path [value]',
		'Build path for built files',
		path.join(__dirname, '..', 'build')
	)
	.option('-w, --show-warnings', 'Show warnings')
	.action(async ({ buildPath, showWarnings }) => {
		console.log(gray('Starting build...'));

		if (!fs.existsSync(buildPath)) {
			fs.mkdirSync(buildPath);
		}
		// Flatten all the contracts.
		// Start with the libraries, then copy our own contracts on top to ensure
		// if there's a naming clash our code wins.
		console.log(gray('Finding .sol files...'));
		const libraries = findSolFiles('node_modules');
		const contracts = findSolFiles('contracts');
		const allSolFiles = { ...libraries, ...contracts };
		console.log(
			gray(
				`Found ${Object.keys(contracts).length} sources, and ${
					Object.keys(libraries).length
				} possible libraries`
			)
		);
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
			console.error(red(errors.map(({ formattedMessage }) => formattedMessage)));
			console.error();
			console.error(gray('Exiting because of compile errors.'));
			process.exit(1);
		}

		if (warnings.length && showWarnings) {
			console.log(gray(warnings.map(({ formattedMessage }) => formattedMessage).join('\n')));
		}

		// We're built!
		console.log(green('Build succeeded'));
	});

program
	.command('deploy')
	.description('Deploy compiled solidity files')
	.option(
		'-a, --add-new-synths',
		`Whether or not any new synths in the ${SYNTHS_FILENAME} file should be deployed if there is no entry in the config file`,
		false
	)
	.option(
		'-b, --build-path [value]',
		'Path to a folder hosting compiled files from the "build" step in this script',
		path.join(__dirname, '..', 'build')
	)
	.option(
		'-c, --contract-deployment-gas-limit <value>',
		'Contract deployment gas limit',
		parseInt,
		7e6
	)
	.option(
		'-d, --deployment-path <value>',
		`Path to a folder that has your input configuration file ${CONFIG_FILENAME}, the synth list ${SYNTHS_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
	)
	.option(
		'-o, --oracle <value>',
		'The address of the oracle for this network',
		'0xac1e8b385230970319906c03a1d8567e3996d1d5' // the oracle for testnets
	)
	.option('-g, --gas-price <value>', 'Gas price in GWEI', '1')
	.option('-m, --method-call-gas-limit <value>', 'Method call gas limit', parseInt, 15e4)
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
	.action(
		async ({
			addNewSynths,
			gasPrice,
			methodCallGasLimit,
			contractDeploymentGasLimit,
			network,
			buildPath,
			deploymentPath,
			oracle,
		}) => {
			ensureNetwork(network);
			ensureDeploymentPath(deploymentPath);

			const {
				config,
				configFile,
				synths,
				deployment,
				deploymentFile,
			} = loadAndCheckRequiredSources({
				deploymentPath,
				network,
			});

			console.log(
				gray('Checking all contracts not flagged for deployment have addresses in this network...')
			);
			const missingDeployments = Object.keys(config).filter(name => {
				return (
					!config[name].deploy && (!deployment.targets[name] || !deployment.targets[name].address)
				);
			});

			if (missingDeployments.length) {
				throw Error(
					`Cannot use existing contracts for deployment as addresses not found for the following contracts on ${network}:\n` +
						missingDeployments.join('\n') +
						'\n' +
						gray(`Used: ${deploymentFile} as source`)
				);
			}

			console.log(gray('Loading the compiled contracts locally...'));
			const compiledSourcePath = path.join(buildPath, COMPILED_FOLDER);

			let firstTimestamp = Infinity;

			const compiled = fs
				.readdirSync(compiledSourcePath)
				.filter(name => /^.+\.json$/.test(name))
				.reduce((memo, contractFilename) => {
					const contract = contractFilename.replace(/\.json$/, '');
					const sourceFile = path.join(compiledSourcePath, contractFilename);
					firstTimestamp = Math.min(firstTimestamp, fs.statSync(sourceFile).mtimeMs);
					if (!fs.existsSync(sourceFile)) {
						throw Error(
							`Cannot find compiled contract code for: ${contract}. Did you run the "build" step first?`
						);
					}
					memo[contract] = JSON.parse(fs.readFileSync(sourceFile));
					return memo;
				}, {});

			// JJM: We could easily add an error here if the earlist build is before the latest SOL contract modification
			console.log(
				yellow(
					`Note: using build files of which, the earlist was modified on ${new Date(
						firstTimestamp
					)}. This is roughly ${((new Date().getTime() - firstTimestamp) / 60000).toFixed(
						2
					)} mins ago.`
				)
			);

			// now clone these so we can update and write them after each deployment but keep the original
			// flags available
			const updatedConfig = JSON.parse(JSON.stringify(config));

			console.log(gray(`Starting deployment to ${network.toUpperCase()} via Infura...`));

			const providerUrl = process.env.INFURA_PROJECT_ID
				? `https://${network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
				: `https://${network}.infura.io/${process.env.INFURA_KEY}`;
			const privateKey = process.env.DEPLOY_PRIVATE_KEY;

			const deployer = new Deployer({
				compiled,
				config,
				gasPrice,
				methodCallGasLimit,
				contractDeploymentGasLimit,
				deployment,
				privateKey,
				providerUrl,
			});

			const { account, web3 } = deployer;
			console.log(gray(`Using account with public key ${account}`));

			const deployContract = async ({ name, source = name, args, deps, force = false }) => {
				// force flag indicates to deploy even when no config for the entry (useful for new synths)
				const deployedContract = await deployer.deploy({ name, source, args, deps, force });
				if (!deployedContract) {
					return;
				}
				const { address } = deployedContract.options;

				let timestamp = new Date();
				let txn = '';
				if (config[name] && !config[name].deploy) {
					// deploy is false, so we reused a deployment, thus lets grab the details that already exist
					timestamp = deployment.targets[name].timestamp;
					txn = deployment.targets[name].txn;
				}
				// now update the deployed contract information
				deployment.targets[name] = {
					name,
					address,
					source,
					link: `https://${network !== 'mainnet' ? network + '.' : ''}etherscan.io/address/${
						deployer.deployedContracts[name].options.address
					}`,
					timestamp,
					txn,
					network,
				};
				deployment.sources[source] = {
					bytecode: compiled[source].evm.bytecode.object,
					abi: compiled[source].abi,
				};
				fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

				// now update the flags to indicate it no longer needs deployment
				updatedConfig[name] = { deploy: false };

				fs.writeFileSync(configFile, JSON.stringify(updatedConfig, null, 2));
				return deployedContract;
			};

			await deployContract({
				name: 'SafeDecimalMath',
			});

			const exchangeRates = await deployContract({
				name: 'ExchangeRates',
				args: [account, oracle, [web3.utils.asciiToHex('SNX')], [web3.utils.toWei('0.2', 'ether')]],
			});

			const proxyFeePool = await deployContract({
				name: 'ProxyFeePool',
				source: 'Proxy',
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
			const proxySynthetix = await deployContract({
				name: 'ProxySynthetix',
				source: 'Proxy',
				args: [account],
			});
			const tokenStateSynthetix = await deployContract({
				name: 'TokenStateSynthetix',
				source: 'TokenState',
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

			const synthetixAddress = synthetix ? synthetix.options.address : '';

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

			if (synthetixEscrow) {
				await deployContract({
					name: 'EscrowChecker',
					deps: ['SynthetixEscrow'],
					args: [synthetixEscrow.options.address],
				});
			}

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
			for (const currencyKey of synths) {
				const tokenStateForSynth = await deployContract({
					name: `TokenState${currencyKey}`,
					source: 'TokenState',
					args: [account, ZERO_ADDRESS],
					force: addNewSynths,
				});
				const proxyForSynth = await deployContract({
					name: `Proxy${currencyKey}`,
					source: 'Proxy',
					args: [account],
					force: addNewSynths,
				});
				const synth = await deployContract({
					name: `Synth${currencyKey}`,
					source: 'Synth',
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
					force: addNewSynths,
				});
				const synthAddress = synth ? synth.options.address : '';
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
					oracle,
					web3.utils.toWei('500'),
					web3.utils.toWei('.10'),
				],
			});

			// Cannot run on mainnet as it needs to be owner of Depot contract
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
	.option(
		'-b, --build-path [value]',
		'Path to a folder hosting compiled files from the "build" step in this script',
		path.join(__dirname, '..', 'build')
	)
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
	.option(
		'-d, --deployment-path <value>',
		`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
	)
	.action(async ({ buildPath, network, deploymentPath }) => {
		ensureNetwork(network);

		const { config, deployment, deploymentFile } = loadAndCheckRequiredSources({
			deploymentPath,
			network,
		});

		// ensure that every contract in the flag file has a matching deployed address
		const missingDeployments = Object.keys(config).filter(contractName => {
			return !deployment.targets[contractName] || !deployment.targets[contractName].address;
		});

		if (missingDeployments.length) {
			throw Error(
				`Cannot use existing contracts for verification as addresses not found for the following contracts on ${network}:\n` +
					missingDeployments.join('\n') +
					'\n' +
					gray(`Used: ${deploymentFile} as source`)
			);
		}

		const etherscanUrl =
			network === 'mainnet'
				? 'https://api.etherscan.io/api'
				: `https://api-${network}.etherscan.io/api`;
		console.log(gray(`Starting ${network.toUpperCase()} contract verification on Etherscan...`));

		const tableData = [];

		for (const name of Object.keys(config)) {
			const { address } = deployment.targets[name];
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
				const { source } = deployment.targets[name];
				console.log(
					gray(` - Contract ${name} not yet verified (source of "${source}.sol"). Verifying...`)
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

				// add the transacton and timestamp to the json file
				deployment.targets[name].txn = `https://${network}.etherscan.io/tx/${
					result.data.result[0].hash
				}`;
				deployment.targets[name].timestamp = new Date(result.data.result[0].timeStamp * 1000);

				fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

				// Grab the last 50 characters of the compiled bytecode
				const compiledBytecode = deployment.sources[source].bytecode.slice(-100);

				const pattern = new RegExp(`${compiledBytecode}(.*)$`);
				const constructorArguments = pattern.exec(deployedBytecode)[1];

				console.log(gray(' - Constructor arguments', constructorArguments));

				const readFlattened = () => {
					const flattenedFilename = path.join(buildPath, FLATTENED_FOLDER, `${source}.sol`);
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
						contractname: source,
						// note: spelling mistake is on etherscan's side
						constructorArguements: constructorArguments,
						compilerversion: 'v' + solc.version().replace('.Emscripten.clang', ''), // The version reported by solc-js is too verbose and needs a v at the front
						optimizationUsed: 1,
						runs: 200,
						libraryname1: 'SafeDecimalMath',
						libraryaddress1: deployment.targets['SafeDecimalMath'].address,
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
				} else if (!guid || guid.length !== 50) {
					console.log(red(`Invalid GUID from Etherscan (see response above).`));
					tableData.push([name, address, 'Unable to verify (invalid GUID)']);
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

program
	.command('generate-token-list')
	.description('Generate json output for all of the token proxy addresses')
	.option(
		'-d, --deployment-path <value>',
		`Path to a folder that has your input configuration file (${CONFIG_FILENAME}) and where your ${DEPLOYMENT_FILENAME} files will go`
	)
	.action(async ({ deploymentPath }) => {
		const deployment = JSON.parse(fs.readFileSync(path.join(deploymentPath, DEPLOYMENT_FILENAME)));

		const output = Object.keys(deployment)
			.filter(key => /^Proxy(s[A-Z]{3,4}|Synthetix)$/.test(key))
			.map(key => {
				return {
					symbol: /Synthetix$/.test(key) ? 'SNX' : key.replace(/^Proxy/, ''),
					address: deployment.targets[key].address,
					decimals: 18,
				};
			});

		console.log(JSON.stringify(output, null, 2));
	});

program.parse(process.argv);
