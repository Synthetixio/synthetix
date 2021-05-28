'use strict';

const { artifacts, web3 } = require('hardhat');
const { smockit } = require('@eth-optimism/smock');
const {
	fromBytes32,
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');
const { prepareSmocks, prepareFlexibleStorageSmock } = require('./helpers');
const { multiplyDecimal } = require('../utils')();

const [sUSD, sETH] = ['sUSD', 'sETH'].map(toBytes32);

let Exchanger;

module.exports = function({ accounts }) {
	before(async () => {
		Exchanger = artifacts.require('Exchanger');
	});

	before(async () => {
		Exchanger.link(await artifacts.require('SafeDecimalMath').new());
	});

	beforeEach(async () => {
		({ mocks: this.mocks, resolver: this.resolver } = await prepareSmocks({
			contracts: [
				'DebtCache',
				'DelegateApprovals',
				'ExchangeRates',
				'ExchangeState',
				'FeePool',
				'FlexibleStorage',
				'Issuer',
				'Synthetix',
				'SystemStatus',
				'TradingRewards',
			],
			accounts: accounts.slice(10), // mock using accounts after the first few
		}));

		this.flexibleStorageMock = prepareFlexibleStorageSmock(this.mocks.FlexibleStorage);
	});

	const mockEffectiveAtomicRate = ({ atomicRate, systemSourceRate, systemDestinationRate }) => {
		this.mocks.ExchangeRates.smocked.effectiveAtomicValueAndRates.will.return.with(
			(srcKey, amount, destKey) => {
				amount = amount.toString(); // seems to be passed to smock as a number
				return [
					multiplyDecimal(amount, atomicRate), // destinationAmount
					multiplyDecimal(amount, srcKey === sUSD ? systemDestinationRate : systemSourceRate), // systemAmountReceived
					systemSourceRate, // systemSourceRate
					systemDestinationRate, // systemDestinationRate
				].map(bn => bn.toString());
			}
		);
	};

	return {
		whenInstantiated: ({ owner }, cb) => {
			describe(`when instantiated`, () => {
				beforeEach(async () => {
					this.instance = await Exchanger.new(owner, this.resolver.address);
					await this.instance.rebuildCache();
				});
				cb();
			});
		},
		whenMockedToAllowExchangeInvocationChecks: cb => {
			describe(`when mocked to allow invocation checks`, () => {
				beforeEach(async () => {
					this.mocks.Synthetix.smocked.synthsByAddress.will.return.with(toBytes32());
				});
				cb();
			});
		},
		whenMockedWithExchangeRatesValidity: ({ valid = true }, cb) => {
			describe(`when mocked with ${valid ? 'valid' : 'invalid'} exchange rates`, () => {
				beforeEach(async () => {
					this.mocks.ExchangeRates.smocked.anyRateIsInvalid.will.return.with(!valid);
				});
				cb();
			});
		},
		whenMockedWithNoPriorExchangesToSettle: cb => {
			describe(`when mocked with no prior exchanges to settle`, () => {
				beforeEach(async () => {
					this.mocks.ExchangeState.smocked.getMaxTimestamp.will.return.with('0');
					this.mocks.ExchangeState.smocked.getLengthOfEntries.will.return.with('0');
				});
				cb();
			});
		},
		whenMockedWithBoolSystemSetting: ({ setting, value }, cb) => {
			describe(`when SystemSetting.${setting} is mocked to ${value}`, () => {
				beforeEach(async () => {
					this.flexibleStorageMock.mockSystemSetting({ setting, value, type: 'bool' });
				});
				cb();
			});
		},
		whenMockedWithUintSystemSetting: ({ setting, value }, cb) => {
			describe(`when SystemSetting.${setting} is mocked to ${value}`, () => {
				beforeEach(async () => {
					this.flexibleStorageMock.mockSystemSetting({ setting, value, type: 'uint' });
				});
				cb();
			});
		},
		whenMockedWithSynthUintSystemSetting: ({ setting, synth, value }, cb) => {
			const settingForSynth = web3.utils.soliditySha3(
				{ type: 'bytes32', value: toBytes32(setting) },
				{ type: 'bytes32', value: synth }
			);
			const synthName = fromBytes32(synth);
			describe(`when SystemSetting.${setting} for ${synthName} is mocked to ${value}`, () => {
				beforeEach(async () => {
					this.flexibleStorageMock.mockSystemSetting({
						value,
						setting: settingForSynth,
						type: 'uint',
					});
				});
				cb();
			});
		},
		whenMockedEffectiveAtomicRateWithValue: (
			{ atomicRate, systemSourceRate, systemDestinationRate },
			cb
		) => {
			describe(`when mocked with atomic rate ${atomicRate}, src rate ${systemSourceRate}, dest rate ${systemDestinationRate}`, () => {
				beforeEach(async () => {
					mockEffectiveAtomicRate({
						atomicRate,
						systemSourceRate,
						systemDestinationRate,
					});
				});
			});
		},
		whenMockedEntireExchangeRateConfiguration: (
			{ atomicRate, systemSourceRate, systemDestinationRate, deviationFactor, lastExchangeRates },
			cb
		) => {
			const lastRates = lastExchangeRates
				.map(([asset, lastRate]) => `${fromBytes32(asset)}: ${lastRate}`)
				.join(',');

			describe(`when mocked with atomic rate ${atomicRate}, src rate ${systemSourceRate}, dest rate ${systemDestinationRate}, deviationFactor ${deviationFactor}, lastExchangeRates ${lastRates}`, () => {
				beforeEach(async () => {
					this.flexibleStorageMock.mockSystemSetting({
						setting: 'priceDeviationThresholdFactor',
						value: deviationFactor,
						type: 'uint',
					});

					mockEffectiveAtomicRate({
						atomicRate,
						systemSourceRate,
						systemDestinationRate,
					});

					this.mocks.ExchangeRates.smocked.effectiveValue.will.return.with(
						(srcKey, sourceAmount, destKey) => {
							sourceAmount = sourceAmount.toString(); // seems to be passed to smock as a number
							return multiplyDecimal(
								sourceAmount,
								srcKey === sUSD ? systemDestinationRate : systemSourceRate
							).toString();
						}
					);

					for (const [asset, lastRate] of lastExchangeRates) {
						await this.instance.setLastExchangeRateForSynth(asset, lastRate, {
							from: this.mocks.ExchangeRates.address,
						});
					}
				});

				cb();
			});
		},
		whenMockedSusdAndSeth: cb => {
			describe(`when mocked sUSD and sETH`, () => {
				async function mockSynth(currencyKey) {
					const synth = await smockit(artifacts.require('Synth').abi);
					synth.smocked.burn.will.return();
					synth.smocked.issue.will.return();
					synth.smocked.currencyKey.will.return.with(currencyKey);
					synth.smocked.proxy.will.return.with(web3.eth.accounts.create().address);
					return synth;
				}

				beforeEach(async () => {
					this.mocks.sUSD = await mockSynth(sUSD);
					this.mocks.sETH = await mockSynth(sETH);
					this.mocks.Issuer.smocked.synths.will.return.with(currencyKey => {
						if (currencyKey === sUSD) {
							return this.mocks.sUSD.address;
						} else if (currencyKey === sETH) {
							return this.mocks.sETH.address;
						}
						// mimic on-chain default of 0s
						return ZERO_ADDRESS;
					});
				});

				cb();
			});
		},
		whenMockedFeePool: cb => {
			describe('when mocked fee pool', () => {
				beforeEach(async () => {
					this.mocks.FeePool.smocked.FEE_ADDRESS.will.return.with(
						'0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF'
					);
				});
				cb();
			});
		},
	};
};
