const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { getSource, getTarget } = require('../..');

function connectContract({ contract, source = contract, provider, useOvm = false }) {
	const params = {
		path,
		fs,
		network: 'local',
		useOvm,
	};

	return new ethers.Contract(
		getTarget({ ...params, contract }).address,
		getSource({ ...params, contract: source }).abi,
		provider
	);
}

async function wait(seconds) {
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

module.exports = {
	connectContract,
	wait,
	fastForward,
	takeSnapshot,
	restoreSnapshot,
};
