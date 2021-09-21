'use strict';

const path = require('path');
const fs = require('fs');
const { gray, green, yellow, red } = require('chalk');

const { findSolFiles, flatten, compile } = require('../solidity');

const {
	constants: { COMPILED_FOLDER, CONTRACTS_FOLDER, FLATTENED_FOLDER, BUILD_FOLDER },
	ovmIgnored,
} = require('../../..');

const { stringify } = require('../util');
const {
	sizeOfContracts,
	logContractSizes,
	pcentToColorFnc,
	sizeChange,
} = require('../contract-size');

const DEFAULTS = {
	buildPath: path.join(__dirname, '..', '..', '..', BUILD_FOLDER),
	optimizerRuns: 200,
};
const overrides = require('../contract-overrides');

const build = async ({
	buildPath = DEFAULTS.buildPath,
	cleanBuild,
	migrations,
	optimizerRuns = DEFAULTS.optimizerRuns,
	showSize,
	showWarnings,
	skipUnchanged,
	testHelpers,
	useOvm,
} = {}) => {
	console.log(gray(`Starting build${useOvm ? ' using OVM' : ''} at path ${buildPath}...`));

	if (cleanBuild && fs.existsSync(buildPath)) {
		fs.rmdirSync(buildPath, { recursive: true });
	}

	if (!fs.existsSync(buildPath)) {
		fs.mkdirSync(buildPath);
	}

	// Flatten all the contracts.
	// Start with the libraries, then copy our own contracts on top to ensure
	// if there's a naming clash our code wins.
	console.log(gray('Finding .sol files...'));
	const libraries = findSolFiles({ sourcePath: 'node_modules' });
	const contracts = findSolFiles({
		sourcePath: CONTRACTS_FOLDER,
		ignore: []
			.concat(!migrations ? /^migrations\// : [])
			.concat(!testHelpers ? /^test-helpers\// : []),
	});

	if (useOvm) {
		console.log(gray(`  Sources to be ignored for OVM compilation (see publish/ovm-ignore.json):`));

		const contractPaths = Object.keys(contracts);
		contractPaths.map(contractPath => {
			const filename = path.basename(contractPath, '.sol');
			const isIgnored = ovmIgnored.some(ignored => filename === ignored);

			if (isIgnored) {
				console.log(gray(`    > ${filename}`));

				delete contracts[contractPath];
			}
		});
	}

	const allSolFiles = { ...libraries, ...contracts };
	console.log(
		gray(
			`Found ${Object.keys(contracts).length} sources, and ${
				Object.keys(libraries).length
			} possible libraries`
		)
	);
	console.log(gray('Flattening contracts...'));
	const sources = await flatten({ files: allSolFiles, contracts });

	const unchangedContracts = [];
	const flattenedPath = path.join(buildPath, FLATTENED_FOLDER);
	Object.entries(sources).forEach(([key, { content }]) => {
		const toWrite = path.join(flattenedPath, key);

		try {
			// try make path for sub-folders (note: recursive flag only from nodejs 10.12.0)
			fs.mkdirSync(path.dirname(toWrite), { recursive: true });
		} catch (e) {}
		// open existing if any
		if (fs.existsSync(toWrite)) {
			const existing = fs.readFileSync(toWrite).toString();

			if (content === existing) {
				unchangedContracts.push(key);
			}
		}
		fs.writeFileSync(toWrite, content);
	});
	const compiledPath = path.join(buildPath, COMPILED_FOLDER);

	// Ok, now we need to compile all the files.
	console.log(gray(`Compiling contracts... Default optimizer runs is set to ${optimizerRuns}`));

	let allErrors = [];
	let allWarnings = [];

	const allArtifacts = {};

	const allCompiledFilePaths = [];
	const previousSizes = [];

	for (const contract of Object.keys(sources)) {
		const contractName = contract
			.match(/^.+(?=\.sol$)/)[0]
			.split('/')
			.slice(-1)[0];
		const toWrite = path.join(compiledPath, contractName);
		const filePath = `${toWrite}.json`;
		const prevSizeIfAny = fs.existsSync(filePath)
			? await sizeOfContracts({
					contractToObjectMap: { [filePath]: require(filePath).evm.deployedBytecode.object },
			  })[0]
			: undefined;
		if (prevSizeIfAny) {
			previousSizes.push(prevSizeIfAny);
		}
		let runs = parseInt(optimizerRuns); // default, use ParseInt: runs setting must be an unsigned number.
		if (typeof overrides[contract] === 'object') {
			runs = overrides[contract].runs;
		}
		console.log(
			gray(
				`Attempting compile of ${contract}${
					runs !== optimizerRuns ? ` (override optimizerRuns: ${runs})` : ''
				}`
			)
		);
		if (skipUnchanged && unchangedContracts.indexOf(contract) >= 0) {
			console.log(
				gray(
					'\tSource unchanged. Assuming that last deploy completed and skipping. (⚠⚠⚠ Do not use for production deploys!).'
				)
			);
			continue;
		}

		const { artifacts, errors, warnings } = compile({
			sources: {
				[contract]: sources[contract],
			},
			runs,
			useOvm,
		});

		Object.assign(allArtifacts, artifacts);
		allErrors = allErrors.concat(errors);
		allWarnings = allWarnings.concat(warnings);

		if (warnings.length && showWarnings) {
			console.log(gray(warnings.map(({ formattedMessage }) => formattedMessage).join('\n')));
		}

		if (errors.length) {
			console.log(red(`${contract} errors detected`));
			console.log(red(errors.map(({ formattedMessage }) => formattedMessage)));

			// now in order to ensure that it does not flag skip unchanged, delete the flattened file
			fs.unlinkSync(path.join(flattenedPath, contract));
		} else {
			try {
				// try make path for sub-folders (note: recursive flag only from nodejs 10.12.0)
				fs.mkdirSync(path.dirname(toWrite), { recursive: true });
			} catch (e) {}
			fs.writeFileSync(filePath, stringify(artifacts[contractName]));

			const { pcent, bytes, length } = sizeOfContracts({
				contractToObjectMap: { [filePath]: artifacts[contractName].evm.deployedBytecode.object },
			})[0];

			console.log(
				green(`${contract}`),
				gray('build using'),
				pcentToColorFnc({ pcent, content: `${bytes} (${pcent})` }),
				sizeChange({ prevSizeIfAny, length })
			);

			allCompiledFilePaths.push(filePath);
		}
	}

	console.log(
		(allErrors.length > 0 ? red : yellow)(
			`Compiled with ${allWarnings.length} warnings and ${allErrors.length} errors`
		)
	);

	// We're built!
	console.log(green('Build succeeded'));

	if (showSize) {
		const contractToObjectMap = allCompiledFilePaths
			.filter(file => fs.existsSync(file))
			.reduce((memo, file) => {
				memo[file] = require(file).evm.deployedBytecode.object;
				return memo;
			}, {});

		logContractSizes({ previousSizes, contractToObjectMap });
	}
};

module.exports = {
	build,
	DEFAULTS,
	cmd: program =>
		program
			.command('build')
			.description('Build (flatten and compile) solidity files')
			.option('-b, --build-path <value>', 'Build path for built files', DEFAULTS.buildPath)
			.option('-c, --clean-build', 'Delete previously existing files', false)
			.option(
				'-k, --skip-unchanged',
				'Skip any contracts that seem as though they have not changed (infers from flattened file and does not strictly check bytecode. ⚠⚠⚠ DO NOT USE FOR PRODUCTION BUILDS.'
			)
			.option('-m, --migrations', 'Also compile the migrations')
			.option(
				'-o, --optimizer-runs <value>',
				'Number of runs for the optimizer by default',
				DEFAULTS.optimizerRuns
			)
			.option('-s, --show-size', 'Show contract sizes')
			.option('-t, --test-helpers', 'Also compile the test-helpers')
			.option('-w, --show-warnings', 'Show warnings')
			.option('-z, --use-ovm', 'Use Optimism OVM-compatible compiler')
			.action(build),
};
