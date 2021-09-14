'use strict';

const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { gray, yellow, red, cyan } = require('chalk');

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
	mixinGasOptions,
} = require('../util');
const { performTransactionalStep } = require('../command-utils/transact');

const DEFAULTS = {
	buildPath: path.join(__dirname, '..', '..', '..', BUILD_FOLDER),
	priorityGasPrice: '1',
};

const replaceSynths = async ({
	network,
	buildPath = DEFAULTS.buildPath,
	deploymentPath,
	maxFeePerGas,
	maxPriorityFeePerGas = DEFAULTS.priorityGasPrice,
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

	const { providerUrl, privateKey: envPrivateKey, explorerLinkPrefix } = loadConnections({
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
		config: {},
		configFile,
		deployment,
		deploymentFile,
		maxFeePerGas,
		maxPriorityFeePerGas,
		network,
		privateKey,
		providerUrl,
		dryRun: false,
	});

	// TODO - this should be fixed in Deployer
	deployer.deployedContracts.SafeDecimalMath = {
		address: getTarget({ contract: 'SafeDecimalMath' }).address,
	};

	const { account, signer } = deployer;
	const provider = deployer.provider;

	console.log(gray(`Using account with public key ${account}`));
	console.log(gray(`Using max base fee of ${maxFeePerGas} GWEI`));

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

	const { address: issuerAddress, source } = deployment.targets['Issuer'];
	const { abi: issuerABI } = deployment.sources[source];
	const Issuer = new ethers.Contract(issuerAddress, issuerABI, provider);

	const resolverAddress = await Issuer.resolver();
	const updatedSynths = JSON.parse(fs.readFileSync(synthsFile));

	const runStep = async opts =>
		performTransactionalStep({
			...opts,
			deployer,
			signer,
			explorerLinkPrefix,
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

		// Ensure this new synth has its resolver cache set
		const overrides = await mixinGasOptions(
			{},
			provider,
			this.maxFeePerGas,
			this.maxPriorityFeePerGas
		);

		const tx = await replacementSynth.rebuildCache(overrides);
		await tx.wait();

		// 4. Issuer.addSynth(newone) // owner
		await runStep({
			contract: 'Issuer',
			target: Issuer,
			read: 'synths',
			readArg: currencyKeyInBytes,
			expected: input => input === replacementSynth.address,
			write: 'addSynth',
			writeArg: replacementSynth.address,
		});

		// 5. old TokenState.setAssociatedContract(newone) // owner
		await runStep({
			contract: `TokenState${currencyKey}`,
			target: TokenState,
			read: 'associatedContract',
			expected: input => input === replacementSynth.address,
			write: 'setAssociatedContract',
			writeArg: replacementSynth.address,
		});

		// 6. old Proxy.setTarget(newone) // owner
		await runStep({
			contract: `Proxy${currencyKey}`,
			target: Proxy,
			read: 'target',
			expected: input => input === replacementSynth.address,
			write: 'setTarget',
			writeArg: replacementSynth.address,
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
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option('-g, --max-fee-per-gas <value>', 'Maximum base gas fee price in GWEI')
			.option(
				'--max-priority-fee-per-gas <value>',
				'Priority gas fee price in GWEI',
				DEFAULTS.priorityGasPrice
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
