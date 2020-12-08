const axios = require('axios');
const { red } = require('chalk');
const commands = {
	build: require('./build').build,
	deploy: require('./deploy').deploy,
	connectBridge: require('./connect-bridge').connectBridge,
};

const L1_PROVIDER_URL = 'http://localhost:9545';
const L2_PROVIDER_URL = 'http://localhost:8545';
const DATA_PROVIDER_URL = 'http://localhost:8080';

const deployOvmPair = async () => {
	// This private key is #4 displayed when starting optimism-integration.
	// When used on a fresh L2 chain, it passes all safety checks.
	const privateKey = '0xea8b000efb33c49d819e8d6452f681eed55cdf7de47d655887fc0e318906f2e7';

	await deployInstance({ useOvm: false, privateKey });
	await deployInstance({ useOvm: true, privateKey });

	const { l1Messenger, l2Messenger } = await getMessengers();

	await commands.connectBridge({
		l1Network: 'local',
		l2Network: 'local',
		l1ProviderUrl: L1_PROVIDER_URL,
		l2ProviderUrl: L2_PROVIDER_URL,
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
	await commands.build({ useOvm });

	await commands.deploy({
		network: 'local',
		freshDeploy: true,
		yes: true,
		providerUrl: useOvm ? L2_PROVIDER_URL : L1_PROVIDER_URL,
		gasPrice: '0',
		useOvm,
		methodCallGasLimit: '3500000',
		contractDeploymentGasLimit: useOvm ? '11000000' : '9500000',
		privateKey,
	});
};

const getMessengers = async () => {
	const response = await axios.get(`${DATA_PROVIDER_URL}/addresses.json`);
	const addresses = response.data;

	// These might appear to be inverted, but their not.
	// Optimism uses a slightly different naming convention.
	return {
		l1Messenger: addresses['OVM_L2CrossDomainMessenger'],
		l2Messenger: addresses['OVM_L1CrossDomainMessenger'],
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
