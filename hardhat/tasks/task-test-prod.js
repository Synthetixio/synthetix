const { task } = require('hardhat/config');

task('test:prod', 'run production tests against a running fork')
	.addFlag('optimizer', 'Compile with the optimizer')
	.addFlag('gas', 'Compile gas usage')
	.addFlag('patchFreshDeployment', 'Patches up some things in production tests for new deployments')
	.addFlag('useOvm', 'Uses an Optimism configuration')
	.addFlag('noCompile', 'Avoid auto compilation')
	.addOptionalParam(
		'targetNetwork',
		'The deployement network to run the tests against (E.g. mainnet, local, etc...)',
		'local'
	)
	.addOptionalParam('gasOutputFile', 'Gas reporter output file')
	.addOptionalParam('deploymentPath', 'Deployed data path')
	.addOptionalVariadicPositionalParam('testFiles', 'An optional list of files to test', [])
	.setAction(async (taskArguments, hre) => {
		if (hre.network.name !== 'localhost') {
			throw new Error('Prod testing needs to be run with --network localhost');
		}

		// Extra arguments that can be reached from the tests
		hre.config.targetNetwork = taskArguments.targetNetwork;
		hre.config.deploymentPath = taskArguments.deploymentPath;
		hre.config.patchFreshDeployment = taskArguments.patchFreshDeployment;
		hre.config.useOvm = taskArguments.useOvm;
		hre.config.prod = true;

		// Configure hre
		hre.config.paths.tests = './test/prod/';
		taskArguments.maxMemory = true;

		// If running on top of a fork, txs could take a bit longer
		const timeout = 5 * 60 * 1000; // 5 minutes
		hre.config.mocha.timeout = timeout;
		hre.config.networks.localhost.timeout = timeout;

		await hre.run('test', taskArguments);
	});
