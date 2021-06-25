const path = require('path');

const { subtask, task, internalTask } = require('hardhat/config');
const {
	TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
	TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS,
	TASK_COMPILE_SOLIDITY_GET_DEPENDENCY_GRAPH,
} = require('hardhat/builtin-tasks/task-names');
const { gray, yellow, red } = require('chalk');

const { ovmIgnored } = require('../..');

const optimizeIfRequired = require('../util/optimizeIfRequired');

const { collectContractBytesCodes } = require('../util/collectContractBytecodes');
const { logContractSizes } = require('../../publish/src/contract-size');

task('compile')
	.addFlag('showsize', 'Show size of compiled contracts')
	.addFlag('optimizer', 'Compile with the optimizer')
	.addFlag('failOversize', 'Fail if any contract is oversize')
	.addFlag('useOvm', 'Compile with the OVM Solidity compiler')
	.addFlag('native', 'Compile with the native solc compiler')
	.setAction(async (taskArguments, hre, runSuper) => {
		if (taskArguments.useOvm) {
			console.log(gray('Compiling with OVM Solidity compiler...'));

			require('@eth-optimism/hardhat-ovm');
			hre.config.ignoreNonOvmContracts = true;
		}

		if (taskArguments.native) {
			hre.config.solc.native = true;
		}

		optimizeIfRequired({ hre, taskArguments });

		await runSuper(taskArguments);

		if (taskArguments.showsize || taskArguments.failOversize) {
			const contractToObjectMap = collectContractBytesCodes();
			const sizes = logContractSizes({ contractToObjectMap });

			if (taskArguments.failOversize) {
				const offenders = sizes.filter(entry => +entry.pcent.split('%')[0] > 100);
				if (offenders.length > 0) {
					const names = offenders.map(o => o.file);
					console.log(red('Oversized contracts:'), yellow(`[${names}]`));
					throw new Error(
						'Compilation failed, because some contracts are too big to be deployed. See above.'
					);
				}
			}
		}
	});

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(({ solcVersion }, hre, runSuper) => {
	if (!hre.isOvm) {
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

// This overrides a buidler internal task, which is part of its compile task's lifecycle.
// This allows us to filter out non OVM compatible contracts from the compilation list,
// which are entries in publish/ovm-ignore.json.
internalTask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, async (_, { config }, runSuper) => {
	let filePaths = await runSuper();

	if (config.ignoreNonOvmContracts) {
		console.log(gray(`  Sources to be ignored for OVM compilation (see publish/ovm-ignore.json):`));
		filePaths = filePaths.filter(filePath => {
			const filename = path.basename(filePath, '.sol');
			const isIgnored = ovmIgnored.some(ignored => filename === ignored);
			if (isIgnored) {
				console.log(gray(`    > ${filename}`));
			}

			return !isIgnored;
		});
	}

	if (config.paths.ignore) {
		console.log(gray(`Ignoring paths`), yellow(config.paths.ignore));
		filePaths = filePaths.filter(filePath => !config.paths.ignore.test(filePath));
	}

	return filePaths;
});

// See internalTask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS) first.
// Filtering the right sources should be enough. However, knowing which are the right sources can be hard.
// I.e. you may mark TradingRewards to be ignored, but it ends up in the compilation anyway
// because test-helpers/FakeTradingRewards uses it.
// We also override this task to more easily detect when this is happening.
internalTask(TASK_COMPILE_SOLIDITY_GET_DEPENDENCY_GRAPH, async (_, { config }, runSuper) => {
	const graph = await runSuper();

	if (config.ignoreNonOvmContracts) {
		// Iterate over the dependency graph, and check if an ignored contract
		// is listed as a dependency of another contract.
		for (const entry of graph._resolvedFiles) {
			const source = entry[0];
			const sourceFilename = path.basename(source, '.sol');

			const dependencies = entry[1].content.imports;
			for (const dependency of dependencies) {
				const filename = path.basename(dependency, '.sol');

				const offender = ovmIgnored.find(ignored => filename === ignored);
				if (offender) {
					throw new Error(
						red(
							`Ignored source ${offender} is in the dependency graph because ${sourceFilename} imports it.`
						)
					);
				}
			}
		}
	}

	return graph;
});
