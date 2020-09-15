'use strict';

const path = require('path');
const { gray, yellow } = require('chalk');

const { usePlugin, task, extendEnvironment } = require('@nomiclabs/buidler/config');

const { SOLC_OUTPUT_FILENAME } = require('@nomiclabs/buidler/internal/constants');

require('@eth-optimism/ovm-toolchain/build/src/buidler-plugins/buidler-ovm-compiler'); // enable custom solc compiler
require('@eth-optimism/ovm-toolchain/build/src/buidler-plugins/buidler-ovm-node'); // add ability to start an OVM node

usePlugin('@nomiclabs/buidler-truffle5'); // uses and exposes web3 via buidler-web3 plugin
usePlugin('solidity-coverage');
usePlugin('buidler-ast-doc'); // compile ASTs for use with synthetix-docs
usePlugin('buidler-gas-reporter');

const { logContractSizes } = require('./publish/src/contract-size');
const {
	constants: { inflationStartTimestampInSecs, AST_FILENAME, AST_FOLDER, BUILD_FOLDER },
} = require('.');

const {
	DEFAULTS: { optimizerRuns },
} = require('./publish/src/commands/build');

const log = (...text) => console.log(gray(...['└─> [DEBUG]'].concat(text)));

const GAS_PRICE = 20e9; // 20 GWEI
const CACHE_FOLDER = 'cache';

const baseNetworkConfig = {
	blockGasLimit: 0x1fffffffffffff,
	initialDate: new Date(inflationStartTimestampInSecs * 1000).toISOString(),
	gasPrice: GAS_PRICE,
	// default to allow unlimited sized so that if we run buidler EVM in isolation (via npx buidler node)
	// it will use this setting and allow any type of compiled contracts
	allowUnlimitedContractSize: true,
};

extendEnvironment(bre => {
	bre.log = log;

	// NOTE: mutating bre.artifacts seems to cause issues with solidity-coverage, so adding
	// "linkWithLegacySupport" to bre is a workaround

	// base definition of legacy link support (no legacy support by default)
	bre.linkWithLegacySupport = async (artifact, linkTo) => {
		if (!bre.legacy) {
			return artifact.link(await bre.artifacts.require(linkTo).new());
		}

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

	// extend how contract testing works
	const oldContractFnc = bre.contract;

	bre.contract = (contractStr, cb) => {
		oldContractFnc(contractStr, accounts => {
			const [contract] = contractStr.split(/\s/); // take the first word as the contract name (ignoring "@xyz" grep tag suffixes)
			const oldRequire = bre.artifacts.require.bind(bre.artifacts);

			// Prevent the contract undergoing testing from using the legacy source file
			// (cause the tests are designed for the newer source, not the legacy)
			before(() => {
				if (bre.legacy) {
					bre.artifacts.require = (name, opts = {}) => {
						if (name === contract || opts.ignoreLegacy) {
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
				}
			});

			after(() => {
				bre.artifacts.require = oldRequire;
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

		await bre.run('test', taskArguments);
	});

task('test:prod', 'run poduction tests against a running fork')
	.addFlag('optimizer', 'Compile with the optimizer')
	.addFlag('gas', 'Compile gas usage')
	.addOptionalParam('gasOutputFile', 'Gas reporter output file')
	.addOptionalVariadicPositionalParam('testFiles', 'An optional list of files to test', [])
	.setAction(async (taskArguments, bre) => {
		if (bre.network.name !== 'localhost') {
			throw new Error('Prod testing needs to be run with --network localhost');
		}

		bre.config.paths.tests = './test/prod/';
		bre.config.mocha.timeout = 120e3;

		await bre.run('test', taskArguments);
	});

const optimizeIfRequired = ({ bre, taskArguments: { optimizer } }) => {
	if (optimizer || bre.optimizer) {
		// only show message once if re-run
		if (bre.optimizer === undefined) {
			console.log(gray('Adding optimizer, runs', yellow(optimizerRuns)));
		}
		// Use optimizer (slower) but simulates real contract size limits and gas usage
		// Note: does not consider actual deployed optimization runs from
		// publish/src/contract-overrides.js
		bre.config.solc.optimizer = { enabled: true, runs: optimizerRuns };
		bre.config.networks.buidlerevm.allowUnlimitedContractSize = false;
	} else {
		if (bre.optimizer === undefined) {
			console.log(gray('Optimizer disabled. Unlimited contract sizes allowed.'));
		}
		bre.config.solc.optimizer = { enabled: false };
		bre.config.networks.buidlerevm.allowUnlimitedContractSize = true;
	}

	// flag here so that if invoked via "buidler test" the argument will persist to the compile stage
	bre.optimizer = !!optimizer;
};

task('compile')
	.addFlag('showsize', 'Show size of compiled contracts')
	.addFlag('optimizer', 'Compile with the optimizer')
	.addFlag('ovm', 'Compile with the OVM Solidity compiler')
	.addFlag('native', 'Compile with the native solc compiler')
	.setAction(async (taskArguments, bre, runSuper) => {
		if (taskArguments.ovm) {
			console.log(gray('Compiling with OVM Solidity compiler...'));
			bre.config.solc = {
				path: path.resolve(__dirname, 'node_modules', '@eth-optimism', 'solc'),
			};
		}

		if (taskArguments.native) {
			bre.config.solc.native = true;
		}

		optimizeIfRequired({ bre, taskArguments });

		await runSuper(taskArguments);

		if (taskArguments.showsize) {
			const compiled = require(path.resolve(
				__dirname,
				BUILD_FOLDER,
				CACHE_FOLDER,
				SOLC_OUTPUT_FILENAME
			));

			const contracts = Object.entries(compiled.contracts).filter(([contractPath]) =>
				/^contracts\/[\w]+.sol/.test(contractPath)
			);

			const contractToObjectMap = contracts.reduce(
				(memo, [, entries]) =>
					Object.assign(
						{},
						memo,
						Object.entries(entries).reduce((_memo, [name, entry]) => {
							_memo[name] = entry.evm.deployedBytecode.object;
							return _memo;
						}, {})
					),
				{}
			);

			logContractSizes({ contractToObjectMap });
		}
	});

task('test')
	.addFlag('optimizer', 'Compile with the optimizer')
	.addFlag('gas', 'Compile gas usage')
	.addFlag('ovm', 'Run tests on the OVM using a custom OVM provider')
	.addFlag('native', 'Compile with the native solc compiler')
	.addOptionalParam('gasOutputFile', 'Gas reporter output file')
	.addOptionalParam('grep', 'Filter tests to only those with given logic')
	.setAction(async (taskArguments, bre, runSuper) => {
		const { gas, grep, ovm, native, gasOutputFile } = taskArguments;

		if (ovm) {
			bre.ovm = true;

			console.log(gray('Compiling and running tests in the OVM...'));
			bre.config.solc = {
				path: path.resolve(__dirname, 'node_modules', '@eth-optimism', 'solc'),
			};
			await bre.config.startOvmNode();
			if (!grep) {
				console.log(gray(`Ignoring test specs containing`, yellow('@ovm-skip')));
				bre.config.mocha.grep = '@ovm-skip';
				bre.config.mocha.invert = true;
			}
			bre.config.mocha.timeout = 10000000;
		}

		if (native) {
			bre.config.solc.native = true;
		}

		optimizeIfRequired({ bre, taskArguments });

		if (grep) {
			console.log(gray('Filtering tests to those containing'), yellow(grep));
			bre.config.mocha.grep = grep;
		}

		if (gas) {
			console.log(gray(`Enabling ${yellow('gas')} reports, tests will run slower`));
			bre.config.gasReporter.enabled = true;
			if (!grep) {
				console.log(gray(`Ignoring test specs containing`, yellow('@gas-skip')));
				bre.config.mocha.grep = '@gas-skip';
				bre.config.mocha.invert = true;
			}
			// Tell buidler-gas-reporter not to wrap provider when using ganache
			if (bre.network.name === 'localhost'){
				bre.config.gasReporter.fast = false;
			}
		}

		if (gasOutputFile) {
			bre.config.gasReporter.outputFile = gasOutputFile;
		}

		await runSuper(taskArguments);
	});

const localNetwork = Object.assign(
	{
		url: 'http://localhost:8545',
		allowUnlimitedContractSize: true,
	},
	baseNetworkConfig
);

module.exports = {
	GAS_PRICE,
	solc: {
		version: '0.5.16',
	},
	paths: {
		sources: './contracts',
		tests: './test/contracts',
		artifacts: path.join(BUILD_FOLDER, 'artifacts'),
		cache: path.join(BUILD_FOLDER, CACHE_FOLDER),
	},
	astdocs: {
		path: path.join(BUILD_FOLDER, AST_FOLDER),
		file: AST_FILENAME,
		ignores: 'test-helpers',
	},
	networks: {
		buidlerevm: baseNetworkConfig,
		coverage: localNetwork,
		localhost: localNetwork,
	},
	gasReporter: {
		enabled: false,
		showTimeSpent: true,
		currency: 'USD',
		outputFile: 'test-gas-used.log',
	},
};
