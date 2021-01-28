const { web3 } = require('hardhat');
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

		it('has the expected token balance', async () => {
			assert.bnEqual(await ctx.token.balanceOf(ctx.rewards.address), helper.data.rewardsBalance);
		});

		it('reports the expected unassigned rewards balance', async () => {
			const balance = await ctx.token.balanceOf(ctx.rewards.address);
			const available = await ctx.rewards.getAvailableRewards();

			const unassigned = await ctx.rewards.getUnassignedRewards();

			assert.bnEqual(helper.data.rewardsBalance.sub(helper.data.availableRewards), unassigned);
			assert.bnEqual(balance.sub(available), unassigned);
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

const itCorrectlyRecoversAssignedTokens = ({ ctx, owner, recoverAccount, periodID }) => {
	describe('when recovering assigned reward tokens', () => {
		let accountBalanceBefore, contractBalanceBefore, extractedBalance;
		let recoverTx;

		before(async () => {
			accountBalanceBefore = await ctx.token.balanceOf(recoverAccount);
			contractBalanceBefore = await ctx.token.balanceOf(ctx.rewards.address);

			extractedBalance = await ctx.rewards.getPeriodAvailableRewards(periodID);

			recoverTx = await ctx.rewards.recoverAssignedRewardTokensAndDestroyPeriod(
				recoverAccount,
				periodID,
				{ from: owner }
			);
		});

		it('credited the tokens to the recover account', async () => {
			assert.bnEqual(
				await ctx.token.balanceOf(recoverAccount),
				accountBalanceBefore.add(extractedBalance)
			);
		});

		it('deducted the tokens from the contract', async () => {
			assert.bnEqual(
				await ctx.token.balanceOf(ctx.rewards.address),
				contractBalanceBefore.sub(extractedBalance)
			);
		});

		it('emitted an AssignedRewardTokensRecovered event', async () => {
			assert.eventEqual(recoverTx, 'AssignedRewardTokensRecovered', {
				recoverAddress: recoverAccount,
				amount: extractedBalance,
				periodID,
			});
		});
	});
};

const itCorrectlyRecoversUnassignedTokens = ({ ctx, owner, recoverAccount }) => {
	describe('when recovering unassigned reward tokens', () => {
		let accountBalanceBefore, contractBalanceBefore, extractedBalance;
		let recoverTx;

		before(async () => {
			accountBalanceBefore = await ctx.token.balanceOf(recoverAccount);
			contractBalanceBefore = await ctx.token.balanceOf(ctx.rewards.address);

			extractedBalance = await ctx.rewards.getUnassignedRewards();

			recoverTx = await ctx.rewards.recoverUnassignedRewardTokens(recoverAccount, { from: owner });
		});

		it('credited the tokens to the recover account', async () => {
			assert.bnEqual(
				await ctx.token.balanceOf(recoverAccount),
				accountBalanceBefore.add(extractedBalance)
			);
		});

		it('deducted the tokens from the contract', async () => {
			assert.bnEqual(
				await ctx.token.balanceOf(ctx.rewards.address),
				contractBalanceBefore.sub(extractedBalance)
			);
		});

		it('leaves the contract with no unassigned reward tokens', async () => {
			assert.bnEqual(await ctx.rewards.getUnassignedRewards(), toBN(0));
		});

		it('emitted an UnassignedRewardTokensRecovered event', async () => {
			assert.eventEqual(recoverTx, 'UnassignedRewardTokensRecovered', {
				recoverAddress: recoverAccount,
				amount: extractedBalance,
			});
		});
	});
};

module.exports = {
	itHasConsistentState,
	itHasConsistentStateForPeriod,
	snapshotBeforeRestoreAfterWithHelper,
	itCorrectlyRecoversUnassignedTokens,
	itCorrectlyRecoversAssignedTokens,
};
