async function getLoan({ ctx, id, user }) {
	const { CollateralShort, CollateralStateShort } = ctx.contracts;

	let loan;
	if (!CollateralStateShort) {
		loan = await CollateralShort.loans(id);
	} else {
		loan = await CollateralStateShort.getLoan(user.address, id);
	}
	return loan;
}

async function getShortInteractionDelay({ ctx }) {
	const { CollateralShort, CollateralStateShort, SystemSettings } = ctx.contracts;

	let interactionDelay;
	if (!CollateralStateShort) {
		interactionDelay = await SystemSettings.interactionDelay(CollateralShort.address);
	} else {
		interactionDelay = await CollateralShort.interactionDelay();
	}

	return interactionDelay;
}

async function setShortInteractionDelay({ ctx, delay }) {
	const { CollateralShort, CollateralStateShort, SystemSettings } = ctx.contracts;

	if (!CollateralStateShort) {
		const SystemSettingsAsOwner = SystemSettings.connect(ctx.users.owner);
		await SystemSettingsAsOwner.setInteractionDelay(CollateralShort.address, delay);
	} else {
		const CollateralShortAsOwner = CollateralShort.connect(ctx.users.owner);
		await CollateralShortAsOwner.setInteractionDelay(delay);
	}
}

module.exports = {
	getLoan,
	getShortInteractionDelay,
	setShortInteractionDelay,
};
