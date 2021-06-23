const { bootstrapL1 } = require('../utils/bootstrap');
const { itCanOpenAndCloseShort } = require('../behaviors/short.behavior');

describe('Shorts integration tests (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });

	itCanOpenAndCloseShort({ ctx });
});
