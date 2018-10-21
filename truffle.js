module.exports = {
	networks: {
		development: {
			host: '127.0.0.1',
			port: 8545,
			network_id: '*',
			gas: 8000000,
		},
		// ropsten: {
		// 	network_id: '3',
		// 	gas: 8000000,
		// 	gasPrice: 20000000000,
		// },
		// mainnet: {
		// 	network_id: '1',
		// 	gas: 8000000,
		// 	gasPrice: 20000000000,
		// },
	},
	mocha: {
		useColors: true,
		slow: 3000, // We only consider tests slow when they take more than 3 seconds.
	},
	compilers: {
		solc: {
			version: './node_modules/solc', // Version is managed in package.json as an NPM dependency.
			settings: {
				optimizer: {
					enabled: true,
					runs: 200,
				},
			},
		},
	},
};
