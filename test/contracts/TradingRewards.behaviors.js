const { web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { toBN } = web3.utils;
const helper = require('./TradingRewards.helper');

const snapshotBeforeRestoreAfterWithHelper = () => {
	before(async () => helper.takeSnapshot());
	after(async () => helper.restoreSnapshot());
};

const itHasConsistentState = ({ ctx, accounts }) => {
	describe('when checking general state', () => {
		// Uncomment to visualize state changes
		// before(async () => helper.describe() );

		it('reports the expected current period id', async () => {
			assert.bnEqual(helper.data.currentPeriodID, await ctx.rewards.getCurrentPeriod());
		});

		it('reports the expected total rewards balance', async () => {
			assert.bnEqual(helper.data.rewardsBalance, await ctx.token.balanceOf(ctx.rewards.address));
		});

		it('reports the expected available rewards balance', async () => {
			assert.bnEqual(helper.data.availableRewards, await ctx.rewards.getAvailableRewards());
		});

		it('reports the expected reward token balances per account', async () => {
			for (const account of accounts) {
				const localRecord = helper.data.rewardsTokenBalanceForAccount[account] || toBN(0);
				const chainRecord = await ctx.token.balanceOf(account);

				assert.bnEqual(localRecord, chainRecord);
			}
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

			assert.bnEqual(
				period.availableRewards,
				await ctx.rewards.getPeriodAvailableRewards(periodID)
			);
		});

		// Claimable/finalized
		it(`correctly reports if period ${periodID} is finalized/claimable`, async () => {
			const isClaimable = await ctx.rewards.getPeriodIsClaimable(periodID);
			const isFinalized = await ctx.rewards.getPeriodIsFinalized(periodID);

			const currentPeriodID = (await ctx.rewards.getCurrentPeriod()).toNumber();
			if (periodID === currentPeriodID) {
				assert.isNotTrue(isClaimable || isFinalized);
			} else {
				assert.isTrue(isClaimable || isFinalized);
			}

			const period = helper.data.periods[periodID];
			assert.equal(period.isFinalized, isFinalized || isClaimable);
		});

		// Recorded fees (per account)
		it(`correctly records fees for each account for period ${periodID}`, async () => {
			const period = helper.data.periods[periodID];

			for (const account of accounts) {
				const localRecord = period.unaccountedFeesForAccount[account] || toBN(0);
				const chainRecord = await ctx.rewards.getUnaccountedFeesForAccountForPeriod(
					account,
					periodID
				);

				assert.bnEqual(localRecord, chainRecord);
			}
		});

		// Available rewards (per account)
		it(`reports the correct available rewards per account for period ${periodID}`, async () => {
			for (const account of accounts) {
				const expectedReward = helper.calculateRewards({ account, periodID });
				const reportedReward = await ctx.rewards.getAvailableRewardsForAccountForPeriod(
					account,
					periodID
				);

				assert.bnEqual(expectedReward, reportedReward);
			}
		});
	});
};

module.exports = {
	itHasConsistentState,
	itHasConsistentStateForPeriod,
	snapshotBeforeRestoreAfterWithHelper,
};
