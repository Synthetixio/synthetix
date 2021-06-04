const { bootstrapL2 } = require('../utils/bootstrap');
const { itConfirmsOrders, itLiquidatesOrders } = require('../behaviors/futures-keepers.behavior');

describe('futures keepers integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	itConfirmsOrders({ ctx });
	itLiquidatesOrders({ ctx });
});
