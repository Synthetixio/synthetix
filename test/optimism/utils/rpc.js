async function wait({ seconds }) {
	return new Promise(resolve => {
		setTimeout(() => {
			resolve();
		}, seconds * 1000);
	});
}

async function fastForward({ seconds, provider }) {
	await provider.send('evm_increaseTime', [seconds]);
	await provider.send('evm_mine', []);
}

async function takeSnapshot({ provider }) {
	const id = await provider.send('evm_snapshot', []);
	await provider.send('evm_mine', []);

	return id;
}

async function restoreSnapshot({ id, provider }) {
	await provider.send('evm_revert', [id]);
	await provider.send('evm_mine', []);
}

async function mineBlock({ provider }) {
	await provider.send('evm_mine', []);
}

module.exports = {
	takeSnapshot,
	restoreSnapshot,
	fastForward,
	wait,
	mineBlock,
};
