module.exports = {
	port: 8545,
	skipFiles: ['test-helpers'],
	client: require('ganache-cli'), // use ganache-cli version listed in dev deps
	providerOptions: {
		default_balance_ether: 10000000000000, // extra zero just in case (coverage consumes more gas)
		time: new Date('2019-03-06T00:00:00'),
		network_id: 55,
		gas: 17592186044415, // 0xfffffffffff
		gasLimit: 9e12,
		callGasLimit: 9e12,
		allowUnlimitedContractSize: true,
	},
	mocha: {
		grep: '@cov-skip', // Find everything with this tag
		invert: true, // Run the grep's inverse set.
	},
};
