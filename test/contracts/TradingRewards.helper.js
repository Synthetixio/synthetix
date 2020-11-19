const cloneDeep = require('lodash.clonedeep');
const { assert } = require('./common');
const { web3 } = require('hardhat');
const { toBN, isHex } = web3.utils;
const {
	toUnit,
	fromUnit,
	divideDecimal,
	multiplyDecimal,
	takeSnapshot,
	restoreSnapshot,
} = require('../utils')();

/**
 * This helper acts as a proxy (or intermediary) for making calls to the TradingRewards contract instance.
 * While forwarding calls to the contract, the helper keeps track of what the contract's state is supposed to be,
 * which allows us to compare this js state with the on-chain state at any time in the unit tests.
 */
module.exports = {
	data: {
		currentPeriodID: toBN(0),
		rewardsBalance: toBN(0),
		availableRewards: toBN(0),
		rewardsTokenBalanceForAccount: {},
		periods: [
			{
				isFinalized: false,
				recordedFees: toBN(0),
				totalRewards: toBN(0),
				availableRewards: toBN(0),
				unaccountedFeesForAccount: {},
			},
		],
	},

	stashedData: null,
	snapshotId: null,

	incrementExpectedBalance(account, deltaBalance) {
		if (!this.data.rewardsTokenBalanceForAccount[account]) {
			this.data.rewardsTokenBalanceForAccount[account] = toBN(0);
		}

		this.data.rewardsTokenBalanceForAccount[account] = this.data.rewardsTokenBalanceForAccount[
			account
		].add(toUnit(deltaBalance));
	},

	async takeSnapshot() {
		this.stashedData = cloneDeep(this.data);

		this.snapshotId = await takeSnapshot();
	},

	async restoreSnapshot() {
		this.data = this.stashedData;

		await restoreSnapshot(this.snapshotId);
	},

	async depositRewards({ amount, token, rewards, owner }) {
		const amountBN = toUnit(amount);

		this.data.rewardsBalance = this.data.rewardsBalance.add(amountBN);

		await token.transfer(rewards.address, amountBN, { from: owner });
	},

	async closePeriodWithRewards({ amount, rewards, periodController }) {
		const periodCreationTx = await rewards.closeCurrentPeriodWithRewards(toUnit(amount), {
			from: periodController,
		});

		const amountBN = toUnit(amount);

		const closingPeriod = this.data.periods[this.data.currentPeriodID];
		closingPeriod.totalRewards = amountBN;
		closingPeriod.availableRewards = amountBN;
		closingPeriod.isFinalized = true;

		const newPeriod = {
			isFinalized: false,
			recordedFees: toBN(0),
			totalRewards: toBN(0),
			availableRewards: toBN(0),
			unaccountedFeesForAccount: {},
		};
		this.data.periods.push(newPeriod);

		this.data.availableRewards = this.data.availableRewards.add(amountBN);
		this.data.currentPeriodID = this.data.currentPeriodID.add(toBN(1));

		assert.eventsEqual(
			periodCreationTx,
			'PeriodFinalizedWithRewards',
			{ periodID: this.data.currentPeriodID - 1, rewards: amountBN },
			'NewPeriodStarted',
			{ periodID: this.data.currentPeriodID }
		);
	},

	async recordFee({ account, fee, periodID, rewards }) {
		const feeBN = toUnit(fee);

		const period = this.data.periods[periodID];
		period.recordedFees = period.recordedFees.add(feeBN);

		if (!period.unaccountedFeesForAccount[account]) {
			period.unaccountedFeesForAccount[account] = toBN(0);
		}
		period.unaccountedFeesForAccount[account] = period.unaccountedFeesForAccount[account].add(
			feeBN
		);

		const feeRecordedTx = await rewards.recordExchangeFeeForAccount(feeBN, account);

		assert.eventEqual(feeRecordedTx, 'ExchangeFeeRecorded', {
			amount: feeBN,
			account,
			periodID,
		});
	},

	calculateRewards({ account, periodID }) {
		const period = this.data.periods[periodID];

		if (period.recordedFees.isZero() || period.totalRewards.isZero()) {
			return 0;
		}

		if (!period.unaccountedFeesForAccount[account]) {
			period.unaccountedFeesForAccount[account] = toBN(0);
		}

		return multiplyDecimal(
			period.totalRewards,
			divideDecimal(period.unaccountedFeesForAccount[account], period.recordedFees)
		);
	},

	calculateMultipleRewards({ account, periodIDs }) {
		return periodIDs.reduce(
			(totalRewards, periodID) => totalRewards.add(this.calculateRewards({ account, periodID })),
			toBN(0)
		);
	},

	async claimRewards({ account, periodID, rewards }) {
		const period = this.data.periods[periodID];
		const reward = this.calculateRewards({ account, periodID });

		period.unaccountedFeesForAccount[account] = toBN(0);
		period.availableRewards = period.availableRewards.sub(reward);

		this.data.availableRewards = this.data.availableRewards.sub(reward);
		this.data.rewardsBalance = this.data.rewardsBalance.sub(reward);

		if (!this.data.rewardsTokenBalanceForAccount[account]) {
			this.data.rewardsTokenBalanceForAccount[account] = toBN(0);
		}
		this.data.rewardsTokenBalanceForAccount[account] = this.data.rewardsTokenBalanceForAccount[
			account
		].add(reward);

		const claimTx = await rewards.claimRewardsForPeriod(periodID, { from: account });

		assert.eventEqual(claimTx, 'RewardsClaimed', {
			account,
			amount: reward,
			periodID,
		});
	},

	async claimMultipleRewards({ account, periodIDs, rewards }) {
		let reward = toBN(0);
		const expectedEvents = [];

		const expectedMultipleRewards = this.calculateMultipleRewards({ account, periodIDs });

		periodIDs.map(periodID => {
			const period = this.data.periods[periodID];

			const periodReward = this.calculateRewards({ account, periodID });
			reward = reward.add(periodReward);

			period.unaccountedFeesForAccount[account] = toBN(0);
			period.availableRewards = period.availableRewards.sub(periodReward);

			expectedEvents.push('RewardsClaimed');
			expectedEvents.push({
				account,
				amount: periodReward,
				periodID,
			});
		});

		assert.bnEqual(reward, expectedMultipleRewards);

		this.data.availableRewards = this.data.availableRewards.sub(reward);
		this.data.rewardsBalance = this.data.rewardsBalance.sub(reward);

		if (!this.data.rewardsTokenBalanceForAccount[account]) {
			this.data.rewardsTokenBalanceForAccount[account] = toBN(0);
		}
		this.data.rewardsTokenBalanceForAccount[account] = this.data.rewardsTokenBalanceForAccount[
			account
		].add(reward);

		const multipleClaimTx = await rewards.claimRewardsForPeriods(periodIDs, { from: account });

		assert.eventsEqual(multipleClaimTx, ...expectedEvents);
	},

	describe() {
		// Converts BNs to decimals for readability
		const replacer = (key, val) => {
			if (isHex(val)) {
				const exceptions = ['currentPeriodID'];
				return exceptions.includes(key) ? val : fromUnit(val);
			} else {
				return val;
			}
		};

		console.log(JSON.stringify(this.data, replacer, 2));
	},
};
