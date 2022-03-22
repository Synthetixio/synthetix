const ethers = require('ethers');
// const { toBytes32 } = require('../../..');
const { assert } = require('../../contracts/common');

const { addAggregatorAndSetRate } = require('../utils/rates');
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
			someUser,
			otherUser;
		let // FuturesMarketManager,
			FuturesMarketSettings,
			// FuturesMarketData,
			FuturesMarketBTC,
			// FuturesMarketETH,
			ExchangeRates,
			// SystemStatus,
			SynthsUSD;

		before('target contracts and users', () => {
			({
				// FuturesMarketManager,
				FuturesMarketSettings,
				// FuturesMarketData,
				FuturesMarketBTC,
				// FuturesMarketETH,
				ExchangeRates,
				// SystemStatus,
				SynthsUSD,
			} = ctx.contracts);

			// owner = ctx.users.owner;
			someUser = ctx.users.someUser;
			otherUser = ctx.users.otherUser;
		});

		before('ensure users have sUSD', async () => {
			await ensureBalance({ ctx, symbol: 'sUSD', user: someUser, balance: sUSDAmount });
			// await ensureBalance({ ctx, symbol: 'sUSD', user: otherUser, balance: sUSDAmount });
		});

		describe('opening and closing a position', () => {
			let market, assetKey, marketKey, price, balance, posSize1x;
			const margin = toUnit('1000');

			before('market and conditions', async () => {
				market = FuturesMarketBTC.connect(someUser);
				assetKey = await market.baseAsset();
				marketKey = await market.marketKey();
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

				describe('existing position', () => {
					before('with max leverage', async () => {
						// reset to known margin
						await market.withdrawAllMargin();
						await market.transferMargin(margin);

						// lever up
						const maxLeverage = await FuturesMarketSettings.maxLeverage(marketKey);
						await market.modifyPosition(multiplyDecimal(posSize1x, maxLeverage));
					});

					before('if new aggregator is set and price drops 20%', async () => {
						const newRate = multiplyDecimal(price, toUnit(0.8)); // 20% drop
						await addAggregatorAndSetRate({ ctx, currencyKey: assetKey, rate: newRate });
					});

					it('user cannot withdraw or modify position', async () => {
						// cannot withdraw
						await assert.revert(market.transferMargin(toBN(-1)), 'Insufficient margin');

						// cannot modify
						await assert.revert(market.modifyPosition(toBN(-1)), 'can be liquidated');

						// cannot close
						await assert.revert(market.closePosition(), 'can be liquidated');
					});

					it('position can be liquidated by another user', async () => {
						// can liquidate view
						assert.ok(await market.canLiquidate(someUser.address));

						// liquidation tx
						const otherCaller = FuturesMarketBTC.connect(otherUser);
						await otherCaller.liquidatePosition(someUser.address);

						// position: rekt
						const pos = await market.positions(someUser.address);
						assert.bnEqual(pos.size, 0);
						assert.bnEqual(pos.margin, 0);
					});
				});
			});
		});
	});
}

module.exports = {
	itCanTrade,
};
