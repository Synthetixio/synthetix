'use strict';

const w3utils = require('web3-utils');
const abi = require('./Gnosis-safe.abi');
const axios = require('axios');
const { green, gray, red } = require('chalk');

const { ZERO_ADDRESS } = require('./constants');

const CALL = 0;
const DELEGATE_CALL = 1;
const TX_TYPE_CONFIRMATION = 'confirmation';
const TX_TYPE_EXECUTION = 'execution';

const safeTransactionApi = ({ network, safeAddress }) => {
	const address = w3utils.toChecksumAddress(safeAddress);
	return `https://safe-transaction.${network}.gnosis.io/api/v1/safes/${address}/transactions/`;
};

const getSafeInstance = (web3, safeAddress) => {
	return new web3.eth.Contract(abi, safeAddress);
};

const getSafeNonce = async safeContract => {
	const nonce = await safeContract.methods.nonce().call();
	return nonce;
};

// load last transaction from Gnosis Safe Transaction API
const getLastTx = async ({ network, safeAddress }) => {
	const endpoint = safeTransactionApi({ network, safeAddress });
	try {
		const response = await axios.get(endpoint, { params: { limit: 1 } });
		return response.data.results[0];
	} catch (err) {
		console.error('failed to retrieve last Tx from server', err);
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

const getApprovalTransaction = async ({
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

module.exports = {
	getSafeInstance,
	getTransactionHash,
	getApprovalTransaction,
	getSafeNonce,
	getNewTxNonce,
	saveTransactionToApi,
	getLastTx,
	CALL,
	DELEGATE_CALL,
	TX_TYPE_CONFIRMATION,
	TX_TYPE_EXECUTION,
};
