const commands = {
	build: require('../../publish/src/commands/build').build,
	deploy: require('../../publish/src/commands/deploy').deploy,
};

describe('OVM testnet deploy', async () => {
	before('build using @eth-optimism/solc', async () => {
		await commands.build({ useOVM: true, showContractSize: true });
	})

	describe('deploy to ovm', async () => {
		await commands.deploy({
			network: 'local',
			freshDeploy: true,
			yes: true,
			privateKey: '0xADD_ME_OH_HAI_MARK',
			deploymentPath: 'publish/deployed/test-ovm/',
			useOvm: true,
			providerUrl: 'http://127.0.0.1:8545',
			methodCallGasLimit: 2000000,
			contractDeploymentGasLimit: 11000000,
		});
	});
});
