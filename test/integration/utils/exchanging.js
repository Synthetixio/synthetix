const ethers = require('ethers');
const { ensureBalance } = require('./balances');
const { toBytes32 } = require('../../../index');
const { updateCache } = require('../utils/rates');
const { skipWaitingPeriod } = require('../utils/skip');

async function exchangeSomething({ ctx }) {
	let { Synthetix } = ctx.contracts;
	Synthetix = Synthetix.connect(ctx.users.owner);

	const sUSDAmount = ethers.utils.parseEther('10');
	await ensureBalance({ ctx, symbol: 'sUSD', user: ctx.users.owner, balance: sUSDAmount });

	await updateCache({ ctx });

	const tx = await Synthetix.exchange(toBytes32('sUSD'), sUSDAmount, toBytes32('sETH'));
	await tx.wait();
}

async function exchangeSynths({ ctx, src, dest, amount, user }) {
	let { Synthetix, ExchangeCircuitBreaker } = ctx.contracts;
	Synthetix = Synthetix.connect(user);
	ExchangeCircuitBreaker = ExchangeCircuitBreaker.connect(ctx.users.owner);

	await ensureBalance({ ctx, symbol: src, user, balance: amount });

	// ensure that circuit breaker wont get int he way
	let tx = await ExchangeCircuitBreaker.resetLastExchangeRate([toBytes32(src), toBytes32(dest)]);

	tx = await Synthetix.exchange(toBytes32(src), amount, toBytes32(dest));
	await tx.wait();

	await skipWaitingPeriod({ ctx });

	tx = await Synthetix.settle(toBytes32(dest));
	await tx.wait();
}

module.exports = {
	exchangeSomething,
	exchangeSynths,
};
