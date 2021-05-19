const { task } = require('hardhat/config');
const { compileInstance, deployInstance } = require('../../test/integration/utils/deploy');

task('test:integration:l1', 'run isolated layer 1 production tests')
	.addFlag('compile', 'Compile an l1 instance before running the tests')
	.addFlag('deploy', 'Deploy an l1 instance before running the tests')
	.setAction(async (taskArguments, hre) => {
		hre.config.paths.tests = './test/integration/l1/';

		const providerUrl = (hre.config.providerUrl = 'http://localhost');
		const providerPort = (hre.config.providerPort = '9545');

		const timeout = 5 * 60 * 1000;
		hre.config.mocha.timeout = timeout;
		hre.config.mocha.bail = false;
		hre.config.networks.localhost.timeout = timeout;

		taskArguments.maxMemory = true;

		if (taskArguments.compile) {
			await compileInstance({ useOvm: false });
		}

		if (taskArguments.deploy) {
			await deployInstance({ useOvm: false, providerUrl, providerPort });
		}

		await hre.run('test', taskArguments);
	});
