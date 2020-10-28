'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { smockit } = require('@eth-optimism/smock');

const { assert } = require('./common');

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toBytes32 } = require('../..');

const Exchanger = artifacts.require('Exchanger');

const prepareMocks = async ({ contracts, owner, accounts = [] }) => {
	const mocks = {};
	for (const [i, contract] of Object.entries(contracts)) {
		mocks[contract] = await smockit(artifacts.require(contract).abi, { address: accounts[i] });
	}

	const resolver = await artifacts.require('AddressResolver').new(owner);
	await resolver.importAddresses(
		Object.keys(mocks).map(contract => toBytes32(contract)),
		Object.values(mocks).map(mock => mock.address),
		{ from: owner }
	);
	return { mocks, resolver };
};

let steps = {
	whenMockedToAllowChecks(cb) {
		describe(`when mocked to allow invocation checks`, () => {
			beforeEach(async () => {
				this.mocks.Synthetix.smocked.synthsByAddress.will.return.with(toBytes32());
			});
			cb();
		});
	},
	whenMockedWithExchangeRatesValidity({ valid = true }, cb) {
		describe(`when mocked with valid exchange rates`, () => {
			beforeEach(async () => {
				this.mocks.ExchangeRates.smocked.anyRateIsInvalid.will.return.with(!valid);
			});
			cb();
		});
	},
	whenMockedWithNoPriorExchangesToSettle(cb) {
		describe(`when mocked with no prior exchanges to settle`, () => {
			beforeEach(async () => {
				this.mocks.ExchangeState.smocked.getMaxTimestamp.will.return.with('0');
				this.mocks.ExchangeState.smocked.getLengthOfEntries.will.return.with('0');
			});
			cb();
		});
	},
	whenMockedWithUintSystemSetting({ setting, value }, cb) {
		describe(`when SystemSetting.${setting} is mocked to ${value}`, () => {
			beforeEach(async () => {
				this.mocks.FlexibleStorage.smocked.getUIntValue.will.return.with((contract, record) =>
					contract === toBytes32('SystemSettings') && record === toBytes32(setting) ? value : '0'
				);
			});
			cb();
		});
	},
	whenMockedEffectiveRateAsEqual(cb) {
		describe(`when mocked with exchange rates giving an effective value of 1:1`, () => {
			beforeEach(async () => {
				this.mocks.ExchangeRates.smocked.effectiveValueAndRates.will.return.with(
					(srcKey, amount, destKey) => [amount, (1e18).toString(), (1e18).toString()]
				);
			});
			cb();
		});
	},
	whenMockedLastNRates(cb) {
		describe(`when mocked 1e18 as last n rates`, () => {
			beforeEach(async () => {
				this.mocks.ExchangeRates.smocked.ratesAndUpdatedTimeForCurrencyLastNRounds.will.return.with(
					[[], []]
				);
			});
			cb();
		});
	},
	whenMockedASynthToIssueAmdBurn(cb) {
		describe(`when mocked a synth to burn`, () => {
			beforeEach(async () => {
				// create and share the one synth for all Issuer.synths() calls
				this.synth = await smockit(artifacts.require('ISynth').abi);
				this.synth.smocked.burn.will.return();
				this.synth.smocked.issue.will.return();
				this.mocks.Issuer.smocked.synths.will.return.with(currencyKey => {
					// but when currency
					this.synth.smocked.currencyKey.will.return.with(currencyKey);
					return this.synth.address;
				});
			});
			cb();
		});
	},
	whenMockedExchangeStatePersistance(cb) {
		describe(`when mocking exchange state persistance`, () => {
			beforeEach(async () => {
				this.mocks.ExchangeRates.smocked.getCurrentRoundId.will.return.with('0');
				this.mocks.ExchangeState.smocked.appendExchangeEntry.will.return();
			});
			cb();
		});
	},
};

contract('Exchanger (unit tests)', async accounts => {
	const [, owner] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: Exchanger.abi,
			ignoreParents: ['MixinResolver'],
			expected: [
				'exchange',
				'exchangeOnBehalf',
				'exchangeOnBehalfWithTracking',
				'exchangeWithTracking',
				'exchangeWithVirtual',
				'settle',
				'suspendSynthWithInvalidRate',
				'setLastExchangeRateForSynth',
			],
		});
	});

	describe('when a contract is instantiated', () => {
		let instance;

		// ensure all of the steps are bound to "this" for sharing test state
		steps = Object.keys(steps).reduce((memo, cur) => {
			memo[cur] = steps[cur].bind(this);
			return memo;
		}, {});

		before(async () => {
			Exchanger.link(await artifacts.require('SafeDecimalMath').new());
		});

		beforeEach(async () => {
			({ mocks: this.mocks, resolver: this.resolver } = await prepareMocks({
				owner,
				contracts: [
					'SystemStatus',
					'ExchangeState',
					'ExchangeRates',
					'Synthetix',
					'FeePool',
					'TradingRewards',
					'DelegateApprovals',
					'Issuer',
					'FlexibleStorage',
				],
				accounts: accounts.slice(3), // mock using accounts after the first few
			}));
		});

		beforeEach(async () => {
			instance = await Exchanger.new(owner, this.resolver.address);
			await instance.setResolverAndSyncCache(this.resolver.address, { from: owner });
		});

		describe('exchanging', () => {
			describe('exchangeWithVirtual', () => {
				describe('failure modes', () => {
					const args = [owner, toBytes32('sUSD'), '100', toBytes32('sETH'), owner];

					// as we aren't calling as Synthetix, we need to mock the check for synths
					steps.whenMockedToAllowChecks(() => {
						it('it reverts when called by regular accounts', async () => {
							await onlyGivenAddressCanInvoke({
								fnc: instance.exchangeWithVirtual,
								args,
								accounts: accounts.filter(a => a !== this.mocks.Synthetix.address),
								reason: 'Exchanger: Only synthetix or a synth contract can perform this action',
								// address: this.mocks.Synthetix.address (doesnt work as this reverts due to lack of mocking setup)
							});
						});
					});

					steps.whenMockedWithExchangeRatesValidity({ valid: false }, () => {
						it('it reverts when either rate is invalid', async () => {
							await assert.revert(
								instance.exchangeWithVirtual(
									...args.concat({ from: this.mocks.Synthetix.address })
								),
								'Src/dest rate invalid or not found'
							);
						});
					});
				});

				steps.whenMockedWithExchangeRatesValidity({ valid: true }, () => {
					steps.whenMockedWithNoPriorExchangesToSettle(() => {
						steps.whenMockedWithUintSystemSetting(
							{ setting: 'waitingPeriodSecs', value: '0' },
							() => {
								steps.whenMockedEffectiveRateAsEqual(() => {
									steps.whenMockedLastNRates(() => {
										steps.whenMockedASynthToIssueAmdBurn(() => {
											steps.whenMockedExchangeStatePersistance(() => {
												describe('when invoked', () => {
													let txn;
													const amount = '101';
													beforeEach(async () => {
														txn = await instance.exchangeWithVirtual(
															owner,
															toBytes32('sUSD'),
															amount,
															toBytes32('sETH'),
															owner,
															{ from: this.mocks.Synthetix.address }
														);
													});
													it('emits a VirtualSynthCreated event with the correct underlying synth and amount', async () => {
														assert.eventEqual(txn, 'VirtualSynthCreated', {
															synth: this.synth.address,
															currencyKey: toBytes32('sETH'),
															amount,
														});
													});
													describe('when interrogating the Virtual Synths construction params', () => {
														let vSynth;
														beforeEach(async () => {
															const { vSynth: vSynthAddress } = txn.logs.find(
																({ event }) => event === 'VirtualSynthCreated'
															).args;
															vSynth = await artifacts.require('VirtualSynth').at(vSynthAddress);
														});
														it('the vSynth has the correct synth', async () => {
															assert.equal(await vSynth.synth(), this.synth.address);
														});
														it('the vSynth has the correct resolver', async () => {
															assert.equal(await vSynth.resolver(), this.resolver.address);
														});
														it('the vSynth has minted the correct amount to the user', async () => {
															assert.equal(await vSynth.totalSupply(), amount);
															assert.equal(await vSynth.balanceOf(owner), amount);
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
		});
	});
});
