const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { mockToken } = require('./setup');
const { toWei } = web3.utils;
const { toUnit } = require('../utils')();
const helper = require('./TradingRewards.helper');
const {
	itHasConsistentState,
	itHasConsistentStateForPeriod,
} = require('./TradingRewards.behaviors');

const TradingRewards = artifacts.require('TradingRewards');
const MockTradingRewards = artifacts.require('MockTradingRewards');

/*
 	* TradingRewards unit tests test the contract in a standalone manner,
 	* i.e. not integrated with the rest of the system.  These tests focus
 	* on the inner functionlity of the contract without
 	* having to worry about anything else in the system.
 	*
 	* It's dependency on Exchanger is replaced in MockTradingRewards,
 	* which basically does not implement the onlyExchanger modifier.
 	* */
contract('TradingRewards (unit tests)', accounts => {
	const [
		deployerAccount,
		owner,
		periodController,
		account1,
		account2,
		account3,
		account4,
		account5,
		account6,
		account7,
	] = accounts;

	const rewardsTokenTotalSupply = '1000000';

	const mockAddress = '0x0000000000000000000000000000000000000001';

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: TradingRewards.abi,
			hasFallback: true,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver'],
			expected: [
				'claimRewardsForPeriod',
				'claimRewardsForPeriods',
				'closeCurrentPeriodWithRewards',
				'recordExchangeFeeForAccount',
				'setPeriodController',
				'recoverTokens',
				'recoverFreeRewardTokens',
				'recoverAllLockedRewardTokensFromPeriod',
				'recoverEther',
			],
		});
	});

	describe('when deploying a TradingRewards contract without setting up its address resolver', () => {
		before('deploy rewards contract', async () => {
			this.rewards = await TradingRewards.new(
				owner,
				mockAddress,
				mockAddress,
				mockAddress,
				{
					from: deployerAccount,
				}
			);
		});

		it('reverts when trying to record a fee', async () => {
			await assert.revert(
				this.rewards.recordExchangeFeeForAccount('1', mockAddress),
				'Missing Exchanger address'
			);
		});
	});

	describe('when deploying a rewards token', () => {
		before('deploy rewards token', async () => {
			({ token: this.token } = await mockToken({
				accounts,
				name: 'Rewards Token',
				symbol: 'RWD',
				supply: rewardsTokenTotalSupply,
			}));

			helper.incrementExpectedBalance(owner, rewardsTokenTotalSupply);
		});

		it('has the expected parameters', async () => {
			assert.equal('18', await this.token.decimals());
			assert.equal(toWei(rewardsTokenTotalSupply), await this.token.totalSupply());
			assert.equal(toWei(rewardsTokenTotalSupply), await this.token.balanceOf(owner));
		});

		 // MockTradingRewards does not enforce onlyExchanger modifier
		describe('when a MockTradingRewards contract is deployed', () => {
			before('deploy rewards contract', async () => {
				this.rewards = await MockTradingRewards.new(
					owner,
					this.token.address,
					periodController,
					mockAddress,
					{
						from: deployerAccount,
					}
				);
			});

			it('has the expected parameters', async () => {
				assert.equal(this.token.address, await this.rewards.getRewardsToken());
				assert.equal(periodController, await this.rewards.getPeriodController());
				assert.equal(owner, await this.rewards.owner());
			});

			itHasConsistentState({ ctx: this, accounts });
			itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });

			describe('when any address attempts to record fees', () => {
				before(async () => {
					await helper.takeSnapshot();
				});

				it('allows any address to record a fee (since this is a mock contract)', async () => {
					await this.rewards.recordExchangeFeeForAccount('1', account6, { from: account6 });
				});

				after(async () => {
					await helper.restoreSnapshot();
				});
			});

			describe('when fees are recorded in period 0', () => {
				before('record some fees in period 0', async () => {
					await helper.recordFee({
						rewards: this.rewards,
						account: account1,
						fee: 10,
						periodID: 0,
					});
					await helper.recordFee({
						rewards: this.rewards,
						account: account2,
						fee: 130,
						periodID: 0,
					});
					await helper.recordFee({
						rewards: this.rewards,
						account: account3,
						fee: 4501,
						periodID: 0,
					});
					await helper.recordFee({
						rewards: this.rewards,
						account: account4,
						fee: 1337,
						periodID: 0,
					});
					await helper.recordFee({
						rewards: this.rewards,
						account: account5,
						fee: 42,
						periodID: 0,
					});
					await helper.recordFee({
						rewards: this.rewards,
						account: account5, // account5 records again
						fee: 1000,
						periodID: 0,
					});
				});

				itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });

				it('reverts when any of the accounts attempt to claim rewards from period 0', async () => {
					await assert.revert(
						this.rewards.claimRewardsForPeriod(0, { from: account1 }),
						'Period is not finalized'
					);
					await assert.revert(
						this.rewards.claimRewardsForPeriod(0, { from: account3 }),
						'Period is not finalized'
					);
				});

				it('reverts when any account attempts to close the current period', async () => {
					await assert.revert(
						this.rewards.closeCurrentPeriodWithRewards('42', { from: account1 }),
						'Caller not period controller'
					);
				});

				it('reverts if the period is attempted to be closed with insufficient balance', async () => {
					await assert.revert(
						this.rewards.closeCurrentPeriodWithRewards('42', { from: periodController }),
						'Insufficient free rewards'
					);
				});

				describe('when 10000 reward tokens are transferred to the contract', () => {
					const rewardsPeriod0 = '10000';

					before('transfer reward tokens to the contract', async () => {
						await helper.depositRewards({
							amount: rewardsPeriod0,
							token: this.token,
							rewards: this.rewards,
							owner,
						});

						helper.incrementExpectedBalance(owner, `-${rewardsPeriod0}`);
					});

					it('holds the transferred tokens', async () => {
						assert.equal(toWei(rewardsPeriod0), await this.token.balanceOf(this.rewards.address));
					});

					it('still reverts when any account attempts to close period 0', async () => {
						await assert.revert(
							this.rewards.closeCurrentPeriodWithRewards('10', { from: account1 }),
							'Caller not period controller'
						);
					});

					itHasConsistentState({ ctx: this, accounts });

					describe('when period 0 is closed and period 1 is created', () => {
						before('create the period', async () => {
							await helper.createPeriod({
								amount: rewardsPeriod0,
								rewards: this.rewards,
								periodController,
							});
						});

						itHasConsistentState({ ctx: this, accounts });

						describe('when claiming all rewards for period 0', () => {
							before(async () => {
								await helper.takeSnapshot();
							});

							before('claim rewards by all accounts that recorded fees in period 0', async () => {
								await helper.claimRewards({
									rewards: this.rewards,
									account: account1,
									periodID: 0,
								});
								await helper.claimRewards({
									rewards: this.rewards,
									account: account2,
									periodID: 0,
								});
								await helper.claimRewards({
									rewards: this.rewards,
									account: account3,
									periodID: 0,
								});
								await helper.claimRewards({
									rewards: this.rewards,
									account: account4,
									periodID: 0,
								});
								await helper.claimRewards({
									rewards: this.rewards,
									account: account5,
									periodID: 0,
								});
							});

							after(async () => {
								await helper.restoreSnapshot();
							});

							itHasConsistentState({ ctx: this, accounts });
							itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });

							it('reverts if accounts that claimed attempt to claim again', async () => {
								await assert.revert(
									this.rewards.claimRewardsForPeriod(0, { from: account1 }),
									'No rewards available'
								);
								await assert.revert(
									this.rewards.claimRewardsForPeriod(0, { from: account2 }),
									'No rewards available'
								);
							});

							it('reverts if accounts that did not record fees attempt to claim', async () => {
								await assert.revert(
									this.rewards.claimRewardsForPeriod(0, { from: account6 }),
									'No rewards available'
								);
								await assert.revert(
									this.rewards.claimRewardsForPeriod(0, { from: account7 }),
									'No rewards available'
								);
							});
						});

						describe('when fees are recorded in period 1', () => {
							before('record some fees in period 1', async () => {
								await helper.recordFee({
									rewards: this.rewards,
									account: account1,
									fee: 1500,
									periodID: 1,
								});
								await helper.recordFee({
									rewards: this.rewards,
									account: account2,
									fee: 7000,
									periodID: 1,
								});
								await helper.recordFee({
									rewards: this.rewards,
									account: account3,
									fee: 500,
									periodID: 1,
								});
								await helper.recordFee({
									rewards: this.rewards,
									account: account4,
									fee: 1000,
									periodID: 1,
								});
							});

							itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });
							itHasConsistentStateForPeriod({ periodID: 1, ctx: this, accounts });

							it('reverts when any of the accounts attempt to claim rewards from period 1', async () => {
								await assert.revert(
									this.rewards.claimRewardsForPeriod(1, { from: account1 }),
									'Period is not finalized'
								);
								await assert.revert(
									this.rewards.claimRewardsForPeriod(1, { from: account3 }),
									'Period is not finalized'
								);
							});

							describe('when partially claiming rewards for period 0', () => {
								before('claim rewards by all accounts that recorded fees in period 0', async () => {
									await helper.claimRewards({
										rewards: this.rewards,
										account: account1,
										periodID: 0,
									});
									await helper.claimRewards({
										rewards: this.rewards,
										account: account2,
										periodID: 0,
									});
									await helper.claimRewards({
										rewards: this.rewards,
										account: account3,
										periodID: 0,
									});
								});

								itHasConsistentState({ ctx: this, accounts });
								itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });

								it('reverts if the period is attempted to be closed with insufficient balance', async () => {
									await assert.revert(
										this.rewards.closeCurrentPeriodWithRewards('100', { from: periodController }),
										'Insufficient free rewards'
									);
								});

								describe('when 50000 reward tokens are transferred to the contract', () => {
									const rewardsPeriod1 = '50000';

									before('transfer reward tokens to the contract', async () => {
										await helper.depositRewards({
											amount: rewardsPeriod1,
											token: this.token,
											rewards: this.rewards,
											owner,
										});

										helper.incrementExpectedBalance(owner, `-${rewardsPeriod1}`);
									});

									describe('when period 1 is closed and period 2 is created', () => {
										before('create the period', async () => {
											await helper.createPeriod({
												amount: rewardsPeriod1,
												rewards: this.rewards,
												periodController,
											});
										});

										itHasConsistentState({ ctx: this, accounts });

										it('properly reports accumulated available rewards', async () => {
											assert.bnEqual(
												await this.rewards.getAvailableRewardsForAccountForPeriods(account4, [
													0,
													1,
												]),
												helper.calculateMultipleRewards({
													account: account4,
													periodIDs: [0, 1],
												})
											);
										});

										it('reverts when an account attempts to claim from multiple periods and it does not have a claim to one of them', async () => {
											// Already claimed period 0
											await assert.revert(
												this.rewards.claimRewardsForPeriods([0, 1], { from: account3 }),
												'No rewards available'
											);
											// Nothing to claim in any period
											await assert.revert(
												this.rewards.claimRewardsForPeriods([0, 1], { from: account7 }),
												'No rewards available'
											);
											// Nothing to claim in period 1
											await assert.revert(
												this.rewards.claimRewardsForPeriods([0, 1], { from: account5 }),
												'No rewards available'
											);
										});

										describe('when accounts claim from multiple periods', () => {
											before(async () => {
												await helper.claimMultipleRewards({
													rewards: this.rewards,
													account: account4,
													periodIDs: [0, 1],
												});
											});

											itHasConsistentState({ ctx: this, accounts });
											itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });
											itHasConsistentStateForPeriod({ periodID: 1, ctx: this, accounts });

											it('reverts when an account attempts to claim from multiple periods again', async () => {
												await assert.revert(
													this.rewards.claimRewardsForPeriods([0, 1], { from: account4 }),
													'No rewards available'
												);
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});
});
