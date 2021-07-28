const { task } = require('hardhat/config');
const { yellow } = require('chalk');

const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { getSource, getTarget } = require('../../index');

function connectContracts({ ctx }) {
	const { useOvm } = ctx;
	const network = ctx.network;

	const allTargets = getTarget({ fs, path, network, useOvm });

	ctx.contracts = {};
	Object.entries(allTargets).map(([name, target]) => {
		ctx.contracts[name] = new ethers.Contract(
			getTarget({ fs, path, network, useOvm, contract: name }).address,
			getSource({ fs, path, network, useOvm, contract: target.source }).abi,
			ctx.provider
		);
	});
}

function _setupProvider({ url }) {
	return new ethers.providers.JsonRpcProvider({
		url,
		pollingInterval: 50,
		timeout: 600000,
	});
}

const { loadUsers } = require('../../test/integration/utils/users');
const { ensureBalance } = require('../util/balances');

task('get-snx-local-l2')
	.addParam('account', 'The account to fund with SNX')
	.addParam('snxNetwork', 'The SNX network to use', 'local')
	.addParam('provider', 'The account to fund with SNX', 'http://localhost:8545')
	.addOptionalParam('privateKey', 'The account to fund with SNX', 'http://localhost:8545')
	.setAction(async (taskArguments, hre, runSuper) => {
		const { account, provider, snxNetwork, privateKey } = taskArguments;
		console.log(`Funding account ${yellow(account)}`);

		const ctx = {};
		ctx.network = snxNetwork;
		ctx.useOvm = true;
		ctx.users = {};

		ctx.provider = _setupProvider({ url: provider });

		if (privateKey) {
			ctx.users.owner = new ethers.Wallet(privateKey, ctx.provider);
		} else {
			loadUsers({ ctx });
		}

		connectContracts({ ctx });

		const accounts = [
			// Hardhat account #1 (deployer)
			'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
			// futures trader
			'0x96D6C55a500782ba07aefb4f620dF2a94CDc7bA7',
		];

		// TODO: fix error with WETH funding when cap is exceeded.
		// await ensureBalance({ ctx, symbol: 'WETH', user: { address: account }, balance: ethers.utils.parseEther('1000') })

		for (const account of accounts) {
			await ensureBalance({
				ctx,
				symbol: 'SNX',
				user: { address: account },
				balance: ethers.utils.parseEther('100000000'),
			});
			await ensureBalance({
				ctx,
				symbol: 'sUSD',
				user: { address: account },
				balance: ethers.utils.parseEther('100000000'),
			});
		}
	});
