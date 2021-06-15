const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanManageOwnedContracts } = require('../behaviors/owned.behavior');

describe('Owned integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	itCanManageOwnedContracts({ ctx });
});
