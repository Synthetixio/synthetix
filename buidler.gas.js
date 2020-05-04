'use strict';

const { usePlugin } = require('@nomiclabs/buidler/config');

usePlugin('@nomiclabs/buidler-truffle5'); // uses and exposes web3 via buidler-web3 plugin
usePlugin('buidler-gas-reporter');

const config = require('./buidler.config');

module.exports = Object.assign({}, config, {
	networks: {
		localhost: Object.assign(
			{
				url: 'http://localhost:8545',
				timeout: 60e4,
			},
			config.baseNetworkConfig
		),
	},
	gasReporter: {
		showTimeSpent: true,
		currency: 'USD',
		outputFile: 'test-gas-used.log',
	},
});
