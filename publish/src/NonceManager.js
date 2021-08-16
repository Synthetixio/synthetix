'use strict';

const { gray } = require('chalk');

class NonceManager {
	constructor({ provider, account }) {
		this.provider = provider;
		this.account = account;
		this.storedNonces = {};
	}

	async getNonce() {
		if (!this.storedNonces[this.account]) {
			this.storedNonces[this.account] = parseInt(
				(await this.provider.getTransactionCount(this.account)).toString(),
				10
			);
		}

		const nonce = this.storedNonces[this.account];
		console.log(gray(`  > Providing custom nonce: ${nonce}`));

		return nonce;
	}

	incrementNonce() {
		this.storedNonces[this.account] += 1;
	}
}

module.exports = NonceManager;
