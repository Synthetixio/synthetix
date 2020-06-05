const {
	constants: { inflationStartTimestampInSecs },
} = require('.');

module.exports = {
	port: 8545,
	skipFiles: ['test-helpers', 'EscrowChecker.sol'],
	providerOptions: {
		default_balance_ether: 10000000000000, // extra zero just in case (coverage consumes more gas)
		time: new Date(inflationStartTimestampInSecs * 1000),
		network_id: 55,
		gasLimit: 0x1fffffffffffff,
	},
	mocha: {
		grep: '@cov-skip', // Find everything with this tag
		invert: true, // Run the grep's inverse set.
	},
};
