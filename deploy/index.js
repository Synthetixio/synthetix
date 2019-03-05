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
	.option('-s, --synth-list <value>', 'Path to a list of synths', './synths.json')
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
			console.log(gray(`Using account with public key ${deployer.account}`));

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

			// // ----------------
			// // Synths
			// // ----------------
			// for (const currencyKey of settings.synths) {
			// 	const tokenState = await deployContract(`TokenState.${currencyKey}`, [
			// 		account,
			// 		ZERO_ADDRESS,
			// 	]);
			// 	const tokenProxy = await deployContract(`Proxy.${currencyKey}`, [account]);
			// 	const synth = await deployContract(`Synth.${currencyKey}`, [
			// 		tokenProxy.options.address,
			// 		tokenState.options.address,
			// 		synthetix.options.address,
			// 		feePool.options.address,
			// 		`Synth ${currencyKey}`,
			// 		currencyKey,
			// 		account,
			// 		web3.utils.asciiToHex(currencyKey),
			// 	]);

			// 	if (
			// 		settings.contracts.Synth[currencyKey].action === 'deploy' ||
			// 		settings.contracts.TokenState[currencyKey].action === 'deploy'
			// 	) {
			// 		console.log(`Setting associated contract for ${currencyKey} TokenState...`);

			// 		await tokenState.methods
			// 			.setAssociatedContract(synth.options.address)
			// 			.send(sendParameters());
			// 	}
			// 	if (
			// 		settings.contracts.Proxy[currencyKey].action === 'deploy' ||
			// 		settings.contracts.Synth[currencyKey].action === 'deploy'
			// 	) {
			// 		console.log(`Setting proxy target for ${currencyKey} Proxy...`);

			// 		await tokenProxy.methods.setTarget(synth.options.address).send(sendParameters());
			// 	}

			// 	// Comment out if deploying on mainnet - Needs to be owner of Synthetix contract
			// 	if (
			// 		settings.contracts.Synth[currencyKey].action === 'deploy' ||
			// 		settings.contracts.Synthetix.action === 'deploy'
			// 	) {
			// 		console.log(`Adding ${currencyKey} to Synthetix contract...`);

			// 		await synthetix.methods.addSynth(synth.options.address).send(sendParameters());
			// 	}

			// 	// Comment out if deploying on mainnet - Needs to be owner of existing Synths contract
			// 	if (
			// 		settings.contracts.Synth[currencyKey].action === 'use-existing' &&
			// 		settings.contracts.Synthetix.action === 'deploy'
			// 	) {
			// 		console.log(`Adding Synthetix contract on ${currencyKey} contract...`);

			// 		await synth.methods.setSynthetix(synthetix.options.address).send(sendParameters());
			// 	}
			// }

			// const depot = await deployContract('Depot', [
			// 	account,
			// 	account,
			// 	synthetix.options.address,
			// 	deployedContracts['Synth.sUSD'].options.address,
			// 	feePool.options.address,
			// 	account,
			// 	web3.utils.toWei('500'),
			// 	web3.utils.toWei('.10'),
			// ]);

			// // Comment out if deploying on mainnet - Needs to be owner of Depot contract
			// if (
			// 	settings.contracts.Synthetix.action === 'deploy' &&
			// 	settings.contracts.Depot.action !== 'deploy'
			// ) {
			// 	console.log(`setting synthetix on depot contract...`);

			// 	await depot.methods.setSynthetix(synthetix.options.address).send(sendParameters());
			// }

			// console.log();
			// console.log();
			// console.log(' Successfully deployed all contracts:');
			// console.log();

			// const tableData = Object.keys(deployedContracts).map(key => [
			// 	key,
			// 	deployedContracts[key].options.address,
			// ]);

			// await deployedContractsToJSON();

			// console.log(table(tableData));
		}
	);

program.parse(process.argv);
