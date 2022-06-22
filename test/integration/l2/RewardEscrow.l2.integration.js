const { bootstrapL2 } = require('../utils/bootstrap');
const { itDoesRewardEscrow } = require('../behaviors/rewardEscrow.behavior');

describe('RewardEscrow integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	itDoesRewardEscrow({ ctx });
});
