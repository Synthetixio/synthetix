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

		hre.config.deploymentPath = taskArguments.deploymentPath;
		hre.config.patchFreshDeployment = taskArguments.patchFreshDeployment;
		hre.config.useOvm = taskArguments.useOvm;
		hre.config.paths.tests = './test/prod/';

		// Prod tests use forking, which means some txs could last minutes.
		const timeout = 5 * 60 * 1000; // 5 minutes
		hre.config.mocha.timeout = timeout;
		hre.config.networks.hardhat.timeout = timeout;

		await hre.run('test', taskArguments);
	});
