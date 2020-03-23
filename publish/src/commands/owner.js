'use strict';

const fs = require('fs');
const { green, gray, yellow, red, cyan, bgYellow, black } = require('chalk');
const w3utils = require('web3-utils');
const Web3 = require('web3');

const { CONFIG_FILENAME, DEPLOYMENT_FILENAME } = require('../constants');

const {
	ensureNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	stringify,
} = require('../util');

const {
	getSafeInstance,
	getSafeNonce,
	sendApprovalTransaction,
	getNewTxNonce,
	saveTransactionToApi,
	getLastTx,
	getSafeTransactions,
	TX_TYPE_CONFIRMATION,
} = require('../safe-utils');

const DEFAULTS = {
	gasPrice: '15',
	gasLimit: 3e5, // 300,000
};

const owner = async ({
	network,
	newOwner,
	deploymentPath,
	gasPrice = DEFAULTS.gasPrice,
	gasLimit = DEFAULTS.gasLimit,
	privateKey,
}) => {
	ensureNetwork(network);

	if (!newOwner || !w3utils.isAddress(newOwner)) {
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

	const { providerUrl, privateKey: envPrivateKey, etherscanLinkPrefix } = loadConnections({
		network,
	});

	if (!privateKey) {
		privateKey = envPrivateKey;
	}

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));
	web3.eth.accounts.wallet.add(privateKey);
	const account = web3.eth.accounts.wallet[0].address;
	console.log(gray(`Using account with public key ${account}`));
	console.log(gray(`Gas Price: ${gasPrice} gwei`));

	let lastNonce;
	// new owner should be gnosis safe proxy address
	const protocolDaoContract = getSafeInstance(web3, newOwner);
	// get protocolDAO nonce
	const currentSafeNonce = await getSafeNonce(protocolDaoContract);

	console.log(
		yellow(
			`Using Protocol DAO Safe contract at ${protocolDaoContract.options.address} - nonce: ${currentSafeNonce}`
		)
	);

	const confirmOrEnd = async message => {
		try {
			await confirmAction(
				message +
					cyan(
						'\nPlease type "y" to stage transaction, or enter "n" to cancel and resume this later? (y/n) '
					)
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	};

	const checkExistingPendingTx = ({
		stagedTransactions,
		target,
		encodedData,
		currentSafeNonce,
	}) => {
		const existingTx = stagedTransactions.find(({ to, data, isExecuted, nonce }) => {
			return (
				!isExecuted && to === target && data === encodedData && nonce > Number(currentSafeNonce)
			);
		});

		if (existingTx) {
			console.log(
				gray(
					`Existing pending tx already submitted to gnosis safe - target address: ${target} and data: ${encodedData}`
				)
			);
		}

		return existingTx;
	};

	const createAndSaveApprovalTransaction = async ({ safeContract, data, to, sender }) => {
		// get latest nonce of the gnosis safe
		const lastTx = await getLastTx({
			network,
			safeAddress: safeContract.options.address,
		});

		let nonce = await getNewTxNonce({ lastTx, safeContract });

		// Check that newTxNonce from API has updated
		while (lastNonce === nonce) {
			console.log(yellow(`Retry getNewTxNonce as same as lastNonce: nonce was ${nonce}`));
			nonce = await getNewTxNonce({ lastTx, safeContract });
		}

		console.log(yellow(`New safe tx Nonce is: ${nonce}`));

		const transaction = await sendApprovalTransaction({
			safeContract,
			data,
			nonce,
			to,
			sender,
			txgasLimit: gasLimit,
			txGasPrice: gasPrice,
		});

		console.log(
			green(
				`Successfully emitted approveHash() with transaction: ${etherscanLinkPrefix}/tx/${transaction.transactionHash}`
			)
		);

		// send transaction to Gnosis safe API
		await saveTransactionToApi({
			safeContract: protocolDaoContract,
			data,
			nonce,
			to,
			sender,
			network,
			type: TX_TYPE_CONFIRMATION,
			txHash: transaction.transactionHash,
		});

		// track nonce just submitted to safe API
		lastNonce = nonce;
	};

	console.log(
		gray('Running through operations during deployment that couldnt complete as not owner.')
	);

	console.log(gray('Looking for contracts whose ownership we should accept'));

	// Load staged transactions
	const stagedTransactions = await getSafeTransactions({
		network,
		safeAddress: protocolDaoContract.options.address,
	});

	// Read owner-actions.json + encoded data to stage tx's
	for (const [key, entry] of Object.entries(ownerActions)) {
		const { target, data, complete } = entry;
		if (complete) continue;

		const existingTx = checkExistingPendingTx({
			stagedTransactions,
			target,
			data,
			currentSafeNonce,
		});

		if (existingTx) continue;

		await confirmOrEnd(yellow('Confirm: ') + `Stage ${bgYellow(black(key))} to (${target})`);

		try {
			await createAndSaveApprovalTransaction({
				safeContract: protocolDaoContract,
				data,
				to: target,
				sender: account,
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

			// Check if similar one already staged and pending
			const existingTx = checkExistingPendingTx({
				stagedTransactions,
				target: deployedContract.options.address,
				encodedData,
				currentSafeNonce,
			});

			if (existingTx) continue;

			// continue if no pending tx found
			await confirmOrEnd(yellow(`Confirm: Stage ${contract}.acceptOwnership() via protocolDAO?`));

			console.log(yellow(`Attempting action protocolDaoContract.approveHash()`));

			try {
				await createAndSaveApprovalTransaction({
					safeContract: protocolDaoContract,
					data: encodedData,
					to: deployedContract.options.address,
					sender: account,
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
				'-o, --new-owner <value>',
				'The address of protocolDAO proxy contract as owner (please include the 0x prefix)'
			)
			.option('-v, --private-key [value]', 'The private key of wallet to stage with.')
			.option('-g, --gas-price <value>', 'Gas price in GWEI', DEFAULTS.gasPrice)
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, DEFAULTS.gasLimit)
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.action(owner),
};
