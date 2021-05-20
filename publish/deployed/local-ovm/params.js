'use strict';
const w3utils = require('web3-utils');

const params = {
	INITIAL_ISSUANCE: '0',
	COLLATERAL_MANAGER: {
		SYNTHS: ['sUSD', 'sETH'],
		SHORTS: [{ long: 'sETH', short: 'iETH' }],
		MAX_DEBT: w3utils.toWei('75000000'), // 75 million sUSD
		BASE_BORROW_RATE: Math.round((0.005 * 1e18) / 31556926).toString(), // 31556926 is CollateralManager seconds per year
		BASE_SHORT_RATE: Math.round((0.005 * 1e18) / 31556926).toString(),
	},
	COLLATERAL_SHORT: {
		SYNTHS: ['sETH'],
		MIN_CRATIO: w3utils.toWei('1.2'),
		MIN_COLLATERAL: w3utils.toWei('1000'),
		ISSUE_FEE_RATE: w3utils.toWei('0.005'),
		INTERACTION_DELAY: '0', // 0 secs
	},
};

exports.default = params;
