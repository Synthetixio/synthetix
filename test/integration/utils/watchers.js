async function finalizationOnL2({ ctx, transactionHash }) {
	const [messageHash] = await ctx.watcher.getMessageHashesFromL1Tx(transactionHash);

	await ctx.watcher.getL2TransactionReceipt(messageHash);
}

async function finalizationOnL1({ ctx, transactionHash }) {
	const [messageHash] = await ctx.watcher.getMessageHashesFromL2Tx(transactionHash);

	await ctx.watcher.getL1TransactionReceipt(messageHash);
}

module.exports = {
	finalizationOnL1,
	finalizationOnL2,
};
