'use strict';
require('dotenv').config();

const path = require('path');

/// the order of these imports is important (due to custom overrides):
/// ./hardhat needs to be imported after hardhat-interact and after solidity-coverage.
///  and hardhat-gas-reporter needs to be imported after ./hardhat (otherwise no gas reports)
require('hardhat-interact');
require('solidity-coverage');
require('./hardhat');
require('@nomiclabs/hardhat-truffle5');
require('@nomiclabs/hardhat-ethers');
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
			// Note: forking settings are injected at runtime by hardhat/tasks/task-node.js
		},
		localhost: {
			gas: 12e6,
			blockGasLimit: 12e6,
			url: 'http://localhost:8545',
		},
		mainnet: {
			url: process.env.PROVIDER_URL_MAINNET || 'http://localhost:8545',
			chainId: 1,
		},
		'mainnet-ovm': {
			url: process.env.OVM_PROVIDER_URL || 'https://mainnet.optimism.io/',
			chainId: 10,
		},
		kovan: {
			url: process.env.PROVIDER_URL || 'http://localhost:8545',
			chainId: 42,
		},
		'kovan-ovm': {
			url: process.env.OVM_PROVIDER_URL || 'https://kovan.optimism.io/',
			chainId: 69,
		},
		local: {
			url: process.env.PROVIDER_URL || 'http://localhost:8545/',
		},
		'local-ovm': {
			url: process.env.OVM_PROVIDER_URL || 'http://localhost:9545/',
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
		timeout: 120e3, // 120s
		retries: 3,
	},
};
