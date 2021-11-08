'use strict';

const { artifacts, web3 } = require('hardhat');
const { smockit } = require('@eth-optimism/smock');
const { toBytes32 } = require('../..');
const { prepareSmocks } = require('./helpers');

let ExchangerWithVirtualSynth;
let SafeDecimalMath;
let DynamicFee;

module.exports = function({ accounts }) {
	before(async () => {
		ExchangerWithVirtualSynth = artifacts.require('ExchangerWithVirtualSynth');
		SafeDecimalMath = artifacts.require('SafeDecimalMath');
		DynamicFee = artifacts.require('DynamicFee');
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
	});

	before(async () => {
		const safeDecimalMath = await SafeDecimalMath.new();
		DynamicFee.link(safeDecimalMath);
		ExchangerWithVirtualSynth.link(safeDecimalMath);
		ExchangerWithVirtualSynth.link(await DynamicFee.new());
	});

	return {
		whenInstantiated: ({ owner }, cb) => {
			describe(`when instantiated`, () => {
				beforeEach(async () => {
					this.instance = await ExchangerWithVirtualSynth.new(owner, this.resolver.address);
					await this.instance.rebuildCache();
				});
				cb();
			});
		},
		whenMockedToAllowChecks: cb => {
			describe(`when mocked to allow invocation checks`, () => {
				beforeEach(async () => {
					this.mocks.Synthetix.smocked.synthsByAddress.will.return.with(toBytes32());
				});
				cb();
			});
		},
		whenMockedWithExchangeRatesValidity: ({ valid = true }, cb) => {
			describe(`when mocked with valid exchange rates`, () => {
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
					this.mocks.FlexibleStorage.smocked.getUIntValue.will.return.with((contract, record) =>
						contract === toBytes32('SystemSettings') && record === toBytes32(setting) ? value : '0'
					);
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
		whenMockedASynthToIssueAndBurn: cb => {
			describe(`when mocked a synth to burn`, () => {
				beforeEach(async () => {
					// create and share the one synth for all Issuer.synths() calls
					this.mocks.synth = await smockit(artifacts.require('Synth').abi);
					this.mocks.synth.smocked.burn.will.return();
					this.mocks.synth.smocked.issue.will.return();
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
		whenMockedExchangeStatePersistance: cb => {
			describe(`when mocking exchange state persistance`, () => {
				beforeEach(async () => {
					this.mocks.ExchangeRates.smocked.getCurrentRoundId.will.return.with('0');
					this.mocks.ExchangeState.smocked.appendExchangeEntry.will.return();
				});
				cb();
			});
		},
	};
};
