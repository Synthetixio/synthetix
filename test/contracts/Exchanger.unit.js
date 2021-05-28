'use strict';

const { contract, web3 } = require('hardhat');

const { assert } = require('./common');

const { onlyGivenAddressCanInvoke } = require('./helpers');

const { multiplyDecimal, toUnit } = require('../utils')();

const { toBytes32 } = require('../..');

const { toBN } = web3.utils;

contract('Exchanger (unit tests)', async accounts => {
	const [, owner] = accounts;
	const [sUSD, sETH, sBTC] = ['sUSD', 'sETH', 'sBTC'].map(toBytes32);
	const maxVolumePerBlock = toUnit('1000000');
	const baseFeeRate = toUnit('0.003');
	const overrideFeeRate = toUnit('0.01');
	const amountIn = toUnit('100');

	// ensure all of the behaviors are bound to "this" for sharing test state
	const behaviors = require('./Exchanger.behaviors').call(this, { accounts });

	const callAsSynthetix = args => [...args, { from: this.mocks.Synthetix.address }];

	describe('when a contract is instantiated', () => {
		behaviors.whenInstantiated({ owner }, () => {
			describe('atomicMaxVolumePerBlock()', () => {
				// Mimic setting not being configured
				behaviors.whenMockedWithUintSystemSetting(
					{ setting: 'atomicMaxVolumePerBlock', value: toUnit('0') },
					() => {
						it('is set to 0', async () => {
							assert.bnEqual(await this.instance.atomicMaxVolumePerBlock(), '0');
						});
					}
				);

				// With configured value
				behaviors.whenMockedWithUintSystemSetting(
					{ setting: 'atomicMaxVolumePerBlock', value: maxVolumePerBlock },
					() => {
						it('is set to the configured value', async () => {
							assert.bnEqual(await this.instance.atomicMaxVolumePerBlock(), maxVolumePerBlock);
						});
					}
				);
			});

			describe('feeRateForAtomicExchange()', () => {
				// Mimic settings not being configured
				behaviors.whenMockedWithSynthUintSystemSetting(
					{ setting: 'exchangeFeeRate', synth: sETH, value: toUnit('0') },
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
							assert.bnEqual(await this.instance.feeRateForAtomicExchange(sUSD, sETH), baseFeeRate);
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
					{ atomicRate, systemSourceRate: toUnit('1'), systemDestinationRate: toUnit('1') },
					() => {
						// No fees
						behaviors.whenMockedWithSynthUintSystemSetting(
							{ setting: 'exchangeFeeRate', synth: sETH, value: toUnit('0') },
							() => {
								it('gives exact amounts when no fees are configured', async () => {
									await assertAmountsReported({
										amountIn,
										atomicRate,
										feeRate: toUnit('0'),
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

			describe('exchangeAtomically()', () => {
				let defaultExchangeArgs;

				beforeEach('setup default exchange args', () => {
					defaultExchangeArgs = callAsSynthetix([owner, sUSD, amountIn, sETH, owner, toBytes32()]);
				});

				describe('when called by unauthorized', async () => {
					behaviors.whenMockedToAllowExchangeInvocationChecks(() => {
						it('it reverts when called by regular accounts', async () => {
							await onlyGivenAddressCanInvoke({
								fnc: this.instance.exchangeAtomically,
								args: defaultExchangeArgs.slice(0, -1), // remove tx options
								accounts: accounts.filter(a => a !== this.mocks.Synthetix.address),
								reason: 'Exchanger: Only synthetix or a synth contract can perform this action',
								// address: this.mocks.Synthetix.address (doesnt work as this reverts due to lack of mocking setup)
							});
						});
					});
				});

				describe('when not exchangeable', () => {
					it('reverts when src and dest are the same', async () => {
						const args = callAsSynthetix([owner, sUSD, amountIn, sUSD, owner, toBytes32()]);
						await assert.revert(this.instance.exchangeAtomically(...args), "Can't be same synth");
					});

					it('reverts when input amount is zero', async () => {
						const args = callAsSynthetix([owner, sUSD, toUnit('0'), sETH, owner, toBytes32()]);
						await assert.revert(this.instance.exchangeAtomically(...args), 'Zero amount');
					});

					// Invalid system rates
					behaviors.whenMockedWithExchangeRatesValidity({ valid: false }, () => {
						it('reverts when either rate is invalid', async () => {
							await assert.revert(
								this.instance.exchangeAtomically(...defaultExchangeArgs),
								'Src/dest rate invalid or not found'
							);
						});
					});

					behaviors.whenMockedWithExchangeRatesValidity({ valid: true }, () => {
						behaviors.whenMockedWithNoPriorExchangesToSettle(() => {
							const lastRate = toUnit('1');
							behaviors.whenMockedEntireExchangeRateConfiguration(
								{
									atomicRate: lastRate,
									systemSourceRate: lastRate,
									systemDestinationRate: lastRate,
									deviationFactor: toUnit('10'), // 10x
									lastExchangeRates: [
										[sUSD, lastRate],
										[sETH, lastRate],
										[sBTC, lastRate],
									],
								},
								() => {
									describe('when sUSD is not in src/dest pair', () => {
										it('reverts requiring src/dest to be sUSD', async () => {
											const args = callAsSynthetix([
												owner,
												sBTC,
												amountIn,
												sETH,
												owner,
												toBytes32(),
											]);
											await assert.revert(
												this.instance.exchangeAtomically(...args),
												'Src/dest synth must be sUSD'
											);
										});
									});

									describe('when max volume limit (0) is surpassed', () => {
										it('reverts due to surpassed volume limit', async () => {
											const args = callAsSynthetix([
												owner,
												sUSD,
												toUnit('1'),
												sETH,
												owner,
												toBytes32(),
											]);
											await assert.revert(
												this.instance.exchangeAtomically(...args),
												'Surpassed volume limit'
											);
										});
									});

									behaviors.whenMockedWithUintSystemSetting(
										{ setting: 'atomicMaxVolumePerBlock', value: maxVolumePerBlock },
										() => {
											describe(`when max volume limit (>0) is surpassed`, () => {
												const aboveVolumeLimit = maxVolumePerBlock.add(toBN('1'));
												it('reverts due to surpassed volume limit', async () => {
													const args = callAsSynthetix([
														owner,
														sUSD,
														aboveVolumeLimit,
														sETH,
														owner,
														toBytes32(),
													]);
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
					behaviors.whenMockedSusdAndSeth(() => {
						behaviors.whenMockedWithExchangeRatesValidity({ valid: true }, () => {
							behaviors.whenMockedWithNoPriorExchangesToSettle(() => {
								behaviors.whenMockedWithSynthUintSystemSetting(
									{ setting: 'exchangeFeeRate', synth: sETH, value: toUnit('0') },
									() => {
										const deviationFactor = toUnit('5'); // 5x deviation limit
										const badRate = toUnit('10');
										const lastRate = badRate.mul(toBN(10)); // should hit deviation factor of 5x

										// Source rate invalid
										behaviors.whenMockedEntireExchangeRateConfiguration(
											{
												atomicRate: lastRate,
												systemSourceRate: badRate,
												systemDestinationRate: lastRate,
												deviationFactor: deviationFactor,
												lastExchangeRates: [
													[sUSD, lastRate],
													[sETH, lastRate],
												],
											},
											() => {
												beforeEach('attempt exchange', async () => {
													await this.instance.exchangeAtomically(...defaultExchangeArgs);
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
												it('does not issue or burn synths', async () => {
													assert.equal(this.mocks.sUSD.smocked.issue.calls.length, 0);
													assert.equal(this.mocks.sETH.smocked.burn.calls.length, 0);
												});
											}
										);

										behaviors.whenMockedEntireExchangeRateConfiguration(
											{
												atomicRate: lastRate,
												systemSourceRate: lastRate,
												systemDestinationRate: badRate,
												deviationFactor: deviationFactor,
												lastExchangeRates: [
													[sUSD, lastRate],
													[sETH, lastRate],
												],
											},
											() => {
												beforeEach('attempt exchange', async () => {
													await this.instance.exchangeAtomically(...defaultExchangeArgs);
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
												it('does not issue or burn synths', async () => {
													assert.equal(this.mocks.sUSD.smocked.issue.calls.length, 0);
													assert.equal(this.mocks.sETH.smocked.burn.calls.length, 0);
												});
											}
										);

										// Atomic rate invalid
										behaviors.whenMockedEntireExchangeRateConfiguration(
											{
												atomicRate: badRate,
												systemSourceRate: lastRate,
												systemDestinationRate: lastRate,
												deviationFactor: deviationFactor,
												lastExchangeRates: [
													[sUSD, lastRate],
													[sETH, lastRate],
												],
											},
											() => {
												it('reverts exchange', async () => {
													await assert.revert(
														this.instance.exchangeAtomically(...defaultExchangeArgs),
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

				describe('when exchange occurs', () => {
					const lastRate = toUnit('0.01'); // 10 USD -> 1 ETH
					const deviationFactor = toUnit('10'); // 10x

					behaviors.whenMockedSusdAndSeth(() => {
						behaviors.whenMockedWithExchangeRatesValidity({ valid: true }, () => {
							behaviors.whenMockedWithNoPriorExchangesToSettle(() => {
								behaviors.whenMockedEntireExchangeRateConfiguration(
									{
										atomicRate: lastRate,
										systemSourceRate: lastRate,
										systemDestinationRate: lastRate,
										deviationFactor: deviationFactor,
										lastExchangeRates: [
											[sUSD, lastRate],
											[sETH, lastRate],
										],
									},
									() => {
										behaviors.whenMockedWithUintSystemSetting(
											{ setting: 'atomicMaxVolumePerBlock', value: maxVolumePerBlock },
											() => {
												const itExchangesCorrectly = ({ exchangeFeeRate, setAsOverrideRate }) => {
													behaviors.whenMockedWithSynthUintSystemSetting(
														{
															setting: setAsOverrideRate
																? 'atomicExchangeFeeRate'
																: 'exchangeFeeRate',
															synth: sETH,
															value: exchangeFeeRate,
														},
														() => {
															beforeEach('attempt exchange', async () => {
																await this.instance.exchangeAtomically(...defaultExchangeArgs);
															});
															it('burned correct amount of sUSD', async () => {});
															it('issued correct amount of sETH', async () => {});
															it('reported correct fee to fee pool', async () => {});
															it('updated debt cache', async () => {});
															it('told Synthetix to emit an exchange event', async () => {});
															it('does not add any fee reclamation entries to exchange state', async () => {});
														}
													);
												};

												describe('when no exchange fees are configured', () => {
													itExchangesCorrectly({
														exchangeFeeRate: toUnit('0'),
													});
												});

												behaviors.whenMockedFeePool(() => {
													behaviors.whenMockedWithBoolSystemSetting(
														{ setting: 'tradingRewardsEnabled', value: true },
														() => {
															describe('when an exchange fee is configured', () => {
																itExchangesCorrectly({
																	exchangeFeeRate: baseFeeRate,
																});
															});
															describe('when an exchange fee override for atomic exchanges is configured', () => {
																itExchangesCorrectly({
																	exchangeFeeRate: overrideFeeRate,
																	setAsOverrideRate: true,
																});
															});
														}
													);
													behaviors.whenMockedWithBoolSystemSetting(
														{ setting: 'tradingRewardsEnabled', value: false },
														() => {
															itExchangesCorrectly({
																exchangeFeeRate: baseFeeRate,
															});
														}
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
			});
		});
	});
});
