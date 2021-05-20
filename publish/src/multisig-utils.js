'use strict';

const w3utils = require('web3-utils');
const { green, gray, red } = require('chalk');

const { loadConnections } = require('./util');

// gnosis multisig abi
const abi = [
	{
		constant: true,
		inputs: [
			{
				internalType: 'bool',
				name: 'pending',
				type: 'bool',
			},
			{
				internalType: 'bool',
				name: 'executed',
				type: 'bool',
			},
		],
		name: 'getTransactionCount',
		outputs: [
			{
				internalType: 'uint256',
				name: 'count',
				type: 'uint256',
			},
		],
		payable: false,
		stateMutability: 'view',
		type: 'function',
	},
	{
		constant: true,
		inputs: [],
		name: 'transactionCount',
		outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
		payable: false,
		stateMutability: 'view',
		type: 'function',
	},
	{
		constant: true,
		inputs: [
			{
				internalType: 'uint256',
				name: 'from',
				type: 'uint256',
			},
			{
				internalType: 'uint256',
				name: 'to',
				type: 'uint256',
			},
			{
				internalType: 'bool',
				name: 'pending',
				type: 'bool',
			},
			{
				internalType: 'bool',
				name: 'executed',
				type: 'bool',
			},
		],
		name: 'getTransactionIds',
		outputs: [
			{
				internalType: 'uint256[]',
				name: '_transactionIds',
				type: 'uint256[]',
			},
		],
		payable: false,
		stateMutability: 'view',
		type: 'function',
	},
	{
		constant: false,
		inputs: [
			{
				internalType: 'address',
				name: 'destination',
				type: 'address',
			},
			{
				internalType: 'uint256',
				name: 'value',
				type: 'uint256',
			},
			{
				internalType: 'bytes',
				name: 'data',
				type: 'bytes',
			},
		],
		name: 'submitTransaction',
		outputs: [
			{
				internalType: 'uint256',
				name: 'transactionId',
				type: 'uint256',
			},
		],
		payable: false,
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		constant: true,
		inputs: [
			{
				internalType: 'uint256',
				name: '',
				type: 'uint256',
			},
		],
		name: 'transactions',
		outputs: [
			{
				internalType: 'address',
				name: 'destination',
				type: 'address',
			},
			{
				internalType: 'uint256',
				name: 'value',
				type: 'uint256',
			},
			{
				internalType: 'bytes',
				name: 'data',
				type: 'bytes',
			},
			{
				internalType: 'bool',
				name: 'executed',
				type: 'bool',
			},
		],
		payable: false,
		stateMutability: 'view',
		type: 'function',
	},
];

const getMultisigInstance = (web3, multisigAddress) => {
	return new web3.eth.Contract(abi, multisigAddress);
};

const getMultisigTransactions = async ({ multisigContract, from, to, pending, executed }) => {
	try {
		const transactionCount = await multisigContract.methods
			.getTransactionIds(from, to, pending, executed)
			.call();
		return transactionCount;
	} catch (err) {
		console.error(red('Cannot fetch multisig txs. Is the owner contract a Gnosis multisig?'));
	}
};

const getMultisigTransactionCount = async multisigContract => {
	try {
		// return total number of transactions: pending (true) +  executed (true)
		const transactionCount = await multisigContract.methods.getTransactionCount(true, true).call();
		return transactionCount;
	} catch (err) {
		console.error(red('Cannot fetch multisig tx count. Is the owner contract a Gnosis multisig?'));
	}
};

// load last transaction ID from Gnosis Multisig
const getLastTxId = async multisigContract => {
	try {
		const txCount = await multisigContract.methods.transactionCount().call();
		return txCount > 0 ? txCount - 1 : txCount;
	} catch (err) {
		console.error(red('failed to retrieve last Tx from multisig', err));
		return undefined;
	}
};

const checkExistingPendingTx = async ({
	multisigContract,
	pendingTransactions,
	target,
	encodedData,
}) => {
	// pendingTransactions is the list of pending tx ids
	let existingTx;
	let found;
	let txID;
	for (let i = 0; i < pendingTransactions.length; i++) {
		txID = pendingTransactions[i];
		// break the loop if the rest of the array is empty i.e. 0 ID
		if (txID === '0' && i !== 0) break;
		// fetch tx from mutlisig
		existingTx = await multisigContract.methods.transactions(txID).call();
		// Safety checks
		if (existingTx.executed === true && txID !== '0')
			throw new Error('Not a pending tx: transaction has been executed');
		if (existingTx.value > 0) throw new Error('Value is non-zero');
		if (existingTx.destination === target && existingTx.data === encodedData) {
			found = true;
			break;
		}
	}

	if (found) {
		console.log(
			gray(
				`Existing pending tx already submitted to gnosis mutlisig - target address: ${target} and data: ${encodedData}`
			)
		);
		return existingTx;
	}
	return null;
};

const createAndSubmitTransaction = async ({
	multisigContract,
	data,
	to,
	sender,
	value,
	gasLimit,
	gasPrice,
	network,
}) => {
	const transaction = await multisigContract.methods.submitTransaction(to, value, data).send({
		from: sender,
		gasLimit,
		gasPrice: w3utils.toWei(gasPrice.toString(), 'gwei'),
	});

	const { etherscanLinkPrefix } = loadConnections({
		network,
	});

	console.log(
		green(
			`Successfully emitted submitTransaction() with transaction: ${etherscanLinkPrefix}/tx/${transaction.transactionHash}`
		)
	);
};

module.exports = {
	checkExistingPendingTx,
	createAndSubmitTransaction,
	getLastTxId,
	getMultisigInstance,
	getMultisigTransactionCount,
	getMultisigTransactions,
};
