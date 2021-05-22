async function ensureBalance({ ctx, symbol, user, balance }) {
	const token = _getTokenFromSymbol({ ctx, symbol });
	const currentBalance = await token.balanceOf(user.address);

	if (currentBalance.lt(balance)) {
		const amount = balance.sub(currentBalance);
		console.log('NEEDS', amount.toString());

		await _getTokens({ ctx, token, symbol, user, amount });
	}
}

function _getTokenFromSymbol({ ctx, symbol }) {
	if (symbol === 'SNX') {
		return ctx.contracts.Synthetix;
	} else {
		throw new Error(`TODO: ${symbol} needs implementation.`);
	}
}

async function _getTokens({ ctx, token, symbol, user, amount }) {
	if (symbol === 'SNX') {
		await _getSNX({ ctx, token, user, amount });
	} else {
		// TODO: will need to get SNX and then exchange
	}
}

async function _getSNX({ ctx, token, user, amount }) {
	token = token.connect(ctx.owner);

	const tx = await token.transfer(user.address, amount);
	await tx.wait();
}

module.exports = {
	ensureBalance,
};
