'use strict';

const fs = require('fs');
const { gray, yellow, red, cyan, bgYellow, black } = require('chalk');
const w3utils = require('web3-utils');
const Web3 = require('web3');

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
	getLastTxId,
	getMultisigInstance,
	getMultisigTransactionCount,
	getMultisigTransactions,
	createAndSubmitTransaction,
} = require('../multisig-utils');

const DEFAULTS = {
	gasPrice: '0',
	gasLimit: 8e6, // 8,000,000
};

const ownerMultisig = async ({
	network,
	newOwner,
	deploymentPath,
	gasPrice = DEFAULTS.gasPrice,
	gasLimit = DEFAULTS.gasLimit,
	privateKey,
	yes,
	useOvm,
	providerUrl,
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
	const { config, deployment, ownerActions, ownerActionsFile } = loadAndCheckRequiredSources({
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

	if (!isContract && !yes) {
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

	web3.eth.accounts.wallet.add(privateKey);
	const account = web3.eth.accounts.wallet[0].address;
	console.log(gray(`Using account with public key ${account}`));

	if (!isContract && account.toLowerCase() !== newOwner.toLowerCase()) {
		throw new Error(
			`New owner is ${newOwner} and signer is ${account}. The signer needs to be the new owner in order to be able to claim ownership and/or execute owner actions.`
		);
	}

	console.log(gray(`Gas Price: ${gasPrice} gwei`));
	console.log(gray(`Gas Limit: ${gasLimit}`));

	let protocolDaoContract;
	let currentTxCount;
	let lastTx;
	if (isContract) {
		// new owner should be gnosis safe proxy address
		protocolDaoContract = getMultisigInstance(web3, newOwner);

		// get protocolDAO tx count
		currentTxCount = await getMultisigTransactionCount(protocolDaoContract);
		lastTx = await getLastTxId(protocolDaoContract);
		console.log('TxCount, currentTxCount, lastTx', lastTx);

		if (!currentTxCount) {
			console.log(gray('Cannot access mutltisig. Exiting.'));
			process.exit();
		}

		console.log(
			yellow(`Using Protocol DAO multisig contract at ${protocolDaoContract.options.address}`)
		);
	}

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

	let stagedTransactions;
	if (isContract) {
		// Load staged transactions
		stagedTransactions = await getMultisigTransactions({
			multisigContract: protocolDaoContract,
			from: 0,
			to: currentTxCount,
			pending: true,
			executed: true,
		});
		console.log('1', stagedTransactions);
		stagedTransactions = await getMultisigTransactions({
			multisigContract: protocolDaoContract,
			from: 0,
			to: currentTxCount,
			pending: true,
			executed: false,
		});
		console.log('2', stagedTransactions);
		stagedTransactions = await getMultisigTransactions({
			multisigContract: protocolDaoContract,
			from: 0,
			to: currentTxCount,
			pending: false,
			executed: true,
		});
		console.log('3', stagedTransactions);
	}

	console.log(
		gray('Running through operations during deployment that couldnt complete as not owner.')
	);
	// Read owner-actions.json + encoded data to stage tx's
	for (const [key, entry] of Object.entries(ownerActions)) {
		const { target, data, complete } = entry;
		if (complete) continue;

		await confirmOrEnd(yellow('Confirm: ') + `Stage ${bgYellow(black(key))} to (${target})`);

		try {
			if (isContract) {
				await createAndSubmitTransaction({
					safeContract: protocolDaoContract,
					data,
					to: target,
					sender: account,
					gasLimit,
					gasPrice,
					network,
				});
			} else {
				const tx = await web3.eth.sendTransaction({
					from: account,
					to: target,
					gasPrice,
					gas: gasLimit,
					data,
				});

				logTx(tx);
			}

			entry.complete = true;
			fs.writeFileSync(ownerActionsFile, stringify(ownerActions));
		} catch (err) {
			console.log(
				gray(`Transaction failed, if sending txn to safe api failed retry manually - ${err}`)
			);
			return;
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
		console.log('SystemSetting', address);
		if (currentOwner === newOwner) {
			console.log(gray(`${newOwner} is already the owner of ${contract}`));
		} else if (nominatedOwner === newOwner) {
			const encodedData = deployedContract.methods.acceptOwnership().encodeABI();

			// continue if no pending tx found
			await confirmOrEnd(yellow(`Confirm: Stage ${contract}.acceptOwnership() via protocolDAO?`));

			if (isContract)
				console.log(yellow(`Attempting action protocolDaoContract.submitTransaction()`));
			else console.log(yellow(`Calling acceptOwnership() on ${contract}...`));

			try {
				if (isContract) {
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
				} else {
					const tx = await web3.eth.sendTransaction({
						from: account,
						to: deployedContract.options.address,
						gasPrice,
						gas: gasLimit,
						data: encodedData,
					});

					logTx(tx);
				}
			} catch (err) {
				console.log(
					gray(`Transaction failed, if sending txn to multisig failed retry manually - ${err}`)
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
	ownerMultisig,
	cmd: program =>
		program
			.command('owner-multisig')
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
			.action(ownerMultisig),
};
