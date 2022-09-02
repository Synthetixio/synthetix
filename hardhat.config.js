'use strict';
require('dotenv').config();

const path = require('path');

/// the order of these imports is important (due to custom overrides):
/// ./hardhat needs to be imported after hardhat-interact and after solidity-coverage.
///  and hardhat-gas-reporter needs to be imported after ./hardhat (otherwise no gas reports)
require('hardhat-interact');
require('solidity-coverage');
require('./hardhat');
require('@nomiclabs/hardhat-etherscan');
require('@nomiclabs/hardhat-truffle5');
require('@nomiclabs/hardhat-ethers');
require('hardhat-gas-reporter');

require('hardhat-cannon');

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
			initialBaseFeePerGas: (1e9).toString(), // 1 GWEI
			// Note: forking settings are injected at runtime by hardhat/tasks/task-node.js
		},
		localhost: {
			gas: 12e6,
			blockGasLimit: 12e6,
			url: 'http://localhost:8545',
		},
		localhost9545: {
			gas: 12e6,
			blockGasLimit: 12e6,
			url: 'http://localhost:9545',
		},
		mainnet: {
			url: process.env.PROVIDER_URL?.replace('network', 'mainnet') || 'http://localhost:8545',
			chainId: 1,
			accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
		},
		'mainnet-ovm': {
			url: process.env.OVM_PROVIDER_URL || 'https://mainnet.optimism.io/',
			chainId: 10,
			accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
		},
		goerli: {
			url: process.env.PROVIDER_URL?.replace('network', 'goerli') || 'http://localhost:8545',
			chainId: 5,
			accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
		},
		'goerli-ovm': {
			url:
				process.env.PROVIDER_URL?.replace('network', 'optimism-goerli') ||
				'https://goerli.optimism.io/',
			chainId: 420,
			accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
		},
		rinkeby: {
			url: process.env.PROVIDER_URL?.replace('network', 'rinkeby') || '',
			chainId: 4,
			accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
		},
		local: {
			chainId: 31337,
			url: 'http://localhost:8545/',
		},
		'local-ovm': {
			url: 'http://localhost:9545/',
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
		retries: 1,
	},
	etherscan: {
		apiKey: {
			goerli: process.env.ETHERSCAN_KEY,
		},
	},
	cannon: {
		publisherPrivateKey: process.env.PRIVATE_KEY,
		// ipfsConnection: {
		// 	protocol: 'https',
		// 	host: 'ipfs.infura.io',
		// 	port: 5001,
		// 	headers: {
		// 		authorization: `Basic ${Buffer.from(
		// 			process.env.INFURA_IPFS_ID + ':' + process.env.INFURA_IPFS_SECRET
		// 		).toString('base64')}`,
		// 	},
		// },
	},
};
