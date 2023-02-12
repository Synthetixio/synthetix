const { bootstrapL1 } = require('../utils/bootstrap');
const { itCanRedeem } = require('../behaviors/zredeem.behavior');

describe('Redemption integration tests (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });

	itCanRedeem({ ctx });
});
