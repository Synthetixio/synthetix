async function fastForward({ seconds, provider }) {
	await provider.send('evm_increaseTime', [seconds]);
	await provider.send('evm_mine', []);
}

async function dummyTx({ wallet, gasPrice = 0, gasLimit = 8000000 }) {
	const tx = await wallet.sendTransaction({
		to: '0x' + '1234'.repeat(10),
		gasPrice,
		gasLimit,
		data: '0x',
		value: 0,
	});
	await tx.wait();
}

module.exports = {
	fastForward,
	dummyTx,
};
