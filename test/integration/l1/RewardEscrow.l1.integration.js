const { bootstrapL1 } = require('../utils/bootstrap');
const { itDoesRewardEscrow } = require('../behaviors/rewardEscrow.behavior');

describe('RewardEscrow integration tests (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });

	itDoesRewardEscrow({ ctx });
});
