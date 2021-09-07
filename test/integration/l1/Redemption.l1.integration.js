const { bootstrapL1 } = require('../utils/bootstrap');
const { addSynths } = require('../utils/synths');
const { itCanRedeem } = require('../behaviors/redeem.behavior');

describe('Redemption integration tests (L1)', () => {
	const ctx = this;

	bootstrapL1({ ctx });

	addSynths({ ctx, synths: ['sREDEEMER'], useOvm: false });

	itCanRedeem({ ctx, synth: 'sREDEEMER' });
});
