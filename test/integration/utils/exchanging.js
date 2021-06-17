const ethers = require('ethers');
const { ensureBalance } = require('./balances');
const { toBytes32 } = require('../../../index');

async function exchangeSomething({ ctx }) {
	let { Synthetix } = ctx.contracts;
	Synthetix = Synthetix.connect(ctx.users.owner);

	const sUSDAmount = ethers.utils.parseEther('10');
	await ensureBalance({ ctx, symbol: 'sUSD', user: ctx.users.owner, balance: sUSDAmount });

	const tx = await Synthetix.exchange(toBytes32('sUSD'), sUSDAmount, toBytes32('sETH'));
	await tx.wait();
}

module.exports = {
	exchangeSomething,
};
