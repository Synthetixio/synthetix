'use strict';

const path = require('path');
const fs = require('fs');
const program = require('commander');
const { gray, green, yellow, red } = require('chalk');
const { table } = require('table');

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
	.option('-n, --network <value>', 'The network to run off.', 'kovan')
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
				console.error(
					red(
						`Cannot use existing contracts for deployment as addresses not found for the following contracts on ${network}:`
					)
				);
				console.error(missingDeployments.join('\n'));
				console.error(gray(`Used: ${deployedContractAddressFile} as source`));
				process.exit(1);
			}

			console.log(gray('Loading the compiled contracts locally...'));
			const compiledSourcePath = path.join(buildPath, COMPILED_FOLDER);

			const compiled = Object.entries(contractFlags).reduce(
				(memo, [contractName, { deploy, contract }]) => {
					const sourceFile = path.join(compiledSourcePath, `${contract}.json`);
					if (!fs.existsSync(sourceFile)) {
						console.error(red(`Cannot find compiled contract code for: ${contract}`));
						process.exit(1);
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

			const feePoolProxy = await deployer.deployContract({
				name: 'ProxyFeePool',
				args: [account],
			});

			const feePool = await deployer.deploy({
				name: 'FeePool',
				args: [
					feePoolProxy.options.address,
					account,
					account,
					account,
					web3.utils.toWei('0.0015', 'ether'),
					web3.utils.toWei('0.0015', 'ether'),
				],
			});

			if (contractFlags['ProxyFeePool'].deploy || contractFlags['FeePool'].deploy) {
				await feePoolProxy.methods
					.setTarget(feePool.options.address)
					.send(deployer.sendParameters());
			}

			const synthetixState = await deployer.deploy({
				name: 'SynthetixState',
				args: [account, account],
			});
			const synthetixProxy = await deployer.deploy({ name: 'ProxySynthetix', args: [account] });
			const synthetixTokenState = await deployer.deploy({
				name: 'TokenStateSynthetix',
				args: [account, account],
			});
			const synthetix = await deployer.deploy({
				name: 'Synthetix',
				args: [
					synthetixProxy.options.address,
					synthetixTokenState.options.address,
					synthetixState.options.address,
					account,
					exchangeRates.options.address,
					feePool.options.address,
				],
			});

			if (contractFlags['ProxySynthetix'].deploy || contractFlags['Synthetix'].deploy) {
				console.log(yellow('Setting target on ProxySynthetix...'));
				await synthetixProxy.methods
					.setTarget(synthetix.options.address)
					.send(deployer.sendParameters());
			}

			if (contractFlags['TokenStateSynthetix'].deploy) {
				console.log(yellow('Setting balance on TokenStateSynthetix...'));
				await synthetixTokenState.methods
					.setBalanceOf(account, web3.utils.toWei('100000000'))
					.send(deployer.sendParameters());
			}

			if (contractFlags['TokenStateSynthetix'].deploy || contractFlags['Synthetix'].deploy) {
				console.log(yellow('Setting associated contract on TokenStateSynthetix...'));
				await synthetixTokenState.methods
					.setAssociatedContract(synthetix.options.address)
					.send(deployer.sendParameters());
				console.log(yellow('Setting associated contract on Synthetix State...'));
				await synthetixState.methods
					.setAssociatedContract(synthetix.options.address)
					.send(deployer.sendParameters());
			}

			const synthetixEscrow = await deployer.deploy({
				name: 'SynthetixEscrow',
				args: [account, synthetix.options.address],
			});

			if (contractFlags['Synthetix'].deploy || contractFlags['SynthetixEscrow'].deploy) {
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
				if (contractFlags['FeePool'].deploy || contractFlags['Synthetix'].deploy) {
					console.log(yellow('Setting Synthetix on Fee Pool...'));
					await feePool.methods
						.setSynthetix(synthetix.options.address)
						.send(deployer.sendParameters());
				}
			}

			// ----------------
			// Synths
			// ----------------
			const synths = JSON.parse(synthList);
			for (const currencyKey of synths) {
				const tokenState = await deployer.deploy({
					name: `TokenState${currencyKey}`,
					args: [account, ZERO_ADDRESS],
				});
				const tokenProxy = await deployer.deploy({ name: `Proxy${currencyKey}`, args: [account] });
				const synth = await deployer.deploy({
					name: `Synth.${currencyKey}`,
					args: [
						tokenProxy.options.address,
						tokenState.options.address,
						synthetix.options.address,
						feePool.options.address,
						`Synth ${currencyKey}`,
						currencyKey,
						account,
						web3.utils.asciiToHex(currencyKey),
					],
				});

				if (
					contractFlags[`Synth${currencyKey}`].deploy ||
					contractFlags[`TokenState${currencyKey}`].deploy
				) {
					console.log(yellow(`Setting associated contract for ${currencyKey} TokenState...`));

					await tokenState.methods
						.setAssociatedContract(synth.options.address)
						.send(deployer.sendParameters());
				}
				if (
					contractFlags[`Proxy${currencyKey}`].deploy ||
					contractFlags[`Synth${currencyKey}`].deploy
				) {
					console.log(yellow(`Setting proxy target for ${currencyKey} Proxy...`));

					await tokenProxy.methods.setTarget(synth.options.address).send(deployer.sendParameters());
				}

				// Cannot run on mainnet, as it needs to be owner of existing Synthetix & Synth contracts
				if (network !== 'mainnet') {
					if (contractFlags[`Synth${currencyKey}`].deploy || contractFlags['Synthetix'].deploy) {
						console.log(yellow(`Adding ${currencyKey} to Synthetix contract...`));

						await synthetix.methods.addSynth(synth.options.address).send(deployer.sendParameters());
					}

					if (!contractFlags[`Synth${currencyKey}`].deploy && contractFlags['Synthetix'].deploy) {
						console.log(yellow(`Adding Synthetix contract on ${currencyKey} contract...`));

						await synth.methods
							.setSynthetix(synthetix.options.address)
							.send(deployer.sendParameters());
					}
				}
			}

			const depot = await deployer.deploy({
				name: 'Depot',
				args: [
					account,
					account,
					synthetix.options.address,
					deployer.deployedContracts['SynthsUSD'].options.address,
					feePool.options.address,
					account,
					web3.utils.toWei('500'),
					web3.utils.toWei('.10'),
				],
			});

			// Comment out if deploying on mainnet - Needs to be owner of Depot contract
			if (network !== 'mainnet') {
				if (contractFlags['Synthetix'].deploy && !contractFlags['Depot'].deploy) {
					console.log(yellow(`setting synthetix on depot contract...`));

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
						network,
						timestamp: new Date(),
						abi: compiled[name].abi,
					};
				});
			fs.writeFileSync(abiFile, JSON.stringify(abiData));

			// JJM: Honestly this can be combined with the ABIs file in the future
			console.log(gray('Overwriting addresses to file contracts.json under network folder'));
			const contractAddressesFile = path.join(outputPath, network, 'contracts.json');
			const contractAddresses = Object.keys(deployer.deployedContracts)
				.sort()
				.reduce((memo, name) => {
					memo[name] = deployer.deployedContracts[name].options.address;
					return memo;
				}, {});
			fs.writeFileSync(contractAddressesFile, JSON.stringify(contractAddresses));

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
