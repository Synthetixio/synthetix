'use strict';

const { artifacts, web3 } = require('hardhat');
const { smockit } = require('@eth-optimism/smock');
const {
	fromBytes32,
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');
const { prepareSmocks } = require('./helpers');
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
	});

	const mockUintSystemSetting = ({ setting, value }) => {
		this.mocks.FlexibleStorage.smocked.getUIntValue.will.return.with((contract, record) =>
			contract === toBytes32('SystemSettings') && record === toBytes32(setting)
				? value.toString()
				: '0'
		);
	};

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
		whenMockedWithUintSystemSetting: ({ setting, value }, cb) => {
			describe(`when SystemSetting.${setting} is mocked to ${value}`, () => {
				beforeEach(async () => {
					mockUintSystemSetting({ setting, value });
				});
				cb();
			});
		},
		whenMockedWithSynthUintSystemSetting: ({ setting, synth, value }, cb) => {
			const synthName = fromBytes32(synth);
			describe(`when SystemSetting.${setting} for ${synthName} is mocked to ${value}`, () => {
				beforeEach(async () => {
					this.mocks.FlexibleStorage.smocked.getUIntValue.will.return.with((contract, record) => {
						const settingForSynth = web3.utils.soliditySha3(
							{ type: 'bytes32', value: toBytes32(setting) },
							{ type: 'bytes32', value: synth }
						);
						return contract === toBytes32('SystemSettings') && record === settingForSynth
							? value.toString()
							: '0';
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
					mockUintSystemSetting({
						setting: 'priceDeviationThresholdFactor',
						value: deviationFactor,
					});

					mockEffectiveAtomicRate({
						atomicRate,
						systemSourceRate,
						systemDestinationRate,
					});

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
	};
};
