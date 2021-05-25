const hre = require('hardhat');
const ethers = require('ethers');
const { getUsers } = require('../../..');

async function loadUsers({ ctx }) {
	const { useOvm } = ctx;
	const network = hre.config.targetNetwork;

	ctx.users = {};

	await _getAdminUsers({ ctx, network, useOvm });
	_createAdditionalUsers({ ctx });
}

async function _getAdminUsers({ ctx, network, useOvm }) {
	const users = getUsers({ network, useOvm })
		.filter(account => account.name !== 'fee')
		.filter(account => account.name !== 'zero');

	for (const user of users) {
		const signer = await ctx.provider.getSigner(user.address);
		signer.address = signer._address;

		ctx.users[user.name] = signer;
	}
}

async function _createAdditionalUsers({ ctx }) {
	const numUsers = 5;
	const offset = 4;

	for (let i = 0; i < numUsers; i++) {
		ctx.users[`user${i}`] = new ethers.Wallet(getPrivateKey({ index: i + offset }), ctx.provider);
	}
}

function getPrivateKey({ index }) {
	const masterNode = ethers.utils.HDNode.fromMnemonic(
		'test test test test test test test test test test test junk' // Default hardhat mnemonic
	);

	return masterNode.derivePath(`m/44'/60'/0'/0/${index}`).privateKey;
}

module.exports = {
	loadUsers,
	getPrivateKey,
};
