'use strict';

const path = require('path');
const { gray, yellow } = require('chalk');

const { usePlugin, task, extendEnvironment } = require('@nomiclabs/buidler/config');

const { SOLC_OUTPUT_FILENAME } = require('@nomiclabs/buidler/internal/constants');

usePlugin('@nomiclabs/buidler-truffle5'); // uses and exposes web3 via buidler-web3 plugin
usePlugin('solidity-coverage');
usePlugin('buidler-ast-doc'); // compile ASTs for use with synthetix-docs

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

task('compile')
	.addFlag('showsize', 'Show size of compiled contracts')
	.addFlag('optimizer', 'Compile with the optimizer')
	.setAction(async (taskArguments, bre, runSuper) => {
		if (taskArguments.optimizer) {
			// Use optimizer (slower) but simulates real contract size limits and gas usage
			// Note: does not consider actual deployed optimization runs from
			// publish/src/contract-overrides.js
			console.log(gray('Adding optimizer, runs', yellow(optimizerRuns)));
			bre.config.solc.optimizer = { enabled: true, runs: optimizerRuns };
			bre.config.networks.buidlerevm.allowUnlimitedContractSize = false;
		} else {
			console.log(gray('Optimizer disabled. Unlimited contract sizes allowed.'));
			bre.config.solc.optimizer = { enabled: false };
			bre.config.networks.buidlerevm.allowUnlimitedContractSize = true;
		}

		await runSuper({ taskArguments });

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
							_memo[name] = entry.evm.bytecode.object;
							return _memo;
						}, {})
					),
				{}
			);

			logContractSizes({ contractToObjectMap });
		}
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
	},
};
