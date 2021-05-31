const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { toBytes32 } = require('../../../index');
const { ensureBalance } = require('../utils/balances');
const { currentTime } = require('../../utils')();
const { wait } = require('../utils/rpc');
const {
	utils: { parseEther },
} = ethers;

function itConfirmsOrders({ ctx }) {
	const sETH = toBytes32('sETH');

	const sUSDAmount = parseEther('200');
	const leverage = parseEther('1.0');
	const margin = parseEther('150');

	let owner;

	let Synthetix, ExchangeRates, FuturesMarketETH;

	async function setPrice(asset, price) {
		const { timestamp } = await ctx.provider.getBlock();
		const tx = await ExchangeRates.updateRates([asset], [parseEther(price)], timestamp);
		await tx.wait();
	}

	before('target contracts and users', () => {
		({ ExchangeRates, ProxyFuturesMarketETH, FuturesMarketETH } = ctx.contracts);

		owner = ctx.users.owner;
	});

	before('ensure the owner has sUSD', async () => {
		await ensureBalance({ ctx: ctx, symbol: 'sUSD', user: owner, balance: sUSDAmount });
	});

	describe('when a user submits an order', () => {
		let txReceipt;
		let orderId;

		before('submit the order', async () => {
			FuturesMarketETH = FuturesMarketETH.connect(owner);

			const tx = await FuturesMarketETH.modifyMarginAndSubmitOrder(margin, leverage, {
				from: owner.address,
			});
			txReceipt = await tx.wait();

			const orderSubmitted = txReceipt.events.filter(
				({ address, event }) =>
					address === ProxyFuturesMarketETH.address && event === 'OrderSubmitted'
			)[0];

			({
				args: { id: orderId },
			} = orderSubmitted);
		});

		before('next exrates round', async () => {
			ExchangeRates = ExchangeRates.connect(owner);
			await setPrice(sETH, '200');
		});

		it('is confirmed by the keeper within a second', async () => {
			await wait({ seconds: 2 });

			let events = await ProxyFuturesMarketETH.queryFilter(
				FuturesMarketETH.filters.OrderConfirmed(orderId),
				txReceipt.blockNumber
			);

			assert.isAtLeast(events.length, 1);
		});
	});
}

function itLiquidatesOrders({ ctx }) {
	const sUSDAmount = parseEther('200');
	const leverage = parseEther('1.0');
	const margin = parseEther('150');

	const sETH = toBytes32('sETH');

	let owner;
	let user;

	let Synthetix, ExchangeRates, SynthsETH, FuturesMarketETH, Market;

	async function setPrice(asset, price) {
		const { timestamp } = await ctx.provider.getBlock();
		const tx = await ExchangeRates.updateRates([asset], [parseEther(price)], timestamp);
		await tx.wait();
	}

	before('target contracts and users', () => {
		({
			Synthetix,
			ExchangeRates,
			SynthsETH,
			ProxyFuturesMarketETH,
			FuturesMarketETH,
		} = ctx.contracts);

		owner = ctx.users.owner;
		user = ctx.users.someUser;
	});

	before('ensure the owner has sUSD', async () => {
		await ensureBalance({ ctx: ctx, symbol: 'sUSD', user: user, balance: sUSDAmount });
	});

	describe.only('when a user submits an order', () => {
		let txReceipt;
		let orderId;

		before('submit the order', async () => {
			FuturesMarketETH = FuturesMarketETH.connect(user);

			const tx = await FuturesMarketETH.modifyMarginAndSubmitOrder(margin, leverage);
			txReceipt = await tx.wait();

			const orderSubmitted = txReceipt.events.filter(
				({ address, event }) =>
					address === ProxyFuturesMarketETH.address && event === 'OrderSubmitted'
			)[0];

			({
				args: { id: orderId },
			} = orderSubmitted);
		});

		before('next exrates round', async () => {
			ExchangeRates = ExchangeRates.connect(owner);
			await setPrice(sETH, '200');
		});

		before('confirming order', async () => {
			await wait({ seconds: 3 });
			// TODO: assert order is confirmed.
		});

		before('price update', async () => {
			await setPrice(sETH, '0.01');
		});

		it('is liquidated by the keeper within a second', async () => {
			// await wait({ seconds: 2 });
			// // event PositionLiquidated(address indexed account, address indexed liquidator, int size, uint price);
			// let events = await ProxyFuturesMarketETH.queryFilter(
			// 	FuturesMarketETH.filters.PositionLiquidated(owner.address),
			// 	txReceipt.blockNumber
			// );
			// assert.isAtLeast(events.length, 1);
		});
	});
}

module.exports = {
	itConfirmsOrders,
	itLiquidatesOrders,
};
