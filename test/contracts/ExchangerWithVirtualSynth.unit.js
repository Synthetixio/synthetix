'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert } = require('./common');

const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	prepareSmocks,
	bindAll,
} = require('./helpers');

const { toBytes32 } = require('../..');

let behaviors = require('./ExchangerWithVirtualSynth.behaviors');

const ExchangerWithVirtualSynth = artifacts.require('ExchangerWithVirtualSynth');

contract('ExchangerWithVirtualSynth (unit tests)', async accounts => {
	const [, owner] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: ExchangerWithVirtualSynth.abi,
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

	describe('when a contract is instantiated @cov-skip', () => {
		let instance;

		// ensure all of the behaviors are bound to "this" for sharing test state
		behaviors = bindAll.call(this, { input: behaviors });

		before(async () => {
			ExchangerWithVirtualSynth.link(await artifacts.require('SafeDecimalMath').new());
		});

		beforeEach(async () => {
			({ mocks: this.mocks, resolver: this.resolver } = await prepareSmocks({
				owner,
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
				accounts: accounts.slice(3), // mock using accounts after the first few
			}));
		});

		beforeEach(async () => {
			instance = await ExchangerWithVirtualSynth.new(owner, this.resolver.address);
			await instance.setResolverAndSyncCache(this.resolver.address, { from: owner });
		});

		describe('exchanging', () => {
			describe('exchangeWithVirtual', () => {
				describe('failure modes', () => {
					const args = [owner, toBytes32('sUSD'), '100', toBytes32('sETH'), owner];

					// as we aren't calling as Synthetix, we need to mock the check for synths
					behaviors.whenMockedToAllowChecks(() => {
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

					behaviors.whenMockedWithExchangeRatesValidity({ valid: false }, () => {
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

				behaviors.whenMockedWithExchangeRatesValidity({ valid: true }, () => {
					behaviors.whenMockedWithNoPriorExchangesToSettle(() => {
						behaviors.whenMockedWithUintSystemSetting(
							{ setting: 'waitingPeriodSecs', value: '0' },
							() => {
								behaviors.whenMockedEffectiveRateAsEqual(() => {
									behaviors.whenMockedLastNRates(() => {
										behaviors.whenMockedASynthToIssueAmdBurn(() => {
											behaviors.whenMockedExchangeStatePersistance(() => {
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
															synth: this.mocks.synth.address,
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
															assert.equal(await vSynth.synth(), this.mocks.synth.address);
														});
														it('the vSynth has the correct resolver', async () => {
															assert.equal(await vSynth.resolver(), this.resolver.address);
														});
														it('the vSynth has minted the correct amount to the user', async () => {
															assert.equal(await vSynth.totalSupply(), amount);
															assert.equal(await vSynth.balanceOf(owner), amount);
														});
														it('and the synth has been issued to the vSynth', async () => {
															assert.equal(
																this.mocks.synth.smocked.issue.calls[0][0],
																vSynth.address
															);
															assert.equal(this.mocks.synth.smocked.issue.calls[0][1], amount);
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
