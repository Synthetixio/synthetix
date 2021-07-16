'use strict';

const ethers = require('ethers');
const { gray, yellow, red, cyan } = require('chalk');

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
} = require('../util');

const {
	SIGNER_KIND,
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

const acceptOwnership = async ({
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

	const signerKind = isSafe ? SIGNER_KIND.safe : SIGNER_KIND.eoa;

	if (!newOwner) {
		newOwner = getUsers({ network, useOvm, user: 'owner' }).address;
	}

	if (!ethers.utils.isAddress(newOwner)) {
		console.error(red('Invalid new owner to nominate. Please check the option and try again.'));
		process.exit(1);
	} else {
		newOwner = newOwner.toLowerCase();
	}

	if (signerKind === SIGNER_KIND.eoa && !yes) {
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
	const { config, deployment } = loadAndCheckRequiredSources({
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

	if (signerKind === SIGNER_KIND.eoa && wallet.address.toLowerCase() !== newOwner.toLowerCase()) {
		throw new Error(
			`New owner is ${newOwner} and signer is ${wallet.address}. The signer needs to be the new owner in order to be able to claim ownership and/or execute owner actions.`
		);
	}

	console.log(gray(`Gas Price: ${gasPrice} gwei`));

	const signerData = await getSignerData({ providerUrl, newOwner });

	const stagedTransactions = await getStagedTransactions({ signerKind, signerData, network });

	console.log(gray('Looking for contracts whose ownership we should accept'));
	for (const contract of Object.keys(config)) {
		const { address, source } = deployment.targets[contract];
		const { abi } = deployment.sources[source];
		const deployedContract = new ethers.Contract(address, abi, provider);

		// ignore contracts that don't support Owned
		if (!deployedContract.functions.owner) {
			continue;
		}
		const currentOwner = (await deployedContract.owner()).toLowerCase();
		const nominatedOwner = (await deployedContract.nominatedOwner()).toLowerCase();

		if (currentOwner === newOwner) {
			console.log(gray(`${newOwner} is already the owner of ${contract}`));
		} else if (nominatedOwner === newOwner) {
			const encodedData = deployedContract.interface.encodeFunctionData('acceptOwnership', []);

			if (
				txAlreadyExists({
					signerKind,
					signerData,
					stagedTransactions,
					target: deployedContract.address,
					encodedData,
				})
			)
				continue;

			// continue if no pending tx found
			await confirmOrEnd(
				yes,
				signerKind !== SIGNER_KIND.eoa,
				yellow(`Confirm: ${contract}.acceptOwnership()?`)
			);

			if (signerKind !== SIGNER_KIND.eoa)
				console.log(yellow(`Attempting action protocolDaoContract.approveHash()`));
			else console.log(yellow(`Calling acceptOwnership() on ${contract}...`));

			try {
				await acceptOwnershipBySigner({
					signerKind,
					signerData,
					useFork,
					network,
					privateKey,
					providerUrl,
					encodedData,
					to: deployedContract.address,
					wallet,
					gasLimit,
					gasPrice,
				});
			} catch (err) {
				console.log(
					gray(`Transaction failed, if sending txn to safe api failed retry manually - ${err}`)
				);
				return;
			}
		} else {
			console.log(
				cyan(
					`Cannot acceptOwnership on ${contract} as nominatedOwner: ${nominatedOwner} isn't the newOwner ${newOwner} you specified. Have you run the nominate command yet?`
				)
			);
		}
	}
};

module.exports = {
	acceptOwnership,
	cmd: program =>
		program
			.command('accept-ownership')
			.description('Accepts ownership - a list of transactions required by the owner.')
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
			.action(acceptOwnership),
};
