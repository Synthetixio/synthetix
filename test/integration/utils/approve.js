async function approveIfNeeded({ token, owner, beneficiary, amount }) {
	const allowance = await token.allowance(owner.address, beneficiary.address);

	if (allowance.lt(amount)) {
		token = token.connect(owner);

		const tx = await token.approve(beneficiary.address, amount);
		await tx.wait();
	}
}

module.exports = {
	approveIfNeeded,
};
