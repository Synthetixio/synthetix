const hre = require('hardhat');
const ethers = require('ethers');
const axios = require('axios');
const { loadUsers } = require('./users');
const { Watcher } = require('@eth-optimism/watcher');
const { connectContracts } = require('./contracts');
const { updateExchangeRatesIfNeeded } = require('./rates');
const { deposit } = require('./bridge');

function bootstrapL1({ ctx }) {
	before('bootstrap layer 1 instance', async () => {
		ctx.useOvm = false;
		const network = hre.config.network;

		// Provider
		ctx.provider = _setupProvider({ url: `${hre.config.providerUrl}:${hre.config.providerPort}` });

		// Accounts
		await loadUsers({ ctx, network });

		// Contracts
		connectContracts({ ctx });

		// Rates and snapshots
		await updateExchangeRatesIfNeeded({ ctx });
	});
}

function bootstrapL2({ ctx }) {
	before('bootstrap layer 2 instance', async () => {
		ctx.useOvm = true;
		const network = hre.config.network;

		// Provider
		ctx.provider = _setupProvider({ url: `${hre.config.providerUrl}:${hre.config.providerPort}` });
		ctx.provider.getGasPrice = () => ethers.BigNumber.from('0');

		// Accounts
		await loadUsers({ ctx, network });

		// Contracts
		connectContracts({ ctx });

		// Rates and snapshots
		await updateExchangeRatesIfNeeded({ ctx });
	});
}

function bootstrapDual({ ctx }) {
	before('bootstrap layer 1 and layer 2 intances', async () => {
		ctx.l1 = { useOvm: false };
		ctx.l2 = { useOvm: true };
		const network = hre.config.network;

		// Providers
		ctx.l1.provider = _setupProvider({
			url: `${hre.config.providerUrl}:${hre.config.providerPortL1}`,
		});
		ctx.l2.provider = _setupProvider({
			url: `${hre.config.providerUrl}:${hre.config.providerPortL2}`,
		});
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
		await loadUsers({ ctx: ctx.l1, network });
		await loadUsers({ ctx: ctx.l2, network });

		// Contracts
		connectContracts({ ctx: ctx.l1 });
		connectContracts({ ctx: ctx.l2 });

		// Rates and snapshots
		await updateExchangeRatesIfNeeded({ ctx: ctx.l1 });
		await updateExchangeRatesIfNeeded({ ctx: ctx.l2 });

		// Ensure owner has SNX on L2
		const amount = ethers.utils.parseEther('1000000');
		const balance = await ctx.l2.contracts.Synthetix.balanceOf(ctx.l2.users.owner.address);
		if (balance.lt(amount)) {
			const delta = amount.sub(balance);
			await deposit({ ctx, from: ctx.l1.users.owner, to: ctx.l1.users.owner, amount: delta });
		}
	});
}

function _setupProvider({ url }) {
	return new ethers.providers.JsonRpcProvider({
		url,
		timeout: 600000,
	});
}

module.exports = {
	bootstrapL1,
	bootstrapL2,
	bootstrapDual,
};
