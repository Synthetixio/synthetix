const ethers = require('ethers');
const { finalizationOnL2 } = require('./watchers');

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

async function withdraw() {
	// TODO
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

module.exports = {
	deposit,
	withdraw,
	approveBridge,
};
