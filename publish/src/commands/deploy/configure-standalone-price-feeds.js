'use strict';

const { gray } = require('chalk');
const {
	utils: { isAddress },
} = require('ethers');
const { toBytes32 } = require('../../../..');

module.exports = async ({ deployer, runStep, standaloneFeeds }) => {
	console.log(gray(`\n------ CONFIGURE STANDLONE FEEDS ------\n`));

	// Setup remaining price feeds (that aren't synths)
	const { ExchangeRates } = deployer.deployedContracts;

	for (const { asset, standaloneFor, feed } of standaloneFeeds) {
		// When standalone present, use this as the key not the asset
		// This is for SCCP-139 and the Thales markets which rely on
		// synth keys existing in future ExchangeRates contracts
		// even though the synths have been deprecated.
		// The 8 feeds from SCCP-139 can be removed after Dec 31, 2021.
		const key = standaloneFor || asset;
		if (isAddress(feed) && ExchangeRates) {
			await runStep({
				contract: `ExchangeRates`,
				target: ExchangeRates,
				read: 'aggregators',
				readArg: toBytes32(key),
				expected: input => input === feed,
				write: 'addAggregator',
				writeArg: [toBytes32(key), feed],
				comment: `Ensure the ExchangeRates contract has the feed for ${key}`,
			});
		}
	}
};
