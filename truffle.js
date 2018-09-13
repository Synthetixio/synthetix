module.exports = {
	networks: {
		development: {
			host: '127.0.0.1',
			port: 8545,
			network_id: '*',
			gas: 8000000,
			gasPrice: 20000000000,
		},
		ropsten: {
			network_id: '3',
			gas: 8000000,
			gasPrice: 20000000000,
		},
		mainnet: {
			network_id: '1',
			gas: 8000000,
			gasPrice: 20000000000,
		},
	},
	mocha: {
		useColors: true,
	},
	compilers: {
		solc: {
			version: '0.4.24',
			settings: {
				optimizer: {
					enabled: true,
				},
			},
		},
	},
};
