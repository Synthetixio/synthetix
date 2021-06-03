const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { toBytes32 } = require('../../../index');
const { ensureBalance } = require('../utils/balances');
const { waitForEvent } = require('../utils/events');
const {
	utils: { parseEther },
} = ethers;

const sETH = toBytes32('sETH');

function itConfirmsOrders({ ctx }) {
	describe('order confirmation', () => {
		let ExchangeRates, ProxyFuturesMarketETH, FuturesMarketETH;
		let owner;

		async function setPrice(asset, price) {
			const { timestamp } = await ctx.provider.getBlock();
			const tx = await ExchangeRates.updateRates([asset], [parseEther(price)], timestamp);
			await tx.wait();
		}

		before('target contracts and users', () => {
			({ ExchangeRates, ProxyFuturesMarketETH, FuturesMarketETH } = ctx.contracts);

			owner = ctx.users.owner;

			ExchangeRates = ExchangeRates.connect(owner);
			FuturesMarketETH = FuturesMarketETH.connect(owner);
			FuturesMarketETH = FuturesMarketETH.attach(ProxyFuturesMarketETH.address);
		});

		before('ensure the owner has sUSD', async () => {
			const sUSDAmount = parseEther('200');
			await ensureBalance({ ctx: ctx, symbol: 'sUSD', user: owner, balance: sUSDAmount });
		});

		describe('when a user submits an order', () => {
			const leverage = parseEther('1.0');
			const margin = parseEther('150');

			let txReceipt;
			let orderId;

			before('submit the order', async () => {
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

			before('next price update', async () => {
				await setPrice(sETH, '200');
			});

			it('is confirmed by the keeper', async () => {
				const events = await waitForEvent(
					ProxyFuturesMarketETH,
					FuturesMarketETH.filters.OrderConfirmed(orderId),
					txReceipt.blockNumber
				);

				assert.isAtLeast(events.length, 1);
			});
		});
	});
}

function itLiquidatesOrders({ ctx }) {
	describe('order liquidation', () => {
		let owner;
		let user;

		let ExchangeRates, ProxyFuturesMarketETH, FuturesMarketETH;

		async function setPrice(asset, price) {
			const { timestamp } = await ctx.provider.getBlock();
			const tx = await ExchangeRates.updateRates([asset], [parseEther(price)], timestamp);
			await tx.wait();
		}

		before('target contracts and users', () => {
			({ ExchangeRates, ProxyFuturesMarketETH, FuturesMarketETH } = ctx.contracts);

			owner = ctx.users.owner;
			user = ctx.users.someUser;

			ExchangeRates = ExchangeRates.connect(owner);
			FuturesMarketETH = FuturesMarketETH.connect(user);
			FuturesMarketETH = FuturesMarketETH.attach(ProxyFuturesMarketETH.address);
		});

		before('ensure the owner has sUSD', async () => {
			const sUSDAmount = parseEther('200');
			await ensureBalance({ ctx: ctx, symbol: 'sUSD', user: user, balance: sUSDAmount });
		});

		describe('when a user submits an order', () => {
			const leverage = parseEther('1.0');
			const margin = parseEther('150');

			let txReceipt;
			let orderId;

			before('price update', async () => {
				await setPrice(sETH, '200');
			});

			before('submit the order', async () => {
				const tx = await FuturesMarketETH.modifyMarginAndSubmitOrder(margin, leverage);
				txReceipt = await tx.wait(1);

				const orderSubmitted = txReceipt.events.filter(
					({ address, event }) =>
						address === ProxyFuturesMarketETH.address && event === 'OrderSubmitted'
				)[0];

				({
					args: { id: orderId },
				} = orderSubmitted);
			});

			before('next price update', async () => {
				await setPrice(sETH, '200');
			});

			before('confirming order', async () => {
				const events = await waitForEvent(
					FuturesMarketETH,
					FuturesMarketETH.filters.OrderConfirmed(orderId),
					txReceipt.blockNumber,
					10000
				);
				assert.isAtLeast(events.length, 1);
			});

			before('next price update, which puts position into liquidation', async () => {
				// TODO: remove
				await setPrice(sETH, '.0001');
			});

			it('is liquidated by the keeper', async () => {
				const events = await waitForEvent(
					FuturesMarketETH,
					FuturesMarketETH.filters.PositionLiquidated(user.address),
					'latest',
					10000
				);
				assert.isAtLeast(events.length, 1);
			});
		});
	});
}

module.exports = {
	itConfirmsOrders,
	itLiquidatesOrders,
};
