const ethers = require('ethers');
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

		const sUSDAmount = ethers.utils.parseEther('100000');

		let someUser, otherUser;
		let FuturesMarketManager,
			FuturesMarketSettings,
			FuturesMarketData,
			FuturesMarketBTC,
			ExchangeRates,
			SynthsUSD;

		before('target contracts and users', () => {
			({
				FuturesMarketManager,
				FuturesMarketSettings,
				FuturesMarketData,
				FuturesMarketBTC,
				ExchangeRates,
				SynthsUSD,
			} = ctx.contracts);

			// owner = ctx.users.owner;
			someUser = ctx.users.someUser;
			otherUser = ctx.users.otherUser;
		});

		before('ensure users have sUSD', async () => {
			await ensureBalance({ ctx, symbol: 'sUSD', user: someUser, balance: sUSDAmount });
		});

		after('reset the sUSD balance', async () => {
			await ensureBalance({ ctx, symbol: 'sUSD', user: someUser, balance: toBN(0) });
		});

		describe('position management', () => {
			let market, assetKey, marketKey, price, balance, posSize1x, debt;
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
				await (await market.withdrawAllMargin()).wait();
				const withdrawBalance = await SynthsUSD.balanceOf(someUser.address);
				assert.bnEqual(withdrawBalance, balance);
			});

			describe('with funded margin', () => {
				const largerMargin = margin.mul(50); // 50k
				before('fund margin', async () => {
					({ debt } = await FuturesMarketManager.totalDebt());
					await (await market.transferMargin(largerMargin)).wait();
				});

				it('futures debt increases roughly by the margin deposit', async () => {
					const res = await FuturesMarketManager.totalDebt();
					assert.bnClose(
						res.debt.toString(),
						debt.add(largerMargin).toString(),
						// time passage causes funding changes which can amount to several $ per second, depending
						// on market conditions at the time (for fork tests)
						// since the deposit is 50000$, change within 500$ is a sufficient test of the debt being updated
						toUnit(500).toString()
					);
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
					await (await market.closePosition()).wait();
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
						await (await otherCaller.liquidatePosition(someUser.address)).wait(); // wait for views to be correct

						// position: rekt
						const pos = await market.positions(someUser.address);
						assert.bnEqual(pos.size, 0);
						assert.bnEqual(pos.margin, 0);
					});
				});
			});
		});

		describe('markets and parameters', () => {
			let allMarketsAddresses, allSummaries, allMarkets, assetKeys, marketKeys;

			before('market and conditions', async () => {
				allMarketsAddresses = await FuturesMarketManager.allMarkets();
				allSummaries = await FuturesMarketData.allMarketSummaries();

				// get market contracts
				allMarkets = [];
				for (const marketAddress of allMarketsAddresses) {
					// this assumes all markets have the same source and abi, which
					// may not be true when a migration to new futures version happens
					allMarkets.push(
						new ethers.Contract(marketAddress, FuturesMarketBTC.interface, ctx.provider)
					);
				}

				// get asset and market keys
				assetKeys = [];
				marketKeys = [];
				for (const someMarket of allMarkets) {
					assetKeys.push(await someMarket.baseAsset());
					marketKeys.push(await someMarket.marketKey());
				}
			});

			it('number of markets and summaries', async () => {
				assert.ok(allMarketsAddresses.length >= 2);
				assert.ok(allMarketsAddresses.length === allSummaries.length);
			});

			it('assets are unique and have valid rates', async () => {
				// ensure all assets are unique, this will not be true in case of migration to
				// newer version of futures markets, but is a good check for all cases
				// to ensure no market is being duplicated / redeployed etc
				assert.ok(new Set(assetKeys).size === assetKeys.length);

				// this should be true always as the keys are keys into a mapping
				assert.ok(new Set(marketKeys).size === marketKeys.length);

				for (const assetKey of assetKeys) {
					const res = await ExchangeRates.rateAndInvalid(assetKey);
					assert.bnGt(res.rate, 0);
					assert.notOk(res.invalid);
				}
			});

			it(`per market parameters make sense`, async () => {
				for (const marketKey of marketKeys) {
					// leverage
					const maxLeverage = await FuturesMarketSettings.maxLeverage(marketKey);
					assert.bnGt(maxLeverage, toUnit(1));
					assert.bnLt(maxLeverage, toUnit(100));

					const maxMarketValueUSD = await FuturesMarketSettings.maxMarketValueUSD(marketKey);
					assert.bnLt(maxMarketValueUSD, toUnit(100000000));

					const skewScaleUSD = await FuturesMarketSettings.skewScaleUSD(marketKey);
					// not too small, may not be true for a deprecated (winding down) market
					assert.bnGt(skewScaleUSD, toUnit(1));
				}
			});

			it(`global parameters make sense`, async () => {
				// minKeeperFee
				const minKeeperFee = await FuturesMarketSettings.minKeeperFee();
				assert.bnGte(minKeeperFee, toUnit(1));
				assert.bnLt(minKeeperFee, toUnit(100));

				// minInitialMargin
				const minInitialMargin = await FuturesMarketSettings.minInitialMargin();
				assert.bnGt(minInitialMargin, toUnit(1));
				assert.bnLt(minInitialMargin, toUnit(200));
			});
		});
	});
}

module.exports = {
	itCanTrade,
};
