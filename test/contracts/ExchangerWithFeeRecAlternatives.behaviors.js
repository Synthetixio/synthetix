'use strict';

const { artifacts, web3 } = require('hardhat');
const { smockit } = require('@eth-optimism/smock');
const { prepareSmocks, prepareFlexibleStorageSmock } = require('./helpers');
const { divideDecimal, multiplyDecimal } = require('../utils')();
const {
	getUsers,
	fromBytes32,
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

const [sUSD, sETH] = ['sUSD', 'sETH'].map(toBytes32);

let ExchangerWithFeeRecAlternatives;

module.exports = function({ accounts }) {
	before(async () => {
		ExchangerWithFeeRecAlternatives = artifacts.require('ExchangerWithFeeRecAlternatives');
	});

	before(async () => {
		const safeDecimalMath = await artifacts.require('SafeDecimalMath').new();
		ExchangerWithFeeRecAlternatives.link(safeDecimalMath);
	});

	beforeEach(async () => {
		const VirtualSynthMastercopy = artifacts.require('VirtualSynthMastercopy');

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
			mocks: {
				// Use a real VirtualSynthMastercopy so the unit tests can interrogate deployed vSynths
				VirtualSynthMastercopy: await VirtualSynthMastercopy.new(),
			},
			accounts: accounts.slice(10), // mock using accounts after the first few
		}));

		this.flexibleStorageMock = prepareFlexibleStorageSmock(this.mocks.FlexibleStorage);
	});

	const mockEffectiveAtomicRate = ({
		sourceCurrency,
		atomicRate,
		systemSourceRate,
		systemDestinationRate,
	}) => {
		this.mocks.ExchangeRates.smocked.effectiveAtomicValueAndRates.will.return.with(
			(srcKey, amount, destKey) => {
				amount = amount.toString(); // seems to be passed to smock as a number

				// For ease of comparison when mocking, atomicRate is specified in the
				// same direction as systemDestinationRate
				const atomicValue =
					srcKey === sourceCurrency
						? divideDecimal(amount, atomicRate)
						: multiplyDecimal(amount, atomicRate);

				const [sourceRate, destinationRate] =
					srcKey === sourceCurrency
						? [systemSourceRate, systemDestinationRate]
						: [systemDestinationRate, systemSourceRate];
				const systemValue = divideDecimal(multiplyDecimal(amount, sourceRate), destinationRate);

				return [
					atomicValue, // value
					systemValue, // systemValue
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
					this.instance = await ExchangerWithFeeRecAlternatives.new(owner, this.resolver.address);
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
		whenMockedWithExchangeRatesValidityAtRound: ({ valid = true }, cb) => {
			describe(`when mocked with ${valid ? 'valid' : 'invalid'} exchange rates`, () => {
				beforeEach(async () => {
					this.mocks.ExchangeRates.smocked.anyRateIsInvalidAtRound.will.return.with(!valid);
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
		whenMockedWithUintsSystemSetting: ({ setting, value }, cb) => {
			describe(`when SystemSetting.${setting} is mocked to ${value}`, () => {
				beforeEach(async () => {
					this.flexibleStorageMock.mockSystemSetting({ setting, value, type: 'uints' });
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
		whenMockedEffectiveRateAsEqual: cb => {
			describe(`when mocked with exchange rates giving an effective value of 1:1`, () => {
				beforeEach(async () => {
					this.mocks.ExchangeRates.smocked.effectiveValueAndRates.will.return.with(
						(srcKey, amount, destKey) => [amount, (1e18).toString(), (1e18).toString()]
					);
				});
				cb();
			});
		},
		whenMockedEffectiveRateAsEqualAtRound: cb => {
			describe(`when mocked with exchange rates giving an effective value of 1:1`, () => {
				beforeEach(async () => {
					this.mocks.ExchangeRates.smocked.effectiveValueAndRatesAtRound.will.return.with(
						(srcKey, amount, destKey) => [amount, (1e18).toString(), (1e18).toString()]
					);
				});
				cb();
			});
		},
		whenMockedLastNRates: cb => {
			describe(`when mocked 1e18 as last n rates`, () => {
				beforeEach(async () => {
					this.mocks.ExchangeRates.smocked.ratesAndUpdatedTimeForCurrencyLastNRounds.will.return.with(
						[[], []]
					);
				});
				cb();
			});
		},
		whenMockedEffectiveAtomicRateWithValue: (
			{ sourceCurrency, atomicRate, systemSourceRate, systemDestinationRate },
			cb
		) => {
			describe(`when mocked with atomic rate ${atomicRate}, src rate ${systemSourceRate}, dest rate ${systemDestinationRate}`, () => {
				beforeEach(async () => {
					mockEffectiveAtomicRate({
						sourceCurrency,
						atomicRate,
						systemSourceRate,
						systemDestinationRate,
					});
				});
			});
		},
		whenMockedWithVolatileSynth: ({ synth, volatile }, cb) => {
			describe(`when mocked with ${fromBytes32(synth)} deemed ${
				volatile ? 'volatile' : 'not volatile'
			}`, () => {
				beforeEach(async () => {
					this.mocks.ExchangesRates.smocked.synthTooVolatileForAtomicExchange.will.return.with(
						synthToCheck => (synthToCheck === synth ? volatile : false)
					);
				});
			});
		},
		whenMockedEntireExchangeRateConfiguration: (
			{
				sourceCurrency,
				atomicRate,
				systemSourceRate,
				systemDestinationRate,
				deviationFactor,
				lastExchangeRates,
				owner,
			},
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
						sourceCurrency,
						atomicRate,
						systemSourceRate,
						systemDestinationRate,
					});

					this.mocks.ExchangeRates.smocked.effectiveValue.will.return.with(
						(srcKey, sourceAmount, destKey) => {
							sourceAmount = sourceAmount.toString(); // passed from smock as a number

							const [sourceRate, destinationRate] =
								srcKey === sourceCurrency
									? [systemSourceRate, systemDestinationRate]
									: [systemDestinationRate, systemSourceRate];
							return divideDecimal(
								multiplyDecimal(sourceAmount, sourceRate),
								destinationRate
							).toString();
						}
					);

					// mock last rates
					this.mocks.ExchangeRates.smocked.ratesAndInvalidForCurrencies.will.return.with([
						lastExchangeRates.map(([, rate]) => require('ethers').BigNumber.from(rate.toString())),
						false,
					]);

					// tell exchanger to update last rates
					await this.instance.resetLastExchangeRate(
						lastExchangeRates.map(([asset]) => asset),
						{
							from: owner,
						}
					);
				});

				cb();
			});
		},
		whenMockedASingleSynthToIssueAndBurn: cb => {
			describe(`when mocked a synth to burn`, () => {
				beforeEach(async () => {
					// create and share the one synth for all Issuer.synths() calls
					this.mocks.synth = await smockit(artifacts.require('Synth').abi);
					this.mocks.synth.smocked.proxy.will.return.with(web3.eth.accounts.create().address);
					this.mocks.Issuer.smocked.synths.will.return.with(currencyKey => {
						// but when currency
						this.mocks.synth.smocked.currencyKey.will.return.with(currencyKey);
						return this.mocks.synth.address;
					});
				});
				cb();
			});
		},
		whenMockedSusdAndSethSeparatelyToIssueAndBurn: cb => {
			describe(`when mocked sUSD and sETH`, () => {
				async function mockSynth(currencyKey) {
					const synth = await smockit(artifacts.require('Synth').abi);
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
		whenMockedExchangeStatePersistance: cb => {
			describe(`when mocking exchange state persistance`, () => {
				beforeEach(async () => {
					this.mocks.ExchangeRates.smocked.getCurrentRoundId.will.return.with('0');
					this.mocks.ExchangeState.smocked.appendExchangeEntry.will.return();
				});
				cb();
			});
		},
		whenMockedFeePool: cb => {
			describe('when mocked fee pool', () => {
				beforeEach(async () => {
					this.mocks.FeePool.smocked.FEE_ADDRESS.will.return.with(
						getUsers({ network: 'mainnet', user: 'fee' }).address
					);
				});
				cb();
			});
		},
	};
};
