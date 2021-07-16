'use strict';

const ethers = require('ethers');
const { gray, yellow } = require('chalk');

const { logTx } = require('./ui-utils');

const {
	getSafeInstance,
	getSafeNonce,
	getSafeTransactions,
	checkExistingPendingTx,
	getNewTransactionHash,
	saveTransactionToApi,
	getSafeSignature,
} = require('./safe-utils');

const SIGNER_KIND = { safe: 'SAFE', eoa: 'EOA' };

const getSignerData = async ({ signerKind, providerUrl, newOwner }) => {
	const signerData = {};
	if (signerKind === SIGNER_KIND.safe) {
		// new owner should be gnosis safe proxy address
		signerData.protocolDaoContract = getSafeInstance(providerUrl, newOwner);

		// get protocolDAO nonce
		signerData.currentSafeNonce = await getSafeNonce(signerData.protocolDaoContract);

		if (!signerData.currentSafeNonce) {
			console.log(gray('Cannot access safe. Exiting.'));
			process.exit(1);
		}

		console.log(
			yellow(`Using Protocol DAO Safe contract at ${signerData.protocolDaoContract.address}`)
		);
	}

	return signerData;
};

const getStagedTransactions = async ({ signerKind, signerData, network }) => {
	let stagedTransactions;
	if (signerKind === SIGNER_KIND.safe) {
		stagedTransactions = await getSafeTransactions({
			network,
			safeAddress: signerData.protocolDaoContract.address,
		});
	} else if (signerKind === SIGNER_KIND.eoa) {
		// Do nothing stagedTransaction remains undefined
	} else {
		// catch everything else
		throw Error('Unsupported Signer kind');
	}

	return stagedTransactions;
};

const txAlreadyExists = async ({
	signerKind,
	signerData,
	stagedTransactions,
	target,
	encodedData,
}) => {
	if (signerKind === SIGNER_KIND.safe) {
		return checkExistingPendingTx({
			stagedTransactions,
			target,
			encodedData,
			currentSafeNonce: signerData.currentSafeNonce,
		});
	} else if (signerKind === SIGNER_KIND.eoa) {
		// Do nothing
		return false;
	} else {
		// catch everything else
		throw Error('Unsupported Signer kind');
	}
};

const acceptOwnershipBySigner = async ({
	signerKind,
	signerData,
	useFork,
	network,
	privateKey,
	providerUrl,
	encodedData,
	to,
	wallet,
	gasLimit,
	gasPrice,
}) => {
	if (signerKind === SIGNER_KIND.safe && !useFork) {
		const { txHash, newNonce } = await getNewTransactionHash({
			safeContract: signerData.protocolDaoContract,
			data: encodedData,
			to,
			sender: wallet.address,
			network,
			lastNonce: signerData.lastNonce,
		});

		// sign txHash to get signature
		const sig = getSafeSignature({
			privateKey,
			providerUrl,
			contractTxHash: txHash,
		});

		// save transaction and signature to Gnosis Safe API
		await saveTransactionToApi({
			safeContract: signerData.protocolDaoContract,
			network,
			data: encodedData,
			nonce: newNonce,
			to,
			sender: wallet.address,
			transactionHash: txHash,
			signature: sig,
		});

		// track lastNonce submitted
		signerData.lastNonce = newNonce;
		return;
	}

	// SignerKind is not contract type (safe) or using fork for Gnosis Safe
	const params = {
		to,
		gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei'),
		data: encodedData,
	};
	if (gasLimit) {
		params.gasLimit = ethers.BigNumber.from(gasLimit);
	}

	const tx = await wallet.sendTransaction(params);
	const receipt = await tx.wait();

	logTx(receipt);
};

module.exports = {
	SIGNER_KIND,
	getSignerData,
	getStagedTransactions,
	txAlreadyExists,
	acceptOwnershipBySigner,
};
