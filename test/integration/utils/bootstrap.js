const hre = require('hardhat');
const ethers = require('ethers');
const axios = require('axios');
const { loadUsers } = require('./users');
const { Watcher } = require('@eth-optimism/watcher');
const { connectContracts } = require('./contracts');
const { updateExchangeRatesIfNeeded } = require('./rates');
const { ensureBalance } = require('./balances');
const { approveBridge } = require('./bridge');
const { startOpsHeartbeat } = require('../../test-utils/rpc');

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
		ctx.l1mock = { useOvm: false };

		/*
		 * We also bootstrap an L1 provider on the assumption that the L2 integration tests
		 * are running against an Optimism ops tool.
		 * The L1 provider allows us to indirectly fast forward the L2 chain by fast forwarding
		 * the L1 chain and waiting for the L2 chain to sync.
		 * Direct fast forwarding on the L2 chain is not possible because the rpc does not support
		 * the method evm_increaseTime.
		 * */
		ctx.l1mock.provider = _setupProvider({
			url: `${hre.config.providerUrl}:${hre.config.providerPortL1}`,
		});
		ctx.provider = _setupProvider({
			url: `${hre.config.providerUrl}:${hre.config.providerPortL2}`,
		});
		ctx.provider.getGasPrice = () => ethers.BigNumber.from('0');

		await loadUsers({ ctx: ctx.l1mock });
		await loadUsers({ ctx });

		connectContracts({ ctx });

		await updateExchangeRatesIfNeeded({ ctx });

		await ensureBalance({
			ctx,
			symbol: 'SNX',
			user: ctx.users.owner,
			balance: ethers.utils.parseEther('1000000'),
		});

		startOpsHeartbeat({
			l1Wallet: ctx.l1mock.users.user9,
			l2Wallet: ctx.users.user9,
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

		startOpsHeartbeat({
			l1Wallet: ctx.l1.users.user9,
			l2Wallet: ctx.l2.users.user9,
		});
	});
}

function _setupProvider({ url }) {
	return new ethers.providers.JsonRpcProvider({
		url,
		pollingInterval: 50,
		timeout: 600000,
	});
}

module.exports = {
	bootstrapL1,
	bootstrapL2,
	bootstrapDual,
};
