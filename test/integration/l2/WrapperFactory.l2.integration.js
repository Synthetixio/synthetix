const { artifacts } = require('hardhat');
const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanWrapETH } = require('../behaviors/wrap.behavior');

const { toBytes32 } = require('../../../index');

describe('WrapperFactory integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	// deploy a test wrapper
	const wrapperOptions = { Wrapper: null, Synth: null, Token: null };

	before(async () => {
		const WrapperFactory = ctx.contracts.WrapperFactory.connect(ctx.users.owner);

		const etherWrapperCreateTx = await WrapperFactory.createWrapper(
			ctx.contracts.WETH.address,
			toBytes32('sETH'),
			toBytes32('SynthsETH')
		);

		// extract address from events
		const etherWrapperAddress = etherWrapperCreateTx.logs.find(l => l.event === 'WrapperCreated')
			.args.wrapperAddress;

		wrapperOptions.Wrapper = await artifacts.require('Wrapper').at(etherWrapperAddress);
		wrapperOptions.Synth = ctx.contracts.SynthsETH;
		wrapperOptions.Token = ctx.contracts.WETH;
	});

	itCanWrapETH({ ctx, wrapperOptions });
});
