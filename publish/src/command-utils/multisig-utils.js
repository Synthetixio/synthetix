'use strict';

const ethers = require('ethers');
const { gray } = require('chalk');
const { loadConnections } = require('../util');

// gnosis multisig (legacy) abi
const { abi } = require('../abis/multisig.abi');

const getMultisigInstance = ({ provider, address }) => {
	return new ethers.Contract(address, abi, provider);
};

const getMultisigTransactionCount = async multisigContract => {
	// signature: getTransactionCount(pending, executed) // Note: include pending OR include executed
	const count = await multisigContract.getTransactionCount(true, true);
	return count;
};

const getMultisigPendingTransactionCount = async multisigContract => {
	const count = await multisigContract.getTransactionCount(true, false);
	return count;
};

const getMultisigExecutedTransactionCount = async multisigContract => {
	const count = await multisigContract.getTransactionCount(false, true);
	return count;
};

const getMultisigTxCount = async multisigContract => {
	const count = await multisigContract.trasactionCount();
	return count;
};

const getMultisigTransactionIds = async ({ multisigContract, from, to, pending, executed }) => {
	const count = await multisigContract.getTransactionIds(from, to, pending, executed);
	return count;
};

const submitMultisigTransaction = async ({
	multisigContract,
	network,
	to,
	valueInWei = 0,
	data,
	gasPrice = 0,
	gasLimit = 0,
	wallet,
}) => {
	const signer = multisigContract.connect(wallet);
	const tx = await signer.submitTransaction(to, valueInWei, data, { gasPrice, gasLimit });
	const receipt = await tx.wait();
	console.log(gray(`    > tx hash: ${receipt.transactionHash}`));

	const { etherscanLinkPrefix } = loadConnections({
		network,
	});

	console.log(
		gray(`Emmited submitTransaction(): ${etherscanLinkPrefix}/tx/${receipt.transactionHash} `)
	);
	return receipt;
};

const checkMultisigExistingPendingTx = async ({
	multisigContract,
	stagedTransactions,
	target,
	encodedData,
}) => {
	let txFound;
	// Staged Transactions contains the IDs of the transactions, not the transactions.
	// We need to traverse the list to read them
	// Possible improvement if needed: add a cache
	for (let i = 0; i < stagedTransactions.length; i++) {
		const txId = stagedTransactions[i];
		// fetch tx from mutlisig
		const existingTx = await multisigContract.transactions(txId);
		// Safety checks
		if (existingTx.executed === true) {
			throw new Error(`Transaction ${txId} changed state to executed while the script was running`);
		}
		if (existingTx.value > 0) throw new Error('Value is non-zero');
		if (existingTx.destination === target && existingTx.data === encodedData) {
			txFound = existingTx;
			break;
		}
	}

	if (txFound) {
		console.log(
			gray(
				`Existing pending tx already submitted to gnosis multisig - target address: ${target} and data: ${encodedData}`
			)
		);
	}

	return txFound;
};

module.exports = {
	getMultisigInstance,
	getMultisigTransactionIds,
	getMultisigTxCount,
	submitMultisigTransaction,
	checkMultisigExistingPendingTx,

	getMultisigTransactionCount,
	getMultisigPendingTransactionCount,
	getMultisigExecutedTransactionCount,
};
