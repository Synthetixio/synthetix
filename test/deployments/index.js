'use strict';

const Web3 = require('web3');
const { toWei, isAddress } = require('web3-utils');
const assert = require('assert');

require('dotenv').config();
const { loadConnections } = require('../../publish/src/util');

const {
	toBytes32,
	getStakingRewards,
	getSynths,
	getTarget,
	getSource,
	networks,
} = require('../..');

describe('deployments', () => {
	networks
		.filter(n => n !== 'local')
		.forEach(network => {
			describe(network, () => {
				// we need this outside the test runner in order to generate tests per contract name
				const targets = getTarget({ network });
				const stakingRewards = getStakingRewards({ network });

				let sources;

				let web3;
				let contracts;

				const getContract = ({ source, target }) =>
					new web3.eth.Contract(sources[source || target].abi, targets[target].address);

				beforeEach(() => {
					// reset this each test to prevent it getting overwritten
					sources = getSource({ network });
					web3 = new Web3();

					const connections = loadConnections({
						network,
					});

					web3 = new Web3(new Web3.providers.HttpProvider(connections.providerUrl));

					contracts = {
						Synthetix: getContract({ source: 'Synthetix', target: 'ProxyERC20' }),
						ExchangeRates: getContract({ target: 'ExchangeRates' }),
					};
				});

				describe('rewards.json', () => {
					for (const { name, stakingToken, rewardsToken } of stakingRewards) {
						describe(name, () => {
							it(`${name} has valid staking and reward tokens`, async () => {
								const stakingRewardsName = `StakingRewards${name}`;
								const stakingRewardsTarget = targets[stakingRewardsName];
								const stakingRewardsContract = getContract({
									source: stakingRewardsTarget.source,
									target: stakingRewardsName,
								});

								const methodMappings = {
									iETHRewards: {
										stakingTokenMethod: 'token',
										rewardsTokenMethod: 'snx',
									},
									Unipool: {
										stakingTokenMethod: 'uni',
										rewardsTokenMethod: 'snx',
									},
									CurveRewards: {
										stakingTokenMethod: 'uni',
										rewardsTokenMethod: 'snx',
									},
								};

								let stakingTokenMethod = 'stakingToken';
								let rewardsTokenMethod = 'rewardsToken';

								// Legacy contracts have a different method name
								// to get staking tokens and rewards token
								if (stakingRewardsTarget.source !== 'StakingRewards') {
									({ stakingTokenMethod, rewardsTokenMethod } = methodMappings[
										stakingRewardsTarget.source
									]);
								}

								const stakingTokenAddress = await stakingRewardsContract.methods[
									stakingTokenMethod
								]().call();
								const rewardTokenAddress = await stakingRewardsContract.methods[
									rewardsTokenMethod
								]().call();

								const tokens = [
									{ token: stakingToken, tokenAddress: stakingTokenAddress },
									{ token: rewardsToken, tokenAddress: rewardTokenAddress },
								];

								// Make sure the token address / names matches up
								for (const { token, tokenAddress } of tokens) {
									// If its an address then just compare the target address
									// and the origin address
									if (isAddress(token)) {
										assert.strictEqual(token.toLowerCase(), tokenAddress.toLowerCase());
									}

									// If its not an address then the token will be a name
									// try and compare the name
									else if (!isAddress(token)) {
										const tokenContract = new web3.eth.Contract(
											sources['ProxyERC20'].abi,
											tokenAddress
										);
										const tokenName = await tokenContract.methods.name().call();

										if (token === 'Synthetix') {
											assert.strictEqual(tokenName, 'Synthetix Network Token');
										} else if (token.includes('Proxy')) {
											const synthType = token.slice(5);
											assert.strictEqual(tokenName, `Synth ${synthType}`);
										} else {
											assert.strictEqual(token, tokenName);
										}
									}
								}
							});
						});
					}
				});

				describe('synths.json', () => {
					const synths = getSynths({ network });

					it(`The number of available synths in Synthetix matches the number of synths in the JSON file: ${synths.length}`, async () => {
						const availableSynths = await contracts.Synthetix.methods
							.availableCurrencyKeys()
							.call();
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
					['AddressResolver', 'ReadProxyAddressResolver'].forEach(target => {
						describe(`${target} has correct addresses`, () => {
							let resolver;
							beforeEach(() => {
								resolver = getContract({
									source: 'AddressResolver',
									target,
								});
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
								'SystemStatus',
							].forEach(name => {
								it(`has correct address for ${name}`, async () => {
									const actual = await resolver.methods.getAddress(toBytes32(name)).call();
									assert.strictEqual(actual, targets[name].address);
								});
							});
						});
					});
				});
			});
		});
});
