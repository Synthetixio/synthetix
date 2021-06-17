const { wait } = require('./wait');

async function fastForward({ seconds, provider }) {
	await provider.send('evm_increaseTime', [seconds]);
	await provider.send('evm_mine', []);
}

async function dummyTx({ wallet, useOvm }) {
	const req = {
		to: '0x' + '1234'.repeat(10),
		gasPrice: 0,
		gasLimit: useOvm ? 33600000000001 : 8000000,
		data: '0x',
		value: 0,
	};

	const tx = await wallet.sendTransaction(req);
	await tx.wait();
}

/*
 * Sends L1 and L2 txs on a timer, which keeps the L2 timestamp in
 * sync with the L1 timestamp.
 * The 5 second delay is chosen because this is the default time granularity
 * of the ops tool.
 * */
async function startOpsHeartbeat({ l1Wallet, l2Wallet }) {
	async function heartbeat() {
		await dummyTx({ wallet: l1Wallet, useOvm: false });
		await dummyTx({ wallet: l2Wallet, useOvm: true });

		await wait({ seconds: 5 });

		await heartbeat();
	}

	heartbeat();
}

module.exports = {
	fastForward,
	dummyTx,
	startOpsHeartbeat,
};
