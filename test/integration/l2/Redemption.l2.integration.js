const { bootstrapL2 } = require('../utils/bootstrap');
const { addSynths } = require('../utils/synths');
const { itCanRedeem } = require('../behaviors/redeem.behavior');

describe('Redemption integration tests (L2)', () => {
	const ctx = this;

	bootstrapL2({ ctx });

	addSynths({ ctx, synths: ['sREDEEMER'], useOvm: true });

	itCanRedeem({ ctx, synth: 'sREDEEMER' });
});
