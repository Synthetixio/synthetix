const { task } = require('hardhat/config');
const {
	compileInstance,
	deployInstance,
	connectInstances,
} = require('../../test/integration/utils/deploy');

task('test:integration:dual', 'run integrated layer 1 and layer 2 production tests')
	.addFlag('deploy', 'Deploy l1 and l2 instances before running the tests')
	.addFlag('connect', 'Connect already deployed l1 and l2 instances before running the tests')
	.setAction(async (taskArguments, hre) => {
		hre.config.paths.tests = './test/integration/dual/';

		const providerUrl = (hre.config.providerUrl = 'http://localhost');
		const providerPortL1 = (hre.config.providerPortL1 = '9545');
		const providerPortL2 = (hre.config.providerPortL2 = '8545');

		const timeout = 5 * 60 * 1000;
		hre.config.mocha.timeout = timeout;
		hre.config.mocha.bail = false;
		hre.config.networks.localhost.timeout = timeout;

		taskArguments.maxMemory = true;

		if (taskArguments.deploy) {
			await compileInstance({ useOvm: false });
			await deployInstance({ useOvm: false, providerUrl, providerPort: providerPortL1 });

			await compileInstance({ useOvm: true });
			await deployInstance({ useOvm: true, providerUrl, providerPort: providerPortL2 });
		}

		if (taskArguments.connect) {
			await connectInstances({ providerUrl, providerPortL1, providerPortL2 });
		}

		await hre.run('test', taskArguments);
	});
