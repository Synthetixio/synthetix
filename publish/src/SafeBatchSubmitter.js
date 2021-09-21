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
		const { ethAdapter, service, safeAddress } = this;
		this.transactions = [];
		this.safe = await GnosisSafe.create({
			ethAdapter,
			safeAddress,
		});
		// TBD - should we also check this signer is one of the owners via safe.getOwners() or
		// does it throw on creation?
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
			const currentNonce = await safe.getNonce(); // TBD - is this required?
			const pendingTxns = await service.getPendingTransactions(safeAddress, currentNonce);
			if (
				pendingTxns.results.find(
					entry => entry.to === to && entry.data === data && entry.value === value
				)
			) {
				return {};
			}
		}

		transactions.push({ to, value, data });
		return { appended: true };
	}

	async submit() {
		const { safe, transactions, safeAddress, service } = this;
		if (!safe) {
			throw Error('Safe must first be initialized');
		}
		if (!transactions.length) {
			return { transactions };
		}
		const batchTxn = await safe.createTransaction(...transactions);
		const txHash = await safe.getTransactionHash(batchTxn);
		const signature = await safe.signTransactionHash(txHash);

		try {
			await service.proposeTransaction(safeAddress, batchTxn.data, txHash, signature);

			return { transactions };
		} catch (err) {
			throw Error(`Error trying to submit batch to safe.\n${err}`);
		}
	}
}

module.exports = SafeBatchSubmitter;
