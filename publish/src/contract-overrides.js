'use strict';

module.exports = {
	'ExchangeRates.sol': {
		runs: 20000,
	},
	'FeePool.sol': {
		runs: 1500,
	},
	// Note: the below was added to work around issues with the solidity compiled
	// used by the deploy script. Without this, errors such as
	// Runtime.functionPointers[index] were being thrown by solcjs.
	'Synthetix.sol': {
		runs: 200,
	},
};
