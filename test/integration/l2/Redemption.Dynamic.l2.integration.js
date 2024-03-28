const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanRedeem } = require('../behaviors/redeem.dynamic.behavior');

describe('Redemption.dynamic integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });
	itCanRedeem({ ctx });
});
