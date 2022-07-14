// const { artifacts } = require('hardhat');
const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanWrapETH } = require('../behaviors/wrap.behavior');

describe('WrapperFactory integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	itCanWrapETH({ ctx });
});
