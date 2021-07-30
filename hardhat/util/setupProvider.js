const ethers = require('ethers');
const { ensureNetwork, loadConnections } = require('../../publish/src/util');

function setupProvider({ providerUrl, network }) {
	ensureNetwork(network);
	const { providerUrl: envProviderUrl } = loadConnections({
		network,
	});

	const provider = new ethers.providers.JsonRpcProvider(providerUrl || envProviderUrl);
	return provider;
}

module.exports = {
	setupProvider,
};
