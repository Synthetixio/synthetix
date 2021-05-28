const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanExchange } = require('../behaviors/exchange.behavior');
const { itCanMintAndBurn } = require('../behaviors/stake.behavior');
const { itBehavesLikeAnERC20 } = require('../behaviors/erc20.behavior');

describe('Synthetix integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	itCanExchange({ ctx });
	itCanMintAndBurn({ ctx });
	itBehavesLikeAnERC20({ ctx });
});
