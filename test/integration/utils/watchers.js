const chalk = require('chalk');

async function finalizationOnL2({ ctx, transactionHash }) {
	const messageHashes = await ctx.watcher.getMessageHashesFromL1Tx(transactionHash);
	console.log(chalk.gray(`> Awaiting for ${messageHashes} to finalize on L2...`));

	const promises = messageHashes.map(messageHash =>
		ctx.watcher.getL2TransactionReceipt(messageHash)
	);

	const receipts = await Promise.all(promises).catch(console.log);
	receipts.map(receipt =>
		console.log(chalk.gray(`> Tx finalized on L2: ${receipt.transactionHash}`))
	);
}

async function finalizationOnL1({ ctx, transactionHash }) {
	const messageHashes = await ctx.watcher.getMessageHashesFromL2Tx(transactionHash);
	console.log(chalk.gray(`> Awaiting for ${messageHashes} to finalize on L1...`));

	const promises = messageHashes.map(messageHash =>
		ctx.watcher.getL1TransactionReceipt(messageHash)
	);

	const receipts = await Promise.all(promises).catch(console.log);
	receipts.map(receipt =>
		console.log(chalk.gray(`> Tx finalized on L1: ${receipt.transactionHash}`))
	);
}

module.exports = {
	finalizationOnL1,
	finalizationOnL2,
};
