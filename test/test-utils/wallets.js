const ethers = require('ethers');

function loadLocalWallets({ provider }) {
	const wallets = [];

	for (let i = 0; i < 10; i++) {
		const privateKey = getLocalPrivateKey({ index: i });
		const wallet = new ethers.Wallet(privateKey, provider);
		wallet.privateKey = privateKey;
		wallets.push(wallet);
	}

	return wallets;
}

function getLocalPrivateKey({ index }) {
	return _getLocalMasterNode().derivePath(`m/44'/60'/0'/0/${index}`).privateKey;
}

function _getLocalMasterNode() {
	return ethers.utils.HDNode.fromMnemonic(
		'test test test test test test test test test test test junk' // Default hardhat mnemonic
	);
}

module.exports = {
	loadLocalWallets,
	getLocalPrivateKey,
};
