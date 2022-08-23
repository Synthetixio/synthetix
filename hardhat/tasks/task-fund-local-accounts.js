const { task } = require('hardhat/config');
const { yellow } = require('chalk');

const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const { getSource, getTarget } = require('../../index');
const { loadConnections } = require('../../publish/src/util');

const { loadUsers } = require('../../test/integration/utils/users');
const { ensureBalance } = require('../util/balances');

function connectContracts({ ctx }) {
	const { useOvm, deploymentPath } = ctx;
	const network = ctx.network;

	const allTargets = getTarget({ fs, path, network, useOvm, deploymentPath });

	ctx.contracts = {};
	Object.entries(allTargets).map(([name, target]) => {
		ctx.contracts[name] = new ethers.Contract(
			getTarget({ fs, path, network, useOvm, deploymentPath, contract: name }).address,
			getSource({ fs, path, network, useOvm, deploymentPath, contract: target.source }).abi,
			ctx.provider
		);
	});
}

function _setupProvider({ providerUrl, network, useOvm }) {
	const { providerUrl: envProviderUrl } = loadConnections({
		network,
		useOvm,
	});

	const provider = new ethers.providers.JsonRpcProvider(providerUrl || envProviderUrl);
	return provider;
}

async function fundAccounts({ ctx, accounts }) {
	for (const account of accounts) {
		console.log(`Funding account ${yellow(account)}`);

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

const takeDebtSnapshot = async ({ contracts, users }) => {
	console.log('Taking debt snapshot');
	const connectedDebtCache = contracts.DebtCache.connect(users.owner);
	await connectedDebtCache.takeDebtSnapshot();
};

const defaultAccounts = [
	// Hardhat account #1 (deployer)
	// '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',

	// futures keeper
	'0x96D6C55a500782ba07aefb4f620dF2a94CDc7bA7',
	// faucet
	'0xC2ecD777d06FFDF8B3179286BEabF52B67E9d991',
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
	.addOptionalParam('deploymentPath', 'Specify the path to the deployment data directory')
	.setAction(async (taskArguments, hre, runSuper) => {
		const { account, providerUrl, targetNetwork, privateKey, deploymentPath } = taskArguments;

		const ctx = {};
		ctx.providerUrl = providerUrl;
		ctx.network = targetNetwork;
		ctx.useOvm = true;
		ctx.users = {};
		ctx.deploymentPath = deploymentPath;
		ctx.provider = _setupProvider(ctx);
		ctx.provider.getGasPrice = async () => ethers.utils.parseUnits('1', 'gwei');

		if (privateKey) {
			ctx.users.owner = new ethers.Wallet(privateKey, ctx.provider);
		} else {
			loadUsers({ ctx });
		}

		connectContracts({ ctx });

		console.log(`Using account ${ctx.users.owner.address}`);
		await takeDebtSnapshot({ contracts: ctx.contracts, users: ctx.users });
		await fundAccounts({
			ctx,
			accounts: account ? [account] : defaultAccounts,
		});
	});
