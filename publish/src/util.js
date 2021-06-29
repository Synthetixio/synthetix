'use strict';

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { gray, cyan, yellow, redBright, green } = require('chalk');
const { table } = require('table');
const w3utils = require('web3-utils');
const { BigNumber } = require('ethers');

const {
	constants: {
		CONFIG_FILENAME,
		PARAMS_FILENAME,
		DEPLOYMENT_FILENAME,
		OWNER_ACTIONS_FILENAME,
		SYNTHS_FILENAME,
		STAKING_REWARDS_FILENAME,
		SHORTING_REWARDS_FILENAME,
		VERSIONS_FILENAME,
		FEEDS_FILENAME,
	},
	wrap,
} = require('../..');

const {
	getPathToNetwork,
	getSynths,
	getStakingRewards,
	getVersions,
	getFeeds,
	getShortingRewards,
} = wrap({
	path,
	fs,
});

const { networks } = require('../..');
const JSONreplacer = (key, value) => {
	if (typeof value === 'object' && value.type && value.type === 'BigNumber') {
		return BigNumber.from(value).toString();
	}
	return value;
};
const stringify = input => JSON.stringify(input, JSONreplacer, '\t') + '\n';

const ensureNetwork = network => {
	if (!networks.includes(network)) {
		throw Error(
			`Invalid network name of "${network}" supplied. Must be one of ${networks.join(', ')}.`
		);
	}
};

const getDeploymentPathForNetwork = ({ network, useOvm }) => {
	console.log(gray('Loading default deployment for network'));
	return getPathToNetwork({ network, useOvm });
};

const ensureDeploymentPath = deploymentPath => {
	if (!fs.existsSync(deploymentPath)) {
		throw Error(
			`Invalid deployment path. Please provide a folder with a compatible ${CONFIG_FILENAME}`
		);
	}
};

// Load up all contracts in the flagged source, get their deployed addresses (if any) and compiled sources
const loadAndCheckRequiredSources = ({ deploymentPath, network, freshDeploy }) => {
	console.log(gray(`Loading the list of synths for ${network.toUpperCase()}...`));
	const synthsFile = path.join(deploymentPath, SYNTHS_FILENAME);
	const synths = getSynths({ network, deploymentPath });

	console.log(gray(`Loading the list of staking rewards to deploy on ${network.toUpperCase()}...`));
	const stakingRewardsFile = path.join(deploymentPath, STAKING_REWARDS_FILENAME);
	const stakingRewards = getStakingRewards({ network, deploymentPath });

	console.log(
		gray(`Loading the list of shorting rewards to deploy on ${network.toUpperCase()}...`)
	);
	const shortingRewardsFile = path.join(deploymentPath, SHORTING_REWARDS_FILENAME);
	const shortingRewards = getShortingRewards({ network, deploymentPath });

	console.log(gray(`Loading the list of contracts to deploy on ${network.toUpperCase()}...`));
	const configFile = path.join(deploymentPath, CONFIG_FILENAME);
	const config = JSON.parse(fs.readFileSync(configFile));

	console.log(gray(`Loading the list of deployment parameters on ${network.toUpperCase()}...`));
	const paramsFile = path.join(deploymentPath, PARAMS_FILENAME);
	const params = JSON.parse(fs.readFileSync(paramsFile));

	const versionsFile = path.join(deploymentPath, VERSIONS_FILENAME);
	const versions = network !== 'local' ? getVersions({ network, deploymentPath }) : {};

	const feedsFile = path.join(deploymentPath, FEEDS_FILENAME);
	const feeds = getFeeds({ network, deploymentPath });

	console.log(
		gray(`Loading the list of contracts already deployed for ${network.toUpperCase()}...`)
	);
	const deploymentFile = path.join(deploymentPath, DEPLOYMENT_FILENAME);
	if (!fs.existsSync(deploymentFile)) {
		fs.writeFileSync(deploymentFile, stringify({ targets: {}, sources: {} }));
	}
	const deployment = JSON.parse(fs.readFileSync(deploymentFile));

	if (freshDeploy) {
		deployment.targets = {};
		deployment.sources = {};
	}

	const ownerActionsFile = path.join(deploymentPath, OWNER_ACTIONS_FILENAME);
	if (!fs.existsSync(ownerActionsFile)) {
		fs.writeFileSync(ownerActionsFile, stringify({}));
	}
	const ownerActions = JSON.parse(fs.readFileSync(ownerActionsFile));

	return {
		config,
		params,
		configFile,
		synths,
		synthsFile,
		stakingRewards,
		stakingRewardsFile,
		deployment,
		deploymentFile,
		ownerActions,
		ownerActionsFile,
		versions,
		versionsFile,
		feeds,
		feedsFile,
		shortingRewards,
		shortingRewardsFile,
	};
};

const getExplorerLinkPrefix = ({ network, useOvm }) => {
	return `https://${network !== 'mainnet' ? network + (useOvm ? '-' : '.') : ''}${
		useOvm ? 'explorer.optimism' : 'etherscan'
	}.io`;
};

const loadConnections = ({ network, useFork, useOvm }) => {
	// Note: If using a fork, providerUrl will need to be 'localhost', even if the target network is not 'local'.
	// This is because the fork command is assumed to be running at 'localhost:8545'.
	let providerUrl;
	if (network === 'local' || useFork) {
		providerUrl = 'http://127.0.0.1:8545';
	} else {
		if (network === 'mainnet' && process.env.PROVIDER_URL_MAINNET) {
			providerUrl = process.env.PROVIDER_URL_MAINNET;
		} else {
			providerUrl = process.env.PROVIDER_URL.replace('network', network);
		}
	}

	const privateKey =
		network === 'mainnet' ? process.env.DEPLOY_PRIVATE_KEY : process.env.TESTNET_DEPLOY_PRIVATE_KEY;

	const etherscanUrl =
		network === 'mainnet'
			? 'https://api.etherscan.io/api'
			: `https://api-${network}.etherscan.io/api`;

	const explorerLinkPrefix = getExplorerLinkPrefix({ network, useOvm });

	return { providerUrl, privateKey, etherscanUrl, explorerLinkPrefix };
};

const confirmAction = prompt =>
	new Promise((resolve, reject) => {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

		rl.question(prompt, answer => {
			if (/y|Y/.test(answer)) resolve();
			else reject(Error('Not confirmed'));
			rl.close();
		});
	});

const appendOwnerActionGenerator = ({ ownerActions, ownerActionsFile, explorerLinkPrefix }) => ({
	key,
	action,
	target,
	data,
}) => {
	ownerActions[key] = {
		target,
		action,
		complete: false,
		link: `${explorerLinkPrefix}/address/${target}#writeContract`,
		data,
	};
	fs.writeFileSync(ownerActionsFile, stringify(ownerActions));
	console.log(cyan(`Cannot invoke ${key} as not owner. Appended to actions.`));
};

let _dryRunCounter = 0;
/**
 * Run a single transaction step, first checking to see if the value needs
 * changing at all, and then whether or not its the owner running it.
 *
 * @returns transaction hash if successful, true if user completed, or falsy otherwise
 */
const performTransactionalStepWeb3 = async ({
	account,
	contract,
	target,
	read,
	readArg, // none, 1 or an array of args, array will be spread into params
	expected,
	write,
	writeArg, // none, 1 or an array of args, array will be spread into params
	gasLimit,
	gasPrice,
	explorerLinkPrefix,
	ownerActions,
	ownerActionsFile,
	dryRun,
	encodeABI,
	nonceManager,
	publiclyCallable,
}) => {
	const argumentsForWriteFunction = [].concat(writeArg).filter(entry => entry !== undefined); // reduce to array of args
	const action = `${contract}.${write}(${argumentsForWriteFunction.map(arg =>
		arg.length === 66 ? w3utils.hexToAscii(arg) : arg
	)})`;

	// check to see if action required
	console.log(yellow(`Attempting action: ${action}`));

	if (read) {
		// web3 counts provided arguments - even undefined ones - and they must match the expected args, hence the below
		const argumentsForReadFunction = [].concat(readArg).filter(entry => entry !== undefined); // reduce to array of args
		const response = await target.methods[read](...argumentsForReadFunction).call();

		if (expected(response)) {
			console.log(gray(`Nothing required for this action.`));
			return { noop: true };
		}
	}
	// otherwise check the owner
	const owner = await target.methods.owner().call();
	if (owner === account || publiclyCallable) {
		// perform action
		let hash;
		let gasUsed = 0;
		if (dryRun) {
			_dryRunCounter++;
			hash = '0x' + _dryRunCounter.toString().padStart(64, '0');
		} else {
			const params = {
				from: account,
				gas:
					Number(gasLimit) ||
					(await target.methods[write](...argumentsForWriteFunction).estimateGas()),
				gasPrice: w3utils.toWei(gasPrice.toString(), 'gwei'),
			};

			if (nonceManager) {
				params.nonce = await nonceManager.getNonce();
			}

			const txn = await target.methods[write](...argumentsForWriteFunction).send(params);

			hash = txn.transactionHash;
			gasUsed = txn.gasUsed;

			if (nonceManager) {
				nonceManager.incrementNonce();
			}
		}

		console.log(
			green(
				`${
					dryRun ? '[DRY RUN] ' : ''
				}Successfully completed ${action} in hash: ${hash}. Gas used: ${(gasUsed / 1e6).toFixed(
					2
				)}m `
			)
		);

		return { mined: true, hash };
	} else {
		console.log(gray(`  > Account ${account} is not owner ${owner}`));
	}

	let data;
	if (ownerActions && ownerActionsFile) {
		// append to owner actions if supplied
		const appendOwnerAction = appendOwnerActionGenerator({
			ownerActions,
			ownerActionsFile,
			explorerLinkPrefix,
		});

		data = target.methods[write](...argumentsForWriteFunction).encodeABI();

		const ownerAction = {
			key: action,
			target: target.options.address,
			action: `${write}(${argumentsForWriteFunction})`,
			data: data,
		};

		if (dryRun) {
			console.log(
				gray(`[DRY RUN] Would append owner action of the following:\n${stringify(ownerAction)}`)
			);
		} else {
			appendOwnerAction(ownerAction);
		}
		return { pending: true };
	} else {
		// otherwise wait for owner in real time
		try {
			data = target.methods[write](...argumentsForWriteFunction).encodeABI();
			if (encodeABI) {
				console.log(green(`Tx payload for target address ${target.options.address} - ${data}`));
				return { pending: true };
			}

			await confirmAction(
				redBright(
					`Confirm: Invoke ${write}(${argumentsForWriteFunction}) via https://gnosis-safe.io/app/#/safes/${owner}/transactions` +
						`to recipient ${target.options.address}` +
						`with data: ${data}`
				) + '\nPlease enter Y when the transaction has been mined and not earlier. '
			);

			return { pending: true };
		} catch (err) {
			console.log(gray('Cancelled'));
			return {};
		}
	}
};

const parameterNotice = props => {
	console.log(gray('-'.repeat(50)));
	console.log('Please check the following parameters are correct:');
	console.log(gray('-'.repeat(50)));

	Object.entries(props).forEach(([key, val]) => {
		console.log(gray(key) + ' '.repeat(40 - key.length) + redBright(val));
	});

	console.log(gray('-'.repeat(50)));
};

function reportDeployedContracts({ deployer }) {
	console.log(
		green(`\nSuccessfully deployed ${deployer.newContractsDeployed.length} contracts!\n`)
	);

	const tableData = deployer.newContractsDeployed.map(({ name, address }) => [
		name,
		address,
		deployer.deployment.targets[name].link,
	]);
	console.log();
	if (tableData.length) {
		console.log(gray(`All contracts deployed on "${deployer.network}" network:`));
		console.log(table(tableData));
	} else {
		console.log(gray('Note: No new contracts deployed.'));
	}
}

module.exports = {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	getExplorerLinkPrefix,
	loadConnections,
	confirmAction,
	appendOwnerActionGenerator,
	stringify,
	performTransactionalStepWeb3,
	parameterNotice,
	reportDeployedContracts,
};
