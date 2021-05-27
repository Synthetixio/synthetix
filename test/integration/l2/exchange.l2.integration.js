const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanPerformExchanges } = require('../behaviors/exchange.behavior');
const { itCanPerformIssuance } = require('../behaviors/issuance.behavior');

describe('exchange integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	itCanPerformExchanges({ ctx });
	itCanPerformIssuance({ ctx });
});
