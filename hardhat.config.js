'use strict';
require('dotenv').config();

const path = require('path');

require('./hardhat');
require('@nomiclabs/hardhat-truffle5');
require('@nomiclabs/hardhat-ethers');
require('solidity-coverage');
require('hardhat-gas-reporter');

const {
	constants: { inflationStartTimestampInSecs, AST_FILENAME, AST_FOLDER, BUILD_FOLDER },
} = require('.');

const CACHE_FOLDER = 'cache';

module.exports = {
	ovm: {
		solcVersion: '0.5.16',
	},
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
		ignore: /migrations\//,
		tests: './test/contracts',
		artifacts: path.join(BUILD_FOLDER, 'artifacts'),
		cache: path.join(BUILD_FOLDER, CACHE_FOLDER),
	},
	astdocs: {
		path: path.join(BUILD_FOLDER, AST_FOLDER),
		file: AST_FILENAME,
		ignores: 'test-helpers',
	},
	defaultNetwork: 'hardhat',
	networks: {
		hardhat: {
			blockGasLimit: 12e6,
			allowUnlimitedContractSize: true,
			initialDate: new Date(inflationStartTimestampInSecs * 1000).toISOString(),
			// initialBaseFeePerGas: '10000000000',
			// Note: forking settings are injected at runtime by hardhat/tasks/task-node.js
		},
		localhost: {
			gas: 12e6,
			blockGasLimit: 12e6,
			url: 'http://localhost:8545',
		},
	},
	gasReporter: {
		enabled: false,
		showTimeSpent: true,
		gasPrice: 20,
		currency: 'USD',
		maxMethodDiff: 25, // CI will fail if gas usage is > than this %
		outputFile: 'test-gas-used.log',
	},
	mocha: {
		timeout: 90e3, // 90s
	},
};
