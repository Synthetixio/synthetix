const { task } = require('hardhat/config');
const { yellow } = require('chalk');

const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { getSource, getTarget } = require('../../index');

const { loadUsers } = require('../../test/integration/utils/users');
const { ensureBalance } = require('../util/balances');

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

async function fundAccounts({ ctx, accounts }) {
	for (const account of accounts) {
		console.log(`Funding account ${yellow(account)}`);

		await ensureBalance({
			ctx,
			symbol: 'ETH',
			user: { address: account },
			balance: ethers.utils.parseEther('1000'),
		});

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
}

const defaultAccounts = [
	// Hardhat account #1 (deployer)
	'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
	// futures trader
	'0x96D6C55a500782ba07aefb4f620dF2a94CDc7bA7',
];

task('fund-local-accounts')
	.addParam('targetNetwork', 'The SNX network to use', 'local')
	.addFlag('useOvm', 'Use an Optimism chain', true)
	.addOptionalParam(
		'providerUrl',
		'The http provider to use for communicating with the blockchain',
		'http://localhost:8545'
	)
	.addOptionalParam('privateKey', 'Private key to use to sign txs')
	.addOptionalParam('account', 'The account to fund with ETH, SNX, sUSD')
	.setAction(async (taskArguments, hre, runSuper) => {
		const { account, providerUrl, targetNetwork, privateKey } = taskArguments;

		const ctx = {};
		ctx.network = targetNetwork;
		ctx.useOvm = true;
		ctx.users = {};
		ctx.provider = _setupProvider({ url: providerUrl });

		if (privateKey) {
			ctx.users.owner = new ethers.Wallet(privateKey, ctx.provider);
		} else {
			loadUsers({ ctx });
		}

		connectContracts({ ctx });

		console.log(`Using account ${ctx.users.owner.address}`);

		await fundAccounts({
			ctx,
			accounts: account ? [account] : defaultAccounts,
		});
	});
