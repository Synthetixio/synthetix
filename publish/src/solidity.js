'use strict';

const path = require('path');
const fs = require('fs');
const solidifier = require('solidifier');
const {
	constants: { COMPILED_FOLDER },
} = require('../..');
const { addSolidityHeader } = require('./solidity-header');

// List all files in a directory in Node.js recursively in a synchronous fashion
const findSolFiles = ({ sourcePath, ignore = [] }) => {
	const fileList = {};
	function doWork(cd, curRelativePath = '') {
		const files = fs.readdirSync(cd);

		for (const file of files) {
			const fullPath = path.join(cd, file);
			const relativePath = path.join(curRelativePath, file);
			if (ignore.filter(regex => regex.test(relativePath)).length > 0) {
				continue;
			} else if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
				doWork(fullPath, relativePath, fileList);
			} else if (path.extname(file) === '.sol') {
				fileList[relativePath] = {
					textContents: fs.readFileSync(fullPath, 'utf8'),
				};
			}
		}
	}

	doWork(sourcePath);

	return fileList;
};

module.exports = {
	findSolFiles,

	getLatestSolTimestamp(dir) {
		let latestSolTimestamp = 0;
		Object.keys(findSolFiles({ sourcePath: dir })).forEach(file => {
			const sourceFilePath = path.join(dir, file);
			latestSolTimestamp = Math.max(latestSolTimestamp, fs.statSync(sourceFilePath).mtimeMs);
		});
		return latestSolTimestamp;
	},

	async flatten({ files, contracts }) {
		const flattenedContracts = {};

		for (const contract of Object.keys(contracts)) {
			const flattened = await solidifier.flatten({
				files,
				path: contract,
				stripExcessWhitespace: true,
			});

			flattenedContracts[contract] = {
				content: addSolidityHeader({ content: flattened, contract }),
			};
		}
		return flattenedContracts;
	},

	compile({ sources, runs, useOvm }) {
		// Note: require this here as silent error is detected on require that impacts pretty-error
		const solc = useOvm ? require('@eth-optimism/solc') : require('solc');

		const artifacts = [];
		const output = JSON.parse(
			solc.compile(
				JSON.stringify({
					language: 'Solidity',
					settings: {
						optimizer: {
							enabled: true,
							runs,
						},
						outputSelection: {
							'*': {
								'*': ['abi', 'metadata', 'evm.bytecode', 'evm.deployedBytecode'],
							},
						},
					},
					sources,
				})
			)
		);

		const warnings = output.errors ? output.errors.filter(e => e.severity === 'warning') : [];
		const errors = output.errors ? output.errors.filter(e => e.severity === 'error') : [];

		// Ok, now pull the contract we care about out of each file's output.
		for (const contract of Object.keys(output.contracts || {})) {
			const name = path.basename(contract, '.sol');
			artifacts[name] = output.contracts[contract][name];
			const metadata = JSON.parse(artifacts[name].metadata);
			artifacts[name].metadata = metadata;
		}

		return { artifacts, errors, warnings };
	},

	loadCompiledFiles({ buildPath }) {
		let earliestCompiledTimestamp = Infinity;

		const compiledSourcePath = path.join(buildPath, COMPILED_FOLDER);

		if (!fs.existsSync(compiledSourcePath)) {
			return { earliestCompiledTimestamp: 0 };
		}
		const compiled = fs
			.readdirSync(compiledSourcePath)
			.filter(name => /^.+\.json$/.test(name))
			.reduce((memo, contractFilename) => {
				const contract = contractFilename.replace(/\.json$/, '');
				const sourceFile = path.join(compiledSourcePath, contractFilename);
				earliestCompiledTimestamp = Math.min(
					earliestCompiledTimestamp,
					fs.statSync(sourceFile).mtimeMs
				);
				if (!fs.existsSync(sourceFile)) {
					throw Error(
						`Cannot find compiled contract code for: ${contract}. Did you run the "build" step first?`
					);
				}
				memo[contract] = JSON.parse(fs.readFileSync(sourceFile));
				return memo;
			}, {});

		return { compiled, earliestCompiledTimestamp };
	},
};
