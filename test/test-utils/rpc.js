const { wait } = require('./wait');
const chalk = require('chalk');

let heartbeatActive = false;

async function fastForward({ seconds, provider }) {
	console.log(chalk.gray(`> Fast forwarding ${seconds} seconds`));

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
 * */
async function startOpsHeartbeat({ l1Wallet, l2Wallet }) {
	if (heartbeatActive) {
		return;
	}

	heartbeatActive = true;

	async function heartbeat() {
		await dummyTx({ wallet: l1Wallet, useOvm: false });
		await dummyTx({ wallet: l2Wallet, useOvm: true });

		await wait({ seconds: 1 });

		const l1Timestamp = (await l1Wallet.provider.getBlock()).timestamp;
		const l2Timestamp = (await l2Wallet.provider.getBlock()).timestamp;
		console.log(chalk.gray(`> Ops heartbeat - Timestamps: [${l1Timestamp}, ${l2Timestamp}]`));

		await heartbeat();
	}

	await heartbeat();
}

module.exports = {
	fastForward,
	dummyTx,
	startOpsHeartbeat,
};
