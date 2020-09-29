const ethers = require('ethers');
const { gray } = require('chalk');

async function setupProvider({ providerUrl, privateKey }) {
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);

  let wallet;
  if (privateKey) {
  	wallet = new ethers.Wallet(
    	privateKey || ethers.Wallet.createRandom().privateKey,
    	provider
  	);
  }

  return {
  	provider,
  	wallet: wallet || undefined
  };
}

module.exports = {
	setupProvider,
};
