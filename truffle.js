module.exports = {
	networks: {
		development: {
			host: 'localhost',
			port: 8545,
			network_id: '*',
			gas: 8000000,
		},
		coverage: {
			host: 'localhost',
			port: 8545,
			network_id: 55,
		},
	},
	plugins: ['solidity-coverage'],
	mocha: {
		useColors: true,
		slow: 3000, // We only consider tests slow when they take more than 3 seconds.
		enableTimeouts: false,
		reporter: 'eth-gas-reporter',
		reporterOptions: {
			showTimeSpent: true,
			currency: 'USD',
			outputFile: 'test-gas-used.log',
		},
	},
	compilers: {
		solc: {
			version: '0.4.25',
			settings: {
				optimizer: {
					enabled: true,
					runs: 200,
				},
			},
		},
	},
};
