const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanTrade } = require('../behaviors/perpsV2.behavior');

describe('PerpsV2 integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });
	itCanTrade({ ctx });
});
