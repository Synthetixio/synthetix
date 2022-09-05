const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanTrade } = require('../behaviors/futuresV2.behavior');

describe('FuturesV2 integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });
	itCanTrade({ ctx });
});
