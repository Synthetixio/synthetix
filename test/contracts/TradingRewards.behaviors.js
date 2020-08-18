const { web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { toBN } = web3.utils;
const helper = require('./TradingRewards.helper');

function itHasConsistentState({ ctx }) {
	describe('when checking general state', () => {

	  // Uncomment to visualize state changes
		before(async () => {
			helper.describe();
		});

		it('reports the expected current period id', async () => {
			assert.bnEqual(helper.data.currentPeriodID, await ctx.rewards.getCurrentPeriod());
		});

		it('reports the expected total rewards balance', async () => {
			assert.bnEqual(helper.data.rewardsBalance, await ctx.token.balanceOf(ctx.rewards.address));
		});

		it('reports the expected available rewards balance', async () => {
			assert.bnEqual(helper.data.availableRewards, await ctx.rewards.getAvailableRewards());
		});
	});
};

const itHasConsistentStateForPeriod = ({ periodID, ctx, accounts }) => {
	describe(`when checking state for period ${periodID}`, () => {

		// Recorded fees (whole period)
		it(`correctly tracks total fees for period ${periodID}`, async () => {
			const period = helper.data.periods[periodID];

			assert.bnEqual(period.recordedFees, await ctx.rewards.getPeriodRecordedFees(periodID));
		});

		// Total rewards (whole period)
		it(`remembers total rewards for period ${periodID}`, async () => {
			const period = helper.data.periods[periodID];

			assert.bnEqual(period.totalRewards, await ctx.rewards.getPeriodTotalRewards(periodID));
		});

		// Available rewards (whole period)
		it(`tracks the available rewards for period ${periodID}`, async () => {
			const period = helper.data.periods[periodID];

			assert.bnEqual(period.availableRewards, await ctx.rewards.getPeriodAvailableRewards(periodID));
		});

		// Claimable
		it(`correctly reports if period ${periodID} is claimable`, async () => {
			if (periodID === 0) {
				assert.isNotTrue(await ctx.rewards.getPeriodIsClaimable(0));
			} else {
				const currentPeriodID = (await ctx.rewards.getCurrentPeriod()).toNumber();

				if (periodID === currentPeriodID) {
					assert.isNotTrue(await ctx.rewards.getPeriodIsClaimable(periodID));
				} else {
					assert.isTrue(await ctx.rewards.getPeriodIsClaimable(periodID));
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
					await ctx.rewards.getUnaccountedFeesForAccountForPeriod(account, periodID)
				);
			}
		});

		// Available rewards (per account)
		it(`reports the correct available rewards per account for period ${periodID}`, async () => {
			for (const account of accounts) {
				const expectedReward = helper.calculateRewards({ account, periodID });

				assert.bnEqual(
					expectedReward,
					await ctx.rewards.getAvailableRewardsForAccountForPeriod(account, periodID)
				);
			}
		});
	});
};

module.exports = {
	itHasConsistentState,
	itHasConsistentStateForPeriod,
}
