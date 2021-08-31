async function getLoan({ ctx, id, user, fork }) {
	let { CollateralShort } = ctx.contracts;
	CollateralShort = CollateralShort.connect(user);

	let loan;

	if (!fork) {
		loan = await CollateralShort.loans(id);
	} else {
		loan = await CollateralShort.getLoan(user.address, id);
	}
	return loan;
}

module.exports = {
	getLoan,
};
