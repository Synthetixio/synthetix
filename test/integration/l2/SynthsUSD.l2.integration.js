const { bootstrapL2 } = require('../utils/bootstrap');
const { itBehavesLikeAnERC20 } = require('../behaviors/erc20.behavior');

describe('SynthsUSD integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	itBehavesLikeAnERC20({ ctx, contract: 'SynthsUSD' });
});
