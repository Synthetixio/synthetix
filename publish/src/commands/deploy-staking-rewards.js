'use strict';

const path = require('path');
const { gray, green, yellow } = require('chalk');
const { table } = require('table');
const w3utils = require('web3-utils');
const Deployer = require('../Deployer');
const { loadCompiledFiles, getLatestSolTimestamp } = require('../solidity');

const {
	ensureNetwork,
	ensureDeploymentPath,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	parameterNotice,
} = require('../util');

const {
	constants: {
		BUILD_FOLDER,
		CONFIG_FILENAME,
		CONTRACTS_FOLDER,
		STAKING_REWARDS_FILENAME,
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
};

const deployStakingRewards = async ({
	addNewStakingRewards,
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
	ensureDeploymentPath(deploymentPath);

	const {
		config,
		configFile,
		stakingRewards,
		stakingRewardsFile,
		deployment,
		deploymentFile,
	} = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	console.log(
		gray('Checking all contracts not flagged for deployment have addresses in this network...')
	);

	const invalidStakingRewardsConfig = stakingRewards.filter(x => {
		return !x.stakingToken || !x.rewardsToken;
	});

	if (invalidStakingRewardsConfig.length > 0) {
		throw Error(
			`${STAKING_REWARDS_FILENAME} has an invalid configurations: ` +
				invalidStakingRewardsConfig.map(x => x.name).join(', ') +
				'\n' +
				gray(`Used: ${stakingRewardsFile} as source`)
		);
	}

	// Get required deployments
	// Required deployments are:
	// 1. RewardsDistribution
	// 2. rewardsToken/stakingToken that is not an address
	const requiredContractDeployments = ['RewardsDistribution'];
	const requiredTokenDeployments = stakingRewards
		.map(x => {
			return [x.rewardsToken, x.stakingToken].filter(y => !w3utils.isAddress(y));
		})
		.reduce((acc, x) => acc.concat(x), [])
		.filter(x => x !== undefined);
	const uniqueRequiredDeployments = Array.prototype
		.concat(requiredTokenDeployments, requiredContractDeployments)
		.filter((v, i, self) => self.indexOf(v) === i); // Unique elements

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

	const { providerUrl, privateKey: envPrivateKey, etherscanLinkPrefix } = loadConnections({
		network,
	});

	// allow local deployments to use the private key passed as a CLI option
	if (network !== 'local' || !privateKey) {
		privateKey = envPrivateKey;
	}

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
	});

	const { account } = deployer;

	const newStakingRewardsToAdd = stakingRewards
		.filter(({ name }) => config[`StakingRewards${name}`] && config[`StakingRewards${name}`].deploy)
		.map(({ name }) => name);

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
		'Add any new staking rewards found?': addNewStakingRewards
			? green('✅ YES\n\t\t\t\t') + newStakingRewardsToAdd.join(', ')
			: yellow('⚠ NO'),
		'Deployer account:': account,
	});

	if (!yes) {
		try {
			await confirmAction(
				yellow(
					`⚠⚠⚠ WARNING: This action will deploy the following contracts to ${network}:\n${newStakingRewardsToAdd.join(
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

	console.log(gray(`Starting deployment to ${network.toUpperCase()} via Infura...`));

	// Contract dependencies
	const rewardsDistributionAddress = deployment.targets['RewardsDistribution'].address;

	// ----------------
	// Staking Rewards
	// ----------------
	for (const { name: stakingRewardName, rewardsToken, stakingToken } of stakingRewards) {
		const stakingRewardsConfig = config[`StakingRewards${stakingRewardName}`] || {};

		// Skip deployment
		if (!(stakingRewardsConfig.deploy || false)) {
			continue;
		}

		// Try and get addresses for the reward/staking token
		const [stakingTokenAddress, rewardsTokenAddress] = [stakingToken, rewardsToken].map(t => {
			// If the token is specified, use that
			// otherwise will default to ZERO_ADDRESS
			if (t) {
				// If its an address, its likely an external dependency
				// e.g. Unipool V1 Token, Curve V1 Token
				if (w3utils.isAddress(t)) {
					return t;
				}

				// Otherwise it's an internal dependency and likely
				// to be a Synth, and it'll get the existing contract
				if (deployment.targets[t]) {
					return deployment.targets[t].address;
				}
			}

			return ZERO_ADDRESS;
		});

		// Double check addresses before deploying
		if (stakingRewardsConfig.deploy && !yes) {
			try {
				await confirmAction(
					yellow(
						`⚠⚠⚠ WARNING: Please confirm - ${network}:\n` +
							`StakingRewards${stakingRewardName}'s staking token is ${stakingToken} ${
								stakingToken === stakingTokenAddress ? '' : `(${stakingTokenAddress})`
							}, and its reward token is ${rewardsToken} ${
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

		// Deploy contract
		await deployer.deployContract({
			name: `StakingRewards${stakingRewardName}`,
			deps: [stakingToken, rewardsToken].filter(x => x).filter(x => !w3utils.isAddress(x)),
			source: 'StakingRewards',
			args: [account, rewardsDistributionAddress, rewardsTokenAddress, stakingTokenAddress],
		});
	}

	console.log(
		green(`\nSuccessfully deployed ${deployer.newContractsDeployed.length} contracts!\n`)
	);

	const tableData = deployer.newContractsDeployed.map(({ name, address }) => [
		name,
		address,
		`${etherscanLinkPrefix}/address/${address}`,
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
	deployStakingRewards,
	DEFAULTS,
	cmd: program =>
		program
			.command('deploy-staking-rewards')
			.description('Deploy staking rewards')
			.option(
				'-a, --add-new-staking-rewards',
				`Whether or not any new staking rewards in the ${STAKING_REWARDS_FILENAME} file should be deployed if there is no entry in the config file`
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
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME}, the rewards file ${STAKING_REWARDS_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
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
			.action(deployStakingRewards),
};
