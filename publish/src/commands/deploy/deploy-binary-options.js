'use strict';

const { gray } = require('chalk');

const {
	utils: { parseUnits },
} = require('ethers');

module.exports = async ({ account, addressOf, deployer, readProxyForResolver }) => {
	// ----------------
	// Binary option market factory and manager setup
	// ----------------

	console.log(gray(`\n------ DEPLOY BINARY OPTIONS ------\n`));

	await deployer.deployContract({
		name: 'BinaryOptionMarketFactory',
		args: [account, addressOf(readProxyForResolver)],
		deps: ['AddressResolver'],
	});

	const day = 24 * 60 * 60;
	const maxOraclePriceAge = 120 * 60; // Price updates are accepted from up to two hours before maturity to allow for delayed chainlink heartbeats.
	const expiryDuration = 26 * 7 * day; // Six months to exercise options before the market is destructible.
	const maxTimeToMaturity = 730 * day; // Markets may not be deployed more than two years in the future.
	const creatorCapitalRequirement = parseUnits('1000').toString(); // 1000 sUSD is required to create a new market.
	const creatorSkewLimit = parseUnits('0.05').toString(); // Market creators must leave 5% or more of their position on either side.
	const poolFee = parseUnits('0.008').toString(); // 0.8% of the market's value goes to the pool in the end.
	const creatorFee = parseUnits('0.002').toString(); // 0.2% of the market's value goes to the creator.
	const refundFee = parseUnits('0.05').toString(); // 5% of a bid stays in the pot if it is refunded.
	const binaryOptionMarketManager = await deployer.deployContract({
		name: 'BinaryOptionMarketManager',
		args: [
			account,
			addressOf(readProxyForResolver),
			maxOraclePriceAge,
			expiryDuration,
			maxTimeToMaturity,
			creatorCapitalRequirement,
			creatorSkewLimit,
			poolFee,
			creatorFee,
			refundFee,
		],
		deps: ['AddressResolver'],
	});

	return { binaryOptionMarketManager };
};
