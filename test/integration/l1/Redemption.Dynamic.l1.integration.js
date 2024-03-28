const { bootstrapL1 } = require('../utils/bootstrap');
const { itCanRedeem } = require('../behaviors/redeem.dynamic.behavior');

describe('Redemption.dynamic integration tests (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });
	itCanRedeem({ ctx });
});
