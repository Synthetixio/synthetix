'use strict';

const Web3 = require('web3');
const axios = require('axios');

const { loadConnections } = require('./util');
const { toBytes32 } = require('../../.');

module.exports = async ({ network, providerUrl, synths, oldExrates }) => {
	const output = [];
	const { etherscanUrl } = loadConnections({ network });

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

	let abi;

	for (const synth of synths) {
		if (synth.aggregator) {
			if (!web3.utils.isAddress(synth.aggregator)) {
				throw Error(
					`Invalid aggregator address for ${synth.name}: ${synth.aggregator}. (If mixed case, make sure it is valid checksum)`
				);
			}

			if (!abi) {
				// Get the ABI from the first aggregator on Etherscan
				// Note: assumes all use the same ABI
				const {
					data: { result },
				} = await axios.get(etherscanUrl, {
					params: {
						module: 'contract',
						action: 'getabi',
						address: synth.aggregator,
						apikey: process.env.ETHERSCAN_KEY,
					},
				});
				abi = JSON.parse(result);
			}

			const liveAggregator = new web3.eth.Contract(abi, synth.aggregator);

			const [aggAnswerRaw, exRatesAnswerRaw] = await Promise.all([
				liveAggregator.methods.latestAnswer().call(),
				oldExrates.methods.rateForCurrency(toBytes32(synth.name)).call(),
			]);

			const answer = (aggAnswerRaw / 1e8).toString();

			const existing = web3.utils.fromWei(exRatesAnswerRaw);

			if (answer === existing) {
				output.push(
					`- Synth ${synth.name} aggregated price: ${answer} (same as currently on-chain)`
				);
			} else {
				output.push(
					`- Synth ${synth.name} aggregated price: ${answer} vs ${existing} (${(
						(Math.abs(answer - existing) / answer) *
						100
					).toFixed(2)} %)`
				);
			}
		}
	}

	return output;
};
