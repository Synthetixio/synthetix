async function getLoan({ ctx, id, user, ovm }) {
	let { CollateralShort } = ctx.contracts;
	CollateralShort = CollateralShort.connect(user);

	let loan;

	if (ovm) {
		loan = await CollateralShort.loans(id);
	} else {
		loan = await CollateralShort.getLoan(user.address, id);
	}
	return loan;
}

module.exports = {
	getLoan,
};
