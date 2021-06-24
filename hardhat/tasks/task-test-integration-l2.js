const path = require('path');
const {
	constants: { BUILD_FOLDER },
} = require('../..');
const { task } = require('hardhat/config');
const { compileInstance, deployInstance } = require('../../test/integration/utils/deploy');

task('test:integration:l2', 'run isolated layer 2 production tests')
	.addFlag('compile', 'Compile an l2 instance before running the tests')
	.addFlag('deploy', 'Deploy an l2 instance before running the tests')
	.addOptionalParam(
		'providerPort',
		'The target port for the running local chain to test on',
		'8545'
	)
	.addOptionalParam('buildPath', 'The target build path for the ovm artifacts')
	.setAction(async (taskArguments, hre) => {
		hre.config.paths.tests = './test/integration/l2/';

		const providerUrl = (hre.config.providerUrl = 'http://localhost');
		const providerPort = (hre.config.providerPort = taskArguments.providerPort);
		const buildPath =
			taskArguments.buildPath || path.join(__dirname, '..', '..', `${BUILD_FOLDER}-ovm`);

		const timeout = 600000; // 10m
		hre.config.mocha.timeout = timeout;
		hre.config.mocha.bail = true;
		hre.config.networks.localhost.timeout = timeout;

		taskArguments.maxMemory = true;

		if (taskArguments.compile) {
			await compileInstance({ useOvm: true, buildPath });
		}

		if (taskArguments.deploy) {
			await deployInstance({
				useOvm: true,
				providerUrl,
				providerPort,
				buildPath,
			});
		}

		await hre.run('test', taskArguments);
	});
