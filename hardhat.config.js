'use strict';

require('@nomiclabs/hardhat-truffle5'); // uses and exposes web3 via hardhat-web3 plugin

const path = require('path');
const { gray, yellow } = require('chalk');

const { task, extendEnvironment, subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');

// require('@eth-optimism/ovm-toolchain/build/src/buidler-plugins/buidler-ovm-compiler'); // enable custom solc compiler
// require('@eth-optimism/ovm-toolchain/build/src/buidler-plugins/buidler-ovm-node'); // add ability to start an OVM node

require('solidity-coverage');
// usePlugin('buidler-ast-doc'); // compile ASTs for use with synthetix-docs
// usePlugin('buidler-gas-reporter');

// const { logContractSizes } = require('./publish/src/contract-size');
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
	// default to allow unlimited sized so that if we run Hardhat Network in isolation (via npx hardhat node)
	// it will use this setting and allow any type of compiled contracts
	allowUnlimitedContractSize: true,
};

extendEnvironment(hre => {
	hre.log = log;

	// NOTE: mutating hre.artifacts seems to cause issues with solidity-coverage, so adding
	// "linkWithLegacySupport" to hre is a workaround

	// base definition of legacy link support (no legacy support by default)
	hre.linkWithLegacySupport = async (artifact, linkTo) => {
		if (!hre.legacy) {
			return artifact.link(await hre.artifacts.require(linkTo).new());
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
			await hre.artifacts.require(linkTo, { ignoreLegacy: !artifact.legacy }).new()
		);
		artifact.contractName = originalContractName;
	};

	// 	// extend how contract testing works
	// 	const oldContractFnc = hre.contract;
	//
	// 	hre.contract = (contractStr, cb) => {
	// 		oldContractFnc(contractStr, accounts => {
	// 			const [contract] = contractStr.split(/\s/); // take the first word as the contract name (ignoring "@xyz" grep tag suffixes)
	// 			const oldRequire = hre.artifacts.require.bind(hre.artifacts);
	//
	// 			// Prevent the contract undergoing testing from using the legacy source file
	// 			// (cause the tests are designed for the newer source, not the legacy)
	// 			before(() => {
	// 				if (hre.legacy) {
	// 					hre.artifacts.require = (name, opts = {}) => {
	// 						if (name === contract || opts.ignoreLegacy) {
	// 							return oldRequire(name);
	// 						}
	// 						try {
	// 							const artifact = oldRequire(name + '_Legacy');
	// 							artifact.legacy = true;
	// 							if (process.env.DEBUG) {
	// 								log('Using legacy source for', name);
	// 							}
	// 							return artifact;
	// 						} catch (err) {
	// 							return oldRequire(name);
	// 						}
	// 					};
	// 				}
	// 			});
	//
	// 			after(() => {
	// 				hre.artifacts.require = oldRequire;
	// 			});
	//
	// 			describe(
	// 				hre.legacy
	// 					? 'when integrating with legacy contracts'
	// 					: 'when integrating with modern contracts',
	// 				() => cb(accounts)
	// 			);
	// 		});
	// 	};
});
//
// // Support for running the tests in "legacy" mode. This enabled the "legacy" flag in the Hardhat
// // Runtime Environment (HRE) and tests can then load up _Legacy sources instead where required.
// // Note: this assumes `npm run compile:legacy` has already been run (we can't run it from in here)
// task('test:legacy', 'run the tests with legacy components')
// 	.addOptionalVariadicPositionalParam('testFiles', 'An optional list of files to test', [])
// 	.setAction(async (taskArguments, hre) => {
// 		hre.legacy = true;
// 		if (process.env.DEBUG) {
// 			console.log(yellow('Legacy mode enabled.'));
// 		}
//
// 		await hre.run('test', taskArguments);
// 	});
//
// task('test:prod', 'run poduction tests against a running fork')
// 	.addFlag('optimizer', 'Compile with the optimizer')
// 	.addFlag('gas', 'Compile gas usage')
// 	.addOptionalParam('gasOutputFile', 'Gas reporter output file')
// 	.addOptionalVariadicPositionalParam('testFiles', 'An optional list of files to test', [])
// 	.setAction(async (taskArguments, hre) => {
// 		if (hre.network.name !== 'localhost') {
// 			throw new Error('Prod testing needs to be run with --network localhost');
// 		}
//
// 		hre.config.paths.tests = './test/prod/';
//
// 		// Prod tests use forking, which means some txs could last minutes.
// 		const timeout = 5 * 60 * 1000; // 5 minutes
// 		hre.config.mocha.timeout = timeout;
// 		hre.config.networks.localhost.timeout = timeout;
//
// 		await hre.run('test', taskArguments);
// 	});
//
const optimizeIfRequired = ({ hre, taskArguments: { optimizer } }) => {
	if (optimizer || hre.optimizer) {
		// only show message once if re-run
		if (hre.optimizer === undefined) {
			console.log(gray('Adding optimizer, runs', yellow(optimizerRuns)));
		}
		// Use optimizer (slower) but simulates real contract size limits and gas usage
		// Note: does not consider actual deployed optimization runs from
		// publish/src/contract-overrides.js
		for (const compiler of hre.config.solidity.compilers) {
			compiler.settings.optimizer = { enabled: true, runs: optimizerRuns };
		}
		hre.config.networks.hardhat.allowUnlimitedContractSize = false;
	} else {
		if (hre.optimizer === undefined) {
			console.log(gray('Optimizer disabled. Unlimited contract sizes allowed.'));
		}
		for (const compiler of hre.config.solidity.compilers) {
			compiler.settings.optimizer = { enabled: false };
		}
		hre.config.networks.hardhat.allowUnlimitedContractSize = true;
	}

	// flag here so that if invoked via "hardhat test" the argument will persist to the compile stage
	hre.optimizer = !!optimizer;
};

let isOvm = false;
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(({ solcVersion }, _, runSuper) => {
	if (!isOvm) {
		return runSuper();
	}

	if (solcVersion === '0.4.25') {
		return runSuper();
	}

	const compilerPath = path.resolve(
		__dirname,
		'node_modules',
		'@eth-optimism',
		'solc',
		'soljson.js'
	);

	return {
		compilerPath,
		isSolcJs: true,
		version: solcVersion,
		longVersion: solcVersion,
	};
});

task('compile')
	.addFlag('showsize', 'Show size of compiled contracts')
	.addFlag('optimizer', 'Compile with the optimizer')
	.addFlag('ovm', 'Compile with the OVM Solidity compiler')
	.addFlag('native', 'Compile with the native solc compiler')
	.setAction(async (taskArguments, hre, runSuper) => {
		if (taskArguments.ovm) {
			console.log(gray('Compiling with OVM Solidity compiler...'));
			isOvm = true;
		}

		optimizeIfRequired({ hre, taskArguments });

		await runSuper(taskArguments);

		if (taskArguments.showsize) {
			// const compiled = require(path.resolve(
			// 	__dirname,
			// 	BUILD_FOLDER,
			// 	CACHE_FOLDER,
			// 	SOLC_OUTPUT_FILENAME
			// ));
			//
			// const contracts = Object.entries(compiled.contracts).filter(([contractPath]) =>
			// 	/^contracts\/[\w]+.sol/.test(contractPath)
			// );
			//
			// const contractToObjectMap = contracts.reduce(
			// 	(memo, [, entries]) =>
			// 		Object.assign(
			// 			{},
			// 			memo,
			// 			Object.entries(entries).reduce((_memo, [name, entry]) => {
			// 				_memo[name] = entry.evm.deployedBytecode.object;
			// 				return _memo;
			// 			}, {})
			// 		),
			// 	{}
			// );
			//
			// logContractSizes({ contractToObjectMap });
		}
	});
//
// task('test')
// 	.addFlag('optimizer', 'Compile with the optimizer')
// 	.addFlag('gas', 'Compile gas usage')
// 	.addFlag('ovm', 'Run tests on the OVM using a custom OVM provider')
// 	.addFlag('native', 'Compile with the native solc compiler')
// 	.addOptionalParam('gasOutputFile', 'Gas reporter output file')
// 	.addOptionalParam('grep', 'Filter tests to only those with given logic')
// 	.setAction(async (taskArguments, hre, runSuper) => {
// 		const { gas, grep, ovm, native, gasOutputFile } = taskArguments;
//
// 		if (ovm) {
// 			hre.ovm = true;
//
// 			console.log(gray('Compiling and running tests in the OVM...'));
// 			hre.config.solc = {
// 				path: path.resolve(__dirname, 'node_modules', '@eth-optimism', 'solc'),
// 			};
// 			await hre.config.startOvmNode();
// 			if (!grep) {
// 				console.log(gray(`Ignoring test specs containing`, yellow('@ovm-skip')));
// 				hre.config.mocha.grep = '@ovm-skip';
// 				hre.config.mocha.invert = true;
// 			}
// 			hre.config.mocha.timeout = 10000000;
// 		}
//
// 		if (native) {
// 			hre.config.solc.native = true;
// 		}
//
// 		optimizeIfRequired({ hre, taskArguments });
//
// 		if (grep) {
// 			console.log(gray('Filtering tests to those containing'), yellow(grep));
// 			hre.config.mocha.grep = grep;
// 		}
//
// 		if (gas) {
// 			console.log(gray(`Enabling ${yellow('gas')} reports, tests will run slower`));
// 			hre.config.gasReporter.enabled = true;
// 			if (!grep) {
// 				console.log(gray(`Ignoring test specs containing`, yellow('@gas-skip')));
// 				hre.config.mocha.grep = '@gas-skip';
// 				hre.config.mocha.invert = true;
// 			}
// 			// Tell buidler-gas-reporter not to wrap provider when using ganache
// 			if (hre.network.name === 'localhost') {
// 				hre.config.gasReporter.fast = false;
// 			}
// 		}
//
// 		if (gasOutputFile) {
// 			hre.config.gasReporter.outputFile = gasOutputFile;
// 		}
//
// 		await runSuper(taskArguments);
// 	});
//
const localNetwork = Object.assign(
	{
		url: 'http://localhost:8545',
		allowUnlimitedContractSize: true,
	},
	baseNetworkConfig
);

module.exports = {
	GAS_PRICE,
	solidity: {
		compilers: [
			{
				version: '0.4.25',
			},
			{
				version: '0.5.16',
			},
		],
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
		hardhat: baseNetworkConfig,
		localhost: localNetwork,
	},
	gasReporter: {
		enabled: false,
		showTimeSpent: true,
		currency: 'USD',
		maxMethodDiff: 25, // CI will fail if gas usage is > than this %
		outputFile: 'test-gas-used.log',
	},
};
