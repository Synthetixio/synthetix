const { bootstrapL2 } = require('../utils/bootstrap');
const { itConfirmsOrders } = require('../behaviors/futures-keepers.behavior');

describe.only('futures keepers integration tests (L2)', () => {
    const ctx = this;
    bootstrapL2({ ctx });

    itConfirmsOrders({ ctx });
});
