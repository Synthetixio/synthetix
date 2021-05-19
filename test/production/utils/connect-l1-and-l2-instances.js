const axios = require('axios');
const commands = {
	connectBridge: require('../../../publish/src/commands/connect-bridge').connectBridge,
};

async function main() {
	// Private key for deterministic account #0 when using hardhat node.
	const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

	const { l1Messenger, l2Messenger } = await _getMessengers();

	await commands.connectBridge({
		l1Network: 'local',
		l2Network: 'local',
		l1ProviderUrl: 'http://localhost:9545',
		l2ProviderUrl: 'http://localhost:8545',
		l1Messenger,
		l2Messenger,
		l1PrivateKey: privateKey,
		l2PrivateKey: privateKey,
		l1GasPrice: 1,
		l2GasPrice: 0,
		gasLimit: 8000000,
	});
}

const _getMessengers = async () => {
	const response = await axios.get(`http://localhost:8080/addresses.json`);
	const addresses = response.data;

	return {
		l1Messenger: addresses['Proxy__OVM_L1CrossDomainMessenger'],
		l2Messenger: '0x4200000000000000000000000000000000000007',
	};
};

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
