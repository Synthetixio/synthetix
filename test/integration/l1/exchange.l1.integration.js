const { bootstrapL1 } = require('../utils/bootstrap');
const { itCanPerformExchanges } = require('../behaviors/exchange.behavior');
const { itCanPerformIssuance } = require('../behaviors/issuance.behavior');
const { itCanPerformERC20Transfers } = require('../behaviors/erc20.behavior');

describe('exchange integration tests (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });

	itCanPerformExchanges({ ctx });
	itCanPerformIssuance({ ctx });
	itCanPerformERC20Transfers({ ctx });
});
