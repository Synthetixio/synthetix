'use strict';

const path = require('path');
const fs = require('fs');
const program = require('commander');
const { gray, green, yellow, red } = require('chalk');

const { findSolFiles, flatten, compile } = require('./solidity');

program
	.command('build')
	.description('Build (flatten and compile) solidity files')
	.option(
		'-b, --build-path [value]',
		'Build path for built files',
		path.join(__dirname, '..', 'build')
	)
	.action(async ({ buildPath }) => {
		console.log(gray('Starting build...'));

		// Flatten all the contracts.
		// Start with the libraries, then copy our own contracts on top to ensure
		// if there's a naming clash our code wins.
		console.log(gray('Finding .sol files...'));
		const libraries = findSolFiles('node_modules');
		const contracts = findSolFiles('contracts');
		const allSolFiles = { ...libraries, ...contracts };

		console.log(gray('Flattening contracts...'));
		const sources = await flatten({ files: allSolFiles, contracts });

		const flattenedPath = path.join(buildPath, 'flattened');
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
		const { artifacts, errors, warnings } = compile({ sources });
		const compiledPath = path.join(buildPath, 'compiled');
		Object.entries(artifacts).forEach(([key, value]) => {
			const toWrite = path.join(compiledPath, key);
			try {
				// try make path for sub-folders (note: recursive flag only from nodejs 10.12.0)
				fs.mkdirSync(path.dirname(toWrite), { recursive: true });
			} catch (e) {}
			fs.writeFileSync(`${toWrite}.json`, JSON.stringify(value));
		});

		console.log(yellow(`Compiled with ${warnings.length} warnings and ${errors.length} errors`));
		if (errors.length > 0) {
			console.error(red(errors));
			console.error();
			console.error(gray('Exiting because of compile errors.'));
			process.exit(1);
		}

		// We're built!
		console.log(green('Build succeeded'));
	});

program
	.command('deplpy')
	.description('Deploy compiled solidity files')
	.option('-n, --network <value>', 'The network to run off.', 'kovan')
	.option('-c, --contract-gas-limit <value>', 'Contract deployment gas limit', parseInt, 65e5)
	.option('-m, --method-gas-limit <value>', 'Method call gas limit', parseInt, 15e4)
	.option('-g, --gas-price <value>', 'Gas price', parseInt, 1)
	.option('-s, --synth-list <value>', 'Path to a list of synths', './synths.json')
	.option(
		'-b, --build-path [value]',
		'Build path for built files',
		path.join(__dirname, '..', 'build')
	)
	.action(async ({ network, buildPath }) => {});

program.parse(process.argv);
