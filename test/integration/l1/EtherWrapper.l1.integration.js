const { bootstrapL1 } = require('../utils/bootstrap');
const { itCanWrapETH } = require('../behaviors/wrap.behavior');

describe('EtherWrapper integration tests (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });

	itCanWrapETH({ ctx });
});
