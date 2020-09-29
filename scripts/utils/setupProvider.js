const bre = require("@nomiclabs/buidler");

const { gray } = require('chalk');

async function setupProvider({ providerUrl, privateKey }) {
  const provider = new bre.ethers.providers.JsonRpcProvider(providerUrl);

  let wallet;
  if (privateKey) {
  	wallet = new bre.ethers.Wallet(
    	privateKey || bre.ethers.Wallet.createRandom().privateKey,
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
