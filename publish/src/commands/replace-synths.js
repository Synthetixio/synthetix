'use strict';

const fs = require('fs');
const path = require('path');
const { gray, yellow, red, cyan } = require('chalk');
const w3utils = require('web3-utils');

const { loadCompiledFiles } = require('../solidity');
const Deployer = require('../Deployer');

const {
	toBytes32,
	constants: { CONFIG_FILENAME, COMPILED_FOLDER, DEPLOYMENT_FILENAME, BUILD_FOLDER, ZERO_ADDRESS },
	wrap,
} = require('../../..');

const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	stringify,
	performTransactionalStep,
} = require('../util');

const DEFAULTS = {
	buildPath: path.join(__dirname, '..', '..', '..', BUILD_FOLDER),
	contractDeploymentGasLimit: 7e6,
	methodCallGasLimit: 22e4,
	gasPrice: '1',
};

const replaceSynths = async ({
	network,
	buildPath = DEFAULTS.buildPath,
	deploymentPath,
	gasPrice = DEFAULTS.gasPrice,
	methodCallGasLimit = DEFAULTS.methodCallGasLimit,
	contractDeploymentGasLimit = DEFAULTS.contractDeploymentGasLimit,
	subclass,
	synthsToReplace,
	privateKey,
	yes,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network });
	ensureDeploymentPath(deploymentPath);

	const { getTarget } = wrap({ network, fs, path });

	const {
		configFile,
		synths,
		synthsFile,
		deployment,
		deploymentFile,
	} = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	if (synthsToReplace.length < 1) {
		console.log(yellow('No synths provided. Please use --synths-to-replace option'));
		return;
	}

	if (!subclass) {
		console.log(yellow('Please provide a valid Synth subclass'));
		return;
	}

	// now check the subclass is valud
	const compiledSourcePath = path.join(buildPath, COMPILED_FOLDER);
	const foundSourceFileForSubclass = fs
		.readdirSync(compiledSourcePath)
		.filter(name => /^.+\.json$/.test(name))
		.find(entry => new RegExp(`^${subclass}.json$`).test(entry));

	if (!foundSourceFileForSubclass) {
		console.log(
			yellow(`Cannot find a source file called: ${subclass}.json. Please check the name`)
		);
		return;
	}

	// sanity-check the synth list
	for (const synth of synthsToReplace) {
		if (synths.filter(({ name }) => name === synth).length < 1) {
			console.error(red(`Synth ${synth} not found!`));
			process.exitCode = 1;
			return;
		} else if (['sUSD'].indexOf(synth) >= 0) {
			console.error(red(`Synth ${synth} cannot be replaced`));
			process.exitCode = 1;
			return;
		}
	}

	const { providerUrl, privateKey: envPrivateKey, etherscanLinkPrefix } = loadConnections({
		network,
	});

	// allow local deployments to use the private key passed as a CLI option
	if (network !== 'local' || !privateKey) {
		privateKey = envPrivateKey;
	}

	console.log(gray('Loading the compiled contracts locally...'));
	const { compiled } = loadCompiledFiles({ buildPath });

	const deployer = new Deployer({
		compiled,
		contractDeploymentGasLimit,
		config: {},
		configFile,
		deployment,
		deploymentFile,
		gasPrice,
		methodCallGasLimit,
		network,
		privateKey,
		providerUrl,
		dryRun: false,
	});

	// TODO - this should be fixed in Deployer
	deployer.deployedContracts.SafeDecimalMath = {
		options: {
			address: getTarget({ contract: 'SafeDecimalMath' }).address,
		},
	};

	const { web3, account } = deployer;

	console.log(gray(`Using account with public key ${account}`));
	console.log(
		gray(
			`Using gas of ${gasPrice} GWEI with a limit of ${methodCallGasLimit} (methods), ${contractDeploymentGasLimit} (deployment)`
		)
	);

	const currentGasPrice = await web3.eth.getGasPrice();
	console.log(
		gray(`Current gas price is approx: ${w3utils.fromWei(currentGasPrice, 'gwei')} GWEI`)
	);

	// convert the list of synths into a list of deployed contracts
	const deployedSynths = synthsToReplace.map(currencyKey => {
		const { address: synthAddress, source: synthSource } = deployment.targets[
			`Synth${currencyKey}`
		];
		const { address: proxyAddress, source: proxySource } = deployment.targets[
			`Proxy${currencyKey}`
		];
		const { address: tokenStateAddress, source: tokenStateSource } = deployment.targets[
			`TokenState${currencyKey}`
		];

		const { abi: synthABI } = deployment.sources[synthSource];
		const { abi: tokenStateABI } = deployment.sources[tokenStateSource];
		const { abi: proxyABI } = deployment.sources[proxySource];

		const Synth = new web3.eth.Contract(synthABI, synthAddress);
		const TokenState = new web3.eth.Contract(tokenStateABI, tokenStateAddress);
		const Proxy = new web3.eth.Contract(proxyABI, proxyAddress);

		return {
			Synth,
			TokenState,
			Proxy,
			currencyKey,
			synthAddress,
		};
	});

	const totalSupplies = {};
	try {
		const totalSupplyList = await Promise.all(
			deployedSynths.map(({ Synth }) => Synth.methods.totalSupply().call())
		);
		totalSupplyList.forEach(
			(supply, i) => (totalSupplies[synthsToReplace[i]] = totalSupplyList[i])
		);
	} catch (err) {
		console.error(
			red(
				'Cannot connect to existing contracts. Please double check the deploymentPath is correct for the network allocated'
			)
		);
		process.exitCode = 1;
		return;
	}
	if (!yes) {
		try {
			await confirmAction(
				cyan(
					`${yellow(
						'⚠ WARNING'
					)}: This action will replace the following synths into ${subclass} on ${network}:\n- ${synthsToReplace
						.map(
							synth => synth + ' (totalSupply of: ' + w3utils.fromWei(totalSupplies[synth]) + ')'
						)
						.join('\n- ')}`
				) + '\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			return;
		}
	}

	const { address: issuerAddress, source } = deployment.targets['Issuer'];
	const { abi: issuerABI } = deployment.sources[source];
	const Issuer = new web3.eth.Contract(issuerABI, issuerAddress);

	const resolverAddress = await Issuer.methods.resolver().call();
	const updatedSynths = JSON.parse(fs.readFileSync(synthsFile));

	const runStep = async opts =>
		performTransactionalStep({
			...opts,
			account,
			gasLimit: methodCallGasLimit,
			gasPrice,
			etherscanLinkPrefix,
		});

	for (const { currencyKey, Synth, Proxy, TokenState } of deployedSynths) {
		const currencyKeyInBytes = toBytes32(currencyKey);
		const synthContractName = `Synth${currencyKey}`;

		// STEPS
		// 1. set old ExternTokenState.setTotalSupply(0) // owner
		await runStep({
			contract: synthContractName,
			target: Synth,
			read: 'totalSupply',
			expected: input => input === '0',
			write: 'setTotalSupply',
			writeArg: '0',
		});

		// 2. invoke Issuer.removeSynth(currencyKey) // owner
		await runStep({
			contract: 'Issuer',
			target: Issuer,
			read: 'synths',
			readArg: currencyKeyInBytes,
			expected: input => input === ZERO_ADDRESS,
			write: 'removeSynth',
			writeArg: currencyKeyInBytes,
		});

		// 3. use Deployer to deploy
		const replacementSynth = await deployer.deployContract({
			name: synthContractName,
			source: subclass,
			force: true,
			args: [
				Proxy.options.address,
				TokenState.options.address,
				`Synth ${currencyKey}`,
				currencyKey,
				account,
				currencyKeyInBytes,
				totalSupplies[currencyKey], // ensure new Synth gets totalSupply set from old Synth
				resolverAddress,
			],
		});

		// Ensure this new synth has its resolver cache set
		await replacementSynth.methods.rebuildCache().send({
			from: account,
			gas: Number(methodCallGasLimit),
			gasPrice: w3utils.toWei(gasPrice.toString(), 'gwei'),
		});

		// 4. Issuer.addSynth(newone) // owner
		await runStep({
			contract: 'Issuer',
			target: Issuer,
			read: 'synths',
			readArg: currencyKeyInBytes,
			expected: input => input === replacementSynth.options.address,
			write: 'addSynth',
			writeArg: replacementSynth.options.address,
		});

		// 5. old TokenState.setAssociatedContract(newone) // owner
		await runStep({
			contract: `TokenState${currencyKey}`,
			target: TokenState,
			read: 'associatedContract',
			expected: input => input === replacementSynth.options.address,
			write: 'setAssociatedContract',
			writeArg: replacementSynth.options.address,
		});

		// 6. old Proxy.setTarget(newone) // owner
		await runStep({
			contract: `Proxy${currencyKey}`,
			target: Proxy,
			read: 'target',
			expected: input => input === replacementSynth.options.address,
			write: 'setTarget',
			writeArg: replacementSynth.options.address,
		});

		// Update the synths.json file
		const synthToUpdateInJSON = updatedSynths.find(({ name }) => name === currencyKey);
		synthToUpdateInJSON.subclass = subclass;
		fs.writeFileSync(synthsFile, stringify(updatedSynths));
	}
};

module.exports = {
	replaceSynths,
	cmd: program =>
		program
			.command('replace-synths')
			.description('Replaces a number of existing synths with a subclass')
			.option(
				'-b, --build-path [value]',
				'Path to a folder hosting compiled files from the "build" step in this script',
				DEFAULTS.buildPath
			)
			.option(
				'-c, --contract-deployment-gas-limit <value>',
				'Contract deployment gas limit',
				x => parseInt(x, 10),
				DEFAULTS.contractDeploymentGasLimit
			)
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option('-g, --gas-price <value>', 'Gas price in GWEI', DEFAULTS.gasPrice)
			// Bug with parseInt
			// https://github.com/tj/commander.js/issues/523
			// Commander by default accepts 2 parameters,
			// so does parseInt, so parseInt(x, undefined) will
			// yield a NaN
			.option(
				'-m, --method-call-gas-limit <value>',
				'Method call gas limit',
				x => parseInt(x, 10),
				DEFAULTS.methodCallGasLimit
			)
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.option(
				'-s, --synths-to-replace <value>',
				'The list of synths to replace',
				(val, memo) => {
					memo.push(val);
					return memo;
				},
				[]
			)
			.option('-u, --subclass <value>', 'Subclass to switch into')
			.option(
				'-v, --private-key [value]',
				'The private key to transact with (only works in local mode, otherwise set in .env).'
			)
			.option('-x, --max-supply-to-purge-in-usd [value]', 'For PurgeableSynth, max supply', 1000)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.action(replaceSynths),
};
