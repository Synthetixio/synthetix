function ignoreWaitingPeriod({ ctx }) {
	before('record and reduce waitingPeriodSecs', async () => {
		let { SystemSettings } = ctx.contracts;
		SystemSettings = SystemSettings.connect(ctx.users.owner);

		ctx.waitingPeriodSecs = await SystemSettings.waitingPeriodSecs();

		const tx = await SystemSettings.setWaitingPeriodSecs(0);
		await tx.wait();
	});

	after('restore waiting period', async () => {
		let { SystemSettings } = ctx.contracts;
		SystemSettings = SystemSettings.connect(ctx.users.owner);

		const tx = await SystemSettings.setWaitingPeriodSecs(ctx.waitingPeriodSecs);
		await tx.wait();
	});
}

module.exports = {
	ignoreWaitingPeriod,
};
