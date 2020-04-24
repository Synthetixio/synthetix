'use strict';

const { gray, yellow } = require('chalk');

const { usePlugin, task, extendEnvironment } = require('@nomiclabs/buidler/config');

usePlugin('@nomiclabs/buidler-truffle5'); // uses and exposes web3 via buidler-web3 plugin
usePlugin('solidity-coverage');

const {
	constants: { inflationStartTimestampInSecs },
} = require('.');

const log = (...text) => console.log(gray(...['└─> [DEBUG]'].concat(text)));

const GAS_PRICE = 20e9; // 20 GWEI

const baseNetworkConfig = {
	allowUnlimitedContractSize: true,
	blockGasLimit: 0x1fffffffffffff,
	initialDate: new Date(inflationStartTimestampInSecs * 1000).toISOString(),
	gasPrice: GAS_PRICE,
};

extendEnvironment(bre => {
	bre.log = log;

	bre.skipLegacyMap = {};

	// base definition of legacy link support (no legacy support by default)
	bre.artifacts.linkWithLegacySupport = async (artifact, linkTo) => {
		return artifact.link(await bre.artifacts.require(linkTo).new());
	};

	// extend how contract testing works
	const oldContractFnc = bre.contract;

	bre.contract = (name, cb) => {
		oldContractFnc(name, accounts => {
			// Prevent the contract undergoing testing from using the legacy source file
			// (cause the tests are designed for the newer source, not the legacy)
			before(() => {
				if (bre.legacy) {
					if (process.env.DEBUG) {
						log(`Preventing legacy usage of ${name} for the duration of this test suite.`);
					}
					bre.skipLegacyMap[name] = true;
				}
			});

			// Yet, once the suite finishes, ensure
			after(() => {
				if (bre.legacy) {
					if (process.env.DEBUG) {
						log(`Re-activating legacy usage of ${name}.`);
					}
					bre.skipLegacyMap[name] = false;
				}
			});
			describe(
				bre.legacy
					? 'when integrating with legacy contracts'
					: 'when integrating with modern contracts',
				() => cb(accounts)
			);
		});
	};
});

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

		const oldRequire = bre.artifacts.require.bind(bre.artifacts);

		bre.artifacts.require = (name, opts = {}) => {
			if (opts.ignoreLegacy || bre.skipLegacyMap[name]) {
				return oldRequire(name);
			}
			try {
				const artifact = oldRequire(name + '_Legacy');
				artifact.legacy = true;
				if (process.env.DEBUG) {
					log('Using legacy source for', name);
				}
				return artifact;
			} catch (err) {
				return oldRequire(name);
			}
		};

		// Ensure when
		bre.artifacts.linkWithLegacySupport = async (artifact, linkTo) => {
			const originalContractName = artifact.contractName;
			if (artifact.legacy) {
				// This little hack is necessary as artifact.link will use the contractName to
				// lookup the contract's bytecode and we need it
				artifact.contractName += '_Legacy';
			}
			await artifact.link(
				// link SafeDecimalMath - which will use legacy by default in legacy mode
				// UNLESS this artifact is not a legacy one
				await bre.artifacts.require(linkTo, { ignoreLegacy: !artifact.legacy }).new()
			);
			artifact.contractName = originalContractName;
		};

		await bre.run('test', taskArguments);
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
