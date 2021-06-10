async function fastForward({ seconds, provider }) {
	await provider.send('evm_increaseTime', [seconds]);
	await provider.send('evm_mine', []);
}

module.exports = {
	fastForward,
};
