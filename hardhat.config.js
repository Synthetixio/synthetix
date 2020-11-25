'use strict';

require('@nomiclabs/hardhat-truffle5'); // uses and exposes web3 via hardhat-web3 plugin

const path = require('path');

// require('@eth-optimism/ovm-toolchain/build/src/buidler-plugins/buidler-ovm-compiler'); // enable custom solc compiler
// require('@eth-optimism/ovm-toolchain/build/src/buidler-plugins/buidler-ovm-node'); // add ability to start an OVM node

require('solidity-coverage');
require('hardhat-gas-reporter');
// usePlugin('buidler-ast-doc'); // compile ASTs for use with synthetix-docs

const {
	constants: { inflationStartTimestampInSecs, AST_FILENAME, AST_FOLDER, BUILD_FOLDER },
} = require('.');

const GAS_PRICE = 20e9; // 20 GWEI
const CACHE_FOLDER = 'cache';

const baseNetworkConfig = {
	blockGasLimit: 0x1fffffffffffff,
	initialDate: new Date(inflationStartTimestampInSecs * 1000).toISOString(),
	gasPrice: GAS_PRICE,
	// default to allow unlimited sized so that if we run Hardhat Network in isolation (via npx hardhat node)
	// it will use this setting and allow any type of compiled contracts
	allowUnlimitedContractSize: true,
};

require('./hardhat');

const localNetwork = Object.assign(
	{
		url: 'http://localhost:8545',
		allowUnlimitedContractSize: true,
	},
	baseNetworkConfig
);

module.exports = {
	GAS_PRICE,
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
	networks: {
		hardhat: baseNetworkConfig,
		localhost: localNetwork,
	},
	gasReporter: {
		enabled: false,
		showTimeSpent: true,
		currency: 'USD',
		maxMethodDiff: 25, // CI will fail if gas usage is > than this %
		outputFile: 'test-gas-used.log',
	},
};
