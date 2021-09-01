'use strict';

const { artifacts, contract, web3 } = require('hardhat');
const { smockit } = require('@eth-optimism/smock');

const { assert } = require('./common');

const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	prepareSmocks,
} = require('./helpers');

const { toUnit } = require('../utils')();

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

let SynthRedeemer;

contract('SynthRedeemer (unit tests)', async accounts => {
	// const [, owner] = accounts;

	before(async () => {
		SynthRedeemer = artifacts.require('SynthRedeemer');
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SynthRedeemer.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['deprecate', 'redeem', 'redeemPartial'],
		});
	});

	describe('when a contract is instantiated', () => {
		let instance;
		beforeEach(async () => {
			({ mocks: this.mocks, resolver: this.resolver } = await prepareSmocks({
				contracts: ['Issuer', 'Synth:SynthsUSD'],
				accounts: accounts.slice(10), // mock using accounts after the first few
			}));
		});

		before(async () => {
			// SynthRedeemer.link(await artifacts.require('SafeDecimalMath').new());
		});
		beforeEach(async () => {
			instance = await SynthRedeemer.new(this.resolver.address);
			await instance.rebuildCache();
		});
		it('by default there are no obvious redemptions', async () => {
			assert.equal(await instance.redemptions(ZERO_ADDRESS), '0');
		});
		describe('deprecate()', () => {
			let synth;
			beforeEach(async () => {
				synth = await smockit(artifacts.require('ERC20').abi);
			});

			it('may only be called by the Issuer', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.deprecate,
					args: [synth.address, toUnit('100'), '1'],
					address: this.mocks['Issuer'].address,
					accounts,
					reason: 'Restricted to Issuer contract',
				});
			});

			describe('when successfully executed', () => {
				let txn;

				beforeEach(async () => {
					txn = await instance.deprecate(synth.address, toUnit('10'), toUnit('999'), {
						from: this.mocks['Issuer'].address,
					});
				});
				it('updates the redemption with the supplied rate', async () => {
					assert.bnEqual(await instance.redemptions(synth.address), toUnit('10'));
				});

				it('emits the correct event', async () => {
					assert.eventEqual(txn, 'SynthDeprecated', {
						synth: synth.address,
						rateToRedeem: toUnit('10'),
						totalSynthSupply: toUnit('999'),
					});
				});
			});

			it('reverts when the rate is 0', async () => {
				await assert.revert(
					instance.deprecate(synth.address, '0', '1', {
						from: this.mocks['Issuer'].address,
					}),
					'No rate for synth to redeem'
				);
			});

			describe('when the synth has some supply', () => {
				beforeEach(async () => {
					synth.smocked.totalSupply.will.return.with('1000');
				});

				it('deprecation fails when insufficient sUSD supply', async () => {
					await assert.revert(
						instance.deprecate(synth.address, toUnit('1000'), '1', {
							from: this.mocks['Issuer'].address,
						}),
						'sUSD must first be supplied'
					);
				});
			});

			describe('when a synth is deprecated', () => {
				beforeEach(async () => {
					await instance.deprecate(synth.address, toUnit('100'), '1', {
						from: this.mocks['Issuer'].address,
					});
				});
				it('then it cannot be deprecated again', async () => {
					await assert.revert(
						instance.deprecate(synth.address, toUnit('5'), '1', {
							from: this.mocks['Issuer'].address,
						}),
						'Synth is already deprecated'
					);
				});
			});
		});
	});
});
