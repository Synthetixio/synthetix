'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');

const { assert } = require('./common');

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

const { divideDecimal } = require('../utils')();

const trimUtf8EscapeChars = input => web3.utils.hexToAscii(web3.utils.utf8ToHex(input));

const VirtualSynth = artifacts.require('VirtualSynth');

contract('VirtualSynth (unit tests)', async accounts => {
	const [, owner] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: VirtualSynth.abi,
			ignoreParents: ['ERC20'],
			expected: ['settle'],
		});
	});

	describe('with common setup', () => {
		// ensure all of the behaviors are bound to "this" for sharing test state
		const behaviors = require('./VirtualSynth.behaviors').call(this, { accounts });

		describe('constructor', () => {
			const amount = '1001';
			behaviors.whenInstantiated({ amount, user: owner, synth: 'sBTC' }, () => {
				it('then each constructor arg is set correctly', async () => {
					assert.equal(trimUtf8EscapeChars(await this.instance.name()), 'Virtual Synth sBTC');
					assert.equal(trimUtf8EscapeChars(await this.instance.symbol()), 'vsBTC');
					assert.equal(await this.instance.decimals(), '18');
				});

				it('and the user is minted the total supply', async () => {
					assert.equal(await this.instance.totalSupply(), amount);
					assert.equal(await this.instance.balanceOf(owner), amount);
				});

				it('and a transfer event was emitted to the user', async () => {
					const [evt] = await this.instance.getPastEvents();

					assert.equal(evt.event, 'Transfer');
					assert.equal(evt.args.from, ZERO_ADDRESS);
					assert.equal(evt.args.to, owner);
					assert.equal(evt.args.value.toString(), amount);
				});

				it('settled is false by default', async () => {
					assert.equal(await this.instance.settled(), false);
				});
			});
		});

		describe('balanceOfUnderlying()', () => {
			const amount = '1200';
			behaviors.whenInstantiated({ amount, user: owner }, () => {
				behaviors.whenMockedSynthBalance({ balanceOf: amount }, () => {
					it('then balance underlying must match the balance', async () => {
						assert.equal(await this.instance.balanceOfUnderlying(owner), amount);
					});
				});
				behaviors.whenMockedSynthBalance({ balanceOf: amount / 2 }, () => {
					it('then balance underlying must be half the balance', async () => {
						assert.equal((await this.instance.balanceOfUnderlying(owner)).toString(), amount / 2);
					});
					behaviors.whenUserTransfersAwayTokens({ amount: amount / 2, from: owner }, () => {
						it('then balance underlying must be quarter the balance', async () => {
							assert.equal((await this.instance.balanceOfUnderlying(owner)).toString(), amount / 4);
						});
						behaviors.whenUserTransfersAwayTokens({ amount: amount / 3, from: owner }, () => {
							it('then balance underlying must be a twelth of the balance', async () => {
								assert.equal(
									(await this.instance.balanceOfUnderlying(owner)).toString(),
									amount / 12
								);
							});
						});
					});
					behaviors.whenUserTransfersAwayTokens({ amount: amount / 3, from: owner }, () => {
						it('then balance underlying must be a third of the balance', async () => {
							assert.equal((await this.instance.balanceOfUnderlying(owner)).toString(), amount / 3);
						});
					});
				});
			});
		});

		describe('rate()', () => {
			const amount = '1200';
			behaviors.whenInstantiated({ amount, user: owner }, () => {
				behaviors.whenMockedSynthBalance({ balanceOf: amount }, () => {
					describe('pre-settlement', () => {
						behaviors.whenMockedSettlementOwing({}, () => {
							it('then the rate must be even', async () => {
								assert.equal(await this.instance.rate(), (1e18).toString());
							});
						});
						behaviors.whenMockedSettlementOwing({ reclaim: 200 }, () => {
							it('then the rate must be 10/12 (with 18 decimals)', async () => {
								assert.bnEqual(await this.instance.rate(), divideDecimal(10, 12));
							});
						});
						behaviors.whenMockedSettlementOwing({ rebate: 300 }, () => {
							it('then the rate must be 15/12 (with 18 decimals)', async () => {
								assert.bnEqual(await this.instance.rate(), divideDecimal(15, 12));
							});
							behaviors.whenUserTransfersAwayTokens({ amount: '300', from: owner }, () => {
								it('then the rate must still be 15/12 (with 18 decimals)', async () => {
									assert.bnEqual(await this.instance.rate(), divideDecimal(15, 12));
								});
								behaviors.whenSettlementCalled({ user: owner }, () => {
									// Not working
									xit('then the rate must still be 15/12 (with 18 decimals) as supply still exists', async () => {
										assert.bnEqual(await this.instance.rate(), divideDecimal(15, 12));
									});
								});
							});
						});
					});

					behaviors.whenSettlementCalled({ user: owner }, () => {
						it('then the rate shows 0 as no more supply', async () => {
							assert.equal(await this.instance.rate(), '0');
						});
					});
				});
			});
		});

		describe('secsLeftInWaitingPeriod()', () => {});

		describe('readyToSettle()', () => {});

		describe('settled()', () => {});
	});
});
