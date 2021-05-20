'use strict';

const fs = require('fs');
const { gray, yellow, red, cyan, bgYellow, black } = require('chalk');
const w3utils = require('web3-utils');
const Web3 = require('web3');

const DEFAULTS = {
	gasLimit: 8e6, // 8,000,000
	numPendingTx: 25, // denotes the number of the latest transactions we want to check, multisig uses for loops to find the relevant info so we need to loop through them
};

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
	getMultisigInstance,
	getMultisigTransactionCount,
	getMultisigTransactions,
	checkExistingPendingTx,
	createAndSubmitTransaction,
} = require('../multisig-utils');

const getOwnerType = type => {
	switch (type.toLowerCase()) {
		case 'eoa':
			return ['eoa', 'EOA'];
		case 'safe':
			return ['safe', 'Gnosis Safe'];
		case 'multisig':
			return ['multisig', 'Gnosis Multisig'];
		default:
			return null;
	}
};

const confirmOrEnd = async message => {
	try {
		if (yes) {
			console.log(message);
		} else {
			await confirmAction(
				message +
					cyan(
						'\nPlease type "y" to stage transaction, or enter "n" to cancel and resume this later? (y/n) '
					)
			);
		}
	} catch (err) {
		console.log(gray('Operation cancelled'));
		process.exit();
	}
};

const acceptOwnership = async ({
	network,
	newOwner,
	deploymentPath,
	gasPrice = DEFAULTS.gasPrice,
	gasLimit = DEFAULTS.gasLimit,
	privateKey,
	yes,
	useOvm,
	providerUrl,
	accountType,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network, useOvm });
	ensureDeploymentPath(deploymentPath);

	function logTx(tx) {
		console.log(gray(`  > tx hash: ${tx.transactionHash}`));
	}

	if (!newOwner) {
		newOwner = getUsers({ network, useOvm, user: 'owner' }).address;
	}

	if (!w3utils.isAddress(newOwner)) {
		console.error(red('Invalid new owner to nominate. Please check the option and try again.'));
		process.exit(1);
	} else {
		newOwner = newOwner.toLowerCase();
	}
	// ensure all nominated owners are accepted
	const { config, deployment } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	const { providerUrl: envProviderUrl, privateKey: envPrivateKey } = loadConnections({
		network,
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

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

	const code = await web3.eth.getCode(newOwner);
	const isContract = code !== '0x';

	let types;
	if (accountType) {
		types = getOwnerType(accountType);
		if (!types) {
			throw new Error('Owner type can be one of the following: eoa, mutlisig, safe.');
		}
	} else {
		// no command line arg provided, try to deduct it
		if (isContract) {
			if (useOvm) {
				types = getOwnerType('multisig'); // currently only gnosis multisig is available on OVM
			} else {
				types = getOwnerType('safe');
			}
		} else {
			types = getOwnerType('eoa');
		}
	}

	const type = types[0];
	const typeName = types[1];

	web3.eth.accounts.wallet.add(privateKey);
	const account = web3.eth.accounts.wallet[0].address;
	console.log(gray(`Using account with public key ${account}`));
	console.log(gray(`Gas Price: ${gasPrice} gwei`));

	if (type === 'eoa') {
		if (account.toLowerCase() !== newOwner.toLowerCase()) {
			throw new Error(
				`EOA: New owner is ${newOwner} and signer is ${account}. The signer needs to be the new owner in order to be able to accept ownership`
			);
		}
	}

	// notify the user and ask for confirmation
	if (!yes) {
		try {
			await confirmAction(
				yellow(`\nHeads up! You are about to set ownership to a ${typeName}. Are you sure? (y/n) `)
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	}

	console.log(gray('Looking for contracts whose ownership we should accept'));
	for (const contract of Object.keys(config)) {
		const { address, source } = deployment.targets[contract];
		const { abi } = deployment.sources[source];
		const deployedContract = new web3.eth.Contract(abi, address);

		// ignore contracts that don't support Owned
		if (!deployedContract.methods.owner) {
			continue;
		}
		const currentOwner = (await deployedContract.methods.owner().call()).toLowerCase();
		const nominatedOwner = (await deployedContract.methods.nominatedOwner().call()).toLowerCase();

		if (currentOwner === newOwner) {
			console.log(gray(`${newOwner} is already the owner of ${contract}`));
		} else if (nominatedOwner === newOwner) {
			const encodedData = deployedContract.methods.acceptOwnership().encodeABI();

			// continue if no pending tx found
			await confirmOrEnd(yellow(`Confirm: Stage ${contract}.acceptOwnership() via protocolDAO?`));

			if (type === 'safe') {
				// Gnosis multisig
				try {
					console.log(yellow(`Attempting action protocolDaoContract.approveHash()`));
				} catch (err) {
					console.log(
						gray(`Transaction failed, if sending txn to safe api failed retry manually - ${err}`)
					);
					return;
				}
			} else if (type === 'multisig') {
				// Gnosis multisig
				try {
					// new owner should be gnosis safe proxy address
					const protocolDaoContract = getMultisigInstance(web3, newOwner);
					// get protocolDAO tx count
					const currentTxCount = await getMultisigTransactionCount(protocolDaoContract);

					if (!currentTxCount) {
						console.log(gray('Cannot access mutltisig. Exiting.'));
						process.exit();
					}

					const startIndex =
						currentTxCount > DEFAULTS.numPendingTx ? currentTxCount - DEFAULTS.numPendingTx : 0;

					const pendingTransactions = await getMultisigTransactions({
						multisigContract: protocolDaoContract,
						from: startIndex,
						to: currentTxCount,
						pending: true,
						executed: false,
					});
					console.log(`Last ${DEFAULTS.numPendingTx} Pending Transactions`, pendingTransactions);

					// Check if similar one already staged and pending
					// Check if similar one already staged and pending
					const existingTx = await checkExistingPendingTx({
						multisigContract: protocolDaoContract,
						pendingTransactions,
						target: deployedContract.options.address,
						encodedData,
					});

					if (existingTx) continue;

					await createAndSubmitTransaction({
						multisigContract: protocolDaoContract,
						data: encodedData,
						to: deployedContract.options.address,
						sender: account,
						value: 0,
						gasLimit,
						gasPrice,
						network,
					});
				} catch (err) {
					console.log(
						gray(`Transaction failed, if sending txn to safe api failed retry manually - ${err}`)
					);
					return;
				}
			} else {
				// EOA
				console.log(yellow(`Calling acceptOwnership() on ${contract}...`));
				try {
					const tx = await web3.eth.sendTransaction({
						from: account,
						to: deployedContract.options.address,
						gasPrice,
						gas: gasLimit,
						data: encodedData,
					});

					logTx(tx);
				} catch (err) {
					console.log(
						gray(`Transaction failed, if sending txn to safe api failed retry manually - ${err}`)
					);
					return;
				}
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
			.description('Owner script - a list of transactions required by the owner.')
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option(
				'-o, --new-owner <value>',
				'The address of protocolDAO proxy contract as owner (please include the 0x prefix)'
			)
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
			.option(
				'-t --account-type <value>',
				'The account type of the new owner i.e. eoa, safe, multisig'
			)
			.action(acceptOwnership),
};
