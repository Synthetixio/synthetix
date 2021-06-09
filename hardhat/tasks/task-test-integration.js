const path = require('path');
const {
	constants: { BUILD_FOLDER },
} = require('../..');
const { task } = require('hardhat/config');
const {
	compileInstance,
	prepareDeploy,
	deployInstance,
	connectInstances,
} = require('../../test/integration/utils/deploy');

task('test:integration:l1', 'run isolated layer 1 production tests')
	.addFlag('compile', 'Compile an l1 instance before running the tests')
	.addFlag('deploy', 'Deploy an l1 instance before running the tests')
	.addFlag('useFork', 'Run the tests against a fork of mainnet')
	.addOptionalParam(
		'providerPort',
		'The target port for the running local chain to test on',
		'8545'
	)
	.setAction(async (taskArguments, hre) => {
		hre.config.paths.tests = './test/integration/l1/';

		_commonIntegrationTestSettings({ hre, taskArguments });

		const providerUrl = (hre.config.providerUrl = 'http://localhost');
		const providerPort = (hre.config.providerPort = taskArguments.providerPort);
		const useOvm = false;
		const buildPath = path.join(__dirname, '..', '..', BUILD_FOLDER);

		if (taskArguments.compile) {
			await compileInstance({ useOvm, buildPath });
		}

		if (taskArguments.deploy) {
			if (taskArguments.fork) {
				await prepareDeploy({ network: 'mainnet' });
				await deployInstance({
					useFork: true,
					network: 'mainnet',
					useOvm,
					freshDeploy: false,
					providerUrl,
					providerPort,
					buildPath,
				});
			} else {
				await deployInstance({ useOvm, providerUrl, providerPort, buildPath });
			}
		}

		await hre.run('test', taskArguments);
	});

task('test:integration:l2', 'run isolated layer 2 production tests')
	.addFlag('compile', 'Compile an l2 instance before running the tests')
	.addFlag('deploy', 'Deploy an l2 instance before running the tests')
	.setAction(async (taskArguments, hre) => {
		hre.config.paths.tests = './test/integration/l2/';

		_commonIntegrationTestSettings({ hre, taskArguments });

		const providerUrl = (hre.config.providerUrl = 'http://localhost');
		const providerPort = (hre.config.providerPort = '8545');
		const useOvm = true;
		const buildPath = path.join(__dirname, '..', '..', `${BUILD_FOLDER}-ovm`);

		if (taskArguments.compile) {
			await compileInstance({ useOvm, buildPath });
		}

		if (taskArguments.deploy) {
			await deployInstance({
				useOvm,
				providerUrl,
				providerPort,
				buildPath,
			});
		}

		await hre.run('test', taskArguments);
	});

task('test:integration:dual', 'run integrated layer 1 and layer 2 production tests')
	.addFlag('compile', 'Compile the l1 instance before running the tests')
	.addFlag('deploy', 'Deploy the l1 instance before running the tests')
	.setAction(async (taskArguments, hre) => {
		hre.config.paths.tests = './test/integration/dual/';

		_commonIntegrationTestSettings({ hre, taskArguments });

		const providerUrl = (hre.config.providerUrl = 'http://localhost');
		const providerPortL1 = (hre.config.providerPortL1 = '9545');
		const providerPortL2 = (hre.config.providerPortL2 = '8545');
		const buildPathEvm = path.join(__dirname, '..', '..', BUILD_FOLDER);
		const buildPathOvm = path.join(__dirname, '..', '..', `${BUILD_FOLDER}-ovm`);

		if (taskArguments.compile) {
			await compileInstance({ useOvm: false, buildPath: buildPathEvm });
			await compileInstance({ useOvm: true, buildPath: buildPathOvm });
		}

		if (taskArguments.deploy) {
			await deployInstance({
				useOvm: false,
				providerUrl,
				providerPort: providerPortL1,
				buildPath: buildPathEvm,
			});

			await deployInstance({
				useOvm: true,
				providerUrl,
				providerPort: providerPortL2,
				buildPath: buildPathOvm,
			});
		}

		await connectInstances({ providerUrl, providerPortL1, providerPortL2 });

		await hre.run('test', taskArguments);
	});

function _commonIntegrationTestSettings({ hre, taskArguments }) {
	const timeout = 600000; // 10m
	hre.config.mocha.timeout = timeout;
	hre.config.mocha.bail = true;
	hre.config.networks.localhost.timeout = timeout;

	taskArguments.maxMemory = true;
	taskArguments.noCompile = true;
}
