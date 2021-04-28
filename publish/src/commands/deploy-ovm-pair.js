const axios = require('axios');
const { red } = require('chalk');
const commands = {
	build: require('./build').build,
	deploy: require('./deploy').deploy,
	connectBridge: require('./connect-bridge').connectBridge,
};

const {
	constants: { OVM_MAX_GAS_LIMIT },
} = require('../../../.');

const deployOvmPair = async ({ l1ProviderUrl, l2ProviderUrl, dataProviderUrl }) => {
	// These private keys are used in the Optimism ops tool for layer 1
	// Account #0: 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266  (10000 ETH)
	// Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
	// Account #1: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8  (10000 ETH)
	// Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
	const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

	await deployInstance({ useOvm: false, privateKey, l1ProviderUrl, l2ProviderUrl });
	await deployInstance({ useOvm: true, privateKey, l1ProviderUrl, l2ProviderUrl });

	const { l1Messenger, l2Messenger } = await getMessengers({ dataProviderUrl });

	await commands.connectBridge({
		l1Network: 'local',
		l2Network: 'local',
		l1ProviderUrl,
		l2ProviderUrl,
		l1Messenger,
		l2Messenger,
		l1PrivateKey: privateKey,
		l2PrivateKey: privateKey,
		l1GasPrice: 0,
		l2GasPrice: 0,
		gasLimit: 8000000,
	});
};

const deployInstance = async ({ useOvm, privateKey, l1ProviderUrl, l2ProviderUrl }) => {
	await commands.build({ useOvm, optimizerRuns: useOvm ? 1 : 200, testHelpers: true });

	await commands.deploy({
		network: 'local',
		concurrency: 1,
		freshDeploy: true,
		yes: true,
		providerUrl: useOvm ? l2ProviderUrl : l1ProviderUrl,
		gasPrice: '0',
		useOvm,
		methodCallGasLimit: '3500000',
		contractDeploymentGasLimit: useOvm ? OVM_MAX_GAS_LIMIT : '9500000',
		privateKey,
		ignoreCustomParameters: false,
	});
};

const getMessengers = async ({ dataProviderUrl }) => {
	const response = await axios.get(`${dataProviderUrl}/addresses.json`);
	const addresses = response.data;

	return {
		l1Messenger: addresses['Proxy__OVM_L1CrossDomainMessenger'],
		l2Messenger: '0x4200000000000000000000000000000000000007',
	};
};

module.exports = {
	deployOvmPair,
	cmd: program =>
		program
			.command('deploy-ovm-pair')
			.description(
				'Deploys a pair of L1 and L2 instances on local running chains started with `optimism-integration`, and connects them together. To be used exclusively for local testing.'
			)
			.option('--l1-provider-url <value>', 'The L1 provider to use', 'http://localhost:9545')
			.option('--l2-provider-url <value>', 'The L2 provider to use', 'http://localhost:8545')
			.option('--data-provider-url <value>', 'The data provider to use', 'http://localhost:8080')
			.action(async (...args) => {
				try {
					await deployOvmPair(...args);
				} catch (err) {
					console.error(red(err));
					console.log(err.stack);
					process.exitCode = 1;
				}
			}),
};
