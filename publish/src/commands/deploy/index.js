'use strict';

const path = require('path');
const { gray, red } = require('chalk');
const { constants } = require('ethers');
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
	performTransactionalStep,
	reportDeployedContracts,
} = require('../../util');

const {
	constants: { BUILD_FOLDER, CONFIG_FILENAME, SYNTHS_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../../..');

const performSafetyChecks = require('./perform-safety-checks');
const getDeployParameterFactory = require('./get-deploy-parameter-factory');
const systemAndParameterCheck = require('./system-and-parameter-check');
const deployCore = require('./deploy-core');
const deploySynths = require('./deploy-synths');
const deployLoans = require('./deploy-loans');
const deployDappUtils = require('./deploy-dapp-utils.js');
const deployBinaryOptions = require('./deploy-binary-options');
const deployFutures = require('./deploy-futures');
const importAddresses = require('./import-addresses');
const rebuildResolverCaches = require('./rebuild-resolver-caches');
const configureLegacySettings = require('./configure-legacy-settings');
const configureStandalonePriceFeeds = require('./configure-standalone-price-feeds');
const configureSynths = require('./configure-synths');
const addSynthsToProtocol = require('./add-synths-to-protocol');
const configureInverseSynths = require('./configure-inverse-synths');
const configureSystemSettings = require('./configure-system-settings');
const configureLoans = require('./configure-loans');
const takeDebtSnapshotWhenRequired = require('./take-debt-snapshot-when-required');

const DEFAULTS = {
	gasPrice: '1',
	methodCallGasLimit: 250e3, // 250k
	contractDeploymentGasLimit: 6.9e6, // TODO split out into separate limits for different contracts, Proxys, Synths, Synthetix
	debtSnapshotMaxDeviation: 0.01, // a 1 percent deviation will trigger a snapshot
	network: 'kovan',
	buildPath: path.join(__dirname, '..', '..', '..', '..', BUILD_FOLDER),
};

const deploy = async ({
	addNewSynths,
	buildPath = DEFAULTS.buildPath,
	concurrency,
	contractDeploymentGasLimit = DEFAULTS.contractDeploymentGasLimit,
	deploymentPath,
	dryRun = false,
	forceUpdateInverseSynthsOnTestnet = false,
	freshDeploy,
	gasPrice = DEFAULTS.gasPrice,
	ignoreCustomParameters,
	ignoreSafetyChecks,
	manageNonces,
	methodCallGasLimit = DEFAULTS.methodCallGasLimit,
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

	// OVM uses a gas price of 0 (unless --gas explicitely defined).
	if (useOvm && gasPrice === DEFAULTS.gasPrice) {
		gasPrice = constants.Zero;
	}

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

	const getDeployParameter = getDeployParameterFactory({ params, yes, ignoreCustomParameters });

	const addressOf = c => (c ? c.options.address : '');

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
		contractDeploymentGasLimit,
		deployment,
		deploymentPath,
		freshDeploy,
		ignoreSafetyChecks,
		manageNonces,
		methodCallGasLimit,
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
		etherscanLinkPrefix,
	} = loadConnections({
		network,
		useFork,
	});

	if (!providerUrl) {
		if (!envProviderUrl) {
			throw new Error('Missing .env key of PROVIDER_URL. Please add and retry.');
		}

		providerUrl = envProviderUrl;
	}

	// if not specified, or in a local network, override the private key passed as a CLI option, with the one specified in .env
	if (network !== 'local' && !privateKey) {
		privateKey = envPrivateKey;
	}

	const nonceManager = new NonceManager({});

	const deployer = new Deployer({
		compiled,
		contractDeploymentGasLimit,
		config,
		configFile,
		deployment,
		deploymentFile,
		gasPrice,
		methodCallGasLimit,
		network,
		privateKey,
		providerUrl,
		dryRun,
		useOvm,
		useFork,
		ignoreSafetyChecks,
		nonceManager: manageNonces ? nonceManager : undefined,
	});

	const { account } = deployer;

	nonceManager.web3 = deployer.provider.web3;
	nonceManager.account = account;

	const {
		currentSynthetixSupply,
		currentLastMintEvent,
		currentWeekOfInflation,
		oldExrates,
		oracleAddress,
	} = await systemAndParameterCheck({
		account,
		addNewSynths,
		concurrency,
		config,
		contractDeploymentGasLimit,
		deployer,
		deploymentPath,
		dryRun,
		earliestCompiledTimestamp,
		freshDeploy,
		gasPrice,
		getDeployParameter,
		methodCallGasLimit,
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

	const runStep = async opts =>
		performTransactionalStep({
			gasLimit: methodCallGasLimit, // allow overriding of gasLimit
			...opts,
			account,
			gasPrice,
			etherscanLinkPrefix,
			ownerActions,
			ownerActionsFile,
			dryRun,
			nonceManager: manageNonces ? nonceManager : undefined,
		});

	const { readProxyForResolver } = await deployCore({
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
		network,
		synths,
		yes,
	});

	const { useEmptyCollateralManager, collateralManagerDefaults } = await deployLoans({
		account,
		addressOf,
		deployer,
		getDeployParameter,
		network,
		useOvm,
	});

	await deployBinaryOptions({
		account,
		addressOf,
		deployer,
	});

	await deployFutures({
		account,
		addressOf,
		deployer,
		readProxyForResolver,
		runStep,
	});

	await deployDappUtils({
		account,
		addressOf,
		deployer,
	});

	await importAddresses({
		addressOf,
		deployer,
		limitPromise,
		runStep,
	});

	await rebuildResolverCaches({
		addressOf,
		compiled,
		deployer,
		limitPromise,
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

	await configureStandalonePriceFeeds({
		deployer,
		runStep,
		standaloneFeeds,
	});

	await configureSynths({
		addressOf,
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
		deployer,
		methodCallGasLimit,
		useOvm,
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
		useEmptyCollateralManager,
	});

	await takeDebtSnapshotWhenRequired({
		debtSnapshotMaxDeviation: DEFAULTS.debtSnapshotMaxDeviation,
		deployer,
		runStep,
		useOvm,
	});

	console.log(gray(`\n------ DEPLOY COMPLETE ------\n`));

	reportDeployedContracts({ deployer });
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
				'-c, --contract-deployment-gas-limit <value>',
				'Contract deployment gas limit',
				parseFloat,
				DEFAULTS.contractDeploymentGasLimit
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
			.option('-g, --gas-price <value>', 'Gas price in GWEI', DEFAULTS.gasPrice)
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
				'-m, --method-call-gas-limit <value>',
				'Method call gas limit',
				parseFloat,
				DEFAULTS.methodCallGasLimit
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
