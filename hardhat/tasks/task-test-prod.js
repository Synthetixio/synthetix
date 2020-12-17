const { task } = require('hardhat/config');

task('test:prod', 'run production tests against a running fork')
	.addFlag('optimizer', 'Compile with the optimizer')
	.addFlag('gas', 'Compile gas usage')
	.addFlag('patchFreshDeployment', 'Patches up some things in production tests for new deployments')
	.addFlag('useOvm', 'Uses an Optimism configuration')
	.addOptionalParam('gasOutputFile', 'Gas reporter output file')
	.addOptionalParam('deploymentPath', 'Deployed data path')
	.addOptionalVariadicPositionalParam('testFiles', 'An optional list of files to test', [])
	.setAction(async (taskArguments, hre) => {
		if (hre.network.name !== 'hardhat') {
			throw new Error('Prod testing needs to be run with --network hardhat');
		}

		// Extra arguments that can be reached from the tests
		hre.config.deploymentPath = taskArguments.deploymentPath;
		hre.config.patchFreshDeployment = taskArguments.patchFreshDeployment;
		hre.config.useOvm = taskArguments.useOvm;

		// Configure hre
		hre.config.paths.tests = './test/prod/';
		hre.config.networks.hardhat.forking.enabled = true;
		taskArguments.maxMemory = true;

		// Forking means that some txs could last a bit longer
		const timeout = 5 * 60 * 1000; // 5 minutes
		hre.config.mocha.timeout = timeout;
		hre.config.networks.hardhat.timeout = timeout;

		await hre.run('test', taskArguments);
	});
