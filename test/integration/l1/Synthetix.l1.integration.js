const { bootstrapL1 } = require('../utils/bootstrap');
const { itBehavesLikeSynthetix } = require('../behaviors/Synthetix.behavior');

describe('Synthetix integration tests (isolated on layer 1)', () => {
	const ctx = this;

	bootstrapL1({ ctx });

	itBehavesLikeSynthetix({ ctx });
});
