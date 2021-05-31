const { task } = require('hardhat/config');
const { compileInstance, deployInstance } = require('../../test/integration/utils/deploy');

task('test:integration:l2', 'run isolated layer 2 production tests')
	.addFlag('compile', 'Compile an l2 instance before running the tests')
	.addFlag('noCompile', 'Avoid auto compilation')
	.addFlag('deploy', 'Deploy an l2 instance before running the tests')
	.addOptionalParam(
		'providerPort',
		'The target port for the running local chain to test on',
		'8545'
	)
	.setAction(async (taskArguments, hre) => {
		hre.config.paths.tests = './test/integration/l2/';

		const providerUrl = (hre.config.providerUrl = 'http://localhost');
		const providerPort = (hre.config.providerPort = taskArguments.providerPort);

		const timeout = 5 * 60 * 1000;
		hre.config.mocha.timeout = timeout;
		hre.config.mocha.bail = false;
		hre.config.networks.localhost.timeout = timeout;

		taskArguments.maxMemory = true;

		if (taskArguments.compile) {
			await compileInstance({ useOvm: true });
		}

		if (taskArguments.deploy) {
			await deployInstance({
				useOvm: true,
				providerUrl,
				providerPort,
			});
		}

		await hre.run('test', taskArguments);
	});
