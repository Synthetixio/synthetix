const { task } = require('hardhat/config');
const { compileInstance, deployInstance } = require('../../test/integration/utils/deploy');

task('test:integration:l2', 'run isolated layer 2 production tests')
	.addFlag('compile', 'Use node publish build before running tests')
	.addFlag('deploy', 'Deploy an l2 instance before running tests')
	.setAction(async (taskArguments, hre) => {
		hre.config.paths.tests = './test/integration/l2/';
		hre.config.providerUrl = 'http://localhost';
		hre.config.providerPort = '8545';

		const timeout = 5 * 60 * 1000;
		hre.config.mocha.timeout = timeout;
		hre.config.mocha.bail = false;
		hre.config.networks.localhost.timeout = timeout;

		taskArguments.maxMemory = true;

		if (taskArguments.compile) {
			await compileInstance({ useOvm: false });
		}

		if (taskArguments.deploy) {
			await deployInstance({ useOvm: false });
		}

		await hre.run('test', taskArguments);
	});
