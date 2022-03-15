const ethers = require('ethers');
// const { toBytes32 } = require('../../..');
const { assert } = require('../../contracts/common');

// const { getRate, addAggregatorAndSetRate } = require('../utils/rates');
const { ensureBalance } = require('../utils/balances');

// conveniece methods
const toUnit = v => ethers.utils.parseUnits(v.toString());
const unit = toUnit(1);
const toBN = v => ethers.BigNumber.from(v.toString());
const divideDecimal = (a, b) => a.mul(unit).div(b);
const multiplyDecimal = (a, b) => a.mul(b).div(unit);

function itCanTrade({ ctx }) {
	describe('opening positions', function() {
		this.retries(0);

		const sUSDAmount = ethers.utils.parseEther('10000');

		let // owner,
			someUser;
		let // FuturesMarketManager,
			// FuturesMarketSettings,
			// FuturesMarketData,
			FuturesMarketBTC,
			// FuturesMarketETH,
			ExchangeRates,
			// SystemStatus,
			SynthsUSD;

		before('target contracts and users', () => {
			({
				// FuturesMarketManager,
				// FuturesMarketSettings,
				// FuturesMarketData,
				FuturesMarketBTC,
				// FuturesMarketETH,
				ExchangeRates,
				// SystemStatus,
				SynthsUSD,
			} = ctx.contracts);

			// owner = ctx.users.owner;
			someUser = ctx.users.someUser;
			// otherUser = ctx.users.otherUser;
		});

		before('ensure users have sUSD', async () => {
			await ensureBalance({ ctx, symbol: 'sUSD', user: someUser, balance: sUSDAmount });
			// await ensureBalance({ ctx, symbol: 'sUSD', user: otherUser, balance: sUSDAmount });
		});

		describe('opening and closing a position', () => {
			let market, assetKey, price, balance, posSize1x;
			const margin = toUnit('1000');

			before('market and conditions', async () => {
				market = FuturesMarketBTC.connect(someUser);
				assetKey = await market.baseAsset();
				price = await ExchangeRates.rateForCurrency(assetKey);
				balance = await SynthsUSD.balanceOf(someUser.address);
				posSize1x = divideDecimal(margin, price);
			});

			it('user can transferMargin and withdraw it', async () => {
				// transfer
				await market.transferMargin(margin);
				assert.bnEqual(await SynthsUSD.balanceOf(someUser.address), balance.sub(margin));

				// withdraw
				await market.withdrawAllMargin();
				const withdrawBalance = await SynthsUSD.balanceOf(someUser.address);
				assert.bnEqual(withdrawBalance, balance);
			});

			describe('with funded margin', () => {
				before('fund margin', async () => {
					await market.transferMargin(margin);
				});

				it('user can open and close position', async () => {
					// open position
					const initialMargin = (await market.positions(someUser.address)).margin;
					await market.modifyPosition(posSize1x);

					const position = await market.positions(someUser.address);
					assert.bnGt(initialMargin, position.margin); // fee was taken
					assert.bnGt(position.margin, multiplyDecimal(initialMargin, toUnit(0.99))); // within 1%
					assert.bnEqual(position.size, posSize1x); // right position size

					// close
					await market.closePosition();
					assert.bnEqual((await market.positions(someUser.address)).size, 0); // no position
				});

				it('user can modifyPosition to short', async () => {
					await market.modifyPosition(posSize1x.mul(toBN(-5)));
					const position = await market.positions(someUser.address);
					assert.bnEqual(position.size, posSize1x.mul(toBN(-5))); // right position size

					// close
					await market.closePosition();
				});
			});
		});
	});
}

module.exports = {
	itCanTrade,
};
