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

const L1_PROVIDER_URL = 'http://localhost:9545';
const L2_PROVIDER_URL = 'http://localhost:8545';
const DATA_PROVIDER_URL = 'http://localhost:8080';

const deployOvmPair = async ({ l1ProviderUrl, l2ProviderUrl }) => {
	// This private key is #4 displayed when starting optimism-integration.
	// When used on a fresh L2 chain, it passes all safety checks.
	// Account #0: 0x023ffdc1530468eb8c8eebc3e38380b5bc19cc5d (10000 ETH)
	// Private Key: 0x754fde3f5e60ef2c7649061e06957c29017fe21032a8017132c0078e37f6193a
	// Account #1: 0x0e0e05cf14349469ee3b45dc2fce50e11b9449b8 (10000 ETH)
	// Private Key: 0xd2ab07f7c10ac88d5f86f1b4c1035d5195e81f27dbe62ad65e59cbf88205629b
	// Account #2: 0x432c38a44381668eda4a3152209abbfae065b44d (10000 ETH)
	// Private Key: 0x23d9aeeaa08ab710a57972eb56fc711d9ab13afdecc92c89586e0150bfa380a6
	// Account #3: 0x5eeabfdd0f31cebf32f8abf22da451fe46eac131 (10000 ETH)
	// Private Key: 0x5b1c2653250e5c580dcb4e51c2944455e144c57ebd6a0645bd359d2e69ca0f0c
	// Account #4: 0x640e7cc27b750144ed08ba09515f3416a988b6a3 (10000 ETH)
	// Private Key: 0xea8b000efb33c49d819e8d6452f681eed55cdf7de47d655887fc0e318906f2e7
	const privateKey = '0xea8b000efb33c49d819e8d6452f681eed55cdf7de47d655887fc0e318906f2e7';

	await deployInstance({ useOvm: false, privateKey });
	await deployInstance({ useOvm: true, privateKey });

	const { l1Messenger, l2Messenger } = await getMessengers();

	await commands.connectBridge({
		l1Network: 'local',
		l2Network: 'local',
		l1ProviderUrl: l1ProviderUrl,
		l2ProviderUrl: l2ProviderUrl,
		l1Messenger,
		l2Messenger,
		l1PrivateKey: privateKey,
		l2PrivateKey: privateKey,
		l1GasPrice: 0,
		l2GasPrice: 0,
		gasLimit: 8000000,
	});
};

const deployInstance = async ({ useOvm, privateKey }) => {
	await commands.build({ useOvm, optimizerRuns: useOvm ? 1 : 200, testHelpers: true });

	await commands.deploy({
		network: 'local',
		freshDeploy: true,
		yes: true,
		providerUrl: useOvm ? L2_PROVIDER_URL : L1_PROVIDER_URL,
		gasPrice: '0',
		useOvm,
		methodCallGasLimit: '3500000',
		contractDeploymentGasLimit: useOvm ? OVM_MAX_GAS_LIMIT : '9500000',
		privateKey,
		ignoreCustomParameters: true,
	});
};

const getMessengers = async () => {
	const response = await axios.get(`${DATA_PROVIDER_URL}/addresses.json`);
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
			.option('--l1-provider-url <value>', 'The L1 provider to use', L1_PROVIDER_URL)
			.option('--l2-provider-url <value>', 'The L2 provider to use', L2_PROVIDER_URL)
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
