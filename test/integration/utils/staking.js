function ignoreMinimumStakeTime({ ctx }) {
	before('record and reduce minimumStakeTime', async () => {
		let { SystemSettings } = ctx.contracts;
		SystemSettings = SystemSettings.connect(ctx.users.owner);

		ctx.minimumStakeTime = await SystemSettings.minimumStakeTime();

		const tx = await SystemSettings.setMinimumStakeTime(0);
		await tx.wait();
	});

	after('restore minimum stake time', async () => {
		let { SystemSettings } = ctx.contracts;
		SystemSettings = SystemSettings.connect(ctx.users.owner);

		const tx = await SystemSettings.setMinimumStakeTime(ctx.minimumStakeTime);
		await tx.wait();
	});
}

module.exports = {
	ignoreMinimumStakeTime,
};
