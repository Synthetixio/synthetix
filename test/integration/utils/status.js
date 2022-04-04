async function resumeIssuance({ ctx }) {
	let { SystemStatus } = ctx.contracts;

	const owner = ctx.users.owner;
	SystemStatus = SystemStatus.connect(owner);
	const tx = await SystemStatus.resumeIssuance();
	await tx.wait();
}

module.exports = {
	resumeIssuance,
};
