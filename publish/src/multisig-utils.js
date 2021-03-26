'use strict';

const w3utils = require('web3-utils');
const axios = require('axios');
const { green, gray, red, yellow } = require('chalk');

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

const { loadConnections } = require('./util');

const CALL = 0;
// const DELEGATE_CALL = 1;
const TX_TYPE_CONFIRMATION = 'confirmation';
// const TX_TYPE_EXECUTION = 'execution';

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
];

const safeTransactionApi = ({ network, safeAddress }) => {
	const address = w3utils.toChecksumAddress(safeAddress);
	return `https://safe-transaction.${network}.gnosis.io/api/v1/safes/${address}/transactions/`;
};

const getMultisigInstance = (web3, multisigAddress) => {
	return new web3.eth.Contract(abi, multisigAddress);
};

const getMultisigTransactionCount = async multisigContract => {
	try {
		const transactionCount = await multisigContract.methods.getTransactionCount(true, true).call();
		return transactionCount;
	} catch (err) {
		console.error(red('Cannot fetch safe tx count. Is the owner contract a Gnosis multisig?'));
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
	type,
	txHash,
}) => {
	const safeAddress = safeContract.options.address;
	const endpoint = safeTransactionApi({ network, safeAddress });

	const transactionHash = await getTransactionHash({
		safeContract,
		baseGas,
		data,
		gasPrice,
		gasToken,
		nonce,
		operation,
		refundReceiver,
		safeTxGas,
		to,
		valueInWei,
	});

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
		origin,
		confirmationType: type,
		transactionHash: txHash,
	};

	console.log(
		gray(
			`Saving tx to gnosis safe API with data: to: ${postData.to}, value: ${postData.value}, data: ${postData.data}, nonce: ${postData.nonce}, ContractHash ${postData.contractTransactionHash}, sender: ${postData.sender}, confirmationType: ${postData.confirmationType}, transactionHash: ${postData.transactionHash}`
		)
	);

	try {
		await axios.post(endpoint, postData);
	} catch (err) {
		console.log(red(`Error submitting the transaction to API`));
	}

	const interfaceLink = `https://gnosis-safe.io/app/#/safes/${safeAddress}/transactions`;
	console.log(green(`Transaction awaiting confirmation in the interface: ${interfaceLink}`));
};

const getTransactionHash = async ({
	safeContract,
	baseGas,
	data,
	gasPrice,
	gasToken,
	nonce,
	operation,
	refundReceiver,
	safeTxGas,
	to,
	valueInWei,
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

const sendApprovalTransaction = async ({
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
	sender,
	txgasLimit,
	txGasPrice,
}) => {
	const txHash = await getTransactionHash({
		safeContract,
		baseGas,
		data,
		gasPrice,
		gasToken,
		nonce,
		operation,
		refundReceiver,
		safeTxGas,
		to,
		valueInWei,
	});

	console.log(gray(`Sending approveHash(${txHash}) to safeContract`));
	return safeContract.methods.approveHash(txHash).send({
		from: sender,
		gasLimit: Number(txgasLimit),
		gasPrice: w3utils.toWei(txGasPrice.toString(), 'gwei'),
	});
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

const createAndSubmitTransaction = async ({
	multisigContract,
	data,
	to,
	sender,
	gasLimit,
	gasPrice,
	network,
	lastNonce,
}) => {
	// get latest nonce of the gnosis safe
	let lastTx = await getLastTx({
		network,
		safeAddress: multisigContract.options.address,
	});

	let newNonce = await getNewTxNonce({ lastTx, multisigContract });

	// Check that newTxNonce from API has updated
	while (lastNonce === newNonce) {
		console.log(yellow(`Retry getNewTxNonce as lastNonce === new nonce`));

		// add short delay to give gnosis safe api a chance to update
		await new Promise(resolve => setTimeout(resolve, 1000));

		lastTx = await getLastTx({
			network,
			safeAddress: multisigContract.options.address,
		});
		newNonce = await getNewTxNonce({ lastTx, multisigContract });
	}

	console.log(yellow(`New safe tx Nonce is: ${newNonce}`));

	const transaction = await sendApprovalTransaction({
		multisigContract,
		data,
		nonce: newNonce,
		to,
		sender,
		txgasLimit: gasLimit,
		txGasPrice: gasPrice,
	});

	const { etherscanLinkPrefix } = loadConnections({
		network,
	});

	console.log(
		green(
			`Successfully emitted approveHash() with transaction: ${etherscanLinkPrefix}/tx/${transaction.transactionHash}`
		)
	);

	// send transaction to Gnosis safe API
	await saveTransactionToApi({
		safeContract,
		data,
		nonce: newNonce,
		to,
		sender,
		network,
		type: TX_TYPE_CONFIRMATION,
		txHash: transaction.transactionHash,
	});

	// return nonce just submitted to safe API
	return newNonce;
};

module.exports = {
	getMultisigInstance,
	getMultisigTransactionCount,
	checkExistingPendingTx,
	createAndSubmitTransaction,
};
