async function ensureBalance({ ctx, symbol, user, balance }) {
	const token = _getTokenFromSymbol({ ctx, symbol });
	const currentBalance = await token.balanceOf(user.address);

	if (currentBalance.lt(balance)) {
		const amount = balance.sub(currentBalance);

		await _getTokens({ ctx, symbol, user, amount });
		console.log(`New balance: ${await token.balanceOf(user.address)}`);
		// New balance: 0
	}
}

async function _getTokens({ ctx, symbol, user, amount }) {
	if (symbol === 'SNX') {
		await _getSNX({ ctx, user, amount });
	} else if (symbol === 'sUSD') {
		await _getsUSD({ ctx, user, amount });
	} else {
		// TODO: will need to get SNX and then exchange
	}
}

async function _getSNX({ ctx, user, amount }) {
	const Synthetix = ctx.contracts.Synthetix.connect(ctx.users.owner);

	const tx = await Synthetix.transfer(user.address, amount);
	await tx.wait();
}

async function _getsUSD({ ctx, user, amount }) {
	const Synthetix = ctx.contracts.Synthetix.connect(ctx.users.owner);

	let tx;

	tx = await Synthetix.issueSynths(amount);
	await tx.wait();

	tx = await Synthetix.transfer(user.address, amount);
	await tx.wait();
}

function _getTokenFromSymbol({ ctx, symbol }) {
	if (symbol === 'SNX') {
		return ctx.contracts.Synthetix;
	} else {
		return ctx.contracts[`Synth${symbol}`];
	}
}

module.exports = {
	ensureBalance,
};
