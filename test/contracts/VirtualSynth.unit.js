'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');

const { assert } = require('./common');

const { bindAll, ensureOnlyExpectedMutativeFunctions, prepareSmocks } = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

let behaviors = require('./VirtualSynth.behaviors');

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
		behaviors = bindAll.call(this, { input: behaviors });

		before(async () => {
			// VirtualSynth.link(await artifacts.require('SafeDecimalMath').new());
		});

		beforeEach(async () => {
			({ mocks: this.mocks, resolver: this.resolver } = await prepareSmocks({
				owner,
				contracts: ['Synth', 'Exchanger'],
				accounts: accounts.slice(3), // mock using accounts after the first few
			}));
		});

		describe('constructor', () => {
			const amount = '1001';
			behaviors.whenInstantiated({ amount, owner }, () => {
				it('then each constructor arg is set correctly', async () => {
					this.mocks.Synth.smocked.currencyKey.will.return.with(toBytes32('sBTC'));

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
			});
		});

		describe('balanceOfUnderlying()', () => {
			const amount = '1200';
			behaviors.whenInstantiated({ amount, owner }, () => {
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
	});
});
