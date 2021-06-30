'use strict';

const { gray } = require('chalk');
const {
	utils: { isAddress },
} = require('ethers');
const { toBytes32 } = require('../../../..');

module.exports = async ({ deployer, runStep, standaloneFeeds, useOvm }) => {
	console.log(gray(`\n------ CONFIGURE STANDLONE FEEDS ------\n`));

	// Setup remaining price feeds (that aren't synths)
	const { ExchangeRates } = deployer.deployedContracts;

	for (const { asset, feed } of standaloneFeeds) {
		if (isAddress(feed) && ExchangeRates) {
			await runStep({
				contract: `ExchangeRates`,
				target: ExchangeRates,
				read: 'aggregators',
				readArg: toBytes32(asset),
				expected: input => input === feed,
				write: 'addAggregator',
				writeArg: [toBytes32(asset), feed],
				comment: `Ensure the ExchangeRates contract has the feed for ${asset}`,
			});
		}
	}

	if (!useOvm && ExchangeRates) {
		/*
			TODO: set up DEX TWAP oracle for exchange rates
			await runStep({
				contract: `ExchangeRates`,
				target: ExchangeRates,
				read: 'dexTwapAggregator',
				expected: input => input === dexTwapAggregator,
				write: 'setDexTwapAggregator',
				writeArg: [dexTwapAggregator],
			});
			*/
	}
};
