const hre = require('hardhat');
const ethers = require('ethers');
const axios = require('axios');
const { loadUsers } = require('./users');
const { Watcher } = require('@eth-optimism/watcher');
const { connectContracts } = require('./contracts');
const { updateExchangeRatesIfNeeded } = require('./rates');
const { ensureBalance } = require('./balances');
const { approveBridge } = require('./bridge');

function bootstrapL1({ ctx }) {
	before('bootstrap layer 1 instance', async () => {
		ctx.useOvm = false;
		ctx.fork = hre.config.fork;

		ctx.provider = _setupProvider({ url: `${hre.config.providerUrl}:${hre.config.providerPort}` });

		await loadUsers({ ctx });
		if (ctx.fork) {
			for (const user of Object.values(ctx.users)) {
				await ensureBalance({ ctx, symbol: 'ETH', user, balance: ethers.utils.parseEther('50') });
			}
		}

		connectContracts({ ctx });

		await updateExchangeRatesIfNeeded({ ctx });
	});
}

function bootstrapL2({ ctx }) {
	before('bootstrap layer 2 instance', async () => {
		ctx.useOvm = true;

		ctx.provider = _setupProvider({ url: `${hre.config.providerUrl}:${hre.config.providerPort}` });
		ctx.provider.getGasPrice = () => ethers.BigNumber.from('0');

		await loadUsers({ ctx });

		connectContracts({ ctx });

		await updateExchangeRatesIfNeeded({ ctx });

		await ensureBalance({
			ctx,
			symbol: 'SNX',
			user: ctx.users.owner,
			balance: ethers.utils.parseEther('1000000'),
		});
	});
}

function bootstrapDual({ ctx }) {
	before('bootstrap layer 1 and layer 2 intances', async () => {
		ctx.l1 = { useOvm: false };
		ctx.l2 = { useOvm: true };

		ctx.l2.l1 = ctx.l1;

		ctx.l1.provider = _setupProvider({
			url: `${hre.config.providerUrl}:${hre.config.providerPortL1}`,
		});
		ctx.l2.provider = _setupProvider({
			url: `${hre.config.providerUrl}:${hre.config.providerPortL2}`,
		});
		ctx.l2.provider.getGasPrice = () => ethers.BigNumber.from('0');

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
		ctx.l1.watcher = ctx.l2.watcher = ctx.watcher;

		await loadUsers({ ctx: ctx.l1 });
		await loadUsers({ ctx: ctx.l2 });

		connectContracts({ ctx: ctx.l1 });
		connectContracts({ ctx: ctx.l2 });

		await updateExchangeRatesIfNeeded({ ctx: ctx.l1 });
		await updateExchangeRatesIfNeeded({ ctx: ctx.l2 });

		await approveBridge({ ctx: ctx.l1, amount: ethers.utils.parseEther('100000000') });

		await ensureBalance({
			ctx: ctx.l2,
			symbol: 'SNX',
			user: ctx.l2.users.owner,
			balance: ethers.utils.parseEther('1000000'),
		});
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
