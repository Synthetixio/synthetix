const { task, extendEnvironment } = require('hardhat/config');

// Poll the node every 50ms, to override ethers.js's default 4000ms causing OVM
// tests to be slow.
const OVM_POLLING_INTERVAL = 50;

extendEnvironment(hre => {
	if (hre.ethers) {
		const { ethers } = hre;
		const interval = hre.network.config.interval || OVM_POLLING_INTERVAL;
		if (hre.ethers.provider.pollingInterval === interval) {
			return;
		}

		// override the provider polling interval
		const provider = new ethers.providers.JsonRpcProvider(hre.ethers.provider.url);

		// the gas price is overriden to the user provided gasPrice or to 0.
		provider.getGasPrice = async () => ethers.BigNumber.from(hre.network.config.gasPrice || 0);

		// Add the private keys for the geth-ovm node,
		// and connect the signers to the provider defined above.
		try {
			let signers;
			// These accounts are based on a mneumonic located in:
			// https://sourcegraph.com/github.com/nomiclabs/hardhat@73ef8b2/-/blob/packages/hardhat-core/src/internal/core/config/default-config.ts#L17
			const accounts = hre.network.config.accounts;
			if (accounts) {
				const indices = Array.from(Array(20).keys()); // generates array of [0, 1, 2, ..., 18, 19]
				signers = indices.map(i =>
					ethers.Wallet.fromMnemonic(accounts.mnemonic, `${accounts.path}/${i}`).connect(provider)
				);
			}

			hre.ethers.getSigners = () => signers;
		} catch (e) {}
	}
});

task('test:prod:ovm', 'run optimism production tests against a running ops instance')
	.addOptionalParam(
		'providerUrl',
		'The target providerUrl where the ops instance will be running',
		'http://localhost'
	)
	.addFlag('gas', 'Compile gas usage')
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
