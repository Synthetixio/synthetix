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
		65e5
	)
	.option('-m, --method-call-gas-limit <value>', 'Method call gas limit', parseInt, 15e4)
	.option('-g, --gas-price <value>', 'Gas price', parseInt, 1)
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

			const providerUrl = `https://${network}.infura.io/${process.env.INFURA_KEY}`;
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

			await deployer.deploy({
				name: 'SafeDecimalMath',
			});

			const exchangeRates = await deployer.deploy({
				name: 'ExchangeRates',
				args: [
					account,
					account,
					[web3.utils.asciiToHex('SNX')],
					[web3.utils.toWei('0.2', 'ether')],
				],
			});

			const proxyFeePool = await deployer.deploy({
				name: 'ProxyFeePool',
				args: [account],
			});

			const feePool = await deployer.deploy({
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

			if (
				(proxyFeePool && contractFlags['ProxyFeePool'].deploy) ||
				(feePool && contractFlags['FeePool'].deploy)
			) {
				await proxyFeePool.methods
					.setTarget(feePool.options.address)
					.send(deployer.sendParameters());
			}

			const synthetixState = await deployer.deploy({
				name: 'SynthetixState',
				args: [account, account],
			});
			const proxySynthetix = await deployer.deploy({ name: 'ProxySynthetix', args: [account] });
			const tokenStateSynthetix = await deployer.deploy({
				name: 'TokenStateSynthetix',
				args: [account, account],
			});
			const synthetix = await deployer.deploy({
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

			if (
				(proxySynthetix && contractFlags['ProxySynthetix'].deploy) ||
				(synthetix && contractFlags['Synthetix'].deploy)
			) {
				console.log(yellow('Setting target on ProxySynthetix...'));
				await proxySynthetix.methods
					.setTarget(synthetix.options.address)
					.send(deployer.sendParameters());
			}

			if (tokenStateSynthetix && contractFlags['TokenStateSynthetix'].deploy) {
				console.log(yellow('Setting balance on TokenStateSynthetix...'));
				await tokenStateSynthetix.methods
					.setBalanceOf(account, web3.utils.toWei('100000000'))
					.send(deployer.sendParameters());
			}

			if (
				(tokenStateSynthetix && contractFlags['TokenStateSynthetix'].deploy) ||
				(synthetix && contractFlags['Synthetix'].deploy)
			) {
				console.log(yellow('Setting associated contract on TokenStateSynthetix...'));
				await tokenStateSynthetix.methods
					.setAssociatedContract(synthetix.options.address)
					.send(deployer.sendParameters());
				console.log(yellow('Setting associated contract on Synthetix State...'));
				await synthetixState.methods
					.setAssociatedContract(synthetix.options.address)
					.send(deployer.sendParameters());
			}

			const synthetixEscrow = await deployer.deploy({
				name: 'SynthetixEscrow',
				deps: ['Synthetix'],
				args: [account, synthetix ? synthetix.options.address : ''],
			});

			if (
				(synthetix && contractFlags['Synthetix'].deploy) ||
				(synthetixEscrow && contractFlags['SynthetixEscrow'].deploy)
			) {
				console.log(yellow('Setting escrow on Synthetix...'));
				await synthetix.methods
					.setEscrow(synthetixEscrow.options.address)
					.send(deployer.sendParameters());

				// Cannot run on mainnet, as it needs to be run by the owner of synthetixEscrow contract
				if (network !== 'mainnet' && contractFlags['SynthetixEscrow'].deploy) {
					console.log(yellow('Setting deployed Synthetix on escrow...'));
					await synthetixEscrow.methods
						.setSynthetix(synthetix.options.address)
						.send(deployer.sendParameters());
				}
			}

			// Cannot run on mainnet, as it needs to be run by the owner of feePool contract
			if (network !== 'mainnet') {
				if (
					(feePool && contractFlags['FeePool'].deploy) ||
					(synthetix && contractFlags['Synthetix'].deploy)
				) {
					console.log(yellow('Setting Synthetix on Fee Pool...'));
					await feePool.methods
						.setSynthetix(synthetix.options.address)
						.send(deployer.sendParameters());
				}
			}

			// ----------------
			// Synths
			// ----------------
			const synths = JSON.parse(fs.readFileSync(synthList));
			for (const currencyKey of synths) {
				const tokenStateForSynth = await deployer.deploy({
					name: `TokenState${currencyKey}`,
					args: [account, ZERO_ADDRESS],
				});
				const proxyForSynth = await deployer.deploy({
					name: `Proxy${currencyKey}`,
					args: [account],
				});
				const synth = await deployer.deploy({
					name: `Synth${currencyKey}`,
					deps: [`TokenState${currencyKey}`, `Proxy${currencyKey}`, 'Synthetix', 'FeePool'],
					args: [
						proxyForSynth ? proxyForSynth.options.address : '',
						tokenStateForSynth ? tokenStateForSynth.options.address : '',
						synthetix ? synthetix.options.address : '',
						feePool ? feePool.options.address : '',
						`Synth ${currencyKey}`,
						currencyKey,
						account,
						web3.utils.asciiToHex(currencyKey),
					],
				});

				if (
					(synth && contractFlags[`Synth${currencyKey}`].deploy) ||
					(tokenStateForSynth && contractFlags[`TokenState${currencyKey}`].deploy)
				) {
					console.log(yellow(`Setting associated contract for ${currencyKey} TokenState...`));

					await tokenStateForSynth.methods
						.setAssociatedContract(synth.options.address)
						.send(deployer.sendParameters());
				}
				if (
					(proxyForSynth && contractFlags[`Proxy${currencyKey}`].deploy) ||
					(synth && contractFlags[`Synth${currencyKey}`].deploy)
				) {
					console.log(yellow(`Setting proxy target for ${currencyKey} Proxy...`));

					await proxyForSynth.methods
						.setTarget(synth.options.address)
						.send(deployer.sendParameters());
				}

				// Cannot run on mainnet, as it needs to be owner of existing Synthetix & Synth contracts
				if (network !== 'mainnet') {
					if (
						(synth && contractFlags[`Synth${currencyKey}`].deploy) ||
						(synthetix && contractFlags['Synthetix'].deploy)
					) {
						console.log(yellow(`Adding ${currencyKey} to Synthetix contract...`));

						await synthetix.methods.addSynth(synth.options.address).send(deployer.sendParameters());
					}

					if (
						synth &&
						!contractFlags[`Synth${currencyKey}`].deploy &&
						(synthetix && contractFlags['Synthetix'].deploy)
					) {
						console.log(yellow(`Adding Synthetix contract on ${currencyKey} contract...`));

						await synth.methods
							.setSynthetix(synthetix.options.address)
							.send(deployer.sendParameters());
					}
				}
			}

			const depot = await deployer.deploy({
				name: 'Depot',
				deps: ['Synthetix', 'SynthsUSD', 'FeePool'],
				args: [
					account,
					account,
					synthetix ? synthetix.options.address : '',
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
				if (
					synthetix &&
					contractFlags['Synthetix'].deploy &&
					depot &&
					!contractFlags['Depot'].deploy
				) {
					console.log(yellow(`Setting synthetix on depot contract...`));

					await depot.methods
						.setSynthetix(synthetix.options.address)
						.send(deployer.sendParameters());
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
