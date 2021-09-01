'use strict';

const { artifacts, contract } = require('hardhat');
const { smockit } = require('@eth-optimism/smock');
const {
	utils: { parseEther },
} = require('ethers');
const { assert } = require('./common');

const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	prepareSmocks,
} = require('./helpers');

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
		let synth;
		beforeEach(async () => {
			({ mocks: this.mocks, resolver: this.resolver } = await prepareSmocks({
				contracts: ['Issuer', 'Synth:SynthsUSD'],
				accounts: accounts.slice(10), // mock using accounts after the first few
			}));
		});
		beforeEach(async () => {
			synth = await smockit(artifacts.require('ERC20').abi);
		});
		beforeEach(async () => {
			instance = await SynthRedeemer.new(this.resolver.address);
			await instance.rebuildCache();
		});
		it('by default there are no obvious redemptions', async () => {
			assert.equal(await instance.redemptions(ZERO_ADDRESS), '0');
		});
		describe('deprecate()', () => {
			it('may only be called by the Issuer', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.deprecate,
					args: [synth.address, parseEther('100'), '1'],
					address: this.mocks['Issuer'].address,
					accounts,
					reason: 'Restricted to Issuer contract',
				});
			});

			describe('when successfully executed', () => {
				let txn;

				beforeEach(async () => {
					txn = await instance.deprecate(synth.address, parseEther('10'), parseEther('999'), {
						from: this.mocks['Issuer'].address,
					});
				});
				it('updates the redemption with the supplied rate', async () => {
					assert.bnEqual(await instance.redemptions(synth.address), parseEther('10'));
				});

				it('emits the correct event', async () => {
					assert.eventEqual(txn, 'SynthDeprecated', {
						synth: synth.address,
						rateToRedeem: parseEther('10'),
						totalSynthSupply: parseEther('999'),
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
					synth.smocked.totalSupply.will.return.with(parseEther('1000'));
				});

				it('deprecation fails when insufficient sUSD supply', async () => {
					await assert.revert(
						instance.deprecate(synth.address, parseEther('1000'), '1', {
							from: this.mocks['Issuer'].address,
						}),
						'sUSD must first be supplied'
					);
				});

				describe('when there is sufficient sUSD for the synth to be deprecated', () => {
					beforeEach(async () => {
						// smock sUSD balance to prevent the deprecation failing
						this.mocks['SynthsUSD'].smocked.balanceOf.will.return.with(parseEther('2000'));
					});
					it('then deprecation succeeds', async () => {
						await instance.deprecate(synth.address, parseEther('2'), '1', {
							from: this.mocks['Issuer'].address,
						});
					});
				});
			});

			describe('when a synth is deprecated', () => {
				beforeEach(async () => {
					await instance.deprecate(synth.address, parseEther('100'), '1', {
						from: this.mocks['Issuer'].address,
					});
				});
				it('then it cannot be deprecated again', async () => {
					await assert.revert(
						instance.deprecate(synth.address, parseEther('5'), '1', {
							from: this.mocks['Issuer'].address,
						}),
						'Synth is already deprecated'
					);
				});
			});
		});
		describe('totalSupply()', () => {
			it('is 0 when no total supply of the underlying synth', async () => {
				assert.equal(await instance.totalSupply(synth.address), '0');
			});

			describe('when a synth is deprecated', () => {
				beforeEach(async () => {
					await instance.deprecate(synth.address, parseEther('100'), '1', {
						from: this.mocks['Issuer'].address,
					});
				});
				it('total supply is still 0 as no total supply of the underlying synth', async () => {
					assert.equal(await instance.totalSupply(synth.address), '0');
				});
			});

			describe('when the synth has some supply', () => {
				beforeEach(async () => {
					synth.smocked.totalSupply.will.return.with(parseEther('1000'));
				});
				it('then totalSupply returns 0 as there is no redemption rate', async () => {
					assert.equal(await instance.totalSupply(synth.address), '0');
				});
				describe('when a synth is deprecated', () => {
					beforeEach(async () => {
						// smock sUSD balance to prevent the deprecation failing
						this.mocks['SynthsUSD'].smocked.balanceOf.will.return.with(parseEther('2000'));
						await instance.deprecate(synth.address, parseEther('2'), '1', {
							from: this.mocks['Issuer'].address,
						});
					});
					it('total supply will be the synth supply multipled by the redemption rate', async () => {
						assert.bnEqual(await instance.totalSupply(synth.address), parseEther('2000'));
					});
				});
			});
		});
	});
});
