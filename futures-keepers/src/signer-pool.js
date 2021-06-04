class SignerPool {
	constructor(signers) {
		this.signers = signers;
		this.pool = Array.from(Array(this.signers.length).keys());
	}

	async acquire() {
		while (!this.pool.length) {
			await new Promise((resolve, reject) => setTimeout(resolve, 0.001));
		}
		const i = this.pool.pop();
		return [i, this.signers[i]];
	}

	release(i) {
		this.pool.push(i);
	}

	async withSigner(cb) {
		const [i, signer] = await this.acquire();
		await cb(signer);
		this.release(i);
	}
}

module.exports = SignerPool;
