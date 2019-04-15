'use strict';

const path = require('path');
const fs = require('fs');
const solidifier = require('solidifier');
const solc = require('solc');

module.exports = {
	// List all files in a directory in Node.js recursively in a synchronous fashion
	findSolFiles(dir, relativePath = '', fileList = {}) {
		const files = fs.readdirSync(dir);

		files.forEach(file => {
			const fullPath = path.join(dir, file);
			if (fs.statSync(fullPath).isDirectory()) {
				module.exports.findSolFiles(fullPath, path.join(relativePath, file), fileList);
			} else if (path.extname(file) === '.sol') {
				fileList[path.join(relativePath, file)] = {
					textContents: fs.readFileSync(fullPath, 'utf8'),
				};
			}
		});

		return fileList;
	},

	async flatten({ files, contracts }) {
		const flattenedContracts = {};

		for (const contract of Object.keys(contracts)) {
			const flattened = await solidifier.flatten({
				files,
				path: contract,
				stripExcessWhitespace: true,
			});

			flattenedContracts[contract] = { content: flattened };
		}
		return flattenedContracts;
	},

	compile({ sources }) {
		const artifacts = [];
		const output = JSON.parse(
			solc.compileStandardWrapper(
				JSON.stringify({
					language: 'Solidity',
					settings: {
						optimizer: {
							enabled: true,
						},
						outputSelection: {
							'*': {
								'*': ['abi', 'evm.bytecode'],
							},
						},
					},
					sources,
				})
			)
		);

		const warnings = output.errors.filter(e => e.severity === 'warning');
		const errors = output.errors.filter(e => e.severity === 'error');

		// Ok, now pull the contract we care about out of each file's output.
		for (const contract of Object.keys(output.contracts)) {
			const name = path.basename(contract, '.sol');
			artifacts[name] = output.contracts[contract][name];
		}

		return { artifacts, errors, warnings };
	},
};
