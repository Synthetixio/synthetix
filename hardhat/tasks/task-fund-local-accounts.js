const { task } = require('hardhat/config');
const { yellow } = require('chalk');

const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const {
	getSource,
	getTarget,
	constants: { OVM_GAS_PRICE_GWEI },
} = require('../../index');

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
			symbol: 'SNX',
			user: { address: account },
			balance: ethers.utils.parseEther('1000000000'),
		});

		await ensureBalance({
			ctx,
			symbol: 'sUSD',
			user: { address: account },
			balance: ethers.utils.parseEther('1000000000'),
		});
	}
}

async function whitelistAccounts({ ctx }, accounts) {
	let { SynthsUSD, SynthsETH } = ctx.contracts;

	for (const account of accounts) {
		SynthsUSD = SynthsUSD.connect(ctx.users.owner);
		await SynthsUSD.addWhitelistCanTransfer(account);

		SynthsETH = SynthsETH.connect(ctx.users.owner);
		await SynthsETH.addWhitelistCanTransfer(account);
	}
}

const defaultAccounts = [
	// Hardhat account #1 (deployer)
	// '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',

	// kovan-ovm-futures deployer
	'0x19C6e6B49D529C2ae16dCC794f08a93dd813859D',
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
		ctx.network = targetNetwork;
		ctx.useOvm = true;
		ctx.users = {};
		ctx.deploymentPath = deploymentPath;
		ctx.provider = _setupProvider({ url: providerUrl });
		ctx.provider.getGasPrice = async () => ethers.utils.parseUnits(OVM_GAS_PRICE_GWEI, 'gwei');

		if (privateKey) {
			ctx.users.owner = new ethers.Wallet(privateKey, ctx.provider);
		} else {
			loadUsers({ ctx });
		}

		connectContracts({ ctx });

		console.log(`Using account ${ctx.users.owner.address}`);

		await whitelistAccounts({ ctx }, [
			ctx.users.owner.address,
			'0xC2ecD777d06FFDF8B3179286BEabF52B67E9d991',
		]);

		await fundAccounts({
			ctx,
			accounts: account ? [account] : defaultAccounts,
		});
	});
