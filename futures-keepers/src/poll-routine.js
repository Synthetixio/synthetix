class PollRoutine {
	constructor(fn, ms) {
		this.fn = fn;
		this.ms = ms;
		this.cancelled = false;
	}

	async run() {
		while (!this.cancelled) {
			await new Promise((resolve, reject) => {
				setTimeout(resolve, this.ms);
			});
			await this.fn();
		}
	}

	cancel() {
		this.cancelled = true;
	}
}

module.exports = PollRoutine;
