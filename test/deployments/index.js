'use strict';

const Web3 = require('web3');
const { toWei } = require('web3-utils');
const assert = require('assert');
const axios = require('axios');

require('dotenv').config();
const { loadConnections, stringify } = require('../../publish/src/util');

const { toBytes32, getSynths, getTarget, getSource } = require('../..');

const sleep = ms => new Promise((resolve, reject) => setTimeout(resolve, ms));

describe('deployments', () => {
	['kovan', 'rinkeby', 'ropsten', 'mainnet'].forEach(network => {
		describe(network, () => {
			// we need this outside the test runner in order to generate tests per contract name
			const targets = getTarget({ network });
			let sources;

			let web3;
			let contracts;
			let etherscanUrl;

			const getContract = ({ source, target }) =>
				new web3.eth.Contract(sources[source || target].abi, targets[target].address);

			beforeEach(() => {
				// reset this each test to prevent it getting overwritten
				sources = getSource({ network });
				web3 = new Web3();

				const connections = loadConnections({
					network,
				});
				etherscanUrl = connections.etherscanUrl;

				web3 = new Web3(new Web3.providers.HttpProvider(connections.providerUrl));

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
			describe('deployment.json', () => {
				describe('AddressResolver has correct addresses', () => {
					let resolver;
					beforeEach(() => {
						resolver = getContract({ target: 'AddressResolver' });
					});

					// Note: instead of manually managing this list, it would be better to read this
					// on-chain for each environment when a contract had the MixinResolver function
					// `getResolverAddressesRequired()` and compile and check these. The problem is then
					// that would omit the deps from Depot and EtherCollateral which were not
					// redeployed in Hadar (v2.21)
					[
						'DelegateApprovals',
						'Depot',
						'EtherCollateral',
						'Exchanger',
						'ExchangeRates',
						'ExchangeState',
						'FeePool',
						'FeePoolEternalStorage',
						'FeePoolState',
						'Issuer',
						'RewardEscrow',
						'RewardsDistribution',
						'SupplySchedule',
						'Synthetix',
						'SynthetixEscrow',
						'SynthetixState',
						'SynthsUSD',
						'SynthsETH',
					].forEach(name => {
						it(`has correct address for ${name}`, async () => {
							const actual = await resolver.methods.getAddress(toBytes32(name)).call();
							assert.strictEqual(actual, targets[name].address);
						});
					});
				});
				Object.values(targets).forEach(({ name, source, address }) => {
					describe(`${name}`, () => {
						it('Etherscan has the correct ABI', async () => {
							const response = await axios.get(etherscanUrl, {
								params: {
									module: 'contract',
									action: 'getabi',
									address,
									apikey: process.env.ETHERSCAN_KEY,
								},
							});
							let result;
							try {
								result = JSON.parse(response.data.result);
							} catch (err) {
								console.log('Error Etherscan returned the following:', response.data.result);
								throw err;
							}

							const sortByName = (a, b) =>
								(a.name || 'constructor') > (b.name || 'constructor') ? 1 : -1;

							const removeSignaturesAndVariableNames = entry => {
								delete entry.signature;
								// Some contracts, such as ProxyERC20 were deployed with different function
								// input names than currently in the code, so reomve these from the check
								// specifically balanceOf(address owner) was changed to balanceOf(address account)
								(entry.inputs || []).forEach(input => {
									input.name = '';
								});

								// Special edge-case: TokenStateSynthetix on mainnet has older
								// method name "nominateOwner" over "nominateNewOwner"
								if (
									network === 'mainnet' &&
									name === 'TokenStateSynthetix' &&
									entry.name === 'nominateOwner'
								) {
									entry.name = 'nominateNewOwner';
								}
								return entry;
							};

							const actual = stringify(
								result.sort(sortByName).map(removeSignaturesAndVariableNames)
							);
							const expected = stringify(
								sources[source].abi.sort(sortByName).map(removeSignaturesAndVariableNames)
							);

							assert.strictEqual(actual, expected);

							// wait 1.5s in order to prevent Etherscan rate limits (use 1.5s as parallel tests in CI
							// can trigger the limit)
							await sleep(1500);
						});

						it('ABI signature is correct', () => {
							const { abi } = sources[source];

							const { encodeFunctionSignature, encodeEventSignature } = web3.eth.abi;

							for (const { type, inputs, name, signature } of abi) {
								if (type === 'function') {
									assert.strictEqual(
										encodeFunctionSignature({ name, inputs }),
										signature,
										`${source}.${name} signature mismatch`
									);
								} else if (type === 'event') {
									assert.strictEqual(
										encodeEventSignature({ name, inputs }),
										signature,
										`${source}.${name} signature mismatch`
									);
								}
							}
						});
					});
				});
			});
		});
	});
});
