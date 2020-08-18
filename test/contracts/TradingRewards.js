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

const TradingRewards = artifacts.require('MockTradingRewards');

contract('TradingRewards', accounts => {
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
	const mockResolverAddress = '0x0000000000000000000000000000000000000001';

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

	describe('when deploying a rewards token', () => {
		before('deploy rewards token', async () => {
			({ token: this.token } = await mockToken({
				accounts,
				name: 'Rewards Token',
				symbol: 'RWD',
				supply: rewardsTokenTotalSupply,
			}));
		});

		it('has the expected parameters', async () => {
			assert.equal('18', await this.token.decimals());
			assert.equal(toWei(rewardsTokenTotalSupply), await this.token.totalSupply());
			assert.equal(toWei(rewardsTokenTotalSupply), await this.token.balanceOf(owner));
		});

		describe('when the TradingRewards contract is deployed', () => {
			before('deploy rewards contract', async () => {
				this.rewards = await TradingRewards.new(owner, this.token.address, periodController, mockResolverAddress, {
					from: deployerAccount,
				});
			});

			it('has the expected parameters', async () => {
				assert.equal(this.token.address, await this.rewards.getRewardsToken());
				assert.equal(periodController, await this.rewards.getPeriodController());
				assert.equal(owner, await this.rewards.owner());
			});

			itHasConsistentState({ ctx: this });
			itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });

			describe('when fees are recorded in period 0', () => {
				before('record some fees', async () => {
					await helper.recordFee({ rewards, account: account1, fee: 10, periodID: 1 });
					await helper.recordFee({ rewards, account: account2, fee: 130, periodID: 1 });
					await helper.recordFee({ rewards, account: account3, fee: 4501, periodID: 1 });
					await helper.recordFee({ rewards, account: account4, fee: 1337, periodID: 1 });
					await helper.recordFee({ rewards, account: account5, fee: 1, periodID: 1 });
				});

				itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });

				it('reverts when any of the accounts attempt to withdraw from period 0', async () => {
					await assert.revert(
						rewards.claimRewardsForPeriod(0, { from: account1 }),
						'Period is not finalized'
					);
					await assert.revert(
						rewards.claimRewardsForPeriod(0, { from: account3 }),
						'Period is not finalized'
					);
				});
			});

			// describe.skip('when 10000 reward tokens are transferred to the contract', () => {
			// 	before('transfer the reward tokens to the contract', async () => {
			// 		await helper.depositRewards({ amount: 10000, token, rewards, owner });
			// 	});

			// 	it('holds the transferred tokens', async () => {
			// 		assert.equal(toWei('10000'), await this.token.balanceOf(rewards.address));
			// 	});

			// 	it('reverts when any account attempts to create a new period', async () => {
			// 		await assert.revert(
			// 			rewards.notifyRewardAmount('10', { from: account1 }),
			// 			'Caller not RewardsDistribution'
			// 		);
			// 	});

			// 	it('reverts when there is not enough rewards balance for the creation of a period', async () => {
			// 		await assert.revert(
			// 			rewards.notifyRewardAmount(toWei('50000'), { from: periodController }),
			// 			'Insufficient free rewards'
			// 		);
			// 	});

			// 	itHasConsistentState({ rewards, token });

			// 	describe.skip('when period 1 is created', () => {
			// 		before('create the period', async () => {
			// 			await helper.createPeriod({
			// 				amount: 10000,
			// 				rewards,
			// 				periodController,
			// 			});
			// 		});

			// 		itHasConsistentState({ rewards, token });
			// 		itHasConsistentStateForPeriod({ rewards, accounts, periodID: 1 });

			// 		describe.skip('when transactions fees are recoded in period 1', () => {
			// 			itHasConsistentStateForPeriod({ rewards, accounts, periodID: 1 });

			// 			describe.skip('when 5000 more reward tokens are transferred to the contract', () => {
			// 				before('transfer the reward tokens to the contract', async () => {
			// 					await helper.depositRewards({ amount: 5000, token, rewards, owner });
			// 				});

			// 				it('reverts if trying to create a period with more rewards than those available', async () => {
			// 					await assert.revert(
			// 						rewards.notifyRewardAmount(toUnit('5001'), {
			// 							from: periodController,
			// 						}),
			// 						'Insufficient free rewards'
			// 					);
			// 				});

			// 				describe.skip('when period 2 is created', () => {
			// 					before('create the period', async () => {
			// 						await helper.createPeriod({
			// 							amount: 5000,
			// 							rewards,
			// 							periodController,
			// 						});
			// 					});

			// 					itHasConsistentState({ rewards, token });
			// 					itHasConsistentStateForPeriod({ rewards, accounts, periodID: 2 });

			// 					describe.skip('when claiming all rewards for period 1', () => {
			// 						before(async () => {
			// 							await helper.takeSnapshot();
			// 						});

			// 						before('claim rewards by all accounts that recorded fees', async () => {
			// 							await helper.claimRewards({ rewards, account: account1, periodID: 1 });
			// 							await helper.claimRewards({ rewards, account: account2, periodID: 1 });
			// 							await helper.claimRewards({ rewards, account: account3, periodID: 1 });
			// 							await helper.claimRewards({ rewards, account: account4, periodID: 1 });
			// 							await helper.claimRewards({ rewards, account: account5, periodID: 1 });
			// 						});

			// 						after(async () => {
			// 							await helper.restoreSnapshot();
			// 						});

			// 						itHasConsistentState({ rewards, token });
			// 						itHasConsistentStateForPeriod({ rewards, accounts, periodID: 1 });
			// 						itHasConsistentStateForPeriod({ rewards, accounts, periodID: 2 });

			// 						it('reverts if accounts that claimed attempt to claim again', async () => {
			// 							await assert.revert(
			// 								rewards.claimRewardsForPeriod(1, { from: account1 }),
			// 								'No rewards claimable'
			// 							);
			// 							await assert.revert(
			// 								rewards.claimRewardsForPeriod(1, { from: account2 }),
			// 								'No rewards claimable'
			// 							);
			// 						});

			// 						it(`reverts when accounts that did not record fees in period 1 attempt to claim rewards`, async () => {
			// 							await assert.revert(
			// 								rewards.claimRewardsForPeriod(1, { from: account6 }),
			// 								'No rewards claimable'
			// 							);
			// 							await assert.revert(
			// 								rewards.claimRewardsForPeriod(1, { from: account7 }),
			// 								'No rewards claimable'
			// 							);
			// 						});
			// 					});

			// 					describe.skip('when partially claiming rewards for period 1', () => {
			// 						before('claim rewards by some accounts that recorded fees', async () => {
			// 							await helper.claimRewards({ rewards, account: account1, periodID: 1 });
			// 							await helper.claimRewards({ rewards, account: account2, periodID: 1 });
			// 							await helper.claimRewards({ rewards, account: account3, periodID: 1 });
			// 							// Note: Intentionally not claiming rewards for account4.
			// 							await helper.claimRewards({ rewards, account: account5, periodID: 1 });
			// 						});

			// 						itHasConsistentState({ rewards, token });
			// 						itHasConsistentStateForPeriod({ rewards, accounts, periodID: 1 });
			// 						itHasConsistentStateForPeriod({ rewards, accounts, periodID: 2 });

			// 						describe.skip('when transaction fees are recoreded in period 2', () => {
			// 							before('record fees', async () => {
			// 								await helper.recordFee({
			// 									rewards,
			// 									account: account4,
			// 									fee: 10000,
			// 									periodID: 2,
			// 								});
			// 								await helper.recordFee({ rewards, account: account6, fee: 42, periodID: 2 });
			// 								await helper.recordFee({ rewards, account: account7, fee: 1, periodID: 2 });
			// 							});

			// 							itHasConsistentState({ rewards, token });
			// 							itHasConsistentStateForPeriod({ rewards, accounts, periodID: 2 });

			// 							describe.skip('when 15000 more reward tokens are transferred to the contract', () => {
			// 								before('transfer the reward tokens to the contract', async () => {
			// 									await helper.depositRewards({ amount: 15000, token, rewards, owner });
			// 								});

			// 								describe.skip('when period 3 is created', () => {
			// 									before('create the period', async () => {
			// 										await helper.createPeriod({
			// 											amount: 15000,
			// 											rewards,
			// 											periodController,
			// 										});
			// 									});

			// 									itHasConsistentState({ rewards, token });
			// 									itHasConsistentStateForPeriod({ rewards, accounts, periodID: 3 });

			// 									it('properly reports accumulated available rewards', async () => {
			// 										assert.bnEqual(
			// 											await this.rewards.getAvailableRewardsForAccountForPeriods(account4, [1, 2]),
			// 											helper.calculateMultipleRewards({
			// 												account: account4,
			// 												periodIDs: [1, 2],
			// 											})
			// 										);
			// 									});

			// 									describe.skip('when some accounts claim rewards on period 2', () => {
			// 										before(async () => {
			// 											await helper.claimRewards({ rewards, account: account6, periodID: 2 });
			// 											await helper.claimRewards({ rewards, account: account7, periodID: 2 });
			// 										});

			// 										itHasConsistentState({ rewards, token });
			// 										itHasConsistentStateForPeriod({ rewards, accounts, periodID: 2 });
			// 									});

			// 									describe('when an account claims rewards for multiple periods', () => {
			// 										before(async () => {
			// 											await helper.claimMultipleRewards({
			// 												rewards,
			// 												account: account4,
			// 												periodIDs: [1, 2],
			// 											});
			// 										});

			// 										itHasConsistentState({ rewards, token });
			// 										itHasConsistentStateForPeriod({ rewards, accounts, periodID: 1 });
			// 										itHasConsistentStateForPeriod({ rewards, accounts, periodID: 2 });
			// 									});
			// 								});
			// 							});
			// 						});
			// 					});
			// 				});
			// 			});
			// 		});
			// 	});
			// });
		});
	});
});
