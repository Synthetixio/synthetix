const ethers = require('ethers');
const { gray } = require('chalk');

async function setupProvider({ providerUrl, privateKey }) {
	const provider = new ethers.providers.JsonRpcProvider(providerUrl);
	console.log(gray(`  > provider: ${providerUrl}`));

	let wallet;
	if (privateKey) {
		wallet = new ethers.Wallet(privateKey || ethers.Wallet.createRandom().privateKey, provider);
	}
	if (wallet) {
		console.log(gray(`  > wallet: ${wallet}`));
	}

	return {
		provider,
		wallet: wallet || undefined,
	};
}

module.exports = {
	setupProvider,
};
