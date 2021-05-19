const hre = require('hardhat');
const axios = require('axios');
const { getPrivateKey } = require('./wallets');

const commands = {
	build: require('../../../publish/src/commands/build').build,
	deploy: require('../../../publish/src/commands/deploy').deploy,
	connectBridge: require('../../../publish/src/commands/connect-bridge').connectBridge,
};

async function compileInstance({ useOvm }) {
	await commands.build({
		useOvm,
		optimizerRuns: useOvm ? 1 : 200,
		testHelpers: true,
	});
}

async function deployInstance({ useOvm }) {
	const privateKey = getPrivateKey({ index: 0 });

	await commands.deploy({
		concurrency: 1,
		network: 'local',
		freshDeploy: true,
		yes: true,
		providerUrl: `${hre.config.providerUrl}:${hre.config.providerPort}`,
		gasPrice: '1',
		useOvm: false,
		privateKey,
		methodCallGasLimit: '3500000',
		contractDeploymentGasLimit: '9500000',
		ignoreCustomParameters: false,
	});
}

async function connectInstances() {
	const privateKey = getPrivateKey({ index: 0 });

	const { l1Messenger, l2Messenger } = await _getMessengers();

	await commands.connectBridge({
		l1Network: 'local',
		l2Network: 'local',
		l1ProviderUrl: `${hre.config.providerUrl}:${hre.config.providerPortL1}`,
		l2ProviderUrl: `${hre.config.providerUrl}:${hre.config.providerPortL2}`,
		l1Messenger,
		l2Messenger,
		l1PrivateKey: privateKey,
		l2PrivateKey: privateKey,
		l1GasPrice: 1,
		l2GasPrice: 0,
		gasLimit: 8000000,
	});
}

async function _getMessengers() {
	const response = await axios.get(`${hre.config.providerUrl}:8080/addresses.json`);
	const addresses = response.data;

	return {
		l1Messenger: addresses['Proxy__OVM_L1CrossDomainMessenger'],
		l2Messenger: '0x4200000000000000000000000000000000000007',
	};
}

module.exports = {
	compileInstance,
	deployInstance,
	connectInstances,
};
