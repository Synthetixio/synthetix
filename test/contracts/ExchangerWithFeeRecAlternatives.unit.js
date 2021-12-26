'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert } = require('./common');

const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	getEventByName,
	buildMinimalProxyCode,
} = require('./helpers');

const { divideDecimal, multiplyDecimal, toUnit } = require('../utils')();

const { getUsers, toBytes32 } = require('../..');

const { toBN } = web3.utils;

let ExchangerWithFeeRecAlternatives;

contract('ExchangerWithFeeRecAlternatives (unit tests)', async accounts => {
	const [, owner] = accounts;
	const [sUSD, sETH, sBTC, iETH] = ['sUSD', 'sETH', 'sBTC', 'iETH'].map(toBytes32);
	const maxAtomicValuePerBlock = toUnit('1000000');
	const baseFeeRate = toUnit('0.003'); // 30bps
	const overrideFeeRate = toUnit('0.01'); // 100bps
	const amountIn = toUnit('100');

	// ensure all of the behaviors are bound to "this" for sharing test state
	const behaviors = require('./ExchangerWithFeeRecAlternatives.behaviors').call(this, {
		accounts,
	});

	const callAsSynthetix = args => [...args, { from: this.mocks.Synthetix.address }];

	before(async () => {
		ExchangerWithFeeRecAlternatives = artifacts.require('ExchangerWithFeeRecAlternatives');
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: ExchangerWithFeeRecAlternatives.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'exchange',
				'exchangeAtomically',
				'resetLastExchangeRate',
				'settle',
				'suspendSynthWithInvalidRate',
			],
		});
	});

	describe('when a contract is instantiated', () => {
		behaviors.whenInstantiated({ owner }, () => {
			describe('atomicMaxVolumePerBlock()', () => {
				// Mimic setting not being configured
				behaviors.whenMockedWithUintSystemSetting(
					{ setting: 'atomicMaxVolumePerBlock', value: '0' },
					() => {
						it('is set to 0', async () => {
							assert.bnEqual(await this.instance.atomicMaxVolumePerBlock(), '0');
						});
					}
				);

				// With configured value
				behaviors.whenMockedWithUintSystemSetting(
					{ setting: 'atomicMaxVolumePerBlock', value: maxAtomicValuePerBlock },
					() => {
						it('is set to the configured value', async () => {
							assert.bnEqual(await this.instance.atomicMaxVolumePerBlock(), maxAtomicValuePerBlock);
						});
					}
				);
			});

			behaviors.whenMockedWithUintSystemSetting(
				{ setting: 'exchangeMaxDynamicFee', value: toUnit('1') },
				() => {
					describe('feeRateForAtomicExchange()', () => {
						// Mimic settings not being configured
						behaviors.whenMockedWithSynthUintSystemSetting(
							{ setting: 'exchangeFeeRate', synth: sETH, value: '0' },
							() => {
								it('is set to 0', async () => {
									assert.bnEqual(await this.instance.feeRateForAtomicExchange(sUSD, sETH), '0');
								});
							}
						);

						// With configured override value
						behaviors.whenMockedWithSynthUintSystemSetting(
							{ setting: 'atomicExchangeFeeRate', synth: sETH, value: overrideFeeRate },
							() => {
								it('is set to the configured atomic override value', async () => {
									assert.bnEqual(
										await this.instance.feeRateForAtomicExchange(sUSD, sETH),
										overrideFeeRate
									);
								});
							}
						);

						// With configured base and override values
						behaviors.whenMockedWithSynthUintSystemSetting(
							{ setting: 'exchangeFeeRate', synth: sETH, value: baseFeeRate },
							() => {
								it('is set to the configured base value', async () => {
									assert.bnEqual(
										await this.instance.feeRateForAtomicExchange(sUSD, sETH),
										baseFeeRate
									);
								});

								behaviors.whenMockedWithSynthUintSystemSetting(
									{ setting: 'atomicExchangeFeeRate', synth: sETH, value: overrideFeeRate },
									() => {
										it('is set to the configured atomic override value', async () => {
											assert.bnEqual(
												await this.instance.feeRateForAtomicExchange(sUSD, sETH),
												overrideFeeRate
											);
										});
									}
								);
							}
						);
					});
				}
			);

			describe('getAmountsForAtomicExchange()', () => {
				const atomicRate = toUnit('0.01');

				async function assertAmountsReported({ instance, amountIn, atomicRate, feeRate }) {
					const {
						amountReceived,
						fee,
						exchangeFeeRate,
					} = await instance.getAmountsForAtomicExchange(amountIn, sUSD, sETH);
					const expectedAmountReceivedWithoutFees = multiplyDecimal(amountIn, atomicRate);

					assert.bnEqual(amountReceived, expectedAmountReceivedWithoutFees.sub(fee));
					assert.bnEqual(exchangeFeeRate, feeRate);
					assert.bnEqual(multiplyDecimal(amountReceived.add(fee), exchangeFeeRate), fee);
				}

				behaviors.whenMockedEffectiveAtomicRateWithValue(
					{
						atomicRate,
						sourceCurrency: sUSD,
						// These system rates need to be supplied but are ignored in calculating the amount recieved
						systemSourceRate: toUnit('1'),
						systemDestinationRate: toUnit('1'),
					},
					() => {
						// No fees
						behaviors.whenMockedWithSynthUintSystemSetting(
							{ setting: 'exchangeFeeRate', synth: sETH, value: '0' },
							() => {
								it('gives exact amounts when no fees are configured', async () => {
									await assertAmountsReported({
										amountIn,
										atomicRate,
										feeRate: '0',
										instance: this.instance,
									});
								});
							}
						);

						// With fees
						behaviors.whenMockedWithSynthUintSystemSetting(
							{ setting: 'exchangeFeeRate', synth: sETH, value: baseFeeRate },
							() => {
								it('gives amounts with base fee', async () => {
									await assertAmountsReported({
										amountIn,
										atomicRate,
										feeRate: baseFeeRate,
										instance: this.instance,
									});
								});

								behaviors.whenMockedWithSynthUintSystemSetting(
									{ setting: 'atomicExchangeFeeRate', synth: sETH, value: overrideFeeRate },
									() => {
										it('gives amounts with atomic override fee', async () => {
											await assertAmountsReported({
												amountIn,
												atomicRate,
												feeRate: overrideFeeRate,
												instance: this.instance,
											});
										});
									}
								);
							}
						);

						behaviors.whenMockedWithSynthUintSystemSetting(
							{ setting: 'atomicExchangeFeeRate', synth: sETH, value: overrideFeeRate },
							() => {
								it('gives amounts with atomic override fee', async () => {
									await assertAmountsReported({
										amountIn,
										atomicRate,
										feeRate: overrideFeeRate,
										instance: this.instance,
									});
								});
							}
						);
					}
				);
			});

			describe('exchanging', () => {
				describe('exchange with virtual synths', () => {
					const sourceCurrency = sUSD;
					const destinationCurrency = sETH;

					const getExchangeArgs = ({
						from = owner,
						sourceCurrencyKey = sourceCurrency,
						sourceAmount = amountIn,
						destinationCurrencyKey = destinationCurrency,
						destinationAddress = owner,
						trackingCode = toBytes32(),
						asSynthetix = true,
					} = {}) => {
						const args = [
							from, // exchangeForAddress
							from, // from
							sourceCurrencyKey,
							sourceAmount,
							destinationCurrencyKey,
							destinationAddress,
							true, // virtualSynth
							from, // rewardAddress
							trackingCode,
						];

						return asSynthetix ? callAsSynthetix(args) : args;
					};

					describe('failure modes', () => {
						behaviors.whenMockedWithExchangeRatesValidityAtRound({ valid: false }, () => {
							it('reverts when either rate is invalid', async () => {
								await assert.revert(
									this.instance.exchange(...getExchangeArgs()),
									'Src/dest rate invalid or not found'
								);
							});
						});

						behaviors.whenMockedWithExchangeRatesValidity({ valid: true }, () => {
							behaviors.whenMockedWithNoPriorExchangesToSettle(() => {
								behaviors.whenMockedWithUintSystemSetting(
									{ setting: 'waitingPeriodSecs', value: '0' },
									() => {
										behaviors.whenMockedEffectiveRateAsEqualAtRound(() => {
											behaviors.whenMockedLastNRates(() => {
												behaviors.whenMockedASingleSynthToIssueAndBurn(() => {
													behaviors.whenMockedExchangeStatePersistance(() => {
														it('it reverts trying to create a virtual synth with no supply', async () => {
															await assert.revert(
																this.instance.exchange(...getExchangeArgs({ sourceAmount: '0' })),
																'Zero amount'
															);
														});
														it('it reverts trying to virtualize into an inverse synth', async () => {
															await assert.revert(
																this.instance.exchange(
																	...getExchangeArgs({
																		sourceCurrencyKey: sUSD,
																		destinationCurrencyKey: iETH,
																	})
																),
																'Cannot virtualize this synth'
															);
														});
													});
												});
											});
										});
									}
								);
							});
						});
					});

					behaviors.whenMockedWithExchangeRatesValidity({ valid: true }, () => {
						behaviors.whenMockedWithNoPriorExchangesToSettle(() => {
							behaviors.whenMockedWithUintSystemSetting(
								{ setting: 'waitingPeriodSecs', value: '0' },
								() => {
									behaviors.whenMockedEffectiveRateAsEqualAtRound(() => {
										behaviors.whenMockedLastNRates(() => {
											behaviors.whenMockedASingleSynthToIssueAndBurn(() => {
												behaviors.whenMockedExchangeStatePersistance(() => {
													describe('when invoked', () => {
														let txn;
														beforeEach(async () => {
															txn = await this.instance.exchange(...getExchangeArgs());
														});
														it('emits a VirtualSynthCreated event with the correct underlying synth and amount', async () => {
															assert.eventEqual(txn, 'VirtualSynthCreated', {
																synth: this.mocks.synth.smocked.proxy.will.returnValue,
																currencyKey: sETH,
																amount: amountIn,
																recipient: owner,
															});
														});
														describe('when interrogating the Virtual Synths', () => {
															let vSynth;
															beforeEach(async () => {
																const VirtualSynth = artifacts.require('VirtualSynth');
																vSynth = await VirtualSynth.at(
																	getEventByName({ tx: txn, name: 'VirtualSynthCreated' }).args
																		.vSynth
																);
															});
															it('the vSynth has the correct synth', async () => {
																assert.equal(
																	await vSynth.synth(),
																	this.mocks.synth.smocked.proxy.will.returnValue
																);
															});
															it('the vSynth has the correct resolver', async () => {
																assert.equal(await vSynth.resolver(), this.resolver.address);
															});
															it('the vSynth has minted the correct amount to the user', async () => {
																assert.bnEqual(await vSynth.totalSupply(), amountIn);
																assert.bnEqual(await vSynth.balanceOf(owner), amountIn);
															});
															it('and the synth has been issued to the vSynth', async () => {
																assert.equal(
																	this.mocks.synth.smocked.issue.calls[0][0],
																	vSynth.address
																);
																assert.bnEqual(
																	this.mocks.synth.smocked.issue.calls[0][1],
																	amountIn
																);
															});
															it('the vSynth is an ERC-1167 minimal proxy instead of a full Virtual Synth', async () => {
																const vSynthCode = await web3.eth.getCode(vSynth.address);
																assert.equal(
																	vSynthCode,
																	buildMinimalProxyCode(this.mocks.VirtualSynthMastercopy.address)
																);
															});
														});
													});
												});
											});
										});
									});
								}
							);
						});
					});
				});

				describe('exchange atomically', () => {
					const sourceCurrency = sUSD;
					const destinationCurrency = sETH;

					const getExchangeArgs = ({
						from = owner,
						sourceCurrencyKey = sourceCurrency,
						sourceAmount = amountIn,
						destinationCurrencyKey = destinationCurrency,
						destinationAddress = owner,
						trackingCode = toBytes32(),
						asSynthetix = true,
					} = {}) => {
						const args = [
							from,
							sourceCurrencyKey,
							sourceAmount,
							destinationCurrencyKey,
							destinationAddress,
							trackingCode,
						];

						return asSynthetix ? callAsSynthetix(args) : args;
					};

					describe('when called by unauthorized', async () => {
						behaviors.whenMockedToAllowExchangeInvocationChecks(() => {
							it('it reverts when called by regular accounts', async () => {
								await onlyGivenAddressCanInvoke({
									fnc: this.instance.exchangeAtomically,
									args: getExchangeArgs({ asSynthetix: false }),
									accounts: accounts.filter(a => a !== this.mocks.Synthetix.address),
									reason: 'Exchanger: Only synthetix or a synth contract can perform this action',
									// address: this.mocks.Synthetix.address (doesnt work as this reverts due to lack of mocking setup)
								});
							});
						});
					});

					describe('when not exchangeable', () => {
						it('reverts when src and dest are the same', async () => {
							const args = getExchangeArgs({
								sourceCurrencyKey: sUSD,
								destinationCurrencyKey: sUSD,
							});
							await assert.revert(this.instance.exchangeAtomically(...args), "Can't be same synth");
						});

						it('reverts when input amount is zero', async () => {
							const args = getExchangeArgs({ sourceAmount: '0' });
							await assert.revert(this.instance.exchangeAtomically(...args), 'Zero amount');
						});

						// Invalid system rates
						behaviors.whenMockedWithExchangeRatesValidity({ valid: false }, () => {
							it('reverts when either rate is invalid', async () => {
								await assert.revert(
									this.instance.exchangeAtomically(...getExchangeArgs()),
									'Src/dest rate invalid or not found'
								);
							});
						});

						behaviors.whenMockedWithExchangeRatesValidity({ valid: true }, () => {
							behaviors.whenMockedWithNoPriorExchangesToSettle(() => {
								const lastRate = toUnit('1');
								behaviors.whenMockedEntireExchangeRateConfiguration(
									{
										sourceCurrency,
										atomicRate: lastRate,
										systemSourceRate: lastRate,
										systemDestinationRate: lastRate,
										deviationFactor: toUnit('10'), // 10x
										lastExchangeRates: [
											[sUSD, lastRate],
											[sETH, lastRate],
											[sBTC, lastRate],
										],
										owner,
									},
									() => {
										behaviors.whenMockedWithVolatileSynth({ synth: sETH, volatile: true }, () => {
											describe('when synth pricing is deemed volatile', () => {
												it('reverts due to volatility', async () => {
													const args = getExchangeArgs({
														sourceCurrencyKey: sUSD,
														destinationCurrencyKey: sETH,
													});
													await assert.revert(
														this.instance.exchangeAtomically(...args),
														'Src/dest synth too volatile'
													);
												});
											});
										});

										describe('when sUSD is not in src/dest pair', () => {
											it('reverts requiring src/dest to be sUSD', async () => {
												const args = getExchangeArgs({
													sourceCurrencyKey: sBTC,
													destinationCurrencyKey: sETH,
												});
												await assert.revert(
													this.instance.exchangeAtomically(...args),
													'Src/dest synth must be sUSD'
												);
											});
										});

										describe('when max volume limit (0) is surpassed', () => {
											it('reverts due to surpassed volume limit', async () => {
												const args = getExchangeArgs({ sourceAmount: toUnit('1') });
												await assert.revert(
													this.instance.exchangeAtomically(...args),
													'Surpassed volume limit'
												);
											});
										});

										behaviors.whenMockedWithUintSystemSetting(
											{ setting: 'atomicMaxVolumePerBlock', value: maxAtomicValuePerBlock },
											() => {
												describe(`when max volume limit (>0) is surpassed`, () => {
													const aboveVolumeLimit = maxAtomicValuePerBlock.add(toBN('1'));
													it('reverts due to surpassed volume limit', async () => {
														const args = getExchangeArgs({ sourceAmount: aboveVolumeLimit });
														await assert.revert(
															this.instance.exchangeAtomically(...args),
															'Surpassed volume limit'
														);
													});
												});
											}
										);
									}
								);
							});
						});
					});

					describe('when exchange rates hit circuit breakers', () => {
						behaviors.whenMockedSusdAndSethSeparatelyToIssueAndBurn(() => {
							behaviors.whenMockedWithExchangeRatesValidity({ valid: true }, () => {
								behaviors.whenMockedWithNoPriorExchangesToSettle(() => {
									behaviors.whenMockedWithSynthUintSystemSetting(
										{ setting: 'exchangeFeeRate', synth: sETH, value: '0' },
										() => {
											const deviationFactor = toUnit('5'); // 5x deviation limit
											const lastRate = toUnit('10');
											const badRate = lastRate.mul(toBN(10)); // should hit deviation factor of 5x

											// Source rate invalid
											behaviors.whenMockedEntireExchangeRateConfiguration(
												{
													sourceCurrency,
													atomicRate: lastRate,
													systemSourceRate: badRate,
													systemDestinationRate: lastRate,
													deviationFactor: deviationFactor,
													lastExchangeRates: [
														[sUSD, lastRate],
														[sETH, lastRate],
													],
													owner,
												},
												() => {
													beforeEach('attempt exchange', async () => {
														await this.instance.exchangeAtomically(...getExchangeArgs());
													});
													it('suspends src synth', async () => {
														assert.equal(
															this.mocks.SystemStatus.smocked.suspendSynth.calls[0][0],
															sUSD
														);
														assert.equal(
															this.mocks.SystemStatus.smocked.suspendSynth.calls[0][1],
															'65' // circuit breaker reason
														);
													});
													it('did not issue or burn synths', async () => {
														assert.equal(this.mocks.sUSD.smocked.issue.calls.length, 0);
														assert.equal(this.mocks.sETH.smocked.burn.calls.length, 0);
													});
												}
											);

											// Dest rate invalid
											behaviors.whenMockedEntireExchangeRateConfiguration(
												{
													sourceCurrency,
													atomicRate: lastRate,
													systemSourceRate: lastRate,
													systemDestinationRate: badRate,
													deviationFactor: deviationFactor,
													lastExchangeRates: [
														[sUSD, lastRate],
														[sETH, lastRate],
													],
													owner,
												},
												() => {
													beforeEach('attempt exchange', async () => {
														await this.instance.exchangeAtomically(...getExchangeArgs());
													});
													it('suspends dest synth', async () => {
														assert.equal(
															this.mocks.SystemStatus.smocked.suspendSynth.calls[0][0],
															sETH
														);
														assert.equal(
															this.mocks.SystemStatus.smocked.suspendSynth.calls[0][1],
															'65' // circuit breaker reason
														);
													});
													it('did not issue or burn synths', async () => {
														assert.equal(this.mocks.sUSD.smocked.issue.calls.length, 0);
														assert.equal(this.mocks.sETH.smocked.burn.calls.length, 0);
													});
												}
											);

											// Atomic rate invalid
											behaviors.whenMockedEntireExchangeRateConfiguration(
												{
													sourceCurrency,
													atomicRate: badRate,
													systemSourceRate: lastRate,
													systemDestinationRate: lastRate,
													deviationFactor: deviationFactor,
													lastExchangeRates: [
														[sUSD, lastRate],
														[sETH, lastRate],
													],
													owner,
												},
												() => {
													it('reverts exchange', async () => {
														await assert.revert(
															this.instance.exchangeAtomically(...getExchangeArgs()),
															'Atomic rate deviates too much'
														);
													});
												}
											);
										}
									);
								});
							});
						});
					});

					describe('when atomic exchange occurs (sUSD -> sETH)', () => {
						const unit = toUnit('1');
						const lastUsdRate = unit;
						const lastEthRate = toUnit('100'); // 1 ETH -> 100 USD
						const deviationFactor = unit.add(toBN('1')); // no deviation allowed, since we're using the same rates

						behaviors.whenMockedSusdAndSethSeparatelyToIssueAndBurn(() => {
							behaviors.whenMockedFeePool(() => {
								behaviors.whenMockedWithExchangeRatesValidity({ valid: true }, () => {
									behaviors.whenMockedWithNoPriorExchangesToSettle(() => {
										behaviors.whenMockedEntireExchangeRateConfiguration(
											{
												sourceCurrency,

												// we are always trading sUSD -> sETH
												atomicRate: lastEthRate,
												systemSourceRate: unit,
												systemDestinationRate: lastEthRate,

												deviationFactor: deviationFactor,
												lastExchangeRates: [
													[sUSD, unit],
													[sETH, lastEthRate],
												],
												owner,
											},
											() => {
												behaviors.whenMockedWithUintSystemSetting(
													{ setting: 'exchangeMaxDynamicFee', value: toUnit('1') },
													() => {
														behaviors.whenMockedWithUintSystemSetting(
															{ setting: 'atomicMaxVolumePerBlock', value: maxAtomicValuePerBlock },
															() => {
																const itExchangesCorrectly = ({
																	exchangeFeeRate,
																	setAsOverrideRate,
																	tradingRewardsEnabled,
																	trackingCode,
																}) => {
																	behaviors.whenMockedWithBoolSystemSetting(
																		{
																			setting: 'tradingRewardsEnabled',
																			value: !!tradingRewardsEnabled,
																		},
																		() => {
																			behaviors.whenMockedWithSynthUintSystemSetting(
																				{
																					setting: setAsOverrideRate
																						? 'atomicExchangeFeeRate'
																						: 'exchangeFeeRate',
																					synth: sETH,
																					value: exchangeFeeRate,
																				},
																				() => {
																					let expectedAmountReceived;
																					let expectedFee;
																					beforeEach('attempt exchange', async () => {
																						expectedFee = multiplyDecimal(
																							amountIn,
																							exchangeFeeRate
																						);
																						expectedAmountReceived = divideDecimal(
																							amountIn.sub(expectedFee),
																							lastEthRate
																						);

																						await this.instance.exchangeAtomically(
																							...getExchangeArgs({
																								trackingCode,
																							})
																						);
																					});
																					it('burned correct amount of sUSD', () => {
																						assert.equal(
																							this.mocks.sUSD.smocked.burn.calls[0][0],
																							owner
																						);
																						assert.bnEqual(
																							this.mocks.sUSD.smocked.burn.calls[0][1],
																							amountIn
																						);
																					});
																					it('issued correct amount of sETH', () => {
																						assert.equal(
																							this.mocks.sETH.smocked.issue.calls[0][0],
																							owner
																						);
																						assert.bnEqual(
																							this.mocks.sETH.smocked.issue.calls[0][1],
																							expectedAmountReceived
																						);
																					});
																					it('tracked atomic volume', async () => {
																						assert.bnEqual(
																							(await this.instance.lastAtomicVolume()).volume,
																							amountIn
																						);
																					});
																					it('updated debt cache', () => {
																						const debtCacheUpdateCall = this.mocks.DebtCache.smocked
																							.updateCachedSynthDebtsWithRates;
																						assert.deepEqual(debtCacheUpdateCall.calls[0][0], [
																							sUSD,
																							sETH,
																						]);
																						assert.deepEqual(debtCacheUpdateCall.calls[0][1], [
																							lastUsdRate,
																							lastEthRate,
																						]);
																					});
																					it('asked Synthetix to emit an exchange event', () => {
																						const synthetixEmitExchangeCall = this.mocks.Synthetix
																							.smocked.emitSynthExchange;
																						assert.equal(
																							synthetixEmitExchangeCall.calls[0][0],
																							owner
																						);
																						assert.equal(
																							synthetixEmitExchangeCall.calls[0][1],
																							sUSD
																						);
																						assert.bnEqual(
																							synthetixEmitExchangeCall.calls[0][2],
																							amountIn
																						);
																						assert.equal(
																							synthetixEmitExchangeCall.calls[0][3],
																							sETH
																						);
																						assert.bnEqual(
																							synthetixEmitExchangeCall.calls[0][4],
																							expectedAmountReceived
																						);
																						assert.equal(
																							synthetixEmitExchangeCall.calls[0][5],
																							owner
																						);
																					});
																					it('asked Synthetix to emit an atomic exchange event', () => {
																						const synthetixEmitAtomicExchangeCall = this.mocks
																							.Synthetix.smocked.emitAtomicSynthExchange;
																						assert.equal(
																							synthetixEmitAtomicExchangeCall.calls[0][0],
																							owner
																						);
																						assert.equal(
																							synthetixEmitAtomicExchangeCall.calls[0][1],
																							sUSD
																						);
																						assert.bnEqual(
																							synthetixEmitAtomicExchangeCall.calls[0][2],
																							amountIn
																						);
																						assert.equal(
																							synthetixEmitAtomicExchangeCall.calls[0][3],
																							sETH
																						);
																						assert.bnEqual(
																							synthetixEmitAtomicExchangeCall.calls[0][4],
																							expectedAmountReceived
																						);
																						assert.equal(
																							synthetixEmitAtomicExchangeCall.calls[0][5],
																							owner
																						);
																					});
																					it('did not add any fee reclamation entries to exchange state', () => {
																						assert.equal(
																							this.mocks.ExchangeState.smocked.appendExchangeEntry
																								.calls.length,
																							0
																						);
																					});

																					// Conditional based on test settings
																					if (toBN(exchangeFeeRate).isZero()) {
																						it('did not report a fee', () => {
																							assert.equal(
																								this.mocks.FeePool.smocked.recordFeePaid.calls
																									.length,
																								0
																							);
																						});
																					} else {
																						it('remitted correct fee to fee pool', () => {
																							assert.equal(
																								this.mocks.sUSD.smocked.issue.calls[0][0],
																								getUsers({ network: 'mainnet', user: 'fee' })
																									.address
																							);
																							assert.bnEqual(
																								this.mocks.sUSD.smocked.issue.calls[0][1],
																								expectedFee
																							);
																							assert.bnEqual(
																								this.mocks.FeePool.smocked.recordFeePaid.calls[0],
																								expectedFee
																							);
																						});
																					}
																					if (!tradingRewardsEnabled) {
																						it('did not report trading rewards', () => {
																							assert.equal(
																								this.mocks.TradingRewards.smocked
																									.recordExchangeFeeForAccount.calls.length,
																								0
																							);
																						});
																					} else {
																						it('reported trading rewards', () => {
																							const trRecordCall = this.mocks.TradingRewards.smocked
																								.recordExchangeFeeForAccount;
																							assert.bnEqual(trRecordCall.calls[0][0], expectedFee);
																							assert.equal(trRecordCall.calls[0][1], owner);
																						});
																					}
																					if (!trackingCode) {
																						it('did not ask Synthetix to emit tracking event', () => {
																							assert.equal(
																								this.mocks.Synthetix.smocked.emitExchangeTracking
																									.calls.length,
																								0
																							);
																						});
																					} else {
																						it('asked Synthetix to emit tracking event', () => {
																							const synthetixEmitTrackingCall = this.mocks.Synthetix
																								.smocked.emitExchangeTracking;
																							assert.equal(
																								synthetixEmitTrackingCall.calls[0][0],
																								trackingCode
																							);
																						});
																					}
																				}
																			);
																		}
																	);
																};

																describe('when no exchange fees are configured', () => {
																	itExchangesCorrectly({
																		exchangeFeeRate: '0',
																	});
																});

																describe('with tracking code', () => {
																	itExchangesCorrectly({
																		exchangeFeeRate: '0',
																		trackingCode: toBytes32('TRACKING'),
																	});
																});

																describe('when an exchange fee is configured', () => {
																	itExchangesCorrectly({
																		exchangeFeeRate: baseFeeRate,
																		tradingRewardsEnabled: true,
																	});
																});
																describe('when an exchange fee override for atomic exchanges is configured', () => {
																	itExchangesCorrectly({
																		exchangeFeeRate: overrideFeeRate,
																		setAsOverrideRate: true,
																		tradingRewardsEnabled: true,
																	});
																});
															}
														);
													}
												);
											}
										);
									});
								});
							});
						});
					});
				});
			});
		});
	});
});
