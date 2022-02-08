'use strict';

const ethers = require('ethers');
const { EthersAdapter } = require('@gnosis.pm/safe-core-sdk');
const GnosisSafe = require('@gnosis.pm/safe-core-sdk').default;
const SafeServiceClient = require('@gnosis.pm/safe-service-client').default;

class SafeBatchSubmitter {
	constructor({ network, signer, safeAddress }) {
		this.network = network;
		this.signer = signer;
		this.safeAddress = safeAddress;

		this.ethAdapter = new EthersAdapter({
			ethers,
			signer,
		});

		this.service = new SafeServiceClient(
			`https://safe-transaction${network === 'rinkeby' ? '.rinkeby' : ''}.gnosis.io`
		);
	}

	async init() {
		const { ethAdapter, service, safeAddress, signer } = this;
		this.transactions = [];
		this.safe = await GnosisSafe.create({
			ethAdapter,
			safeAddress,
		});
		// check if signer is on the list of owners
		if (!(await this.safe.isOwner(signer.address))) {
			throw Error(`Account ${signer.address} is not a signer on this safe`);
		}
		const currentNonce = await this.safe.getNonce();
		const pendingTxns = await service.getPendingTransactions(safeAddress, currentNonce);
		return { currentNonce, pendingTxns };
	}

	async appendTransaction({ to, value = '0', data, force }) {
		const { safe, service, safeAddress, transactions } = this;
		if (!force) {
			// check it does not exist in the pending list
			// Note: this means that a duplicate transaction - like an acceptOwnership on
			// the same contract cannot be added in one batch. This could be useful in situations
			// where you want to accept, nominate another owner, migrate, then accept again.
			// In these cases, use "force: true"
			const currentNonce = await safe.getNonce();
			const pendingTxns = await service.getPendingTransactions(safeAddress, currentNonce);

			this.currentNonce = currentNonce;
			this.pendingTxns = pendingTxns;

			this.unusedNoncePosition = currentNonce;

			let matchedTxnIsPending = false;

			for (const {
				nonce,
				dataDecoded: {
					parameters: [{ valueDecoded }],
				},
			} of pendingTxns.results) {
				// figure out what the next unused nonce position is (including everything else in the queue)
				this.unusedNoncePosition = Math.max(this.unusedNoncePosition, nonce + 1);
				matchedTxnIsPending =
					matchedTxnIsPending ||
					(valueDecoded || []).find(
						entry => entry.to === to && entry.data === data && entry.value === value
					);
			}

			if (matchedTxnIsPending) {
				return {};
			}
		}

		transactions.push({ to, value, data, nonce: this.unusedNoncePosition });
		return { appended: true };
	}

	async submit() {
		const { safe, transactions, safeAddress, service, signer, unusedNoncePosition: nonce } = this;
		if (!safe) {
			throw Error('Safe must first be initialized');
		}
		if (!transactions.length) {
			return { transactions };
		}
		const safeTransaction = await safe.createTransaction(transactions);
		await safe.signTransaction(safeTransaction);
		const safeTxHash = await safe.getTransactionHash(safeTransaction);
		const senderAddress = await signer.getAddress();

		try {
			await service.proposeTransaction({ safeAddress, senderAddress, safeTransaction, safeTxHash });

			return { transactions, nonce };
		} catch (err) {
			throw Error(`Error trying to submit batch to safe.\n${err}`);
		}
	}
}

module.exports = SafeBatchSubmitter;
