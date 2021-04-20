'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert } = require('./common');

const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	getEventByName,
	buildMinimalProxyCode,
} = require('./helpers');

const { toBytes32 } = require('../..');

let ExchangerWithVirtualSynth;

contract('ExchangerWithVirtualSynth (unit tests)', async accounts => {
	const [, owner] = accounts;

	before(async () => {
		ExchangerWithVirtualSynth = artifacts.require('ExchangerWithVirtualSynth');
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: ExchangerWithVirtualSynth.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
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
		// ensure all of the behaviors are bound to "this" for sharing test state
		const behaviors = require('./ExchangerWithVirtualSynth.behaviors').call(this, { accounts });

		describe('exchanging', () => {
			describe('exchangeWithVirtual', () => {
				describe('failure modes', () => {
					const args = [owner, toBytes32('sUSD'), '100', toBytes32('sETH'), owner, toBytes32()];

					behaviors.whenInstantiated({ owner }, () => {
						// as we aren't calling as Synthetix, we need to mock the check for synths
						behaviors.whenMockedToAllowChecks(() => {
							it('it reverts when called by regular accounts', async () => {
								await onlyGivenAddressCanInvoke({
									fnc: this.instance.exchangeWithVirtual,
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
									this.instance.exchangeWithVirtual(
										...args.concat({ from: this.mocks.Synthetix.address })
									),
									'Src/dest rate invalid or not found'
								);
							});
							behaviors.whenMockedWithExchangeRatesValidity({ valid: true }, () => {
								behaviors.whenMockedWithNoPriorExchangesToSettle(() => {
									behaviors.whenMockedWithUintSystemSetting(
										{ setting: 'waitingPeriodSecs', value: '0' },
										() => {
											behaviors.whenMockedEffectiveRateAsEqual(() => {
												behaviors.whenMockedLastNRates(() => {
													behaviors.whenMockedASynthToIssueAndBurn(() => {
														behaviors.whenMockedExchangeStatePersistance(() => {
															it('it reverts trying to create a virtual synth with no supply', async () => {
																await assert.revert(
																	this.instance.exchangeWithVirtual(
																		owner,
																		toBytes32('sUSD'),
																		'0',
																		toBytes32('sETH'),
																		owner,
																		toBytes32(),
																		{ from: this.mocks.Synthetix.address }
																	),
																	'Zero amount'
																);
															});
															it('it reverts trying to virtualize into an inverse synth', async () => {
																await assert.revert(
																	this.instance.exchangeWithVirtual(
																		owner,
																		toBytes32('sUSD'),
																		'100',
																		toBytes32('iETH'),
																		owner,
																		toBytes32(),
																		{ from: this.mocks.Synthetix.address }
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
					});
				});

				behaviors.whenInstantiated({ owner }, () => {
					behaviors.whenMockedWithExchangeRatesValidity({ valid: true }, () => {
						behaviors.whenMockedWithNoPriorExchangesToSettle(() => {
							behaviors.whenMockedWithUintSystemSetting(
								{ setting: 'waitingPeriodSecs', value: '0' },
								() => {
									behaviors.whenMockedEffectiveRateAsEqual(() => {
										behaviors.whenMockedLastNRates(() => {
											behaviors.whenMockedASynthToIssueAndBurn(() => {
												behaviors.whenMockedExchangeStatePersistance(() => {
													describe('when invoked', () => {
														let txn;
														const amount = '101';
														beforeEach(async () => {
															txn = await this.instance.exchangeWithVirtual(
																owner,
																toBytes32('sUSD'),
																amount,
																toBytes32('sETH'),
																owner,
																toBytes32(),
																{ from: this.mocks.Synthetix.address }
															);
														});
														it('emits a VirtualSynthCreated event with the correct underlying synth and amount', async () => {
															assert.eventEqual(txn, 'VirtualSynthCreated', {
																synth: this.mocks.synth.smocked.proxy.will.returnValue,
																currencyKey: toBytes32('sETH'),
																amount,
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
			});
		});
	});
});
