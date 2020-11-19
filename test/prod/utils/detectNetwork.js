const { networkToChainId } = require('../../..');
const { web3 } = require('hardhat');

async function detectNetworkName() {
	const networkId = await web3.eth.net.getId();

	let network = Object.keys(networkToChainId).find(key => networkToChainId[key] === networkId);
	if (!network) {
		network = 'local';
	}

	return network;
}

module.exports = {
	detectNetworkName,
};
