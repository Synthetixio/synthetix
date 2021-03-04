'use strict';

const fs = require('fs');
const Web3 = require('web3');
const axios = require('axios');
const { gray, yellow, red, cyan } = require('chalk');

const { loadConnections } = require('./util');
const { toBytes32 } = require('../../.');

module.exports = async ({ network, useOvm, providerUrl, synths, oldExrates, standaloneFeeds }) => {
	const output = [];
	const { etherscanUrl } = loadConnections({ network });

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

	const feeds = standaloneFeeds.concat(synths);

	let abi;

	for (const { name, asset, feed, inverted } of feeds) {
		const currencyKey = name || asset; // either name of synth or asset for standalone
		if (feed) {
			if (!web3.utils.isAddress(feed)) {
				throw Error(
					`Invalid aggregator address for ${currencyKey}: ${feed}. (If mixed case, make sure it is valid checksum)`
				);
			}

			if (!abi) {
				if (useOvm) {
					abi = JSON.parse(
						fs.readFileSync(
							'node_modules/@chainlink/contracts-0.0.10/abi/v0.5/AggregatorV2V3Interface.json',
							'utf8'
						)
					).compilerOutput.abi;
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

			const liveAggregator = new web3.eth.Contract(abi, feed);

			const [
				aggAnswerRaw,
				exRatesAnswerRaw,
				{ frozenAtUpperLimit, frozenAtLowerLimit },
			] = await Promise.all([
				liveAggregator.methods.latestAnswer().call(),
				oldExrates.methods.rateForCurrency(toBytes32(currencyKey)).call(),
				oldExrates.methods.inversePricing(toBytes32(currencyKey)).call(),
			]);

			let answer = (aggAnswerRaw / 1e8).toString();

			// do a quick calculation of he inverted number
			if (inverted) {
				answer = 2 * inverted.entryPoint - answer;
				answer = frozenAtLowerLimit ? inverted.lowerLimit : Math.max(answer, inverted.lowerLimit);
				answer = frozenAtUpperLimit ? inverted.upperLimit : Math.min(answer, inverted.upperLimit);
			}

			const existing = web3.utils.fromWei(exRatesAnswerRaw);

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
