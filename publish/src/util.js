'use strict';

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { gray, cyan, yellow, redBright, green } = require('chalk');
const w3utils = require('web3-utils');

const {
	constants: {
		CONFIG_FILENAME,
		DEPLOYMENT_FILENAME,
		OWNER_ACTIONS_FILENAME,
		SYNTHS_FILENAME,
		STAKING_REWARDS_FILENAME,
		VERSIONS_FILENAME,
		FEEDS_FILENAME,
	},
	wrap,
} = require('../..');

const { getPathToNetwork, getSynths, getStakingRewards, getVersions, getFeeds } = wrap({
	path,
	fs,
});

const { networks } = require('../..');
const stringify = input => JSON.stringify(input, null, '\t') + '\n';

const ensureNetwork = network => {
	if (!networks.includes(network)) {
		throw Error(
			`Invalid network name of "${network}" supplied. Must be one of ${networks.join(', ')}.`
		);
	}
};

const getDeploymentPathForNetwork = network => {
	console.log(gray('Loading default deployment for network'));
	return getPathToNetwork({ network });
};

const ensureDeploymentPath = deploymentPath => {
	if (!fs.existsSync(deploymentPath)) {
		throw Error(
			`Invalid deployment path. Please provide a folder with a compatible ${CONFIG_FILENAME}`
		);
	}
};

// Load up all contracts in the flagged source, get their deployed addresses (if any) and compiled sources
const loadAndCheckRequiredSources = ({ deploymentPath, network }) => {
	console.log(gray(`Loading the list of synths for ${network.toUpperCase()}...`));
	const synthsFile = path.join(deploymentPath, SYNTHS_FILENAME);
	const synths = getSynths({ network, deploymentPath });

	console.log(gray(`Loading the list of staking rewards to deploy on ${network.toUpperCase()}...`));
	const stakingRewardsFile = path.join(deploymentPath, STAKING_REWARDS_FILENAME);
	const stakingRewards = getStakingRewards({ network, deploymentPath });

	console.log(gray(`Loading the list of contracts to deploy on ${network.toUpperCase()}...`));
	const configFile = path.join(deploymentPath, CONFIG_FILENAME);
	const config = JSON.parse(fs.readFileSync(configFile));

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

	const ownerActionsFile = path.join(deploymentPath, OWNER_ACTIONS_FILENAME);
	if (!fs.existsSync(ownerActionsFile)) {
		fs.writeFileSync(ownerActionsFile, stringify({}));
	}
	const ownerActions = JSON.parse(fs.readFileSync(ownerActionsFile));

	return {
		config,
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
	};
};

const loadConnections = ({ network, useFork }) => {
	if (network !== 'local' && !process.env.INFURA_PROJECT_ID) {
		throw Error('Missing .env key of INFURA_PROJECT_ID. Please add and retry.');
	}

	// Note: If using a fork, providerUrl will need to be 'localhost', even if the target network is not 'local'.
	// This is because the fork command is assumed to be running at 'localhost:8545'.
	const providerUrl =
		network === 'local' || useFork
			? 'http://127.0.0.1:8545'
			: `https://${network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
	const privateKey =
		network === 'mainnet' ? process.env.DEPLOY_PRIVATE_KEY : process.env.TESTNET_DEPLOY_PRIVATE_KEY;
	const etherscanUrl =
		network === 'mainnet'
			? 'https://api.etherscan.io/api'
			: `https://api-${network}.etherscan.io/api`;

	const etherscanLinkPrefix = `https://${network !== 'mainnet' ? network + '.' : ''}etherscan.io`;
	return { providerUrl, privateKey, etherscanUrl, etherscanLinkPrefix };
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

const appendOwnerActionGenerator = ({ ownerActions, ownerActionsFile, etherscanLinkPrefix }) => ({
	key,
	action,
	target,
	data,
}) => {
	ownerActions[key] = {
		target,
		action,
		complete: false,
		link: `${etherscanLinkPrefix}/address/${target}#writeContract`,
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
const performTransactionalStep = async ({
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
	etherscanLinkPrefix,
	ownerActions,
	ownerActionsFile,
	dryRun,
	encodeABI,
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
			return;
		}
	}
	// otherwuse check the owner
	const owner = await target.methods.owner().call();
	if (owner === account) {
		// perform action
		let hash;
		if (dryRun) {
			_dryRunCounter++;
			hash = '0x' + _dryRunCounter.toString().padStart(64, '0');
		} else {
			const txn = await target.methods[write](...argumentsForWriteFunction).send({
				from: account,
				gas: Number(gasLimit),
				gasPrice: w3utils.toWei(gasPrice.toString(), 'gwei'),
			});
			hash = txn.transactionHash;
		}

		console.log(
			green(`${dryRun ? '[DRY RUN] ' : ''}Successfully completed ${action} in hash: ${hash}`)
		);

		return hash;
	}
	let data;
	if (ownerActions && ownerActionsFile) {
		// append to owner actions if supplied
		const appendOwnerAction = appendOwnerActionGenerator({
			ownerActions,
			ownerActionsFile,
			etherscanLinkPrefix,
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
		return true;
	} else {
		// otherwise wait for owner in real time
		try {
			data = target.methods[write](...argumentsForWriteFunction).encodeABI();
			if (encodeABI) {
				console.log(green(`Tx payload for target address ${target.options.address} - ${data}`));
				return true;
			}

			await confirmAction(
				redBright(
					`Confirm: Invoke ${write}(${argumentsForWriteFunction}) via https://gnosis-safe.io/app/#/safes/${owner}/transactions` +
						`to recipient ${target.options.address}` +
						`with data: ${data}`
				) + '\nPlease enter Y when the transaction has been mined and not earlier. '
			);

			return true;
		} catch (err) {
			console.log(gray('Cancelled'));
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

module.exports = {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	appendOwnerActionGenerator,
	stringify,
	performTransactionalStep,
	parameterNotice,
};
