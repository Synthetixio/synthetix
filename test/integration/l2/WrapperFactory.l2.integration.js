// const { artifacts } = require('hardhat');
const { bootstrapL2 } = require('../utils/bootstrap');
const { itCanWrapETH } = require('../behaviors/wrap.behavior');
const { ethers } = require('hardhat');

const { toBytes32 } = require('../../../index');

// Load Compiled
const path = require('path');
const {
	constants: { BUILD_FOLDER },
} = require('../../..');
const buildPath = path.join(__dirname, '..', '..', '..', BUILD_FOLDER);
const { loadCompiledFiles } = require('../../../publish/src/solidity');
const { compiled } = loadCompiledFiles({ buildPath });

describe('WrapperFactory integration tests (L2)', () => {
	const ctx = this;
	bootstrapL2({ ctx });

	// deploy a test wrapper
	const wrapperOptions = { Wrapper: null, Synth: null, Token: null };

	before(async () => {
		const WrapperFactory = ctx.contracts.WrapperFactory.connect(ctx.users.owner);

		const wrapperCreatedEvent = new Promise((resolve, reject) => {
			WrapperFactory.on('WrapperCreated', (token, currencyKey, wrapperAddress, event) => {
				event.removeListener();

				resolve({
					token: token,
					currencyKey: currencyKey,
					wrapperAddress: wrapperAddress,
				});
			});

			setTimeout(() => {
				reject(new Error('timeout'));
			}, 60000);
		});

		await WrapperFactory.createWrapper(
			ctx.contracts.WETH.address,
			toBytes32('sETH'),
			toBytes32('SynthsETH')
		);

		const event = await wrapperCreatedEvent;

		// extract address from events
		const etherWrapperAddress = event.wrapperAddress;

		ctx.contracts.Wrapper = new ethers.Contract(
			etherWrapperAddress,
			compiled.Wrapper.abi,
			ctx.provider
		);
		wrapperOptions.Wrapper = ctx.contracts.Wrapper;
		wrapperOptions.Synth = ctx.contracts.SynthsETH;
		wrapperOptions.Token = ctx.contracts.WETH;
	});

	itCanWrapETH({ ctx, wrapperOptions });
});
