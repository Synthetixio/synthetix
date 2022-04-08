'use strict';

const ethers = require('ethers');
const axios = require('axios');
const { gray, yellow, red, cyan } = require('chalk');

const { loadConnections } = require('../../util');
const { toBytes32 } = require('../../../..');

module.exports = async ({ network, useOvm, providerUrl, synths, oldExrates, feeds }) => {
	const output = [];
	const { etherscanUrl } = loadConnections({ network });

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	const allFeeds = Object.values(feeds).concat(synths);

	let abi;

	for (const { name, asset, feed } of allFeeds) {
		const currencyKey = name || asset; // either name of synth or asset for standalone
		if (feed) {
			if (!ethers.utils.isAddress(feed)) {
				throw Error(
					`Invalid aggregator address for ${currencyKey}: ${feed}. (If mixed case, make sure it is valid checksum)`
				);
			}

			if (!abi) {
				if (useOvm) {
					abi = require('@chainlink/contracts-0.0.10/abi/v0.5/AggregatorV2V3Interface.json')
						.compilerOutput.abi;
				} else {
					// Get the ABI from the first aggregator on Etherscan
					// Note: assumes all use the same ABI
					const {
						data: { result },
					} = await axios.get(etherscanUrl, {
						params: {
							module: 'contract',
							action: 'getabi',
							address: feed,
							apikey: process.env.ETHERSCAN_KEY,
						},
					});
					abi = JSON.parse(result);
				}
			}

			const liveAggregator = new ethers.Contract(feed, abi, provider);

			const [aggAnswerRaw, exRatesAnswerRaw] = await Promise.all([
				liveAggregator.latestAnswer(),
				oldExrates.rateForCurrency(toBytes32(currencyKey)),
			]);

			const answer = (aggAnswerRaw / 1e8).toString();

			const existing = ethers.utils.formatUnits(exRatesAnswerRaw);

			if (answer === existing) {
				output.push(
					gray(
						`- ${
							name ? 'Synth ' : ''
						}${currencyKey} aggregated price: ${answer} (same as currently on-chain)`
					)
				);
			} else {
				const diff = ((Math.abs(answer - existing) / answer) * 100).toFixed(2);

				const colorize = diff > 5 ? red : diff > 1 ? yellow : cyan;
				output.push(
					colorize(
						`- ${
							name ? 'Synth ' : ''
						}${currencyKey} aggregated price: ${answer} vs ${existing} (${diff} %)`
					)
				);
			}
		}
	}

	return output;
};
