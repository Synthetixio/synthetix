const ethers = require('ethers');
const { deposit } = require('./bridge');
const { toBytes32 } = require('../../..');

async function ensureBalance({ ctx, symbol, user, balance }) {
	const token = _getTokenFromSymbol({ ctx, symbol });
	const currentBalance = await token.balanceOf(user.address);

	if (currentBalance.lt(balance)) {
		const amount = balance.sub(currentBalance);

		await _getTokens({ ctx, symbol, user, amount });
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
	let { Synthetix } = ctx.contracts;

	const ownerTransferable = await Synthetix.transferableSynthetix(ctx.users.owner.address);
	if (ownerTransferable.lt(amount)) {
		await _getSNXForOwner({ ctx, amount: amount.sub(ownerTransferable) });
	}

	Synthetix = Synthetix.connect(ctx.users.owner);
	const tx = await Synthetix.transfer(user.address, amount);
	await tx.wait();
}

async function _getSNXForOwner({ ctx, amount }) {
	if (!ctx.useOvm) {
		throw new Error('There is no more SNX!');
	} else {
		if (ctx.l1) {
			await _getSNXForOwnerOnL2ByDepositing({ ctx: ctx.l1, amount });
		} else {
			await _getSNXForOwnerOnL2ByHackMinting({ ctx, amount });
		}
	}
}

async function _getSNXForOwnerOnL2ByDepositing({ ctx, amount }) {
	await deposit({ ctx, from: ctx.users.owner, to: ctx.users.owner, amount });
}

async function _getSNXForOwnerOnL2ByHackMinting({ ctx, amount }) {
	const owner = ctx.users.owner;

	let { Synthetix, AddressResolver } = ctx.contracts;

	const bridgeName = toBytes32('SynthetixBridgeToBase');
	const bridgeAddress = await AddressResolver.getAddress(bridgeName);

	let tx;

	AddressResolver = AddressResolver.connect(owner);
	tx = await AddressResolver.importAddresses([bridgeName], [owner.address]);
	await tx.wait();
	tx = await AddressResolver.rebuildCaches([Synthetix.address]);
	await tx.wait();

	Synthetix = Synthetix.connect(owner);
	tx = await Synthetix.mintSecondary(owner.address, amount);
	await tx.wait();

	tx = await AddressResolver.importAddresses([bridgeName], [bridgeAddress]);
	await tx.wait();
	tx = await AddressResolver.rebuildCaches([Synthetix.address]);
	await tx.wait();
}

async function _getsUSD({ ctx, user, amount }) {
	const Synthetix = ctx.contracts.Synthetix.connect(ctx.users.owner);

	let tx;

	const requiredSNX = await _getSNXAmountRequiredForsUSDAmount({ ctx, amount });
	await ensureBalance({ ctx, symbol: 'SNX', user, balance: requiredSNX });

	tx = await Synthetix.issueSynths(amount);
	await tx.wait();

	tx = await Synthetix.transfer(user.address, amount);
	await tx.wait();
}

async function _getSNXAmountRequiredForsUSDAmount({ ctx, amount }) {
	// TODO: Do not assume that the c-ratio is 600%
	// TODO: Do not assume that 1 SNX = 1 sUSD

	return amount.mul(ethers.BigNumber.from('6'));
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
