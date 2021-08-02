'use strict';

const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { gray, yellow, red, cyan } = require('chalk');

const { loadCompiledFiles } = require('../solidity');
const Deployer = require('../Deployer');

const {
	toBytes32,
	constants: { CONFIG_FILENAME, COMPILED_FOLDER, DEPLOYMENT_FILENAME, BUILD_FOLDER },
} = require('../../..');

const nominateCmd = require('./nominate');
const ownerCmd = require('./owner');

const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	stringify,
} = require('../util');
const { performTransactionalStep } = require('../command-utils/transact');

const DEFAULTS = {
	buildPath: path.join(__dirname, '..', '..', '..', BUILD_FOLDER),
	contractDeploymentGasLimit: 7e6,
	methodCallGasLimit: 22e4,
	gasPrice: '1',
};

const replaceSynths = async ({
	buildPath = DEFAULTS.buildPath,
	contractDeploymentGasLimit = DEFAULTS.contractDeploymentGasLimit,
	deploymentPath,
	gasPrice = DEFAULTS.gasPrice,
	methodCallGasLimit = DEFAULTS.methodCallGasLimit,
	network,
	privateKey,
	subclass,
	useFork,
	useOvm,
	yes,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	const {
		config,
		configFile,
		synths,
		synthsFile,
		deployment,
		deploymentFile,
	} = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	if (!subclass) {
		console.log(yellow('Please provide a valid Synth subclass'));
		return;
	}

	const synthsToReplace = Object.entries(config)
		.filter(([label, { deploy }]) => /Synth(s|i)[\w]+$/.test(label) && deploy)
		.map(([label]) => label);

	if (!synthsToReplace.length) {
		console.log(
			yellow(`No synths marked to deploy in the config file - please update it and try again.`)
		);
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

	const { providerUrl, privateKey: envPrivateKey, explorerLinkPrefix } = loadConnections({
		network,
		useFork,
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
		address: deployment.targets['SafeDecimalMath'].address,
	};

	const { account, signer } = deployer;
	const provider = deployer.provider;

	console.log(gray(`Using account with public key ${account}`));
	console.log(
		gray(
			`Using gas of ${gasPrice} GWEI with a limit of ${methodCallGasLimit} (methods), ${contractDeploymentGasLimit} (deployment)`
		)
	);

	const currentGasPrice = await provider.getGasPrice();
	console.log(
		gray(`Current gas price is approx: ${ethers.utils.formatUnits(currentGasPrice, 'gwei')} GWEI`)
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

		const Synth = new ethers.Contract(synthAddress, synthABI, provider);
		const TokenState = new ethers.Contract(tokenStateAddress, tokenStateABI, provider);
		const Proxy = new ethers.Contract(proxyAddress, proxyABI, provider);

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
			deployedSynths.map(({ Synth }) => Synth.totalSupply())
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
							synth =>
								synth + ' (totalSupply of: ' + ethers.utils.formatEther(totalSupplies[synth]) + ')'
						)
						.join('\n- ')}`
				) + '\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			return;
		}
	}

	const updatedSynths = JSON.parse(fs.readFileSync(synthsFile));

	const runStep = async opts =>
		performTransactionalStep({
			...opts,
			signer,
			gasLimit: methodCallGasLimit,
			gasPrice,
			explorerLinkPrefix,
		});

	const resolverAddress = deployment.targets['ReadProxyAddressResolver'].address;

	const contractsToNominateUpgraderTo = [
		deployment.targets['Issuer'].address,
		deployment.targets['AddressResolver'],
	];
	const replacementSynths = [];

	// DEPLOY NEW SYNTHS
	console.log(gray('Deploy the new synths'));

	for (const { currencyKey, Synth, Proxy, TokenState } of deployedSynths) {
		const currencyKeyInBytes = toBytes32(currencyKey);
		const synthContractName = `Synth${currencyKey}`;

		console.log(gray('Deploying'), yellow(synthContractName));

		// deploy each synth
		const newSynth = await deployer.deployContract({
			name: synthContractName,
			source: subclass,
			args: [
				Proxy.address,
				TokenState.address,
				`Synth ${currencyKey}`,
				currencyKey,
				account,
				currencyKeyInBytes,
				totalSupplies[currencyKey], // ensure new Synth gets totalSupply set from old Synth
				resolverAddress,
			],
		});
		replacementSynths.push(newSynth);

		contractsToNominateUpgraderTo.push(
			Synth.address,
			Proxy.address,
			TokenState.address,
			newSynth.address
		);
	}

	// NOMINATE CONTRACTS TO THE UPGRADER
	const synthUpgrader = deployment.targets['SynthUpgrader'];
	console.log(
		gray('Nominate required contracts to the SynthUpgrader contract'),
		yellow(synthUpgrader.address)
	);

	await nominateCmd.nominate({
		// Note: passing as addresses - this won't work with any contract using LegacyOwned,
		// which does not include any Synths - ??? BUT WHAT ABOUT THEIR PROXIES OR TOKEN STATES?
		contracts: contractsToNominateUpgraderTo,
		deploymentPath,
		gasPrice,
		gasLimit: methodCallGasLimit,
		network,
		newOwner: synthUpgrader.address,
		useFork,
		useOvm,
	});

	// RUN MIGRATION

	// now finally invoke the upgrade for all synths
	console.log(gray('Running the upgrade action'));
	await runStep({
		contract: 'SynthUpgrader',
		target: synthUpgrader,
		write: 'upgrade',
		writeArgs: [
			deployedSynths.map(({ currencyKey }) => toBytes32(`Synth${currencyKey}`)),
			replacementSynths.map(synth => synth.address),
		],
	});

	// update the synths.json file with the appropriate subclass
	for (const { currencyKey } of deployedSynths) {
		const synthToUpdateInJSON = updatedSynths.find(({ name }) => name === currencyKey);
		synthToUpdateInJSON.subclass = subclass;
		fs.writeFileSync(synthsFile, stringify(updatedSynths));
	}

	// ACCEPT OWNERSHIP
	console.log(gray('Accept ownership of all contracts that were previously given'));
	await ownerCmd.owner({
		deploymentPath,
		gasPrice,
		gasLimit: methodCallGasLimit,
		network,
		skipActions: true, // skip any owner actions - only do the accept ownerships
		useFork,
		useOvm,
	});
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
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
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
			.option('-u, --subclass <value>', 'Subclass to switch into')
			.option(
				'-v, --private-key [value]',
				'The private key to transact with (only works in local mode, otherwise set in .env).'
			)
			.option('-x, --max-supply-to-purge-in-usd [value]', 'For PurgeableSynth, max supply', 1000)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')

			.action(replaceSynths),
};
