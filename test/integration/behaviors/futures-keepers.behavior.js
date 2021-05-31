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
	const sUSDAmount = parseEther('200');
	const leverage = parseEther('1.0');
	const margin = parseEther('150');

	const sETH = toBytes32('sETH');

	let owner;

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

		owner = ctx.owner;
	});

	before('ensure the owner has sUSD', async () => {
		await ensureBalance({ ctx: ctx, symbol: 'sUSD', user: owner, balance: sUSDAmount });
	});

	describe.only('when a user submits an order', () => {
		let txReceipt;
		let orderId;

		before('submit the order', async () => {
			Synthetix = Synthetix.connect(owner);
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
			console.log(orderId);
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
			// const event = events.find(log => log.event === 'OrderConfirmed');
			// console.log(events)
		});
	});
}

module.exports = {
	itConfirmsOrders,
};
