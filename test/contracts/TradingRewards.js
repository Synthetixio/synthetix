const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { mockToken } = require('./setup');
const { toWei, fromWei, toBN } = web3.utils;
const { toUnit, divideDecimal, multiplyDecimal } = require('../utils')();

const TradingRewards = artifacts.require('TradingRewards');

contract('TradingRewards', accounts => {
	const [
		deployerAccount,
		owner,
		rewardsDistribution,
		account1,
		account2,
		account3,
		account4,
		account5,
		account6,
		account7,
	] = accounts;

	const rewardsTokenTotalSupply = '1000000';

	let token, rewards;

	// ---------------- HELPER ---------------- //

	const helper = {
		data: {
			rewardsBalance: 0,
			availableRewards: 0,
			periods: [
				{
					recordedFees: 0,
					totalRewards: 0,
					availableRewards: 0,
					recordedFeesForAccount: {},
					claimedRewardsForAccount: {},
				},
			],
		},

		depositRewards: async function({ amount }) {
			this.data.rewardsBalance += amount;

			token.transfer(rewards.address, toUnit(amount), { from: owner });
		},

		createPeriod: async function({ amount }) {
			this.data.availableRewards += amount;

			this.data.periods.push({
				recordedFees: 0,
				totalRewards: amount,
				availableRewards: amount,
				recordedFeesForAccount: {},
				claimedRewardsForAccount: {},
			});

			const periodCreationTx = await rewards.notifyRewardAmount(toUnit(amount), {
				from: rewardsDistribution,
			});

			assert.eventEqual(periodCreationTx, 'PeriodCreated', {
				periodID: this.data.periods.length - 1,
				rewards: toUnit(amount),
			});
		},

		recordFee: async function({ account, fee, periodID }) {
			const period = this.data.periods[periodID];
			period.recordedFees += fee;

			if (!period.recordedFeesForAccount[account]) {
				period.recordedFeesForAccount[account] = 0;
			}
			period.recordedFeesForAccount[account] += fee;

			const feeRecordedTx = await rewards.recordExchangeFeeForAccount(toUnit(fee), account);

			assert.eventEqual(feeRecordedTx, 'FeeRecorded', {
				amount: toUnit(fee),
				account,
				periodID,
			});
		},

		calculateRewards: function({ account, periodID }) {
			if (periodID === 0 || periodID === this.data.periods.length - 1) {
				return 0;
			}

			const period = this.data.periods[periodID];
			if (period.claimedRewardsForAccount[account] === true) {
				return 0;
			}

			const accountFees = period.recordedFeesForAccount[account] || '0';

			return multiplyDecimal(
				toUnit(period.totalRewards),
				divideDecimal(toUnit(accountFees), toUnit(period.recordedFees))
			);
		},

		claimRewards: async function({ account, periodID }) {
			const period = this.data.periods[periodID];
			const reward = parseFloat(fromWei(this.calculateRewards({ account, periodID })));

			if (!period.claimedRewardsForAccount[account]) {
				period.claimedRewardsForAccount[account] = 0;
			}
			period.claimedRewardsForAccount[account] += reward;
			period.availableRewards -= reward;

			this.data.availableRewards -= reward;
			this.data.rewardsBalance -= reward;

			return rewards.claimRewardsForPeriod(periodID, { from: account });
		},

		describe: function() {
			console.log(JSON.stringify(this.data, null, 2));
		},
	};

	// ---------------- BEHAVIORS ---------------- //

	const itProperlyCreatedThePeriod = ({ periodID }) => {
		it(`reports the correct current period id as ${periodID}`, async () => {
			assert.equal(`${periodID}`, await rewards.getCurrentPeriod());
		});

		it(`reports period ${periodID} to not be claimable`, async () => {
			assert.isNotTrue(await rewards.getPeriodIsClaimable(periodID));
		});

		it(`reports no recorded fees on period ${periodID}`, async () => {
			assert.equal('0', await rewards.getPeriodRecordedFees(periodID));
		});

		it(`reports the correct amount of total rewards for period ${periodID}`, async () => {
			const period = helper.data.periods[periodID];

			assert.bnEqual(toUnit(period.totalRewards), await rewards.getPeriodTotalRewards(periodID));
		});

		it(`reports the correct amount of available rewards on period ${periodID}`, async () => {
			const period = helper.data.periods[periodID];

			assert.bnEqual(
				toUnit(period.availableRewards),
				await rewards.getPeriodAvailableRewards(periodID)
			);
		});

		if (periodID > 1) {
			it(`reports the previous period ${periodID - 1} to be claimable`, async () => {
				assert.isTrue(await rewards.getPeriodIsClaimable(periodID - 1));
			});
		} else {
			it('reports period 0 to not be claimable', async () => {
				assert.isNotTrue(await rewards.getPeriodIsClaimable(0));
			});
		}
	};

	const itProperlyRecordedFees = ({ periodID }) => {
		it(`correctly records total fees for period ${periodID}`, async () => {
			const period = helper.data.periods[periodID];

			assert.bnEqual(toUnit(period.recordedFees), await rewards.getPeriodRecordedFees(periodID));
		});

		it(`correctly records fees for each account for period ${periodID}`, async () => {
			const period = helper.data.periods[periodID];

			for (const account in period.recordedFeesForAccount) {
				assert.bnEqual(
					toUnit(period.recordedFeesForAccount[account]),
					await rewards.getRecordedFeesForAccountForPeriod(account, periodID)
				);
			}
		});
	};

	const itProperlyReportsAvailableRewards = ({ periodID }) => {
		it(`reports the correct total available rewards for period ${periodID}`, async () => {
			const period = helper.data.periods[periodID];

			assert.bnEqual(
				toUnit(period.availableRewards),
				await rewards.getPeriodAvailableRewards(periodID)
			);
		});

		it(`reports the correct available rewards per account for period ${periodID}`, async () => {
			for (const account of accounts) {
				const expectedReward = helper.calculateRewards({ account, periodID });

				assert.bnEqual(
					expectedReward,
					await rewards.getAvailableRewardsForAccountForPeriod(account, periodID)
				);
			}
		});
	};

	// ---------------- TESTS ---------------- //

	// TODO: why should I use this?
	addSnapshotBeforeRestoreAfterEach();

	describe('when deploying a rewards token', () => {
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

			describe('before period 1 is created (while in period 0)', () => {
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

			describe('when 10000 reward tokens are transferred to the contract', () => {
				before('transfer the reward tokens to the contract', async () => {
					await helper.depositRewards({ amount: 10000 });
				});

				it('holds the transferred tokens', async () => {
					assert.equal(toWei('10000'), await token.balanceOf(rewards.address));
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

				itProperlyReportsAvailableRewards({ periodID: 0 });

				describe('when period 1 is created', () => {
					before('create the period', async () => {
						await helper.createPeriod({
							amount: 10000,
						});
					});

					itProperlyCreatedThePeriod({ periodID: 1 });

					describe('when transactions fees are recoded in period 1', () => {
						before('record fees for account 1', async () => {
							await helper.recordFee({ account: account1, fee: 10, periodID: 1 });
							await helper.recordFee({ account: account2, fee: 130, periodID: 1 });
							await helper.recordFee({ account: account3, fee: 4501, periodID: 1 });
							await helper.recordFee({ account: account4, fee: 1337, periodID: 1 });
							await helper.recordFee({ account: account5, fee: 1, periodID: 1 });
						});

						itProperlyRecordedFees({ periodID: 1 });
						itProperlyReportsAvailableRewards({ periodID: 0 });
						itProperlyReportsAvailableRewards({ periodID: 1 });

						// TODO
						// it('reverts when any of the accounts attempt to withdraw from period 0', async () => {
						// });

						describe('when 5000 more reward tokens are transferred to the contract', () => {
							before('transfer the reward tokens to the contract', async () => {
								await helper.depositRewards({ amount: 5000 });
							});

							it('reverts if trying to create a period with more rewards than those available', async () => {
								await assert.revert(
									rewards.notifyRewardAmount(toUnit('5001'), {
										from: rewardsDistribution,
									}),
									'Insufficient free rewards'
								);
							});

							describe('when period 2 is created', () => {
								before('create the period', async () => {
									await helper.createPeriod({
										amount: 5000,
									});
								});

								itProperlyCreatedThePeriod({ periodID: 2 });
								itProperlyReportsAvailableRewards({ periodID: 1 });
								itProperlyReportsAvailableRewards({ periodID: 2 });

								describe('when claiming fees for period 1', () => {
									before('claim rewards by accounts that recorded fees', async () => {
										await helper.claimRewards({ account: account1, periodID: 1 });
										await helper.claimRewards({ account: account2, periodID: 1 });
										await helper.claimRewards({ account: account3, periodID: 1 });
										// Note: account4 is intentionally not claiming here.
										await helper.claimRewards({ account: account5, periodID: 1 });
									});

									it('reverts if accounts that claimed attempt to claim again', async () => {
										await assert.revert(
											rewards.claimRewardsForPeriod(1, { from: account1 }),
											'No rewards claimable'
										);
										await assert.revert(
											rewards.claimRewardsForPeriod(1, { from: account2 }),
											'No rewards claimable'
										);
									});

									it(`reverts when accounts that did not record fees in period 1 attempt to claim rewards`, async () => {
										await assert.revert(
											rewards.claimRewardsForPeriod(1, { from: account6 }),
											'No rewards claimable'
										);
										await assert.revert(
											rewards.claimRewardsForPeriod(1, { from: account7 }),
											'No rewards claimable'
										);
									});

									it('shows remaining available rewards to be roughly those of the account that didnt claim', async () => {
										assert.bnClose(
											await rewards.getPeriodAvailableRewards(1),
											helper.calculateRewards({ account: account4, periodID: 1 }),
											toWei('0.0001')
										);
									});

									it('description', async () => {
										helper.describe();
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
