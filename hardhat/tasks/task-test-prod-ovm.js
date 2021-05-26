const { task, extendEnvironment, extendConfig } = require('hardhat/config');
const ethers = require('ethers');

// Poll the node every 50ms, to override ethers.js's default 4000ms causing OVM
// tests to be slow.
const OVM_POLLING_INTERVAL = 50;

extendEnvironment(hre => {
	return;
	const interval = hre.network.config.interval || OVM_POLLING_INTERVAL;

	// override the provider polling interval
	const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
});

task('test:prod:ovm', 'run optimism production tests against a running ops instance')
	.addOptionalParam(
		'providerUrl',
		'The target providerUrl where the ops instance will be running',
		'http://localhost'
	)
	.addFlag('gas', 'Compile gas usage')
	.addFlag('noCompile', '')
	.addOptionalParam('gasOutputFile', 'Gas reporter output file')
	.addOptionalVariadicPositionalParam('testFiles', 'An optional list of files to test', [])
	.setAction(async (taskArguments, hre) => {
		// hre.config.paths.tests = './test/optimism/';
		hre.config.providerUrl = taskArguments.providerUrl;

		const timeout = 5 * 60 * 1000;
		hre.config.mocha.timeout = timeout;
		hre.config.mocha.bail = false;
		hre.config.networks.localhost.timeout = timeout;

		hre.config.useOvm = true;
		// contracts should have been compiled with optimizer previously.
		hre.config.noCompile = true;

		taskArguments.maxMemory = true;

		await hre.run('test', taskArguments);
	});
