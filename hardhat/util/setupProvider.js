const ethers = require('ethers');

function setupProvider({ providerUrl, privateKey, publicKey }) {
	let provider;
	if (providerUrl) {
		provider = new ethers.providers.JsonRpcProvider(providerUrl);
	} else {
		// eslint-disable-next-line new-cap
		provider = new ethers.getDefaultProvider();
	}

	let wallet;
	if (publicKey) {
		wallet = provider.getSigner(publicKey);
		wallet.address = publicKey;
	} else if (privateKey) {
		wallet = new ethers.Wallet(privateKey, provider);
	}

	return {
		provider,
		wallet: wallet || undefined,
	};
}

module.exports = {
	setupProvider,
};
