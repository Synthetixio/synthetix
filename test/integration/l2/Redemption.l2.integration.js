const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanRedeem } = require('../behaviors/redeem.behavior');

describe('Redemption integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	before('check fork', async function() {
		if (ctx.fork) {
			// this will fail on a fork since sBTC or sETH can't be removed because
			// the debt may be too large for removeSynth to not underflow during debt update
			this.skip();
		}
	});

	itCanRedeem({ ctx });
});
