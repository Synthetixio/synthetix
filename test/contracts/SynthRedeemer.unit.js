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
	const [account1] = accounts;

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
					it('total supply will be the synth supply multiplied by the redemption rate', async () => {
						assert.bnEqual(await instance.totalSupply(synth.address), parseEther('2000'));
					});
				});
			});
		});
		describe('balanceOf()', () => {
			it('is 0 when no balance of the underlying synth', async () => {
				assert.equal(await instance.balanceOf(synth.address, account1), '0');
			});

			describe('when a synth is deprecated', () => {
				beforeEach(async () => {
					await instance.deprecate(synth.address, parseEther('100'), '1', {
						from: this.mocks['Issuer'].address,
					});
				});
				it('balance of is still 0 as no total supply of the underlying synth', async () => {
					assert.equal(await instance.balanceOf(synth.address, account1), '0');
				});
			});

			describe('when the synth has some balance', () => {
				beforeEach(async () => {
					synth.smocked.balanceOf.will.return.with(parseEther('5'));
				});
				it('then balance of still returns 0 as there is no redemption rate', async () => {
					assert.equal(await instance.balanceOf(synth.address, account1), '0');
				});
				describe('when a synth is deprecated', () => {
					beforeEach(async () => {
						// smock sUSD balance to prevent the deprecation failing
						this.mocks['SynthsUSD'].smocked.balanceOf.will.return.with(parseEther('2000'));
						await instance.deprecate(synth.address, parseEther('2'), '1', {
							from: this.mocks['Issuer'].address,
						});
					});
					it('balance of will be the synth supply multiplied by the redemption rate', async () => {
						assert.bnEqual(await instance.balanceOf(synth.address, account1), parseEther('10'));
					});
				});
			});
		});
		describe('redemption', () => {
			describe('redeem()', () => {
				it('reverts when synth not redeemable', async () => {
					await assert.revert(
						instance.redeem(synth.address, {
							from: account1,
						}),
						'Synth not redeemable'
					);
				});

				describe('when synth marked for redemption', () => {
					beforeEach(async () => {
						// smock sUSD balance to prevent the deprecation failing
						this.mocks['SynthsUSD'].smocked.balanceOf.will.return.with(parseEther('2000'));
						await instance.deprecate(synth.address, parseEther('2'), '1', {
							from: this.mocks['Issuer'].address,
						});
					});
					it('redemption reverts when user has no balance', async () => {
						await assert.revert(
							instance.redeem(synth.address, {
								from: account1,
							}),
							'No balance of synth to redeem'
						);
					});
					describe('when the user has a synth balance', () => {
						let userBalance;
						beforeEach(async () => {
							userBalance = parseEther('5');
							synth.smocked.balanceOf.will.return.with(userBalance);
						});
						describe('when redemption is called by the user', () => {
							let txn;
							beforeEach(async () => {
								txn = await instance.redeem(synth.address, { from: account1 });
							});
							it('then Issuer.burnForRedemption is called with the correct arguments', async () => {
								assert.equal(this.mocks['Issuer'].smocked.burnForRedemption.calls.length, 1);
								assert.equal(
									this.mocks['Issuer'].smocked.burnForRedemption.calls[0][0],
									synth.address
								);
								assert.equal(this.mocks['Issuer'].smocked.burnForRedemption.calls[0][1], account1);
								assert.bnEqual(
									this.mocks['Issuer'].smocked.burnForRedemption.calls[0][2],
									userBalance
								);
							});
							it('transfers the correct amount of sUSD to the user', async () => {
								assert.equal(this.mocks['SynthsUSD'].smocked.transfer.calls.length, 1);
								assert.equal(this.mocks['SynthsUSD'].smocked.transfer.calls[0][0], account1);
								assert.bnEqual(
									this.mocks['SynthsUSD'].smocked.transfer.calls[0][1],
									parseEther('10') // 5 units deprecated at price 2 is 10
								);
							});
							it('emitting a SynthRedeemed event', async () => {
								assert.eventEqual(txn, 'SynthRedeemed', {
									synth: synth.address,
									account: account1,
									amountOfSynth: userBalance,
									amountInsUSD: parseEther('10'),
								});
							});
						});
					});
				});
			});
			describe('redeemPartial()', () => {
				it('reverts when synth not redeemable', async () => {
					await assert.revert(
						instance.redeemPartial(synth.address, parseEther('1'), {
							from: account1,
						}),
						'Synth not redeemable'
					);
				});

				describe('when synth marked for redemption', () => {
					beforeEach(async () => {
						// smock sUSD balance to prevent the deprecation failing
						this.mocks['SynthsUSD'].smocked.balanceOf.will.return.with(parseEther('2000'));
						await instance.deprecate(synth.address, parseEther('2'), '1', {
							from: this.mocks['Issuer'].address,
						});
					});
					it('partial redemption reverts when user has no balance', async () => {
						await assert.revert(
							instance.redeemPartial(synth.address, parseEther('1'), {
								from: account1,
							}),
							'Insufficient balance'
						);
					});
					describe('when the user has a synth balance', () => {
						let userBalance;
						beforeEach(async () => {
							userBalance = parseEther('5');
							synth.smocked.balanceOf.will.return.with(userBalance);
						});
						describe('when partial redemption is called by the user', () => {
							let txn;
							beforeEach(async () => {
								txn = await instance.redeemPartial(synth.address, parseEther('1'), {
									from: account1,
								});
							});
							it('then Issuer.burnForRedemption is called with the correct arguments', async () => {
								assert.equal(this.mocks['Issuer'].smocked.burnForRedemption.calls.length, 1);
								assert.equal(
									this.mocks['Issuer'].smocked.burnForRedemption.calls[0][0],
									synth.address
								);
								assert.equal(this.mocks['Issuer'].smocked.burnForRedemption.calls[0][1], account1);
								assert.bnEqual(
									this.mocks['Issuer'].smocked.burnForRedemption.calls[0][2],
									parseEther('1')
								);
							});
							it('transfers the correct amount of sUSD to the user', async () => {
								assert.equal(this.mocks['SynthsUSD'].smocked.transfer.calls.length, 1);
								assert.equal(this.mocks['SynthsUSD'].smocked.transfer.calls[0][0], account1);
								assert.bnEqual(
									this.mocks['SynthsUSD'].smocked.transfer.calls[0][1],
									parseEther('2') // 1 units deprecated at price 2 is 2
								);
							});
							it('emitting a SynthRedeemed event', async () => {
								assert.eventEqual(txn, 'SynthRedeemed', {
									synth: synth.address,
									account: account1,
									amountOfSynth: parseEther('1'),
									amountInsUSD: parseEther('2'),
								});
							});
						});
					});
				});
			});
		});
	});
});
