const path = require('path');
const {
	constants: { BUILD_FOLDER },
} = require('../..');
const { task } = require('hardhat/config');
const {
	compileInstance,
	prepareDeploy,
	deployInstance,
} = require('../../test/integration/utils/deploy');

task('test:integration:l1', 'run isolated layer 1 production tests')
	.addFlag('compile', 'Compile an l1 instance before running the tests')
	.addFlag('deploy', 'Deploy an l1 instance before running the tests')
	.addFlag('fork', 'Run the tests against a fork of mainnet')
	.addOptionalParam('buildPath', 'The target build path for the evm artifacts')
	.addOptionalParam(
		'providerPort',
		'The target port for the running local chain to test on',
		'8545'
	)
	.setAction(async (taskArguments, hre) => {
		hre.config.paths.tests = './test/integration/l1/';

		const providerUrl = (hre.config.providerUrl = 'http://localhost');
		const providerPort = (hre.config.providerPort = taskArguments.providerPort);
		const buildPath = taskArguments.buildPath || path.join(__dirname, '..', '..', BUILD_FOLDER);

		const timeout = 600000; // 10m
		hre.config.mocha.timeout = timeout;
		hre.config.mocha.bail = true;
		hre.config.networks.localhost.timeout = timeout;
		hre.config.fork = taskArguments.fork;

		taskArguments.maxMemory = true;

		if (taskArguments.compile) {
			await compileInstance({ useOvm: false, buildPath });
		}

		if (taskArguments.deploy) {
			if (taskArguments.fork) {
				await prepareDeploy({ network: 'mainnet' });
				await deployInstance({
					useFork: true,
					network: 'mainnet',
					useOvm: false,
					freshDeploy: false,
					providerUrl,
					providerPort,
					buildPath,
				});
			} else {
				await deployInstance({ useOvm: false, providerUrl, providerPort, buildPath });
			}
		}

		await hre.run('test', taskArguments);
	});
