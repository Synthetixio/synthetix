const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanRedeem } = require('../behaviors/redeem.behavior');

describe('Redemption integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	itCanRedeem({ ctx });
});
