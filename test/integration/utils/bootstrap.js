const hre = require('hardhat');
const ethers = require('ethers');
const { loadWallets } = require('./wallets');
const { connectContracts } = require('./contracts');
const { simulateExchangeRates } = require('./rates');
const { takeDebtSnapshot } = require('./cache');

function bootstrapL1({ ctx }) {
	before('bootstrap layer 1 instance', async () => {
		ctx.useOvm = false;

		ctx.provider = new ethers.providers.JsonRpcProvider(
			`${hre.config.providerUrl}:${hre.config.providerPort}`
		);

		loadWallets({ ctx });
		connectContracts({ ctx });

		await simulateExchangeRates({ ctx });
		await takeDebtSnapshot({ ctx });
	});
}

function bootstrapL2({ ctx }) {
	before('bootstrap layer 2 instance', async () => {
		ctx.useOvm = true;

		ctx.provider = new ethers.providers.JsonRpcProvider(
			`${hre.config.providerUrl}:${hre.config.providerPort}`
		);
		ctx.provider.getGasPrice = () => ethers.BigNumber.from('0');

		loadWallets({ ctx });
		connectContracts({ ctx });

		await simulateExchangeRates({ ctx });
		await takeDebtSnapshot({ ctx });
	});
}

function bootstrapDual({ ctx }) {
	before('bootstrap layer 1 and layer 2 intances', async () => {
		ctx.l1 = { useOvm: false };
		ctx.l2 = { useOvm: true };

		ctx.l1.provider = new ethers.providers.JsonRpcProvider(
			`${hre.config.providerUrl}:${hre.config.providerPortL1}`
		);
		ctx.l2.provider = new ethers.providers.JsonRpcProvider(
			`${hre.config.providerUrl}:${hre.config.providerPortL2}`
		);
		ctx.l2.provider.getGasPrice = () => ethers.BigNumber.from('0');

		loadWallets({ ctx: ctx.l1 });
		loadWallets({ ctx: ctx.l2 });

		connectContracts({ ctx: ctx.l1 });
		connectContracts({ ctx: ctx.l2 });

		await simulateExchangeRates({ ctx: ctx.l1 });
		await simulateExchangeRates({ ctx: ctx.l2 });

		await takeDebtSnapshot({ ctx: ctx.l1 });
		await takeDebtSnapshot({ ctx: ctx.l2 });
	});
}

module.exports = {
	bootstrapL1,
	bootstrapL2,
	bootstrapDual,
};
