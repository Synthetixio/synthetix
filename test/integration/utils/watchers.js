const chalk = require('chalk');

async function finalizationOnL2({ ctx, transactionHash }) {
	const messageHashes = await ctx.watcher.getMessageHashesFromL1Tx(transactionHash);
	console.log(chalk.gray(`> Awaiting for ${messageHashes} to finalize on L2...`));

	const promises = messageHashes.map(messageHash =>
		ctx.watcher.getL2TransactionReceipt(messageHash)
	);

	await Promise.all(promises);
}

async function finalizationOnL1({ ctx, transactionHash }) {
	const messageHashes = await ctx.watcher.getMessageHashesFromL2Tx(transactionHash);
	console.log(chalk.gray(`> Awaiting for ${messageHashes} to finalize on L1...`));

	const promises = messageHashes.map(messageHash =>
		ctx.watcher.getL1TransactionReceipt(messageHash)
	);

	await Promise.all(promises);
}

module.exports = {
	finalizationOnL1,
	finalizationOnL2,
};
