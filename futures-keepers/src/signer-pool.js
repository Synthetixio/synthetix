class SignerPool {
	constructor(signers) {
		this.signers = signers;
		this.pool = Array.from(Array(this.signers.length).keys());
	}

	async acquire() {
		while (!this.pool.length) {
			await new Promise((resolve, reject) => setTimeout(resolve, 0.01));
		}
		return this.pool.shift();
	}

	release(i) {
		this.pool.push(i);
	}

	async withSigner(cb) {
		const i = await this.acquire();
		try {
			await cb(this.signers[i]);
		} catch(err) {
			throw err
		} finally {
			this.release(i);
		}
	}
}

module.exports = SignerPool;
