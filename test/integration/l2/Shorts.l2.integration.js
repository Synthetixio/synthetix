const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanOpenAndCloseShort } = require('../behaviors/short.behavior');

describe('Shorts integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	itCanOpenAndCloseShort({ ctx });
});
