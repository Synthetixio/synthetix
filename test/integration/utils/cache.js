async function takeDebtSnapshot({ ctx }) {
	ctx.contracts.DebtCache = ctx.contracts.DebtCache.connect(ctx.owner);

	const tx = await ctx.contracts.DebtCache.takeDebtSnapshot();
	await tx.wait();
}

module.exports = {
	takeDebtSnapshot,
};
