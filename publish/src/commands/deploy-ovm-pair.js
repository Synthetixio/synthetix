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
	const privateKey = '0x6fcb386bca1dd44b31a33e371a2cc26a039f72732396f2bbc88d8a50ba13fcc4';

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

	// we should use the messenger proxy on L1
	// on L2 we hardcode the messenger address since it is not included in addresses.json
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
