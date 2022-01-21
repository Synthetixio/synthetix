const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanLiquidate } = require('../behaviors/liquidations.behavior');

describe('Liquidations (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	itCanLiquidate({ ctx });
});
