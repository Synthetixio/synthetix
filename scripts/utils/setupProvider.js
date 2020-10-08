const ethers = require('ethers');
const { gray } = require('chalk');

function setupProvider({ providerUrl, privateKey, publicKey }) {
	const provider = new ethers.providers.JsonRpcProvider(providerUrl);
	console.log(gray(`  > provider: ${providerUrl}`));

	let wallet;
	if (publicKey) {
		wallet = provider.getSigner(publicKey);
		wallet.address = publicKey;
	} else if (privateKey) {
		wallet = new ethers.Wallet(privateKey || ethers.Wallet.createRandom().privateKey, provider);
	}

	if (wallet) {
		console.log(gray(`  > wallet: ${wallet.address}`));
	}

	return {
		provider,
		wallet: wallet || undefined,
	};
}

module.exports = {
	setupProvider,
};
