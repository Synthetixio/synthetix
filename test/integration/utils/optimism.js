const chalk = require('chalk');
const ethers = require('ethers');
const hre = require('hardhat');
const axios = require('axios');
const { watchOptimismMessengers, Watcher } = require('./optimism-temp');

async function deposit({ ctx, from, to, amount }) {
	let { Synthetix, SynthetixBridgeToOptimism } = ctx.contracts;
	Synthetix = Synthetix.connect(from);
	SynthetixBridgeToOptimism = SynthetixBridgeToOptimism.connect(from);

	let tx;

	const allowance = await Synthetix.allowance(from.address, SynthetixBridgeToOptimism.address);
	if (allowance.lt(amount)) {
		tx = await Synthetix.approve(SynthetixBridgeToOptimism.address, amount);
		await tx.wait();
	}

	tx = await SynthetixBridgeToOptimism.depositTo(to.address, amount);
	const receipt = await tx.wait();

	await finalizationOnL2({ ctx, transactionHash: receipt.transactionHash });
}

async function approveBridge({ ctx, amount }) {
	const { Synthetix, SynthetixBridgeToOptimism } = ctx.contracts;
	let { SynthetixBridgeEscrow } = ctx.contracts;
	SynthetixBridgeEscrow = SynthetixBridgeEscrow.connect(ctx.users.owner);

	let tx;

	tx = await SynthetixBridgeEscrow.approveBridge(
		Synthetix.address,
		SynthetixBridgeToOptimism.address,
		ethers.constants.Zero
	);
	await tx.wait();

	tx = await SynthetixBridgeEscrow.approveBridge(
		Synthetix.address,
		SynthetixBridgeToOptimism.address,
		amount
	);
	await tx.wait();
}

async function setupOptimismWatchers({ ctx, providerUrl }) {
	const response = await axios.get(`${providerUrl}:8080/addresses.json`);
	const addresses = response.data;
	const l1MessengerAddress = addresses['Proxy__OVM_L1CrossDomainMessenger'];
	const l2MessengerAddress = '0x4200000000000000000000000000000000000007';

	ctx.watcher = new Watcher({
		l1: {
			provider: ctx.l1.provider,
			messengerAddress: l1MessengerAddress,
		},
		l2: {
			provider: ctx.l2.provider,
			messengerAddress: l2MessengerAddress,
		},
	});
	ctx.l1.watcher = ctx.l2.watcher = ctx.watcher;

	if (hre.config.debugOptimism) {
		watchOptimismMessengers({ ctx, l1MessengerAddress, l2MessengerAddress });
	}
}

async function finalizationOnL1({ ctx, transactionHash }) {
	const messageHashes = await ctx.watcher.getMessageHashesFromL2Tx(transactionHash);
	if (hre.config.debugOptimism) {
		console.log(chalk.gray(`> Awaiting for ${messageHashes} to finalize on L1...`));
	}

	const promises = messageHashes.map(messageHash =>
		ctx.watcher.getL1TransactionReceipt(messageHash)
	);

	const receipts = await Promise.all(promises).catch(console.log);
	if (hre.config.debugOptimism) {
		receipts.map(receipt =>
			console.log(chalk.gray(`> Tx finalized on L1: ${receipt.transactionHash}`))
		);
	}
}

async function finalizationOnL2({ ctx, transactionHash }) {
	const messageHashes = await ctx.watcher.getMessageHashesFromL1Tx(transactionHash);
	if (hre.config.debugOptimism) {
		console.log(chalk.gray(`> Awaiting for ${messageHashes.join(', ')} to finalize on L2...`));
	}

	const promises = messageHashes.map(messageHash =>
		ctx.watcher.getL2TransactionReceipt(messageHash)
	);

	const receipts = await Promise.all(promises);
	if (hre.config.debugOptimism) {
		receipts.map(receipt =>
			console.log(chalk.gray(`> Tx finalized on L2: ${receipt.transactionHash}`))
		);
	}
}
module.exports = {
	deposit,
	approveBridge,
	finalizationOnL1,
	finalizationOnL2,
	setupOptimismWatchers,
};
