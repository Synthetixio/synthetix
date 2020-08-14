const helper = {
	data: {
		// TODO: add create empty period func?
		currentPeriodID: toBN(0),
		rewardsBalance: toBN(0),
		availableRewards: toBN(0),
		periods: [
			{
				recordedFees: toBN(0),
				totalRewards: toBN(0),
				availableRewards: toBN(0),
				recordedFeesForAccount: {},
				claimedRewardsForAccount: {},
			},
		],
	},

	stashedData: null,
	snapshotId: null,

	async takeSnapshot() {
		this.stashedData = cloneDeep(this.data);

		this.snapshotId = await takeSnapshot();
	},

	async restoreSnapshot() {
		this.data = this.stashedData;

		await restoreSnapshot(this.snapshotId);
	},

	async depositRewards({ amount }) {
		const amountBN = toUnit(amount);

		this.data.rewardsBalance = this.data.rewardsBalance.add(amountBN);

		token.transfer(rewards.address, amountBN, { from: owner });
	},

	async createPeriod({ amount }) {
		const amountBN = toUnit(amount);

		this.data.availableRewards = this.data.availableRewards.add(amountBN);

		this.data.periods.push({
			recordedFees: toBN(0),
			totalRewards: amountBN,
			availableRewards: amountBN,
			// TODO: auto populate these with toBN(0)
			recordedFeesForAccount: {},
			claimedRewardsForAccount: {},
		});

		this.data.currentPeriodID = this.data.currentPeriodID.add(toBN(1));

		const periodCreationTx = await rewards.notifyRewardAmount(toUnit(amount), {
			from: rewardsDistribution,
		});

		assert.eventEqual(periodCreationTx, 'PeriodCreated', {
			periodID: this.data.periods.length - 1,
			rewards: amountBN,
		});
	},

	async recordFee({ account, fee, periodID }) {
		const feeBN = toUnit(fee);

		const period = this.data.periods[periodID];
		period.recordedFees = period.recordedFees.add(feeBN);

		if (!period.recordedFeesForAccount[account]) {
			period.recordedFeesForAccount[account] = toBN(0);
		}
		period.recordedFeesForAccount[account] = period.recordedFeesForAccount[account].add(feeBN);

		const feeRecordedTx = await rewards.recordExchangeFeeForAccount(feeBN, account);

		assert.eventEqual(feeRecordedTx, 'FeeRecorded', {
			amount: feeBN,
			account,
			periodID,
		});
	},

	calculateRewards({ account, periodID }) {
		if (periodID === 0 || periodID === this.data.periods.length - 1) {
			return 0;
		}

		const period = this.data.periods[periodID];
		if (period.claimedRewardsForAccount[account]) {
			return 0;
		}

		const accountFees = period.recordedFeesForAccount[account] || toBN(0);

		return multiplyDecimal(period.totalRewards, divideDecimal(accountFees, period.recordedFees));
	},

	calculateMultipleRewards({ account, periodIDs }) {
		return periodIDs.reduce(
			(totalRewards, periodID) => totalRewards.add(this.calculateRewards({ account, periodID })),
			toBN(0)
		);
	},

	async claimRewards({ account, periodID }) {
		const period = this.data.periods[periodID];
		const reward = this.calculateRewards({ account, periodID });

		if (!period.claimedRewardsForAccount[account]) {
			period.claimedRewardsForAccount[account] = toBN(0);
		}
		period.claimedRewardsForAccount[account] = period.claimedRewardsForAccount[account].add(
			reward
		);

		period.availableRewards = period.availableRewards.sub(reward);

		this.data.availableRewards = this.data.availableRewards.sub(reward);
		this.data.rewardsBalance = this.data.rewardsBalance.sub(reward);

		return rewards.claimRewardsForPeriod(periodID, { from: account });
	},

	async claimMultipleRewards({ account, periodIDs }) {
		let reward = toBN(0);

		periodIDs.map(periodID => {
			const period = this.data.periods[periodID];

			const periodReward = this.calculateRewards({ account, periodID });
			reward = reward.add(periodReward);

			if (!period.claimedRewardsForAccount[account]) {
				period.claimedRewardsForAccount[account] = toBN(0);
			}
			period.claimedRewardsForAccount[account] = period.claimedRewardsForAccount[account].add(
				periodReward
			);

			period.availableRewards = period.availableRewards.sub(periodReward);
		});

		// TODO
		// assert.bnEqual(reward, this.calculateMultipleRewards({ account, periodIDs }));

		this.data.availableRewards = this.data.availableRewards.sub(reward);
		this.data.rewardsBalance = this.data.rewardsBalance.sub(reward);

		return rewards.claimRewardsForPeriods(periodIDs, { from: account });
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

