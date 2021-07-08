'use strict';

const ethers = require('ethers');
const { gray } = require('chalk');
const { loadConnections } = require('../util');

// gnosis multisig (legacy) abi
const abi = [
	{
		inputs: [
			{
				internalType: 'address[]',
				name: '_owners',
				type: 'address[]',
			},
			{
				internalType: 'uint256',
				name: '_required',
				type: 'uint256',
			},
		],
		payable: false,
		stateMutability: 'nonpayable',
		type: 'constructor',
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: 'address',
				name: 'sender',
				type: 'address',
			},
			{
				indexed: true,
				internalType: 'uint256',
				name: 'transactionId',
				type: 'uint256',
			},
		],
		name: 'Confirmation',
		type: 'event',
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: 'address',
				name: 'sender',
				type: 'address',
			},
			{
				indexed: false,
				internalType: 'uint256',
				name: 'value',
				type: 'uint256',
			},
		],
		name: 'Deposit',
		type: 'event',
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: 'uint256',
				name: 'transactionId',
				type: 'uint256',
			},
		],
		name: 'Execution',
		type: 'event',
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: 'uint256',
				name: 'transactionId',
				type: 'uint256',
			},
		],
		name: 'ExecutionFailure',
		type: 'event',
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: 'address',
				name: 'owner',
				type: 'address',
			},
		],
		name: 'OwnerAddition',
		type: 'event',
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: 'address',
				name: 'owner',
				type: 'address',
			},
		],
		name: 'OwnerRemoval',
		type: 'event',
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: false,
				internalType: 'uint256',
				name: 'required',
				type: 'uint256',
			},
		],
		name: 'RequirementChange',
		type: 'event',
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: 'address',
				name: 'sender',
				type: 'address',
			},
			{
				indexed: true,
				internalType: 'uint256',
				name: 'transactionId',
				type: 'uint256',
			},
		],
		name: 'Revocation',
		type: 'event',
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: 'uint256',
				name: 'transactionId',
				type: 'uint256',
			},
		],
		name: 'Submission',
		type: 'event',
	},
	{
		payable: true,
		stateMutability: 'payable',
		type: 'fallback',
	},
	{
		constant: true,
		inputs: [],
		name: 'MAX_OWNER_COUNT',
		outputs: [
			{
				internalType: 'uint256',
				name: '',
				type: 'uint256',
			},
		],
		payable: false,
		stateMutability: 'view',
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
			{
				internalType: 'address',
				name: '',
				type: 'address',
			},
		],
		name: 'confirmations',
		outputs: [
			{
				internalType: 'bool',
				name: '',
				type: 'bool',
			},
		],
		payable: false,
		stateMutability: 'view',
		type: 'function',
	},
	{
		constant: true,
		inputs: [
			{
				internalType: 'address',
				name: '',
				type: 'address',
			},
		],
		name: 'isOwner',
		outputs: [
			{
				internalType: 'bool',
				name: '',
				type: 'bool',
			},
		],
		payable: false,
		stateMutability: 'view',
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
		name: 'owners',
		outputs: [
			{
				internalType: 'address',
				name: '',
				type: 'address',
			},
		],
		payable: false,
		stateMutability: 'view',
		type: 'function',
	},
	{
		constant: true,
		inputs: [],
		name: 'required',
		outputs: [
			{
				internalType: 'uint256',
				name: '',
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
		outputs: [
			{
				internalType: 'uint256',
				name: '',
				type: 'uint256',
			},
		],
		payable: false,
		stateMutability: 'view',
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
	{
		constant: false,
		inputs: [
			{
				internalType: 'address',
				name: 'owner',
				type: 'address',
			},
		],
		name: 'addOwner',
		outputs: [],
		payable: false,
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		constant: false,
		inputs: [
			{
				internalType: 'address',
				name: 'owner',
				type: 'address',
			},
		],
		name: 'removeOwner',
		outputs: [],
		payable: false,
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		constant: false,
		inputs: [
			{
				internalType: 'address',
				name: 'owner',
				type: 'address',
			},
			{
				internalType: 'address',
				name: 'newOwner',
				type: 'address',
			},
		],
		name: 'replaceOwner',
		outputs: [],
		payable: false,
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		constant: false,
		inputs: [
			{
				internalType: 'uint256',
				name: '_required',
				type: 'uint256',
			},
		],
		name: 'changeRequirement',
		outputs: [],
		payable: false,
		stateMutability: 'nonpayable',
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
		constant: false,
		inputs: [
			{
				internalType: 'uint256',
				name: 'transactionId',
				type: 'uint256',
			},
		],
		name: 'confirmTransaction',
		outputs: [],
		payable: false,
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		constant: false,
		inputs: [
			{
				internalType: 'uint256',
				name: 'transactionId',
				type: 'uint256',
			},
		],
		name: 'revokeConfirmation',
		outputs: [],
		payable: false,
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		constant: false,
		inputs: [
			{
				internalType: 'uint256',
				name: 'transactionId',
				type: 'uint256',
			},
		],
		name: 'executeTransaction',
		outputs: [],
		payable: false,
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		constant: true,
		inputs: [
			{
				internalType: 'uint256',
				name: 'transactionId',
				type: 'uint256',
			},
		],
		name: 'isConfirmed',
		outputs: [
			{
				internalType: 'bool',
				name: '',
				type: 'bool',
			},
		],
		payable: false,
		stateMutability: 'view',
		type: 'function',
	},
	{
		constant: true,
		inputs: [
			{
				internalType: 'uint256',
				name: 'transactionId',
				type: 'uint256',
			},
		],
		name: 'getConfirmationCount',
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
		name: 'getOwners',
		outputs: [
			{
				internalType: 'address[]',
				name: '',
				type: 'address[]',
			},
		],
		payable: false,
		stateMutability: 'view',
		type: 'function',
	},
	{
		constant: true,
		inputs: [
			{
				internalType: 'uint256',
				name: 'transactionId',
				type: 'uint256',
			},
		],
		name: 'getConfirmations',
		outputs: [
			{
				internalType: 'address[]',
				name: '_confirmations',
				type: 'address[]',
			},
		],
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
];

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
