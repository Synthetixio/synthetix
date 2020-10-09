const ethers = require('ethers');

function setupProvider({ providerUrl, privateKey, publicKey }) {
	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	let wallet;
	if (publicKey) {
		wallet = provider.getSigner(publicKey);
		wallet.address = publicKey;
	} else if (privateKey) {
		wallet = new ethers.Wallet(privateKey || ethers.Wallet.createRandom().privateKey, provider);
	}

	return {
		provider,
		wallet: wallet || undefined,
	};
}

module.exports = {
	setupProvider,
};
