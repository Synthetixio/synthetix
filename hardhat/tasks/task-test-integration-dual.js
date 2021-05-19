const { task } = require('hardhat/config');
const {
	compileInstance,
	deployInstance,
	connectInstances,
} = require('../../test/integration/utils/deploy');

task('test:integration:dual', 'run integrated layer 1 and layer 2 production tests')
	.addFlag('compile', 'Use node publish build before running tests')
	.addFlag('deploy', 'Deploy l1 and l2 instances before running the tests')
	.addFlag('connect', 'Connect the instances before running the tests')
	.setAction(async (taskArguments, hre) => {
		hre.config.paths.tests = './test/integration/dual/';
		hre.config.providerUrl = 'http://localhost';
		hre.config.providerPortL1 = '9545';
		hre.config.providerPortL2 = '8545';

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

		if (taskArguments.connect) {
			await connectInstances();
		}

		await hre.run('test', taskArguments);
	});
