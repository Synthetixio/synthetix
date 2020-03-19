'use strict';

const w3utils = require('web3-utils');
const abi = require('./Gnosis-safe.abi');

const { ZERO_ADDRESS } = require('./constants');

const CALL = 0;
const DELEGATE_CALL = 1;

const getSafeInstance = (web3, safeAddress) => {
	return new web3.eth.Contract(abi, safeAddress);
};

const getSafeNonce = async safeContract => {
	const nonce = await safeContract.methods.nonce().call();
	return nonce;
};

// load last transaction from Gnosis Safe API
const getLastTx = async safeAddress => {};

const getNewTxNonce = async safeContract => {
	const lastTx = await getLastTx(safeContract.options.address);
	// use current's safe nonce as fallback
	return lastTx === undefined
		? (await safeContract.methods.nonce().call()).toString()
		: `${lastTx.nonce + 1}`;
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

	console.log(`Sending approveHash(${txHash}) to safeContract`);
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
	CALL,
	DELEGATE_CALL,
};
