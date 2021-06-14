const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanNominate } = require('../behaviors/nominate.behavior');

describe('Owned integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	itCanNominate({ ctx });
});
