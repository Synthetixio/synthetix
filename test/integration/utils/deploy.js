const axios = require('axios');
const { getLocalPrivateKey } = require('../../test-utils/wallets');

const {
	constants: { OVM_GAS_PRICE },
} = require('../../..');

const commands = {
	build: require('../../../publish/src/commands/build').build,
	deploy: require('../../../publish/src/commands/deploy').deploy,
	prepareDeploy: require('../../../publish/src/commands/prepare-deploy').prepareDeploy,
	connectBridge: require('../../../publish/src/commands/connect-bridge').connectBridge,
};

async function compileInstance({ useOvm, buildPath }) {
	await commands.build({
		useOvm,
		cleanBuild: true,
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
	skipFeedChecks = true,
}) {
	const privateKey = network === 'local' ? getLocalPrivateKey({ index: 0 }) : undefined;

	await commands.deploy({
		concurrency: 1,
		network,
		useFork,
		freshDeploy,
		yes: true,
		providerUrl: `${providerUrl}:${providerPort}`,
		gasPrice: useOvm ? OVM_GAS_PRICE : 1,
		useOvm,
		privateKey,
		methodCallGasLimit: useOvm ? undefined : 3500000,
		contractDeploymentGasLimit: useOvm ? undefined : 9500000,
		ignoreCustomParameters,
		buildPath,
		skipFeedChecks,
	});
}

async function connectInstances({ providerUrl, providerPortL1, providerPortL2, quiet }) {
	const privateKey = getLocalPrivateKey({ index: 0 });

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
		l2GasPrice: OVM_GAS_PRICE,
		gasLimit: 8000000,
		quiet,
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
