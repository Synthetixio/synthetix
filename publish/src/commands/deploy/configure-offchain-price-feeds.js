'use strict';

const { gray } = require('chalk');
const { toBytes32 } = require('../../../..');

module.exports = async ({ deployer, runStep, offchainFeeds, useOvm }) => {
	console.log(gray(`\n------ CONFIGURE OFFCHAIN FEEDS ------\n`));

	console.log(gray(`\n------ CONFIGURE OFFCHAIN FEEDS (PYTH) ------\n`));

	// Setup remaining price feeds (that aren't synths)
	const { PerpsV2ExchangeRate } = deployer.deployedContracts;

	const pythFeeds = offchainFeeds.filter(p => p.kind === 'pyth');
	if (pythFeeds.length === 0) {
		// No feeds to configure
		return;
	}

	if (new Set(pythFeeds.map(p => p.oracle)).size > 1) {
		throw Error('Pyth Off-chain feeds contains more than one oracle address');
	}

	const oracleAddress = pythFeeds[0].oracle;

	await runStep({
		contract: `PerpsV2ExchangeRate`,
		target: PerpsV2ExchangeRate,
		read: 'offchainOracle',
		expected: input => input === oracleAddress,
		write: 'setOffchainOracle',
		writeArg: [oracleAddress],
		comment: `Ensure the PerpsV2ExchangeRate has the oracle address configured to ${oracleAddress}`,
	});

	for (const feed of pythFeeds) {
		const key = feed.asset;
		await runStep({
			contract: `PerpsV2ExchangeRate`,
			target: PerpsV2ExchangeRate,
			read: 'offchainPriceFeedId',
			readArg: [toBytes32(key)],
			expected: input => input === feed.feedId,
			write: 'setOffchainPriceFeedId',
			writeArg: [toBytes32(key), feed.feedId],
			comment: `Ensure the PerpsV2ExchangeRate contract has the off-chain feed Id for ${key}`,
		});
	}
};
