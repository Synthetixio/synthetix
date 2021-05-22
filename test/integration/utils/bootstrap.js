const hre = require('hardhat');
const ethers = require('ethers');
const axios = require('axios');
const { loadUsers } = require('./users');
const { Watcher } = require('@eth-optimism/watcher');
const { connectContracts } = require('./contracts');
const { simulateExchangeRates } = require('./rates');
const { takeDebtSnapshot } = require('./cache');
const { deposit } = require('./bridge');

function bootstrapL1({ ctx }) {
	before('bootstrap layer 1 instance', async () => {
		ctx.useOvm = false;

		// Provider
		ctx.provider = new ethers.providers.JsonRpcProvider(
			`${hre.config.providerUrl}:${hre.config.providerPort}`
		);

		// Accounts
		loadUsers({ ctx });

		// Contracts
		connectContracts({ ctx });

		// Rates and snapshots
		await simulateExchangeRates({ ctx });
		await takeDebtSnapshot({ ctx });
	});
}

function bootstrapL2({ ctx }) {
	before('bootstrap layer 2 instance', async () => {
		ctx.useOvm = true;

		// Provider
		ctx.provider = new ethers.providers.JsonRpcProvider(
			`${hre.config.providerUrl}:${hre.config.providerPort}`
		);
		ctx.provider.getGasPrice = () => ethers.BigNumber.from('0');

		// Accounts
		loadUsers({ ctx });

		// Contracts
		connectContracts({ ctx });

		// Rates and snapshots
		await simulateExchangeRates({ ctx });
		await takeDebtSnapshot({ ctx });
	});
}

function bootstrapDual({ ctx }) {
	before('bootstrap layer 1 and layer 2 intances', async () => {
		ctx.l1 = { useOvm: false };
		ctx.l2 = { useOvm: true };

		// Providers
		ctx.l1.provider = new ethers.providers.JsonRpcProvider(
			`${hre.config.providerUrl}:${hre.config.providerPortL1}`
		);
		ctx.l2.provider = new ethers.providers.JsonRpcProvider(
			`${hre.config.providerUrl}:${hre.config.providerPortL2}`
		);
		ctx.l2.provider.getGasPrice = () => ethers.BigNumber.from('0');

		// Watchers
		const response = await axios.get(`${hre.config.providerUrl}:8080/addresses.json`);
		const addresses = response.data;
		ctx.watcher = new Watcher({
			l1: {
				provider: ctx.l1.provider,
				messengerAddress: addresses['Proxy__OVM_L1CrossDomainMessenger'],
			},
			l2: {
				provider: ctx.l2.provider,
				messengerAddress: '0x4200000000000000000000000000000000000007',
			},
		});

		// Accounts
		loadUsers({ ctx: ctx.l1 });
		loadUsers({ ctx: ctx.l2 });

		// Contracts
		connectContracts({ ctx: ctx.l1 });
		connectContracts({ ctx: ctx.l2 });

		// Rates and snapshots
		await simulateExchangeRates({ ctx: ctx.l1 });
		await simulateExchangeRates({ ctx: ctx.l2 });
		await takeDebtSnapshot({ ctx: ctx.l1 });
		await takeDebtSnapshot({ ctx: ctx.l2 });

		// Ensure owner has SNX on L2
		const amount = ethers.utils.parseEther('1000000');
		const balance = await ctx.l2.contracts.Synthetix.balanceOf(ctx.l2.owner.address);
		if (balance.lt(amount)) {
			const delta = amount.sub(balance);
			await deposit({ ctx, from: ctx.l1.owner, to: ctx.l1.owner, amount: delta });
		}
	});
}

module.exports = {
	bootstrapL1,
	bootstrapL2,
	bootstrapDual,
};
