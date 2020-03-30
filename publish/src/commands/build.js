'use strict';

const path = require('path');
const fs = require('fs');
const { table } = require('table');
const { gray, green, yellow, red, bgRed } = require('chalk');
const { findSolFiles, flatten, compile } = require('../solidity');

const {
	COMPILED_FOLDER,
	CONTRACTS_FOLDER,
	FLATTENED_FOLDER,
	BUILD_FOLDER,
} = require('../constants');

const { stringify } = require('../util');
const { sizeOfContracts } = require('../contract-size');

const DEFAULTS = {
	buildPath: path.join(__dirname, '..', '..', '..', BUILD_FOLDER),
	optimizerRuns: 200,
};
const overrides = require('../contract-overrides');

const pcentToColorFnc = ({ pcent, content }) => {
	const percentage = pcent.slice(0, -1);
	return percentage > 95
		? bgRed(content)
		: percentage > 85
		? red(content)
		: percentage > 60
		? yellow(content)
		: percentage > 25
		? content
		: gray(content);
};

const build = async ({
	buildPath = DEFAULTS.buildPath,
	optimizerRuns = DEFAULTS.optimizerRuns,
	skipUnchanged,
	testHelpers,
	showWarnings,
	showContractSize,
} = {}) => {
	console.log(gray('Starting build...'));

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
		ignore: [].concat(!testHelpers ? /^test-helpers\// : []),
	});

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

	const sizeChange = ({ prevSizeIfAny, length }) => {
		if (
			!prevSizeIfAny ||
			prevSizeIfAny.length === 0 ||
			length === 0 ||
			prevSizeIfAny.length === length
		) {
			return '';
		}
		const amount = length / prevSizeIfAny.length;
		const pcentChange = ((amount - 1) * 100).toFixed(2);
		return (pcentChange > 0 ? red : green)(`Change of ${pcentChange}%`);
	};

	for (const contract of Object.keys(sources)) {
		const contractName = contract
			.match(/^.+(?=\.sol$)/)[0]
			.split('/')
			.slice(-1)[0];
		const toWrite = path.join(compiledPath, contractName);
		const filePath = `${toWrite}.json`;
		const prevSizeIfAny = await sizeOfContracts({
			filePaths: [filePath],
		})[0];
		if (prevSizeIfAny) {
			previousSizes.push(prevSizeIfAny);
		}
		let runs = optimizerRuns; // default
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

			const { pcent, bytes, length } = sizeOfContracts({ filePaths: [filePath] })[0];

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

	if (showContractSize) {
		const config = {
			border: Object.entries({
				topBody: `─`,
				topJoin: `┬`,
				topLeft: `┌`,
				topRight: `┐`,

				bottomBody: `─`,
				bottomJoin: `┴`,
				bottomLeft: `└`,
				bottomRight: `┘`,

				bodyLeft: `│`,
				bodyRight: `│`,
				bodyJoin: `│`,

				joinBody: `─`,
				joinLeft: `├`,
				joinRight: `┤`,
				joinJoin: `┼`,
			}).reduce((memo, [key, val]) => {
				memo[key] = gray(val);
				return memo;
			}, {}),
		};
		const entries = sizeOfContracts({ filePaths: allCompiledFilePaths });
		const tableData = [
			['Contract', 'Size', 'Percent of Limit', 'Increase'].map(x => yellow(x)),
		].concat(
			entries.reverse().map(({ file, length, pcent }) => {
				const prevSizeIfAny = previousSizes.find(candidate => candidate.file === file);

				return [file, length, pcent, sizeChange({ prevSizeIfAny, length })].map(content =>
					pcentToColorFnc({ pcent, content })
				);
			})
		);
		console.log(table(tableData, config));
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
			.option(
				'-k, --skip-unchanged',
				'Skip any contracts that seem as though they have not changed (infers from flattened file and does not strictly check bytecode. ⚠⚠⚠ DO NOT USE FOR PRODUCTION BUILDS.'
			)
			.option(
				'-o, --optimizer-runs <value>',
				'Number of runs for the optimizer by default',
				DEFAULTS.optimizerRuns
			)
			.option('-s, --show-contract-size', 'Show contract sizes')
			.option('-t, --test-helpers', 'Also compile the test-helpers')
			.option('-w, --show-warnings', 'Show warnings')
			.action(build),
};
