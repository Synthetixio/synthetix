const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanTrade } = require('../behaviors/futures.behavior');

describe('Futures integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });
	itCanTrade({ ctx });
});
