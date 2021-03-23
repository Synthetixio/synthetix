'use strict';

const w3utils = require('web3-utils');
const axios = require('axios');
const { green, gray, red, yellow } = require('chalk');

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

const CALL = 0;
// const DELEGATE_CALL = 1;
// const TX_TYPE_EXECUTION = 'execution';

// gnosis safe abi
const abi = [
	{
		constant: false,
		inputs: [{ internalType: 'bytes32', name: 'hashToApprove', type: 'bytes32' }],
		name: 'approveHash',
		outputs: [],
		payable: false,
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		constant: true,
		inputs: [],
		name: 'nonce',
		outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
		payable: false,
		stateMutability: 'view',
		type: 'function',
	},
	{
		constant: true,
		inputs: [
			{ internalType: 'address', name: 'to', type: 'address' },
			{ internalType: 'uint256', name: 'value', type: 'uint256' },
			{ internalType: 'bytes', name: 'data', type: 'bytes' },
			{
				internalType: 'enum Enum.Operation',
				name: 'operation',
				type: 'uint8',
			},
			{ internalType: 'uint256', name: 'safeTxGas', type: 'uint256' },
			{ internalType: 'uint256', name: 'baseGas', type: 'uint256' },
			{ internalType: 'uint256', name: 'gasPrice', type: 'uint256' },
			{ internalType: 'address', name: 'gasToken', type: 'address' },
			{ internalType: 'address', name: 'refundReceiver', type: 'address' },
			{ internalType: 'uint256', name: '_nonce', type: 'uint256' },
		],
		name: 'getTransactionHash',
		outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
		payable: false,
		stateMutability: 'view',
		type: 'function',
	},
];

const safeTransactionApi = ({ network, safeAddress }) => {
	const address = w3utils.toChecksumAddress(safeAddress);
	return `https://safe-transaction.${network}.gnosis.io/api/v1/safes/${address}/multisig-transactions/`;
};

const getSafeInstance = (web3, safeAddress) => {
	return new web3.eth.Contract(abi, safeAddress);
};

const getSafeNonce = async safeContract => {
	try {
		const nonce = await safeContract.methods.nonce().call();
		return nonce;
	} catch (err) {
		console.error(red('Cannot fetch safe nonce. Is the owner contract a Gnosis safe?'));
	}
};

const getSafeTransactions = async ({ network, safeAddress }) => {
	const endpoint = safeTransactionApi({ network, safeAddress });
	try {
		const response = await axios.get(endpoint, { params: { limit: 100 } });
		return response.data.results;
	} catch (err) {
		console.error(red('failed to retrieve Tx from server', err));
		return undefined;
	}
};

// load last transaction from Gnosis Safe Transaction API
const getLastTx = async ({ network, safeAddress }) => {
	const endpoint = safeTransactionApi({ network, safeAddress });
	try {
		const response = await axios.get(endpoint, { params: { limit: 1 } });
		return response.data.results[0];
	} catch (err) {
		console.error(red('failed to retrieve last Tx from server', err));
		return undefined;
	}
};

const getNewTxNonce = async ({ lastTx, safeContract }) => {
	// use current's safe nonce as fallback
	return lastTx === undefined
		? (await safeContract.methods.nonce().call()).toString()
		: `${lastTx.nonce + 1}`;
};

const saveTransactionToApi = async ({
	safeContract,
	network,
	baseGas = 0,
	data,
	gasPrice = 0,
	gasToken = ZERO_ADDRESS,
	nonce,
	operation = CALL,
	refundReceiver = ZERO_ADDRESS,
	safeTxGas = 0,
	to,
	valueInWei = 0,
	sender,
	origin = null,
	transactionHash,
	signature,
}) => {
	const safeAddress = safeContract.options.address;
	const endpoint = safeTransactionApi({ network, safeAddress });

	const postData = {
		to: w3utils.toChecksumAddress(to),
		value: valueInWei,
		data,
		operation,
		safeTxGas,
		baseGas,
		gasPrice, // important that this is zero
		gasToken,
		refundReceiver,
		nonce: Number(nonce),
		contractTransactionHash: transactionHash,
		sender: w3utils.toChecksumAddress(sender),
		signature,
		origin,
	};

	console.log(
		gray(
			`Saving tx to gnosis safe API with data: to ${endpoint}: target: ${postData.to}, value: ${postData.value}, data: ${postData.data}, nonce: ${postData.nonce}, ContractTxHash ${postData.contractTransactionHash}, sender: ${postData.sender}, signature: ${postData.signature}`
		)
	);

	try {
		await axios.post(endpoint, postData);
	} catch (err) {
		console.log(red(`Error submitting the transaction to API: ${err}`));
	}

	const interfaceLink = `https://gnosis-safe.io/app/#/safes/${safeAddress}/transactions`;
	console.log(green(`Transaction awaiting confirmation in the interface: ${interfaceLink}`));
};

const getTransactionHash = async ({
	safeContract,
	baseGas = 0,
	data,
	gasPrice = 0,
	gasToken = ZERO_ADDRESS,
	nonce,
	operation = CALL,
	refundReceiver = ZERO_ADDRESS,
	safeTxGas = 0,
	to,
	valueInWei = 0,
}) => {
	const txHash = await safeContract.methods
		.getTransactionHash(
			to,
			valueInWei,
			data,
			operation,
			safeTxGas,
			baseGas,
			gasPrice,
			gasToken,
			refundReceiver,
			nonce
		)
		.call();
	return txHash;
};

const checkExistingPendingTx = ({ stagedTransactions, target, encodedData, currentSafeNonce }) => {
	const existingTx = stagedTransactions.find(({ to, data, isExecuted, nonce }) => {
		return (
			!isExecuted && to === target && data === encodedData && nonce >= Number(currentSafeNonce)
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

const getNewTransactionHash = async ({ safeContract, data, to, sender, network, lastNonce }) => {
	// get latest nonce of the gnosis safe
	let lastTx = await getLastTx({
		network,
		safeAddress: safeContract.options.address,
	});

	let newNonce = await getNewTxNonce({ lastTx, safeContract });

	// Check that newTxNonce from API has updated
	while (lastNonce === newNonce) {
		console.log(yellow(`Retry getNewTxNonce as lastNonce === new nonce`));

		// add short delay to give gnosis safe api a chance to update
		await new Promise(resolve => setTimeout(resolve, 1000));

		lastTx = await getLastTx({
			network,
			safeAddress: safeContract.options.address,
		});
		newNonce = await getNewTxNonce({ lastTx, safeContract });
	}

	console.log(yellow(`New safe tx Nonce is: ${newNonce}`));

	const txHash = await getTransactionHash({ safeContract, data, to, sender, nonce: newNonce });

	// return contract transaction hash and nonce just submitted to safe API
	return { txHash, newNonce };
};

module.exports = {
	getSafeInstance,
	getSafeNonce,
	getSafeTransactions,
	checkExistingPendingTx,
	saveTransactionToApi,
	getNewTransactionHash,
};
