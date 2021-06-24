const path = require('path');
const {
	constants: { BUILD_FOLDER },
} = require('../..');
const { task } = require('hardhat/config');
const {
	compileInstance,
	deployInstance,
	connectInstances,
} = require('../../test/integration/utils/deploy');

task('test:integration:dual', 'run integrated layer 1 and layer 2 production tests')
	.addFlag('compileEvm', 'Compile the l1 instance before running the tests')
	.addFlag('compileOvm', 'Compile the l2 instance before running the tests')
	.addFlag('deployEvm', 'Deploy the l1 instance before running the tests')
	.addFlag('deployOvm', 'Deploy the l2 instance before running the tests')
	.addFlag('connect', 'Connect deployed l1 and l2 instances before running the tests')
	.addOptionalParam('buildPathEvm', 'The target build path for the evm artifacts')
	.addOptionalParam('buildPathOvm', 'The target build path for the ovm artifacts')
	.setAction(async (taskArguments, hre) => {
		hre.config.paths.tests = './test/integration/dual/';

		const providerUrl = (hre.config.providerUrl = 'http://localhost');
		const providerPortL1 = (hre.config.providerPortL1 = '9545');
		const providerPortL2 = (hre.config.providerPortL2 = '8545');
		const buildPathEvm =
			taskArguments.buildPathEvm || path.join(__dirname, '..', '..', BUILD_FOLDER);
		const buildPathOvm =
			taskArguments.buildPathOvm || path.join(__dirname, '..', '..', `${BUILD_FOLDER}-ovm`);

		const timeout = 600000; // 10m
		hre.config.mocha.timeout = timeout;
		hre.config.mocha.bail = true;
		hre.config.networks.localhost.timeout = timeout;

		taskArguments.maxMemory = true;

		if (taskArguments.compileEvm) {
			await compileInstance({ useOvm: false, buildPath: buildPathEvm });
		}

		if (taskArguments.compileOvm) {
			await compileInstance({ useOvm: true, buildPath: buildPathEvm });
		}

		if (taskArguments.deployEvm) {
			await deployInstance({
				useOvm: false,
				providerUrl,
				providerPort: providerPortL1,
				buildPath: buildPathEvm,
			});
		}

		if (taskArguments.deployOvm) {
			await deployInstance({
				useOvm: true,
				providerUrl,
				providerPort: providerPortL2,
				buildPath: buildPathOvm,
			});
		}

		if (taskArguments.connect) {
			await connectInstances({ providerUrl, providerPortL1, providerPortL2 });
		}

		await hre.run('test', taskArguments);
	});
