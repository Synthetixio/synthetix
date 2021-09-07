const { bootstrapL2 } = require('../utils/bootstrap');
const { addSynths } = require('../utils/synths');
const { itCanRedeem } = require('../behaviors/redeem.behavior');

describe('Redemption integration tests (L2)', () => {
	const ctx = this;

	addSynths({ ctx, synths: ['sREDEEMER'], useOvm: true });

	bootstrapL2({ ctx });

	itCanRedeem({ ctx });
});
