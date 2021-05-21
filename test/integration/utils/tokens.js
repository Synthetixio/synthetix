let _associatedContract;

async function ensureBalance({ ctx, tokenName, user, balance }) {
	const token = ctx.contracts[tokenName];

	const currentBalance = await token.balanceOf(user.address);
	if (currentBalance.lt(balance)) {
		const amount = balance.sub(currentBalance);

		await _printTokens({ ctx, tokenName, user, amount });
	}
}

async function _printTokens({ ctx, tokenName, user, amount }) {
	let tokenState = ctx.contracts[`TokenState${tokenName}`];
	tokenState = tokenState.connect(ctx.owner);

	const associatedContract = await tokenState.associatedContract();

	let tx;

	tx = await tokenState.setAssociatedContract(ctx.owner.address);
	await tx.wait();

	try {
		tx = await tokenState.setBalanceOf(user.address, amount);
		await tx.wait();
	} catch(err) {}

	tx = await tokenState.setAssociatedContract(associatedContract);
	await tx.wait();
}

module.exports = {
	ensureBalance,
};
