async function getLoan({ ctx, id, user }) {
	let { CollateralShort } = ctx.contracts;
	CollateralShort = CollateralShort.connect(user);

	let loan;

	if (!ctx.useFork) {
		loan = await CollateralShort.loans(id);
	} else {
		loan = await CollateralShort.getLoan(user.address, id);
	}
	return loan;
}

module.exports = {
	getLoan,
};
