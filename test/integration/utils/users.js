const ethers = require('ethers');

async function loadUsers({ ctx, network }) {
	const wallets = _createWallets({ provider: ctx.provider });

	ctx.users = {};
	ctx.users.owner = wallets[0];
	ctx.users.someUser = wallets[1];
	ctx.users.wallets = wallets;
}

function _createWallets({ provider }) {
	const wallets = [];

	for (let i = 0; i < 20; i++) {
		wallets.push(new ethers.Wallet(getPrivateKey({ index: i }), provider));
	}

	return wallets;
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
