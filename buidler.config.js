'use strict';

const { yellow } = require('chalk');

const { usePlugin, task, extendEnvironment } = require('@nomiclabs/buidler/config');

usePlugin('@nomiclabs/buidler-truffle5'); // uses and exposes web3 via buidler-web3 plugin
usePlugin('solidity-coverage');

const {
	constants: { inflationStartTimestampInSecs },
} = require('.');

const GAS_PRICE = 20e9; // 20 GWEI

const baseNetworkConfig = {
	allowUnlimitedContractSize: true,
	blockGasLimit: 0x1fffffffffffff,
	initialDate: new Date(inflationStartTimestampInSecs * 1000).toISOString(),
	gasPrice: GAS_PRICE,
};

// Support for running the tests in "legacy" mode. This enabled the "legacy" flag in the buidler
// runtime environment (BRE) and tests can then load up _Legacy sources instead where required.
// Note: this assumes `npm run compile:legacy` has already been run (we can't run it from in here)
task('test:legacy', 'run the tests with legacy components')
	.addOptionalVariadicPositionalParam('testFiles', 'An optional list of files to test', [])
	.setAction(async (taskArguments, bre) => {
		bre.legacy = true;
		if (process.env.DEBUG) {
			console.log(yellow('Legacy mode enabled.'));
		}
		await bre.run('test', taskArguments);
	});

extendEnvironment(bre => {
	// Add the requireWithLegacy function to artifacts to allow us easy access to
	// legacy versions
	bre.artifacts.requireWithLegacySupport = name => {
		if (bre.legacy && process.env.DEBUG) {
			console.log(yellow('Using legacy source for', name));
		}
		return bre.artifacts.require(name + (bre.legacy ? '_Legacy' : ''));
	};
});

module.exports = {
	GAS_PRICE,
	solc: {
		version: '0.5.16',
	},
	paths: {
		sources: './contracts',
		tests: './test/contracts',
		artifacts: './build/artifacts',
		cache: './build/cache',
	},
	networks: {
		buidlerevm: baseNetworkConfig,
		coverage: Object.assign(
			{
				url: 'http://localhost:8545',
			},
			baseNetworkConfig
		),
	},
};
