const { bootstrapL1 } = require('../utils/bootstrap');
const { itCanWrapETH } = require('../behaviors/wrap.behavior');

describe('EtherWrapper integration tests (L1)', () => {
	const ctx = this;
	bootstrapL1({ ctx });

	const wrapperOptions = {};

	before(() => {
		wrapperOptions.Wrapper = ctx.contracts.EtherWrapper;
		wrapperOptions.Synth = ctx.contracts.SynthsETH;
		wrapperOptions.Token = ctx.contracts.WETH;
	});

	itCanWrapETH({ ctx, wrapperOptions });
});
