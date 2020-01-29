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
const contractSize = require('../contract-size');

const DEFAULTS = {
	buildPath: path.join(__dirname, '..', '..', '..', BUILD_FOLDER),
};
const CONTRACT_OVERRIDES = require('../contract-overrides');

const build = async ({ buildPath = DEFAULTS.buildPath, showWarnings, showContractSize } = {}) => {
	console.log(gray('Starting build...'));

	if (!fs.existsSync(buildPath)) {
		fs.mkdirSync(buildPath);
	}
	// Flatten all the contracts.
	// Start with the libraries, then copy our own contracts on top to ensure
	// if there's a naming clash our code wins.
	console.log(gray('Finding .sol files...'));
	const libraries = findSolFiles('node_modules');
	const contracts = findSolFiles(CONTRACTS_FOLDER);
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

	const flattenedPath = path.join(buildPath, FLATTENED_FOLDER);
	Object.entries(sources).forEach(([key, { content }]) => {
		const toWrite = path.join(flattenedPath, key);
		try {
			// try make path for sub-folders (note: recursive flag only from nodejs 10.12.0)
			fs.mkdirSync(path.dirname(toWrite), { recursive: true });
		} catch (e) {}
		fs.writeFileSync(toWrite, content);
	});

	// Ok, now we need to compile all the files.
	console.log(gray('Compiling contracts...'));

	let contractsWithOverride = {};
	let allErrors = [];
	let allWarnings = [];
	Object.entries(CONTRACT_OVERRIDES).forEach(([key, value]) => {
		console.log(green(`${key} with optimisation runs: ${value.runs}`));
		const source = {
			[key]: sources[key],
		};
		const { artifacts, errors, warnings } = compile({
			sources: source,
			runs: value.runs,
		});

		contractsWithOverride = Object.assign(contractsWithOverride, artifacts);
		allErrors = allErrors.concat(errors);
		allWarnings = allWarnings.concat(warnings);

		delete sources[key];
	});

	console.log(gray('Compiling remaining contracts...'));
	const { artifacts, errors, warnings } = compile({ sources });

	const compiledPath = path.join(buildPath, COMPILED_FOLDER);

	const allArtifacts = Object.assign(artifacts, contractsWithOverride);
	allErrors = allErrors.concat(errors);
	allWarnings = allWarnings.concat(warnings);

	Object.entries(allArtifacts).forEach(([key, value]) => {
		const toWrite = path.join(compiledPath, key);
		try {
			// try make path for sub-folders (note: recursive flag only from nodejs 10.12.0)
			fs.mkdirSync(path.dirname(toWrite), { recursive: true });
		} catch (e) {}
		fs.writeFileSync(`${toWrite}.json`, stringify(value));
	});

	console.log(
		yellow(`Compiled with ${allWarnings.length} warnings and ${allErrors.length} errors`)
	);
	if (allErrors.length > 0) {
		console.error(red(errors.map(({ formattedMessage }) => formattedMessage)));
		console.error();
		console.error(gray('Exiting because of compile errors.'));
		process.exit(1);
	}

	if (allWarnings.length && showWarnings) {
		console.log(gray(warnings.map(({ formattedMessage }) => formattedMessage).join('\n')));
	}

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
		const entries = await contractSize({ compiledPath });
		const tableData = [['Contract', 'Size', 'Percent of Limit'].map(x => yellow(x))].concat(
			entries.reverse().map(({ file, length, pcent }) => {
				const percentage = pcent.slice(0, -1);
				return [file, length, pcent].map(x =>
					percentage > 95
						? bgRed(x)
						: percentage > 85
						? red(x)
						: percentage > 60
						? yellow(x)
						: percentage > 25
						? x
						: gray(x)
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
			.option('-b, --build-path [value]', 'Build path for built files', DEFAULTS.buildPath)
			.option('-s, --show-contract-size', 'Show contract sizes')
			.option('-w, --show-warnings', 'Show warnings')
			.action(build),
};
