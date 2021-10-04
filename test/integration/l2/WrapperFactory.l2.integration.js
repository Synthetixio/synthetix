const { artifacts } = require('hardhat');
const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanWrapETH } = require('../behaviors/wrap.behavior');

const { toBytes32 } = require('../../../index');

describe.only('WrapperFactory integration tests (L2)', () => {
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

		console.log(etherWrapperCreateTx);

		const { events } = await etherWrapperCreateTx.wait();
		const event = events.find(l => l.event === 'WrapperCreated');
		const etherWrapperAddress = event.args.wrapperAddress;
		console.log(etherWrapperAddress);

		wrapperOptions.Wrapper = ctx.contracts.Wrapper; // await artifacts.require('Wrapper').at(etherWrapperAddress);
		wrapperOptions.Synth = ctx.contracts.SynthsETH;
		wrapperOptions.Token = ctx.contracts.WETH;

		console.log(wrapperOptions.Wrapper.address);
	});

	itCanWrapETH({ ctx, wrapperOptions });
});
