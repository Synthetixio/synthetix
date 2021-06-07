'use strict';

const ethers = require('ethers');

// @TODO: Keep a per-NonceManager pool of sent but unmined transactions for
//        rebroadcasting, in case we overrun the transaction pool

// constructor({ web3, account }) {
//     this.web3 = web3;
//     this.account = account;
//     this.storedNonces = {};
// }

// async getNonce() {
//     if (!this.storedNonces[this.account]) {
//         this.storedNonces[this.account] = parseInt(
//             (await this.web3.eth.getTransactionCount(this.account)).toString(),
//             10
//         );
//     }

//     const nonce = this.storedNonces[this.account];
//     console.log(gray(`  > Providing custom nonce: ${nonce}`));

//     return nonce;
// }

// incrementNonce() {
//     this.storedNonces[this.account] += 1;
// }

class LocalNonceManager extends ethers.Signer {
	constructor(signer) {
		super();
		this.signer = signer;
		this.provider = signer.provider || null;
		this.nonce = null;
	}

	connect(provider) {
		return new NonceManager(this.signer.connect(provider));
	}

	getAddress() {
		return this.signer.getAddress();
	}

	async initialize() {
		this.nonce = await this.signer.getTransactionCount('pending');
	}

	async getTransactionCount(blockTag) {
		// if (!this.nonce) {
		//     this.nonce = await this.signer.getTransactionCount("pending")
		// }

		return this.nonce;

		// const count = this.signer.getTransactionCount("pending")

		// if (blockTag === "pending") {
		//     if (!this._initialPromise) {
		//         this._initialPromise = this.signer.getTransactionCount("pending");
		//     }
		//     const deltaCount = this._deltaCount;
		//     return this._initialPromise.then((initial) => (initial + deltaCount));
		// }

		// return this.signer.getTransactionCount(blockTag);
	}

	// setTransactionCount(transactionCount) {
	//     this._initialPromise = Promise.resolve(transactionCount).then((nonce) => {
	//         return ethers.BigNumber.from(nonce).toNumber();
	//     });
	//     this._deltaCount = 0;
	// }

	// incrementTransactionCount(count) {
	//     this._deltaCount += (count ? count : 1);
	// }

	incrementNonce() {
		this.nonce += 1;
	}

	signMessage(message) {
		return this.signer.signMessage(message);
	}

	signTransaction(transaction) {
		return this.signer.signTransaction(transaction);
	}

	async sendTransaction(transaction) {
		if (transaction.nonce == null) {
			transaction = ethers.utils.shallowCopy(transaction);
			this.nonce++;
			transaction.nonce = this.nonce;
			// await this.getTransactionCount("pending");
			// this.incrementNonce()
			console.log(transaction.nonce);
		}

		// else {
		//     this.setTransactionCount(transaction.nonce);
		// }

		return this.signer.sendTransaction(transaction).then(tx => {
			return tx;
		});
	}
}

module.exports = { LocalNonceManager };
