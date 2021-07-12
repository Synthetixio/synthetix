'use strict';

const ethers = require('ethers');
const fs = require('fs');
const { gray, yellow, red, bgYellow, black } = require('chalk');

const {
	getUsers,
	constants: { CONFIG_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../..');

const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	stringify,
} = require('../util');

const {
	KIND,
	getSignerData,
	getStagedTransactions,
	txAlreadyExists,
	acceptOwnershipBySigner,
} = require('../command-utils/owner-actions');

const { confirmOrEnd } = require('../command-utils/ui-utils');

const DEFAULTS = {
	gasPrice: '15',
	gasLimit: 2e5, // 200,000
};

const owner = async ({
	network,
	newOwner,
	deploymentPath,
	gasPrice,
	gasLimit,
	privateKey,
	yes,
	useOvm,
	useFork,
	providerUrl,
	isSafe,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	const signerKind = isSafe ? KIND.safe : KIND.eoa;

	if (!newOwner) {
		newOwner = getUsers({ network, useOvm, user: 'owner' }).address;
	}

	if (!ethers.utils.isAddress(newOwner)) {
		console.error(red('Invalid new owner to nominate. Please check the option and try again.'));
		process.exit(1);
	} else {
		newOwner = newOwner.toLowerCase();
	}

	if (signerKind === KIND.eoa && !yes) {
		try {
			await confirmAction(
				yellow(
					'\nHeads up! You are about to set ownership to an EOA (externally owned address), i.e. not a multisig or a DAO. Are you sure? (y/n) '
				)
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	}

	// ensure all nominated owners are accepted
	const { ownerActions, ownerActionsFile } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	const { providerUrl: envProviderUrl, privateKey: envPrivateKey } = loadConnections({
		network,
		useFork,
	});

	if (!providerUrl) {
		if (!envProviderUrl) {
			throw new Error('Missing .env key of PROVIDER_URL. Please add and retry.');
		}

		providerUrl = envProviderUrl;
	}

	if (!privateKey) {
		privateKey = envPrivateKey;
	}

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	let wallet;
	if (!privateKey) {
		const account = getUsers({ network, user: 'owner' }).address; // protocolDAO
		wallet = provider.getSigner(account);
		wallet.address = await wallet.getAddress();
	} else {
		wallet = new ethers.Wallet(privateKey, provider);
	}
	console.log(gray(`Using account with public key ${wallet.address}`));

	if (signerKind === KIND.eoa && wallet.address.toLowerCase() !== newOwner.toLowerCase()) {
		throw new Error(
			`New owner is ${newOwner} and signer is ${wallet.address}. The signer needs to be the new owner in order to be able to claim ownership and/or execute owner actions.`
		);
	}

	console.log(gray(`Gas Price: ${gasPrice} gwei`));

	const signerData = await getSignerData({ providerUrl, newOwner });

	const stagedTransactions = await getStagedTransactions({ signerKind, signerData, network });

	console.log(
		gray('Running through operations during deployment that couldnt complete as not owner.')
	);
	// Read owner-actions.json + encoded data to stage tx's
	for (const [key, entry] of Object.entries(ownerActions)) {
		const { target, data, complete } = entry;
		if (complete) continue;

		if (
			txAlreadyExists({
				signerKind,
				signerData,
				stagedTransactions,
				target,
				encodedData: data,
			})
		)
			continue;

		await confirmOrEnd(
			yes,
			signerKind !== KIND.eoa,
			yellow('Confirm: ') + `Stage ${bgYellow(black(key))} to (${target})`
		);

		try {
			await acceptOwnershipBySigner({
				signerKind,
				signerData,
				useFork,
				network,
				privateKey,
				providerUrl,
				encodedData: data,
				to: target,
				wallet,
				gasLimit,
				gasPrice,
			});

			entry.complete = true;
			fs.writeFileSync(ownerActionsFile, stringify(ownerActions));
		} catch (err) {
			console.log(
				gray(`Transaction failed, if sending txn to safe api failed retry manually - ${err}`)
			);
			return;
		}
	}
};

module.exports = {
	owner,
	cmd: program =>
		program
			.command('owner')
			.description('Owner script - a list of transactions required by the owner.')
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
			.option(
				'-o, --new-owner <value>',
				'The address of protocolDAO proxy contract as owner (please include the 0x prefix)'
			)
			.option('--is-safe', 'Wether the new owner is a gnosis safe wallet', false)
			.option('-v, --private-key [value]', 'The private key of wallet to stage with.')
			.option('-g, --gas-price <value>', 'Gas price in GWEI', DEFAULTS.gasPrice)
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, DEFAULTS.gasLimit)
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
			.option(
				'-p, --provider-url <value>',
				'Ethereum network provider URL. If default, will use PROVIDER_URL found in the .env file.'
			)
			.action(owner),
};
