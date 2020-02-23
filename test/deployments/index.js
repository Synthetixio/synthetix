'use strict';

const Web3 = require('web3');
const { toWei } = require('web3-utils');
const assert = require('assert');

require('dotenv').config();
const { loadConnections } = require('../../publish/src/util');

const { toBytes32, getSynths, getTarget, getSource } = require('../..');

describe('deployments', () => {
	['kovan', 'rinkeby', 'ropsten', 'mainnet'].forEach(network => {
		describe(network, () => {
			const targets = getTarget({ network });
			const sources = getSource({ network });

			let web3;
			let contracts;

			const getContract = ({ source, target }) =>
				new web3.eth.Contract(sources[source || target].abi, targets[target].address);

			beforeEach(() => {
				this.timeout = 5e3; // 5s timeout

				web3 = new Web3();

				const { providerUrl } = loadConnections({
					network,
				});

				web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));
				contracts = {
					Synthetix: getContract({ source: 'Synthetix', target: 'ProxySynthetix' }),
					ExchangeRates: getContract({ target: 'ExchangeRates' }),
				};
			});

			describe('synths.json', () => {
				const synths = getSynths({ network });

				it(`The number of available synths in Synthetix matches the number of synths in the JSON file: ${synths.length}`, async () => {
					const availableSynths = await contracts.Synthetix.methods.availableCurrencyKeys().call();
					assert.strictEqual(availableSynths.length, synths.length);
				});
				synths.forEach(({ name, inverted, aggregator, index }) => {
					describe(name, () => {
						it('Synthetix has the synth added', async () => {
							const foundSynth = await contracts.Synthetix.methods.synths(toBytes32(name)).call();
							assert.strictEqual(foundSynth, targets[`Synth${name}`].address);
						});
						if (inverted) {
							it('ensure only inverted synths have i prefix', () => {
								assert.strictEqual(name[0], 'i');
							});
							it(`checking inverted params of ${name}`, async () => {
								// check inverted status
								const {
									entryPoint,
									upperLimit,
									lowerLimit,
								} = await contracts.ExchangeRates.methods.inversePricing(toBytes32(name)).call();
								assert.strictEqual(entryPoint, toWei(inverted.entryPoint.toString()));
								assert.strictEqual(upperLimit, toWei(inverted.upperLimit.toString()));
								assert.strictEqual(lowerLimit, toWei(inverted.lowerLimit.toString()));
							});
						} else {
							it('ensure non inverted synths have s prefix', () => {
								assert.strictEqual(name[0], 's');
							});
						}
						if (aggregator) {
							it(`checking aggregator of ${name}`, async () => {
								const aggregatorActual = await contracts.ExchangeRates.methods
									.aggregators(toBytes32(name))
									.call();
								assert.strictEqual(aggregatorActual, aggregator);
							});
						}
						if (index && Array.isArray(index)) {
							it(`the index parameter of ${name} is a well formed array with correct entries of type`, () => {
								for (const ix of index) {
									assert.strictEqual(typeof ix.symbol, 'string');
									assert.strictEqual(typeof ix.name, 'string');
									assert.strictEqual(typeof ix.units, 'number');
								}
							});
						} else if (index) {
							it('the index type is valid', () => {
								assert.fail('Unknown "index" type:', typeof index);
							});
						}
					});
				});
			});
			// describe('deployment.json', () => {
			// 	let sources;
			// 	let targets;
			// 	beforeEach(() => {
			// 		sources = getSource({ network });
			// 		targets = getTarget({ network });
			// 	});
			// 	describe('Etherscan verification', () => {});
			// });
		});
	});
});
