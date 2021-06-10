const axios = require('axios');
const { getPrivateKey } = require('./users');

const commands = {
	build: require('../../../publish/src/commands/build').build,
	deploy: require('../../../publish/src/commands/deploy').deploy,
	prepareDeploy: require('../../../publish/src/commands/prepare-deploy').prepareDeploy,
	connectBridge: require('../../../publish/src/commands/connect-bridge').connectBridge,
};

const {
	constants: { OVM_MAX_GAS_LIMIT },
} = require('../../../.');

async function compileInstance({ useOvm, buildPath }) {
	await commands.build({
		useOvm,
		optimizerRuns: useOvm ? 1 : 200,
		testHelpers: true,
		buildPath,
	});
}

async function prepareDeploy() {
	await commands.prepareDeploy({ network: 'mainnet' });
}

async function deployInstance({
	useOvm,
	providerUrl,
	providerPort,
	useFork = false,
	network = 'local',
	freshDeploy = true,
	ignoreCustomParameters = false,
	buildPath,
}) {
	const privateKey = getPrivateKey({ index: 0 });

	await commands.deploy({
		concurrency: 1,
		network,
		useFork,
		freshDeploy,
		yes: true,
		providerUrl: `${providerUrl}:${providerPort}`,
		gasPrice: useOvm ? '0' : '1',
		useOvm,
		privateKey,
		methodCallGasLimit: '3500000',
		contractDeploymentGasLimit: useOvm ? OVM_MAX_GAS_LIMIT : '9500000',
		ignoreCustomParameters,
		buildPath,
	});
}

async function connectInstances({ providerUrl, providerPortL1, providerPortL2 }) {
	const privateKey = getPrivateKey({ index: 0 });

	const { l1Messenger, l2Messenger } = await _getMessengers({ providerUrl });

	await commands.connectBridge({
		l1Network: 'local',
		l2Network: 'local',
		l1ProviderUrl: `${providerUrl}:${providerPortL1}`,
		l2ProviderUrl: `${providerUrl}:${providerPortL2}`,
		l1Messenger,
		l2Messenger,
		l1PrivateKey: privateKey,
		l2PrivateKey: privateKey,
		l1GasPrice: 1,
		l2GasPrice: 0,
		gasLimit: 8000000,
	});
}

async function _getMessengers({ providerUrl }) {
	const response = await axios.get(`${providerUrl}:8080/addresses.json`);
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
	prepareDeploy,
};
