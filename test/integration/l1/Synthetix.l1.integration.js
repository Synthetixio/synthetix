const { bootstrapL1 } = require('../utils/bootstrap');
const { itCanExchange } = require('../behaviors/exchange.behavior');
const { itCanStake } = require('../behaviors/stake.behavior');
const { itBehavesLikeAnERC20 } = require('../behaviors/erc20.behavior');

describe('Synthetix integration tests (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });

	itCanExchange({ ctx });
	itCanStake({ ctx });
	itBehavesLikeAnERC20({ ctx });
});
