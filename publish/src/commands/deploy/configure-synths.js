'use strict';

const { gray } = require('chalk');
const {
	utils: { isAddress },
} = require('ethers');
const { toBytes32 } = require('../../../..');

module.exports = async ({ addressOf, synths, feeds, deployer, runStep }) => {
	// now configure synths
	console.log(gray(`\n------ CONFIGURE SYNTHS ------\n`));

	const { ExchangeRates } = deployer.deployedContracts;

	for (const { name: currencyKey, asset } of synths) {
		console.log(gray(`\n   --- SYNTH ${currencyKey} ---\n`));

		const currencyKeyInBytes = toBytes32(currencyKey);

		const synth = deployer.deployedContracts[`Synth${currencyKey}`];
		const tokenStateForSynth = deployer.deployedContracts[`TokenState${currencyKey}`];
		const proxyForSynth = deployer.deployedContracts[`Proxy${currencyKey}`];
		const proxyERC20ForSynth =
			currencyKey === 'sUSD' ? deployer.deployedContracts[`ProxyERC20sUSD`] : undefined;

		if (tokenStateForSynth && synth) {
			await runStep({
				contract: `TokenState${currencyKey}`,
				target: tokenStateForSynth,
				read: 'associatedContract',
				expected: input => input === addressOf(synth),
				write: 'setAssociatedContract',
				writeArg: addressOf(synth),
				comment: `Ensure the ${currencyKey} synth can write to its TokenState`,
			});
		}

		// Setup proxy for synth
		if (proxyForSynth && synth) {
			await runStep({
				contract: `Proxy${currencyKey}`,
				target: proxyForSynth,
				read: 'target',
				expected: input => input === addressOf(synth),
				write: 'setTarget',
				writeArg: addressOf(synth),
				comment: `Ensure the ${currencyKey} synth Proxy is correctly connected to the Synth`,
			});

			// Migration Phrase 2: if there's a ProxyERC20sUSD then the Synth's proxy must use it
			await runStep({
				contract: `Synth${currencyKey}`,
				target: synth,
				read: 'proxy',
				expected: input => input === addressOf(proxyERC20ForSynth || proxyForSynth),
				write: 'setProxy',
				writeArg: addressOf(proxyERC20ForSynth || proxyForSynth),
				comment: `Ensure the ${currencyKey} synth is connected to its Proxy`,
			});

			if (proxyERC20ForSynth) {
				// and make sure this new proxy has the target of the synth
				await runStep({
					contract: `ProxyERC20sUSD`,
					target: proxyERC20ForSynth,
					read: 'target',
					expected: input => input === addressOf(synth),
					write: 'setTarget',
					writeArg: addressOf(synth),
					comment: 'Ensure the special ERC20 proxy for sUSD has its target set to the Synth',
				});
			}
		}

		const { feed } = feeds[asset] || {};

		// now setup price aggregator if any for the synth
		if (isAddress(feed) && ExchangeRates) {
			await runStep({
				contract: `ExchangeRates`,
				target: ExchangeRates,
				read: 'aggregators',
				readArg: currencyKeyInBytes,
				expected: input => input === feed,
				write: 'addAggregator',
				writeArg: [currencyKeyInBytes, feed],
				comment: `Ensure the ExchangeRates contract has the feed for ${currencyKey}`,
			});
		}
	}
};
