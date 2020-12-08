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
	await deployInstance({ useOvm: false });
	await deployInstance({ useOvm: true });

	const { l1Messenger, l2Messenger } = await getMessengers();
	await commands.connectBridge({
		l1Network: 'local',
		l2Network: 'local',
		l1ProviderUrl: L1_PROVIDER_URL,
		l2ProviderUrl: L2_PROVIDER_URL,
		l1Messenger,
		l2Messenger,
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

const deployInstance = async ({ useOvm }) => {
	await commands.build({ useOvm });

	await commands.deploy({
		network: 'local',
		freshDeploy: true,
		yes: true,
		providerUrl: useOvm ? L1_PROVIDER_URL : L2_PROVIDER_URL,
		gasPrice: 0,
		useOvm,
		methodCallGasLimit: 2500000,
		contractDeploymentGasLimit: 11000000,
	});
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
