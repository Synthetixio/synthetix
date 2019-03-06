'use strict';

const path = require('path');
const fs = require('fs');
const program = require('commander');
const { gray, green, yellow, red } = require('chalk');
const { table } = require('table');
require('pretty-error').start();
require('dotenv').config();

const { findSolFiles, flatten, compile } = require('./solidity');
const Deployer = require('./deployer');

const COMPILED_FOLDER = 'compiled';
const FLATTENED_FOLDER = 'flattened';
const ZERO_ADDRESS = '0x' + '0'.repeat(40);

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
			fs.writeFileSync(`${toWrite}.json`, JSON.stringify(value));
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
		'Path to a list of synths',
		path.join(__dirname, 'synths.json')
	)
	.option(
		'-f, --contract-flag-source <value>',
		'Path to a list of contract flags - this is a mapping of full contract names to a deploy flag and the source solidity file. Only files in this mapping will be deployed.',
		path.join(__dirname, 'contract-flags.json')
	)
	.option(
		'-o, --output-path <value>',
		'Path to a list of deployed contract addresses',
		path.join(__dirname, 'out')
	)
	.option(
		'-b, --build-path [value]',
		'Build path for built files',
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
			if (!/^(kovan|rinkeby|ropsten|mainnet)$/.test(network)) {
				throw Error(
					`Invalid network name of "${network}" supplied. Must be one of kovan, rinkeby, ropsten or mainnet`
				);
			}

			console.log(gray(`Starting deployment to ${network.toUpperCase()} via Infura...`));

			const contractFlags = JSON.parse(fs.readFileSync(contractFlagSource));
			// now clone these so we can update and write them after each deployment but keep the original
			// flags available
			const updatedContractFlags = JSON.parse(JSON.stringify(contractFlags));
			console.log(
				gray('Checking all contracts not flagged for deployment have addresses in this network...')
			);
			const deployedContractAddressFile = path.join(outputPath, network, 'contracts.json');
			const deployedContractAddresses = JSON.parse(fs.readFileSync(deployedContractAddressFile));

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

			console.log(gray('Loading the compiled contracts locally...'));
			const compiledSourcePath = path.join(buildPath, COMPILED_FOLDER);

			const compiled = Object.entries(contractFlags).reduce(
				(memo, [contractName, { deploy, contract }]) => {
					const sourceFile = path.join(compiledSourcePath, `${contract}.json`);
					if (!fs.existsSync(sourceFile)) {
						throw Error(`Cannot find compiled contract code for: ${contract}`);
					}
					memo[contractName] = JSON.parse(fs.readFileSync(sourceFile));
					return memo;
				},
				{}
			);

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
						if (!currentSynthInSNX) {
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
			fs.writeFileSync(abiFile, JSON.stringify(abiData, undefined, 2));

			// JJM: Honestly this can be combined with the ABIs file in the future
			console.log(gray('Overwriting addresses to file contracts.json under network folder'));
			const contractAddressesFile = path.join(outputPath, network, 'contracts.json');
			const contractAddresses = Object.keys(deployer.deployedContracts)
				.sort()
				.reduce((memo, name) => {
					memo[name] = deployer.deployedContracts[name].options.address;
					return memo;
				}, {});
			fs.writeFileSync(contractAddressesFile, JSON.stringify(contractAddresses, undefined, 2));

			const tableData = Object.keys(deployer.deployedContracts).map(key => [
				key,
				deployer.deployedContracts[key].options.address,
			]);
			console.log();
			console.log(gray(`Tabular data of all contracts on ${network}`));
			console.log(table(tableData));
		}
	);

program.parse(process.argv);
