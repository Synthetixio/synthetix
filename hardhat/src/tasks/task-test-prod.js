// task('test:prod', 'run poduction tests against a running fork')
// 	.addFlag('optimizer', 'Compile with the optimizer')
// 	.addFlag('gas', 'Compile gas usage')
// 	.addFlag('patchFreshDeployment', 'Patches up some things in production tests for new deployments')
// 	.addFlag('useOvm', 'Uses an Optimism configuration')
// 	.addOptionalParam('gasOutputFile', 'Gas reporter output file')
// 	.addOptionalParam('deploymentPath', 'Deployed data path')
// 	.addOptionalVariadicPositionalParam('testFiles', 'An optional list of files to test', [])
// 	.setAction(async (taskArguments, bre) => {
// 		if (bre.network.name !== 'localhost') {
// 			throw new Error('Prod testing needs to be run with --network localhost');
// 		}

// 		bre.config.deploymentPath = taskArguments.deploymentPath;
// 		bre.config.patchFreshDeployment = taskArguments.patchFreshDeployment;
// 		bre.config.useOvm = taskArguments.useOvm;
// 		bre.config.paths.tests = './test/prod/';

// 		// Prod tests use forking, which means some txs could last minutes.
// 		const timeout = 5 * 60 * 1000; // 5 minutes
// 		bre.config.mocha.timeout = timeout;
// 		bre.config.networks.localhost.timeout = timeout;

// 		await bre.run('test', taskArguments);
// 	});
