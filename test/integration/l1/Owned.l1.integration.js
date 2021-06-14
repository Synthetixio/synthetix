const { bootstrapL1 } = require('../utils/bootstrap');
const { itCanNominate } = require('../behaviors/nominate.behavior');

describe('Owned integration tests (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });

	itCanNominate({ ctx });
});
