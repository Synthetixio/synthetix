'use strict';

const path = require('path');
const { gray, yellow } = require('chalk');

const { usePlugin, task, extendEnvironment } = require('@nomiclabs/buidler/config');
const { glob } = require('@nomiclabs/buidler/internal/util/glob');

const { SOLC_OUTPUT_FILENAME } = require('@nomiclabs/buidler/internal/constants');

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

	bre.contract = (contract, cb) => {
		oldContractFnc(contract, accounts => {
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
	.setAction(async (taskArguments, bre, runSuper) => {
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
	.addFlag('prod', 'Run production tests on a fork')
	.addOptionalParam('grep', 'Filter tests to only those with given logic')
	.setAction(async (taskArguments, bre, runSuper) => {
		optimizeIfRequired({ bre, taskArguments });

		const { gas, grep, testFiles, prod } = taskArguments;

		if (testFiles.length === 0) {
			const allFiles = await glob(path.join(bre.config.paths.tests, '**/*.js'));

			let modifiedTestFiles;
			if (prod) {
				modifiedTestFiles = allFiles.filter(file => file.match(/\.prod/g));
			} else {
				modifiedTestFiles = allFiles.filter(file => file.match(/^((?!\.prod).)*$/g));
			}

			taskArguments.testFiles = modifiedTestFiles;
		} else if (prod) {
			throw new Error('Cannot specify test files with the "prod" option.');
		}

		// TODO: Is there a way to force this.
		// TODO: Consider starting the fork here?
		if (prod && bre.buidlerArguments.network !== 'localhost') {
			throw new Error('Prod testing needs to be run with --network localhost');
		}

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
		}

		await runSuper(taskArguments);
	});

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
		coverage: Object.assign(
			{
				url: 'http://localhost:8545',
				allowUnlimitedContractSize: true,
			},
			baseNetworkConfig
		),
		localhost: Object.assign(
			{
				url: 'http://localhost:8545',
				allowUnlimitedContractSize: true,
			},
			baseNetworkConfig
		),
	},
	gasReporter: {
		enabled: false,
		showTimeSpent: true,
		currency: 'USD',
		outputFile: 'test-gas-used.log',
	},
};
