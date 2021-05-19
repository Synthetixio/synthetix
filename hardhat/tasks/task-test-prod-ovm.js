const { task } = require('hardhat/config');

task('test:prod:ovm', 'run optimism production tests against a running ops instance')
	.addOptionalParam(
		'providerUrl',
		'The target providerUrl where the ops instance will be running',
		'http://localhost'
	)
	.setAction(async (taskArguments, hre) => {
		hre.config.paths.tests = './test/optimism/';
		hre.config.providerUrl = taskArguments.providerUrl;

		const timeout = 5 * 60 * 1000;
		hre.config.mocha.timeout = timeout;
		hre.config.mocha.bail = false;
		hre.config.networks.localhost.timeout = timeout;

		taskArguments.maxMemory = true;

		await hre.run('test', taskArguments);
	});
