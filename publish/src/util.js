'use strict';

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { gray, cyan, yellow, redBright } = require('chalk');
const w3utils = require('web3-utils');

const {
	CONFIG_FILENAME,
	DEPLOYMENT_FILENAME,
	OWNER_ACTIONS_FILENAME,
	SYNTHS_FILENAME,
} = require('./constants');

const toBytes4 = str => w3utils.asciiToHex(str, 4);

const stringify = input => JSON.stringify(input, null, '\t') + '\n';

const ensureNetwork = network => {
	if (!/^(local|kovan|rinkeby|ropsten|mainnet)$/.test(network)) {
		throw Error(
			`Invalid network name of "${network}" supplied. Must be one of local, kovan, rinkeby, ropsten or mainnet`
		);
	}
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
	const synths = JSON.parse(fs.readFileSync(synthsFile));
	console.log(gray(`Loading the list of contracts to deploy on ${network.toUpperCase()}...`));
	const configFile = path.join(deploymentPath, CONFIG_FILENAME);
	const config = JSON.parse(fs.readFileSync(configFile));

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
		deployment,
		deploymentFile,
		ownerActions,
		ownerActionsFile,
	};
};

const loadConnections = ({ network }) => {
	if (network !== 'local' && !process.env.INFURA_PROJECT_ID) {
		throw Error('Missing .env key of INFURA_PROJECT_ID. Please add and retry.');
	}

	const providerUrl =
		network === 'local'
			? 'http://127.0.0.1:8545'
			: `https://${network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
	const privateKey = process.env.DEPLOY_PRIVATE_KEY;
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
}) => {
	ownerActions[key] = {
		target,
		action,
		complete: false,
		link: `${etherscanLinkPrefix}/address/${target}#writeContract`,
	};
	fs.writeFileSync(ownerActionsFile, stringify(ownerActions));
	console.log(cyan(`Cannot invoke ${key} as not owner. Appended to actions.`));
};

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
}) => {
	const action = `${contract}.${write}(${writeArg})`;

	// check to see if action required
	if (read) {
		// web3 counts provided arguments - even undefined ones - and they must match the expected args, hence the below
		const argumentsForReadFunction = [].concat(readArg).filter(entry => entry !== undefined); // reduce to array of args
		const response = await target.methods[read](...argumentsForReadFunction).call();

		console.log(yellow(`Attempting action: ${action}`));

		if (expected(response)) {
			console.log(gray(`Nothing required for this action.`));
			return;
		}
	}
	// otherwuse check the owner
	const owner = await target.methods.owner().call();
	if (owner === account) {
		// perform action
		const argumentsForWriteFunction = [].concat(writeArg).filter(entry => entry !== undefined); // reduce to array of args
		const txn = await target.methods[write](...argumentsForWriteFunction).send({
			from: account,
			gas: Number(gasLimit),
			gasPrice: w3utils.toWei(gasPrice.toString(), 'gwei'),
		});

		const { transactionHash: hash } = txn;
		console.log(gray(`Successfully completed ${action} in hash: ${hash}`));

		return hash;
	}

	if (ownerActions && ownerActionsFile) {
		// append to owner actions if supplied
		const appendOwnerAction = appendOwnerActionGenerator({
			ownerActions,
			ownerActionsFile,
			etherscanLinkPrefix,
		});

		appendOwnerAction({
			key: action,
			target: target.options.address,
			action: `${write}(${writeArg})`,
		});
		return true;
	} else {
		// otherwise wait for owner in real time
		try {
			await confirmAction(
				redBright(
					`YOUR TASK: Invoke ${write}(${writeArg}) via ${etherscanLinkPrefix}/address/` +
						target.options.address +
						'#writeContract'
				) + '\nPlease enter Y when the transaction has been mined and not earlier. '
			);

			return true;
		} catch (err) {
			console.log(gray('Cancelled'));
		}
	}
};

module.exports = {
	toBytes4,
	ensureNetwork,
	ensureDeploymentPath,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	appendOwnerActionGenerator,
	stringify,
	performTransactionalStep,
};
