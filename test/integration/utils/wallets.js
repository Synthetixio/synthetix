const ethers = require('ethers');

function loadWallets({ ctx }) {
	ctx.wallets = [];

	for (let i = 0; i < 10; i++) {
		const wallet = new ethers.Wallet(getPrivateKey({ index: i }), ctx.provider);

		ctx.wallets.push(wallet);
	}

	ctx.owner = ctx.wallets[0];
}

function getPrivateKey({ index }) {
	const masterNode = ethers.utils.HDNode.fromMnemonic(
		'test test test test test test test test test test test junk' // Default hardhat mnemonic
	);

	return masterNode.derivePath(`m/44'/60'/0'/0/${index}`).privateKey;
}

module.exports = {
	loadWallets,
	getPrivateKey,
};
