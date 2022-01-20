const { bootstrapL1 } = require('../utils/bootstrap');
const { itCanLiquidate } = require('../behaviors/liquidations.behavior');

describe('Liquidations (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });

	itCanLiquidate({ ctx });
});
