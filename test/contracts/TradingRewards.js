'use strict';

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { toUnit, divideDecimal, multiplyDecimal } = require('../utils')();
const { mockToken } = require('./setup');
const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toWei } = web3.utils;

const TradingRewards = artifacts.require('TradingRewards');

function calculateRewards(accountFees, totalFees, totalRewards) {
	return multiplyDecimal(toWei(totalRewards), divideDecimal(toWei(accountFees), toWei(totalFees)));
}

contract('TradingRewards', accounts => {
	const [deployerAccount, owner, rewardsDistribution, account1, account2, account3] = accounts;

	let rewards;

	const rewardsTokenTotalSupply = '1000000';

	addSnapshotBeforeRestoreAfterEach();

	describe('when deploying a rewards token', () => {
		let token;

		before('deploy rewards token', async () => {
			({ token } = await mockToken({
				accounts,
				name: 'Rewards Token',
				symbol: 'RWD',
				supply: rewardsTokenTotalSupply,
			}));
		});

		it('has the correct decimals settings', async () => {
			assert.equal('18', await token.decimals());
		});

		it('has the correct total supply', async () => {
			assert.equal(toWei(rewardsTokenTotalSupply), await token.totalSupply());
		});

		describe('when deploying the rewards contract', () => {
			before('deploy rewards contract', async () => {
				rewards = await TradingRewards.new(owner, token.address, rewardsDistribution, {
					from: deployerAccount,
				});
			});

			it('ensure only known functions are mutative', () => {
				ensureOnlyExpectedMutativeFunctions({
					abi: rewards.abi,
					ignoreParents: ['Owned', 'Pausable'],
					expected: [
						'claimRewardsForPeriod',
						'claimRewardsForPeriods',
						'recordExchangeFeeForAccount',
						'setRewardsDistribution',
						'notifyRewardAmount',
						'recoverTokens',
						'recoverRewardsTokens',
					],
				});
			});

			it('has the correct rewards token set', async () => {
				assert.equal(token.address, await rewards.getRewardsToken());
			});

			it('has the correct rewardsDistribution address set', async () => {
				assert.equal(rewardsDistribution, await rewards.getRewardsDistribution());
			});

			it('has the correct owner set', async () => {
				assert.equal(owner, await rewards.owner());
			});

			describe('before a period is started', () => {
				it('reports the current period to be 0', async () => {
					assert.equal(await rewards.getCurrentPeriod(), 0);
				});

				it('reports the current period to not be claimable', async () => {
					assert.isNotTrue(await rewards.getPeriodIsClaimable(0));
				});

				it('reverts when trying to record fees', async () => {
					await assert.revert(
						rewards.recordExchangeFeeForAccount(10, account1),
						'No period available'
					);
				});

				it('reverts when attempting to create a new period with no rewards balance', async () => {
					await assert.revert(
						rewards.notifyRewardAmount(10, { from: rewardsDistribution }),
						'Insufficient free rewards'
					);
				});

				// TODO: period 0 getters
			});

			describe('when some rewards tokens are transferred to the contract', () => {
				const periodRewards1 = '10000';

				before('transfer some rewards tokens to the contract', async () => {
					await token.transfer(rewards.address, toWei(periodRewards1), { from: owner });
				});

				it('holds the transferred tokens', async () => {
					assert.equal(toWei(periodRewards1), await token.balanceOf(rewards.address));
				});

				it('reverts when any account attempts to create a new period', async () => {
					await assert.revert(
						rewards.notifyRewardAmount('10', { from: account1 }),
						'Caller not RewardsDistribution'
					);
				});

				it('reverts when there is not enough rewards balance for the creation of a period', async () => {
					await assert.revert(
						rewards.notifyRewardAmount(toWei('50000'), { from: rewardsDistribution }),
						'Insufficient free rewards'
					);
				});

				describe('when period 1 is created', () => {
					before('create period 1', async () => {
						await rewards.notifyRewardAmount(toWei(periodRewards1), { from: rewardsDistribution });
					});

					// TODO
					// it('emits NewPeriodStarted event', async () => {
					// });

					it('reports the correct current period id', async () => {
						assert.equal('1', await rewards.getCurrentPeriod());
					});

					it('reports period 0 to not be claimable', async () => {
						assert.isNotTrue(await rewards.getPeriodIsClaimable(0));
					});

					it('reports period 1 to not be claimable', async () => {
						assert.isNotTrue(await rewards.getPeriodIsClaimable(1));
					});

					it('reports no recorded fees for the period', async () => {
						assert.equal('0', await rewards.getPeriodRecordedFees(1));
					});

					it('reports the correct amount of total rewards', async () => {
						assert.equal(toWei(periodRewards1), await rewards.getPeriodTotalRewards(1));
					});

					it('reports the correct amount of available rewards', async () => {
						assert.equal(toWei(periodRewards1), await rewards.getPeriodAvailableRewards(1));
					});

					describe('when transaction fees are recorded on period 1', () => {
						let tx1, tx2, tx3;

						const fee1 = '10';
						const fee2 = '130';
						const fee3 = '4501';
						const feeT = '4641';

						before('record some transaction fees', async () => {
							tx1 = await rewards.recordExchangeFeeForAccount(toWei(fee1), account1);
							tx2 = await rewards.recordExchangeFeeForAccount(toWei(fee2), account2);
							tx3 = await rewards.recordExchangeFeeForAccount(toWei(fee3), account3);
						});

						// TODO
						// it('emits FeeRecorded events', async () => {
						// 	console.log(JSON.stringify(tx2, null, 2));
						// });

						it('recorded the correct fees for each account', async () => {
							assert.equal(
								toWei(fee1),
								await rewards.getRecordedFeesForAccountForPeriod(account1, 1)
							);
							assert.equal(
								toWei(fee2),
								await rewards.getRecordedFeesForAccountForPeriod(account2, 1)
							);
							assert.equal(
								toWei(fee3),
								await rewards.getRecordedFeesForAccountForPeriod(account3, 1)
							);
						});

						it('reports the expected available rewards for period 0', async () => {
							assert.equal('0', await rewards.getAvailableRewardsForAccountForPeriod(account1, 0));
							assert.equal('0', await rewards.getAvailableRewardsForAccountForPeriod(account2, 0));
							assert.equal('0', await rewards.getAvailableRewardsForAccountForPeriod(account3, 0));
						});

						it('reports the expected available rewards for period 1', async () => {
							assert.equal('0', await rewards.getAvailableRewardsForAccountForPeriod(account1, 1));
							assert.equal('0', await rewards.getAvailableRewardsForAccountForPeriod(account2, 1));
							assert.equal('0', await rewards.getAvailableRewardsForAccountForPeriod(account3, 1));
						});

						// TODO
						// it('reverts when any of the accounts attempt to withdraw from period 0', async () => {
						// });

						describe('when more rewards tokens are transferred to the contract', () => {
							const periodRewards2 = '5000';

							before('transfer some rewards tokens to the contract', async () => {
								await token.transfer(rewards.address, toWei(periodRewards2), { from: owner });
							});

							describe('when period 2 is created', () => {
								before('create period 2', async () => {
									await rewards.notifyRewardAmount(toWei(periodRewards2), {
										from: rewardsDistribution,
									});
								});

								it('reports the correct current period id', async () => {
									assert.equal('2', await rewards.getCurrentPeriod());
								});

								it('reports period 1 to be claimable', async () => {
									assert.isTrue(await rewards.getPeriodIsClaimable(1));
								});

								it('reports period 2 to not be claimable', async () => {
									assert.isNotTrue(await rewards.getPeriodIsClaimable(2));
								});

								it('reports the expected available rewards for period 1', async () => {
									assert.deepEqual(
										calculateRewards(fee1, feeT, periodRewards1),
										await rewards.getAvailableRewardsForAccountForPeriod(account1, 1)
									);
									// assert.deepEqual(
									// 	calculateRewards(fee2, feeT, periodRewards1),
									// 	await rewards.getAvailableRewardsForAccountForPeriod(account2, 1)
									// );
									// assert.deepEqual(
									// 	calculateRewards(fee3, feeT, periodRewards1),
									// 	await rewards.getAvailableRewardsForAccountForPeriod(account3, 1)
									// );
								});

								it('reports the expected available rewards for period 2', async () => {
									assert.equal(
										'0',
										await rewards.getAvailableRewardsForAccountForPeriod(account1, 2)
									);
									assert.equal(
										'0',
										await rewards.getAvailableRewardsForAccountForPeriod(account2, 2)
									);
									assert.equal(
										'0',
										await rewards.getAvailableRewardsForAccountForPeriod(account3, 2)
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
