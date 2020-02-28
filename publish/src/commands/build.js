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
const { sizeOfFile, sizeOfAllInPath } = require('../contract-size');

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
	console.log(gray(`Compiling contracts... Default optimizer runs is set to ${optimizerRuns}`));
	let allErrors = [];
	let allWarnings = [];
	const allArtifacts = {};
	const compiledPath = path.join(buildPath, COMPILED_FOLDER);
	for (const contract of Object.keys(sources)) {
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
		} else {
			const contractName = contract
				.match(/^.+(?=\.sol$)/)[0]
				.split('/')
				.slice(-1)[0];
			const toWrite = path.join(compiledPath, contractName);
			try {
				// try make path for sub-folders (note: recursive flag only from nodejs 10.12.0)
				fs.mkdirSync(path.dirname(toWrite), { recursive: true });
			} catch (e) {}
			const filePath = `${toWrite}.json`;
			fs.writeFileSync(filePath, stringify(artifacts[contractName]));

			const { pcent, bytes } = await sizeOfFile({ filePath });
			console.log(
				green(`${contract}`),
				gray('build using'),
				pcentToColorFnc({ pcent, content: `${bytes} (${pcent})` })
			);
		}
	}

	Object.entries(allArtifacts).forEach(([key, value]) => {
		const toWrite = path.join(compiledPath, key);
		try {
			// try make path for sub-folders (note: recursive flag only from nodejs 10.12.0)
			fs.mkdirSync(path.dirname(toWrite), { recursive: true });
		} catch (e) {}
		fs.writeFileSync(`${toWrite}.json`, stringify(value));
	});

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
		const entries = await sizeOfAllInPath({ compiledPath });
		const tableData = [['Contract', 'Size', 'Percent of Limit'].map(x => yellow(x))].concat(
			entries.reverse().map(({ file, length, pcent }) => {
				return [file, length, pcent].map(content => pcentToColorFnc({ pcent, content }));
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
				'-o, --optimizer-runs <value>',
				'Number of runs for the optimizer by default',
				DEFAULTS.optimizerRuns
			)
			.option('-s, --show-contract-size', 'Show contract sizes')
			.option('-t, --test-helpers', 'Also compile the test-helpers')
			.option('-w, --show-warnings', 'Show warnings')
			.action(build),
};
