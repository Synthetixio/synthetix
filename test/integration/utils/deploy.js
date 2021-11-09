const axios = require('axios');
const { getLocalPrivateKey } = require('../../test-utils/wallets');

const commands = {
	build: require('../../../publish/src/commands/build').build,
	deploy: require('../../../publish/src/commands/deploy').deploy,
	prepareDeploy: require('../../../publish/src/commands/prepare-deploy').prepareDeploy,
	connectBridge: require('../../../publish/src/commands/connect-bridge').connectBridge,
};

async function compileInstance({ useOvm, buildPath, migrations }) {
	await commands.build({
		useOvm,
		cleanBuild: true,
		optimizerRuns: useOvm ? 1 : 200,
		testHelpers: true,
		buildPath,
		migrations,
	});
}

async function prepareDeploy(...args) {
	await commands.prepareDeploy(...args);
}

async function deployInstance({
	addNewSynths,
	buildPath,
	freshDeploy = true,
	generateSolidity = false,
	ignoreCustomParameters = false,
	network = 'local',
	providerPort,
	providerUrl,
	skipFeedChecks = true,
	useFork = false,
	useOvm,
}) {
	const privateKey = network === 'local' ? getLocalPrivateKey({ index: 0 }) : undefined;

	await commands.deploy({
		addNewSynths,
		buildPath,
		concurrency: 1,
		freshDeploy,
		generateSolidity,
		ignoreCustomParameters,
		network,
		nonceManager: useOvm,
		privateKey,
		providerUrl: `${providerUrl}:${providerPort}`,
		skipFeedChecks,
		useFork,
		useOvm,
		yes: true,
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
