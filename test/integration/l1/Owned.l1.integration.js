const { bootstrapL1 } = require('../utils/bootstrap');
const { itCanManageOwnedContracts } = require('../behaviors/owned.behavior');

describe('Owned integration tests (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });

	itCanManageOwnedContracts({ ctx });
});
