const { bootstrapL1 } = require('../utils/bootstrap');
const { addSynths } = require('../utils/synths');
const { itCanRedeem } = require('../behaviors/redeem.behavior');

describe('Redemption integration tests (L1)', () => {
	const ctx = this;

	addSynths({ ctx, synths: ['sREDEEMER'], useOvm: false });

	bootstrapL1({ ctx });

	itCanRedeem({ ctx });
});
