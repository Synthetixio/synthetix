const itHasConsistentState = () => {
	describe('when checking general state', () => {
		before(async () => {
			// helper.describe(); // Uncomment to visualize state changes
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

const itHasConsistentStateForPeriod = ({ periodID }) => {
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
					await rewards.getRecordedFeesForAccountForPeriod(account, periodID)
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

