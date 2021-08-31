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

module.exports = {
	getLoan,
};
