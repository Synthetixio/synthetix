'use strict';

const path = require('path');
const ethers = require('ethers');
const { gray, green, yellow } = require('chalk');
const { table } = require('table');
const Deployer = require('../Deployer');
const NonceManager = require('../NonceManager');
const { loadCompiledFiles, getLatestSolTimestamp } = require('../solidity');

const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	parameterNotice,
} = require('../util');
const { performTransactionalStep } = require('../command-utils/transact');

const {
	toBytes32,
	constants: {
		BUILD_FOLDER,
		CONTRACTS_FOLDER,
		SHORTING_REWARDS_FILENAME,
		DEPLOYMENT_FILENAME,
		ZERO_ADDRESS,
	},
} = require('../../../.');

const DEFAULTS = {
	gasPrice: '1',
	methodCallGasLimit: 250e3, // 250k
	contractDeploymentGasLimit: 6.9e6, // TODO split out into seperate limits for different contracts, Proxys, Synths, Synthetix
	network: 'kovan',
	buildPath: path.join(__dirname, '..', '..', '..', BUILD_FOLDER),
	rewardsToDeploy: [],
};

const addressOf = c => (c ? c.address : '');

const deployShortingRewards = async ({
	rewardsToDeploy = DEFAULTS.rewardsToDeploy,
	gasPrice = DEFAULTS.gasPrice,
	methodCallGasLimit = DEFAULTS.methodCallGasLimit,
	contractDeploymentGasLimit = DEFAULTS.contractDeploymentGasLimit,
	network = DEFAULTS.network,
	buildPath = DEFAULTS.buildPath,
	deploymentPath,
	privateKey,
	yes,
	dryRun = false,
} = {}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network });
	ensureDeploymentPath(deploymentPath);

	const {
		ownerActions,
		ownerActionsFile,
		shortingRewards,
		deployment,
		deploymentFile,
	} = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	console.log(
		gray('Checking all contracts not flagged for deployment have addresses in this network...')
	);

	// Get required deployments
	// Required deployments are:
	// 1. RewardsDistribution, CollateralShort
	// 2. rewardsToken that is not an address
	const requiredContractDeployments = ['RewardsDistribution', 'CollateralShort'];
	const requiredTokenDeployments = shortingRewards
		.map(x => {
			return [x.rewardsToken].filter(y => !ethers.utils.isAddress(y));
		})
		.reduce((acc, x) => acc.concat(x), [])
		.filter(x => x !== undefined);
	const uniqueRequiredDeployments = Array.from(
		new Set([].concat(requiredTokenDeployments, requiredContractDeployments))
	);

	const missingDeployments = uniqueRequiredDeployments.filter(name => {
		return !deployment.targets[name] || !deployment.targets[name].address;
	});

	if (missingDeployments.length > 0) {
		throw Error(
			`Cannot use existing contracts for deployment as addresses not found for the following contracts on ${network}:\n` +
				missingDeployments.join(', ') +
				'\n' +
				gray(`Used: ${deploymentFile} as source`)
		);
	}

	console.log(gray('Loading the compiled contracts locally...'));
	const { earliestCompiledTimestamp, compiled } = loadCompiledFiles({ buildPath });

	// now get the latest time a Solidity file was edited
	const latestSolTimestamp = getLatestSolTimestamp(CONTRACTS_FOLDER);

	const { providerUrl, privateKey: envPrivateKey, explorerLinkPrefix } = loadConnections({
		network,
	});

	// allow local deployments to use the private key passed as a CLI option
	if (network !== 'local' || !privateKey) {
		privateKey = envPrivateKey;
	}

	// Names in rewardsToDeploy will always be true
	const config = rewardsToDeploy.reduce(
		(acc, x) => Object.assign({}, { [`ShortingRewards${x}`]: { deploy: true } }, acc),
		{}
	);

	console.log(config);

	const deployer = new Deployer({
		compiled,
		contractDeploymentGasLimit,
		config,
		configFile: null, // null configFile so it doesn't overwrite config.json
		deployment,
		deploymentFile,
		gasPrice,
		methodCallGasLimit,
		network,
		privateKey,
		providerUrl,
		dryRun,
	});

	const { account, signer } = deployer;

	parameterNotice({
		'Dry Run': dryRun ? green('true') : yellow('⚠ NO'),
		Network: network,
		'Gas price to use': `${gasPrice} GWEI`,
		'Deployment Path': new RegExp(network, 'gi').test(deploymentPath)
			? deploymentPath
			: yellow('⚠⚠⚠ cant find network name in path. Please double check this! ') + deploymentPath,
		'Local build last modified': `${new Date(earliestCompiledTimestamp)} ${yellow(
			((new Date().getTime() - earliestCompiledTimestamp) / 60000).toFixed(2) + ' mins ago'
		)}`,
		'Last Solidity update':
			new Date(latestSolTimestamp) +
			(latestSolTimestamp > earliestCompiledTimestamp
				? yellow(' ⚠⚠⚠ this is later than the last build! Is this intentional?')
				: green(' ✅')),
		'Shorting rewards to deploy': rewardsToDeploy.join(', '),
		'Deployer account:': account,
	});

	if (!yes) {
		try {
			await confirmAction(
				yellow(
					`⚠⚠⚠ WARNING: This action will deploy the following contracts to ${network}:\n${rewardsToDeploy.join(
						', '
					)}\n`
				) +
					gray('-'.repeat(50)) +
					'\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			return;
		}
	}

	console.log(gray(`Starting deployment to ${network.toUpperCase()}...`));

	// Contract dependencies
	const resolverAddress = deployment.targets['ReadProxyAddressResolver'].address;

	// ----------------
	// Shorting Rewards
	// ----------------
	for (const { name, rewardsToken } of shortingRewards) {
		const shortingRewardNameFixed = `ShortingRewards${name}`;
		const shortinggRewardsConfig = config[shortingRewardNameFixed] || {};

		// Skip deployment
		if (!(shortinggRewardsConfig.deploy || false)) {
			console.log(gray(`Skipped deployment ${shortingRewardNameFixed}`));
			continue;
		}

		// Try and get addresses for the reward token
		const [rewardsTokenAddress] = [rewardsToken].map(token => {
			// If the token is specified, use that
			// otherwise will default to ZERO_ADDRESS
			if (token) {
				// If its an address, its likely an external dependency
				// e.g. Unipool V1 Token, Curve V1 Token
				if (ethers.utils.isAddress(token)) {
					return token;
				}

				// Otherwise it's an internal dependency and likely
				// to be a Synth, and it'll get the existing contract
				if (deployment.targets[token]) {
					return deployment.targets[token].address;
				}
			}

			return ZERO_ADDRESS;
		});

		// Double check addresses before deploying
		if (!yes) {
			try {
				await confirmAction(
					yellow(
						`⚠⚠⚠ WARNING: Please confirm - ${network}:\n` +
							`${shortingRewardNameFixed}'s reward token is ${rewardsToken} ${
								rewardsToken === rewardsTokenAddress ? '' : `(${rewardsTokenAddress})`
							}\n`
					) +
						gray('-'.repeat(50)) +
						'\nDo you want to continue? (y/n) '
				);
			} catch (err) {
				console.log(gray('Operation cancelled'));
				return;
			}
		}

		// Deploy contract with deployer as RewardsDistribution.
		const rewardsContract = await deployer.deployContract({
			name: shortingRewardNameFixed,
			deps: [rewardsToken].filter(x => !ethers.utils.isAddress(x)),
			source: 'ShortingRewards',
			args: [account, resolverAddress, account, rewardsTokenAddress],
		});

		const nonceManager = new NonceManager({});
		const manageNonces = deployer.manageNonces;

		const runStep = async opts =>
			performTransactionalStep({
				gasLimit: methodCallGasLimit, // allow overriding of gasLimit
				...opts,
				signer,
				deployer,
				gasPrice,
				explorerLinkPrefix,
				ownerActions,
				ownerActionsFile,
				nonceManager: manageNonces ? nonceManager : undefined,
			});

		// Rebuild the cache so it knows about CollateralShort
		await runStep({
			account,
			gasLimit: 6e6,
			contract: shortingRewardNameFixed,
			target: rewardsContract,
			write: 'rebuildCache',
			publiclyCallable: true,
		});

		// Link it to the Collateral Short contract
		await runStep({
			account,
			gasLimit: 6e6,
			contract: 'CollateralShort',
			target: deployer.getExistingContract({ contract: 'CollateralShort' }),
			write: 'addRewardsContracts',
			writeArg: [addressOf(rewardsContract), toBytes32(name)],
		});
	}

	console.log(
		green(`\nSuccessfully deployed ${deployer.newContractsDeployed.length} contracts!\n`)
	);

	const tableData = deployer.newContractsDeployed.map(({ name, address }) => [
		name,
		address,
		`${explorerLinkPrefix}/address/${address}`,
	]);
	console.log();
	if (tableData.length) {
		console.log(gray(`All contracts deployed on "${network}" network:`));
		console.log(table(tableData));
	} else {
		console.log(gray('Note: No new contracts deployed.'));
	}
};

module.exports = {
	deployShortingRewards,
	DEFAULTS,
	cmd: program =>
		program
			.command('deploy-shorting-rewards')
			.description('Deploy shorting rewards')
			.option(
				'-t, --rewards-to-deploy <items>',
				`Deploys shorting rewards with matching names in ${SHORTING_REWARDS_FILENAME}`,
				v => v.split(','),
				DEFAULTS.rewardsToDeploy
			)
			.option(
				'-b, --build-path [value]',
				'Path to a folder hosting compiled files from the "build" step in this script',
				DEFAULTS.buildPath
			)
			.option(
				'-c, --contract-deployment-gas-limit <value>',
				'Contract deployment gas limit',
				parseInt,
				DEFAULTS.contractDeploymentGasLimit
			)
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has the rewards file ${SHORTING_REWARDS_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option('-g, --gas-price <value>', 'Gas price in GWEI', DEFAULTS.gasPrice)
			.option(
				'-m, --method-call-gas-limit <value>',
				'Method call gas limit',
				parseInt,
				DEFAULTS.methodCallGasLimit
			)
			.option(
				'-n, --network <value>',
				'The network to run off.',
				x => x.toLowerCase(),
				DEFAULTS.network
			)
			.option(
				'-r, --dry-run',
				'If enabled, will not run any transactions but merely report on them.'
			)
			.option(
				'-v, --private-key [value]',
				'The private key to deploy with (only works in local mode, otherwise set in .env).'
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.action(deployShortingRewards),
};
