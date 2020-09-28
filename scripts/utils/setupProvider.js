const bre = require("@nomiclabs/buidler");

const { gray } = require('chalk');

async function setupProvider({ providerUrl, privateKey }) {
  const provider = new bre.ethers.providers.JsonRpcProvider(providerUrl);
	console.log(gray('Connecting with provider:', providerUrl));

  const wallet = new bre.ethers.Wallet(
    privateKey || bre.ethers.Wallet.createRandom().privateKey,
    provider
  );
	console.log(gray('Using wallet:', wallet.address));

  return {
  	provider,
  	wallet
  };
}

module.exports = {
	setupProvider,
};
