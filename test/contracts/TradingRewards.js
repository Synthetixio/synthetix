const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { mockToken } = require('./setup');
const { toWei, toBN } = web3.utils;
const { toUnit } = require('../utils')();
const helper = require('./TradingRewards.helper');

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

	let token, rewards;

	function itHasConsistentState() {
		describe('when checking general state', () => {
			before(async () => {
				helper.describe(); // Uncomment to visualize state changes
			});

			it('reports the expected current period id', async () => {
				assert.bnEqual(helper.data.currentPeriodID, await rewards.getCurrentPeriod());
			});

			it('reports the expected total rewards balance', async () => {
				assert.bnEqual(helper.data.rewardsBalance, await token.balanceOf(rewards.address));
			});

			it('reports the expected available rewards balance', async () => {
				assert.bnEqual(helper.data.availableRewards, await rewards.getAvailableRewards());
			});
		});
	};

	function itHasConsistentStateForPeriod({ periodID }) {
		describe(`when checking state for period ${periodID}`, () => {
			// Recorded fees (whole period)
			it(`correctly tracks total fees for period ${periodID}`, async () => {
				const period = helper.data.periods[periodID];

				assert.bnEqual(period.recordedFees, await rewards.getPeriodRecordedFees(periodID));
			});

			// Total rewards (whole period)
			it(`remembers total rewards for period ${periodID}`, async () => {
				const period = helper.data.periods[periodID];

				assert.bnEqual(period.totalRewards, await rewards.getPeriodTotalRewards(periodID));
			});

			// Available rewards (whole period)
			it(`tracks the available rewards for period ${periodID}`, async () => {
				const period = helper.data.periods[periodID];

				assert.bnEqual(period.availableRewards, await rewards.getPeriodAvailableRewards(periodID));
			});

			// Claimable
			it(`correctly reports if period ${periodID} is claimable`, async () => {
				if (periodID === 0) {
					assert.isNotTrue(await rewards.getPeriodIsClaimable(0));
				} else {
					const currentPeriodID = (await rewards.getCurrentPeriod()).toNumber();

					if (periodID === currentPeriodID) {
						assert.isNotTrue(await rewards.getPeriodIsClaimable(periodID));
					} else {
						assert.isTrue(await rewards.getPeriodIsClaimable(periodID));
					}
				}
			});

			// Recorded fees (per account)
			it(`correctly records fees for each account for period ${periodID}`, async () => {
				const period = helper.data.periods[periodID];

				for (const account of accounts) {
					const localRecord = period.recordedFeesForAccount[account] || toBN(0);

					assert.bnEqual(
						localRecord,
						await rewards.getUnaccountedFeesForAccountForPeriod(account, periodID)
					);
				}
			});

			// Available rewards (per account)
			it(`reports the correct available rewards per account for period ${periodID}`, async () => {
				for (const account of accounts) {
					const expectedReward = helper.calculateRewards({ account, periodID });

					assert.bnEqual(
						expectedReward,
						await rewards.getAvailableRewardsForAccountForPeriod(account, periodID)
					);
				}
			});
		});
	};

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
			({ token } = await mockToken({
				accounts,
				name: 'Rewards Token',
				symbol: 'RWD',
				supply: rewardsTokenTotalSupply,
			}));
		});

		it('has the expected parameters', async () => {
			assert.equal('18', await token.decimals());
			assert.equal(toWei(rewardsTokenTotalSupply), await token.totalSupply());
			assert.equal(toWei(rewardsTokenTotalSupply), await token.balanceOf(owner));
		});

		describe('when the TradingRewards contract is deployed', () => {
			before('deploy rewards contract', async () => {
				rewards = await TradingRewards.new(owner, token.address, periodController, mockResolverAddress, {
					from: deployerAccount,
				});
			});

			it('has the expected parameters', async () => {
				assert.equal(token.address, await rewards.getRewardsToken());
				assert.equal(periodController, await rewards.getPeriodController());
				assert.equal(owner, await rewards.owner());
			});

			itHasConsistentState();
			itHasConsistentStateForPeriod({ periodID: 0 });

			// describe.skip('when 10000 reward tokens are transferred to the contract', () => {
			// 	before('transfer the reward tokens to the contract', async () => {
			// 		await helper.depositRewards({ amount: 10000, token, rewards, owner });
			// 	});

			// 	it('holds the transferred tokens', async () => {
			// 		assert.equal(toWei('10000'), await token.balanceOf(rewards.address));
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
			// 			before('record fees', async () => {
			// 				await helper.recordFee({ rewards, account: account1, fee: 10, periodID: 1 });
			// 				await helper.recordFee({ rewards, account: account2, fee: 130, periodID: 1 });
			// 				await helper.recordFee({ rewards, account: account3, fee: 4501, periodID: 1 });
			// 				await helper.recordFee({ rewards, account: account4, fee: 1337, periodID: 1 });
			// 				await helper.recordFee({ rewards, account: account5, fee: 1, periodID: 1 });
			// 			});

			// 			itHasConsistentStateForPeriod({ rewards, accounts, periodID: 1 });

			// 			// TODO
			// 			// it('reverts when any of the accounts attempt to withdraw from period 0', async () => {
			// 			// });

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
			// 											await rewards.getAvailableRewardsForAccountForPeriods(account4, [1, 2]),
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
