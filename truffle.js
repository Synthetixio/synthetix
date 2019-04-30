module.exports = {
	networks: {
		development: {
			host: '127.0.0.1',
			port: 8545,
			network_id: '*',
			gas: 8000000,
		},
	},
	mocha: {
		useColors: true,
		slow: 3000, // We only consider tests slow when they take more than 3 seconds.
		enableTimeouts: false,
		reporter: 'eth-gas-reporter',
		reporterOptions: {
			showTimeSpent: true,
			currency: 'USD',
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
