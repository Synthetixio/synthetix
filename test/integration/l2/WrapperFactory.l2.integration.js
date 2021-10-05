const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
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

		const { events } = await etherWrapperCreateTx.wait();
		const event = events.find(l => l.event === 'WrapperCreated');
		const etherWrapperAddress = event.args.wrapperAddress;

		// load Wrapper abi
		const wrapperDeploymentData = JSON.parse(
			fs.readFileSync(path.join(__dirname, '../../../build-ovm/compiled/Wrapper.json'))
		);

		// instantiate the Wrapper contract
		const wrapperContract = new ethers.Contract(
			etherWrapperAddress,
			wrapperDeploymentData.abi,
			ctx.provider
		);

		// TODO: increase the amount of permitted WETH capacity
		// const SystemSettings = ctx.contracts.SystemSettings.connect(ctx.users.owner);
		// await SystemSettings.setWrapperMaxTokenAmount(
		// 	etherWrapperAddress,
		// 	ethers.utils.parseEther('10')
		// );

		wrapperOptions.Wrapper = wrapperContract;
		wrapperOptions.Synth = ctx.contracts.SynthsETH;
		wrapperOptions.Token = ctx.contracts.WETH;
	});

	itCanWrapETH({ ctx, wrapperOptions: () => wrapperOptions });
});
