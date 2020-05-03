'use strict';

const { usePlugin } = require('@nomiclabs/buidler/config');

usePlugin('@nomiclabs/buidler-truffle5'); // uses and exposes web3 via buidler-web3 plugin
usePlugin('solidity-coverage');
usePlugin('buidler-gas-reporter');

const {
	constants: { inflationStartTimestampInSecs },
} = require('.');

const GAS_PRICE = 20e9; // 20 GWEI

const baseNetworkConfig = {
	allowUnlimitedContractSize: true,
	blockGasLimit: 0x1fffffffffffff,
	initialDate: new Date(inflationStartTimestampInSecs * 1000).toISOString(),
	gasPrice: GAS_PRICE,
};

module.exports = {
	GAS_PRICE,
	solc: {
		version: '0.5.16',
	},
	paths: {
		sources: './contracts',
		tests: './test/contracts',
		artifacts: './build/artifacts',
		cache: './build/cache',
	},
	networks: {
		buidlerevm: baseNetworkConfig,
		localhost: Object.assign(
			{
				url: 'http://localhost:8545',
				timeout: 60e4,
			},
			baseNetworkConfig
		)
	},
	gasReporter: {
		showTimeSpent: true,
		currency: 'USD',
		outputFile: 'test-gas-used.log',
	},
};
