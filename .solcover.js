const {
	constants: { inflationStartTimestampInSecs },
} = require('.');

module.exports = {
	port: 8545,
	skipFiles: [
		'test-helpers',
		'migrations',
		'legacy',
		'EscrowChecker.sol',
		'ExchangeRatesWithoutInvPricing.sol',
		'EmptyEtherWrapper.sol',
	],
	providerOptions: {
		default_balance_ether: 10000000000000, // extra zero just in case (coverage consumes more gas)
		time: new Date(inflationStartTimestampInSecs * 1000),
		network_id: 55,
	},
	mocha: {
		grep: '@cov-skip', // Find everything with this tag
		invert: true, // Run the grep's inverse set.
		timeout: 360e3,
	},
	// Reduce instrumentation footprint - volume of solidity code
	// passed to compiler causes it to crash (See discussion PR #732)
	// Line and branch coverage will still be reported.
	measureStatementCoverage: false,
};
