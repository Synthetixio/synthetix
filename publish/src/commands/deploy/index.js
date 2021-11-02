'use strict';

const path = require('path');
const { gray, red } = require('chalk');
const pLimit = require('p-limit');
const Deployer = require('../../Deployer');
const NonceManager = require('../../NonceManager');
const { loadCompiledFiles } = require('../../solidity');

const {
	ensureDeploymentPath,
	ensureNetwork,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	reportDeployedContracts,
} = require('../../util');
const { performTransactionalStep } = require('../../command-utils/transact');

const {
	constants: { BUILD_FOLDER, CONFIG_FILENAME, SYNTHS_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../../..');

const addSynthsToProtocol = require('./add-synths-to-protocol');
const configureInverseSynths = require('./configure-inverse-synths');
const configureLegacySettings = require('./configure-legacy-settings');
const configureLoans = require('./configure-loans');
const configureStandalonePriceFeeds = require('./configure-standalone-price-feeds');
const configureSynths = require('./configure-synths');
const configureSystemSettings = require('./configure-system-settings');
const deployCore = require('./deploy-core');
const deployDappUtils = require('./deploy-dapp-utils.js');
const deployLoans = require('./deploy-loans');
const deploySynths = require('./deploy-synths');
const generateSolidityOutput = require('./generate-solidity-output');
const getDeployParameterFactory = require('./get-deploy-parameter-factory');
const importAddresses = require('./import-addresses');
const importFeePeriods = require('./import-fee-periods');
const performSafetyChecks = require('./perform-safety-checks');
const rebuildResolverCaches = require('./rebuild-resolver-caches');
const rebuildLegacyResolverCaches = require('./rebuild-legacy-resolver-caches');
const systemAndParameterCheck = require('./system-and-parameter-check');
const takeDebtSnapshotWhenRequired = require('./take-debt-snapshot-when-required');

const DEFAULTS = {
	priorityGasPrice: '1',
	debtSnapshotMaxDeviation: 0.01, // a 1 percent deviation will trigger a snapshot
	network: 'kovan',
	buildPath: path.join(__dirname, '..', '..', '..', '..', BUILD_FOLDER),
};

const deploy = async ({
	addNewSynths,
	buildPath = DEFAULTS.buildPath,
	concurrency,
	deploymentPath,
	dryRun = false,
	forceUpdateInverseSynthsOnTestnet = false,
	freshDeploy,
	maxFeePerGas,
	maxPriorityFeePerGas = DEFAULTS.priorityGasPrice,
	generateSolidity = false,
	ignoreCustomParameters,
	ignoreSafetyChecks,
	manageNonces,
	network = DEFAULTS.network,
	oracleExrates,
	privateKey,
	providerUrl,
	skipFeedChecks = false,
	specifyContracts,
	useFork,
	useOvm,
	yes,
} = {}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	const limitPromise = pLimit(concurrency);

	const {
		config,
		params,
		configFile,
		synths,
		deployment,
		deploymentFile,
		ownerActions,
		ownerActionsFile,
		feeds,
	} = loadAndCheckRequiredSources({
		deploymentPath,
		network,
		freshDeploy,
	});

	const getDeployParameter = getDeployParameterFactory({ params, ignoreCustomParameters });

	const addressOf = c => (c ? c.address : '');
	const sourceOf = c => (c ? c.source : '');

	// Mark contracts for deployment specified via an argument
	if (specifyContracts) {
		// Ignore config.json
		Object.keys(config).map(name => {
			config[name].deploy = false;
		});
		// Add specified contracts
		specifyContracts.split(',').map(name => {
			if (!config[name]) {
				config[name] = {
					deploy: true,
				};
			} else {
				config[name].deploy = true;
			}
		});
	}

	performSafetyChecks({
		config,
		deployment,
		deploymentPath,
		freshDeploy,
		ignoreSafetyChecks,
		manageNonces,
		maxFeePerGas,
		maxPriorityFeePerGas,
		network,
		useOvm,
	});

	const standaloneFeeds = Object.values(feeds).filter(({ standalone }) => standalone);

	console.log(
		gray('Checking all contracts not flagged for deployment have addresses in this network...')
	);
	const missingDeployments = Object.keys(config).filter(name => {
		return !config[name].deploy && (!deployment.targets[name] || !deployment.targets[name].address);
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
	const { earliestCompiledTimestamp, compiled } = loadCompiledFiles({ buildPath });

	const {
		providerUrl: envProviderUrl,
		privateKey: envPrivateKey,
		explorerLinkPrefix,
	} = loadConnections({
		network,
		useFork,
		useOvm,
	});

	if (!providerUrl) {
		if (!envProviderUrl) {
			throw new Error('Missing .env key of PROVIDER_URL. Please add and retry.');
		}

		providerUrl = envProviderUrl;
	}

	// when not in a local network, and not forking, and the privateKey isn't supplied,
	// use the one from the .env file
	if (network !== 'local' && !useFork && !privateKey) {
		privateKey = envPrivateKey;
	}

	const nonceManager = new NonceManager({});

	const deployer = new Deployer({
		compiled,
		config,
		configFile,
		deployment,
		deploymentFile,
		maxFeePerGas,
		maxPriorityFeePerGas,
		network,
		privateKey,
		providerUrl,
		dryRun,
		useOvm,
		useFork,
		ignoreSafetyChecks,
		nonceManager: manageNonces ? nonceManager : undefined,
	});

	const { account, signer } = deployer;

	nonceManager.provider = deployer.provider;
	nonceManager.account = account;

	const {
		currentSynthetixSupply,
		currentLastMintEvent,
		currentWeekOfInflation,
		oldExrates,
		oracleAddress,
		systemSuspended,
	} = await systemAndParameterCheck({
		account,
		buildPath,
		addNewSynths,
		concurrency,
		config,
		deployer,
		deploymentPath,
		dryRun,
		earliestCompiledTimestamp,
		freshDeploy,
		maxFeePerGas,
		maxPriorityFeePerGas,
		getDeployParameter,
		network,
		oracleExrates,
		providerUrl,
		skipFeedChecks,
		standaloneFeeds,
		synths,
		useFork,
		useOvm,
		yes,
	});

	console.log(
		gray(`Starting deployment to ${network.toUpperCase()}${useFork ? ' (fork)' : ''}...`)
	);

	// track for use with solidity output
	const runSteps = [];

	const runStep = async opts => {
		const { noop, ...rest } = await performTransactionalStep({
			...opts,
			signer,
			dryRun,
			explorerLinkPrefix,
			maxFeePerGas,
			maxPriorityFeePerGas,
			generateSolidity,
			nonceManager: manageNonces ? nonceManager : undefined,
			ownerActions,
			ownerActionsFile,
		});

		// only add to solidity steps when the transaction is NOT a no-op
		if (!noop) {
			runSteps.push(opts);
		}

		return { noop, ...rest };
	};

	await deployCore({
		account,
		addressOf,
		currentLastMintEvent,
		currentSynthetixSupply,
		currentWeekOfInflation,
		deployer,
		oracleAddress,
		useOvm,
	});

	const { synthsToAdd } = await deploySynths({
		account,
		addressOf,
		addNewSynths,
		config,
		deployer,
		freshDeploy,
		generateSolidity,
		network,
		synths,
		systemSuspended,
		useFork,
		yes,
	});

	const { collateralManagerDefaults } = await deployLoans({
		account,
		addressOf,
		deployer,
		getDeployParameter,
		network,
		useOvm,
	});

	await deployDappUtils({
		account,
		addressOf,
		deployer,
	});

	const { newContractsBeingAdded } = await importAddresses({
		addressOf,
		deployer,
		dryRun,
		continueEvenIfUnsuccessful: generateSolidity,
		limitPromise,
		runStep,
	});

	await rebuildResolverCaches({
		deployer,
		generateSolidity,
		limitPromise,
		newContractsBeingAdded,
		runStep,
		useOvm,
	});

	await rebuildLegacyResolverCaches({
		addressOf,
		compiled,
		deployer,
		network,
		runStep,
		useOvm,
	});

	await configureLegacySettings({
		account,
		addressOf,
		config,
		deployer,
		getDeployParameter,
		network,
		runStep,
		useOvm,
	});

	await importFeePeriods({
		deployer,
		explorerLinkPrefix,
		freshDeploy,
		generateSolidity,
		network,
		runStep,
		systemSuspended,
		useFork,
		yes,
	});

	await configureStandalonePriceFeeds({
		deployer,
		runStep,
		standaloneFeeds,
		useOvm,
	});

	await configureSynths({
		addressOf,
		explorerLinkPrefix,
		generateSolidity,
		synths,
		feeds,
		deployer,
		runStep,
	});

	await addSynthsToProtocol({
		addressOf,
		deployer,
		runStep,
		synthsToAdd,
	});

	await configureInverseSynths({
		addressOf,
		deployer,
		forceUpdateInverseSynthsOnTestnet,
		network,
		oldExrates,
		runStep,
		synths,
	});

	await configureSystemSettings({
		addressOf,
		deployer,
		useOvm,
		generateSolidity,
		getDeployParameter,
		network,
		runStep,
		synths,
	});

	await configureLoans({
		addressOf,
		collateralManagerDefaults,
		deployer,
		getDeployParameter,
		runStep,
	});

	await takeDebtSnapshotWhenRequired({
		debtSnapshotMaxDeviation: DEFAULTS.debtSnapshotMaxDeviation,
		deployer,
		generateSolidity,
		runStep,
		useOvm,
		useFork,
	});

	console.log(gray(`\n------ DEPLOY COMPLETE ------\n`));

	reportDeployedContracts({ deployer });

	if (generateSolidity) {
		generateSolidityOutput({
			addressOf,
			deployer,
			deployment,
			explorerLinkPrefix,
			network,
			newContractsBeingAdded,
			runSteps,
			sourceOf,
			useOvm,
		});
	}
};

module.exports = {
	deploy,
	DEFAULTS,
	cmd: program =>
		program
			.command('deploy')
			.description('Deploy compiled solidity files')
			.option(
				'-a, --add-new-synths',
				`Whether or not any new synths in the ${SYNTHS_FILENAME} file should be deployed if there is no entry in the config file`
			)
			.option(
				'-b, --build-path [value]',
				'Path to a folder hosting compiled files from the "build" step in this script',
				DEFAULTS.buildPath
			)
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME}, the synth list ${SYNTHS_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option(
				'-e, --concurrency <value>',
				'Number of parallel calls that can be made to a provider',
				10
			)
			.option(
				'-f, --fee-auth <value>',
				'The address of the fee authority for this network (default is to use existing)'
			)
			.option('-g, --max-fee-per-gas <value>', 'Maximum base gas fee price in GWEI')
			.option(
				'--max-priority-fee-per-gas <value>',
				'Priority gas fee price in GWEI',
				DEFAULTS.priorityGasPrice
			)
			.option('--generate-solidity', 'Whether or not to output the migration as a Solidity file')
			.option(
				'-h, --fresh-deploy',
				'Perform a "fresh" deploy, i.e. the first deployment on a network.'
			)
			.option(
				'-i, --ignore-safety-checks',
				'Ignores some validations regarding paths, compiler versions, etc.',
				false
			)
			.option(
				'--ignore-custom-parameters',
				'Ignores deployment parameters specified in params.json',
				false
			)
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
			.option(
				'-l, --oracle-gas-limit <value>',
				'The address of the gas limit oracle for this network (default is use existing)'
			)
			.option(
				'-n, --network <value>',
				'The network to run off.',
				x => x.toLowerCase(),
				DEFAULTS.network
			)
			.option(
				'-o, --oracle-exrates <value>',
				'The address of the oracle for this network (default is use existing)'
			)
			.option(
				'-q, --manage-nonces',
				'The command makes sure that no repeated nonces are sent (which may be the case when reorgs are common, i.e. in Goerli. Not to be confused with --manage-nonsense.)',
				false
			)
			.option(
				'-p, --provider-url <value>',
				'Ethereum network provider URL. If default, will use PROVIDER_URL found in the .env file.'
			)
			.option(
				'--skip-feed-checks',
				'If enabled, will skip the feed checking on start (speeds up deployment)'
			)
			.option(
				'-r, --dry-run',
				'If enabled, will not run any transactions but merely report on them.'
			)
			.option(
				'-v, --private-key [value]',
				'The private key to deploy with (only works in local mode, otherwise set in .env).'
			)
			.option(
				'-u, --force-update-inverse-synths-on-testnet',
				'Allow inverse synth pricing to be updated on testnet regardless of total supply'
			)
			.option(
				'-x, --specify-contracts <value>',
				'Ignore config.json  and specify contracts to be deployed (Comma separated list)'
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
			.action(async (...args) => {
				try {
					await deploy(...args);
				} catch (err) {
					// show pretty errors for CLI users
					console.error(red(err));
					console.log(err.stack);
					process.exitCode = 1;
				}
			}),
};
