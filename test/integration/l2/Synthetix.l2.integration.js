const { bootstrapL2 } = require('../utils/bootstrap');
const { itBehavesLikeSynthetix } = require('../behaviors/Synthetix.behavior');

describe('Synthetix integration tests (isolated on layer 2)', () => {
	const ctx = this;

	bootstrapL2({ ctx });

	itBehavesLikeSynthetix({ ctx });
});
