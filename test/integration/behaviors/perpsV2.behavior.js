const ethers = require('ethers');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { assert } = require('../../contracts/common');
const {
	constants: { COMPILED_FOLDER, BUILD_FOLDER },
} = require('../../../');

const { addAggregatorAndSetRate } = require('../utils/rates');
const { ensureBalance } = require('../utils/balances');

// convenience methods
const toUnit = v => ethers.utils.parseUnits(v.toString());
const unit = toUnit(1);
const toBN = v => ethers.BigNumber.from(v.toString());
const divideDecimal = (a, b) => a.mul(unit).div(b);
const multiplyDecimal = (a, b) => a.mul(b).div(unit);

const proxiedContract = (proxy, abi, user) => {
	return new ethers.Contract(proxy.address, abi, user);
};

const deployHelper = async ({ AddressResolver, owner, args }) => {
	const buildPath = path.join(__dirname, '..', '..', '..', BUILD_FOLDER, COMPILED_FOLDER);

	const builtArtifact = JSON.parse(
		fs.readFileSync(path.resolve(buildPath, 'TestablePerpsV2Market.json'), 'utf8')
	);

	const factory = new ethers.ContractFactory(builtArtifact.abi, builtArtifact.evm.bytecode, owner);

	const deployedContract = await factory.deploy(
		args.proxy,
		args.marketState,
		args.owner,
		args.resolver
	);
	await deployedContract.deployTransaction.wait();

	await AddressResolver.connect(owner).rebuildCaches([deployedContract.address]);

	return deployedContract;
};

const unifyAbis = implementations => {
	const fullAbi = [];
	for (const implementation of implementations) {
		if (!implementation || !implementation.interface) {
			continue;
		}
		for (const fragment of implementation.interface.format(ethers.FormatTypes)) {
			if (!fullAbi.includes(fragment)) {
				fullAbi.push(fragment);
			}
		}
	}
	return fullAbi;
};

function itCanTrade({ ctx }) {
	describe('opening positions', function() {
		this.retries(0);

		const sUSDAmount = ethers.utils.parseEther('100000');

		let owner, someUser, otherUser;
		let FuturesMarketManager,
			FuturesMarketSettings,
			PerpsV2MarketSettings,
			PerpsV2MarketData,
			PerpsV2MarketHelper,
			PerpsV2MarketETH,
			PerpsV2MarketImplETHPERP,
			PerpsV2MarketLiquidateETHPERP,
			PerpsV2DelayedIntentETHPERP,
			PerpsV2DelayedExecutionETHPERP,
			PerpsV2MarketViewsETHPERP,
			PerpsV2MarketStateETHPERP,
			PerpsV2ProxyETHPERP,
			FuturesMarketBTC,
			ExchangeRates,
			AddressResolver,
			SynthsUSD;

		before('target contracts and users', async () => {
			({
				FuturesMarketManager,
				FuturesMarketSettings,
				PerpsV2MarketSettings,
				PerpsV2MarketData,
				TestablePerpsV2MarketETH: PerpsV2MarketHelper,
				PerpsV2MarketETHPERP: PerpsV2MarketImplETHPERP,
				PerpsV2MarketLiquidateETHPERP,
				PerpsV2DelayedIntentETHPERP,
				PerpsV2DelayedExecutionETHPERP,
				PerpsV2MarketViewsETHPERP,
				PerpsV2MarketStateETHPERP,
				PerpsV2ProxyETHPERP,
				FuturesMarketBTC,
				ExchangeRates,
				AddressResolver,
				SynthsUSD,
			} = ctx.contracts);

			owner = ctx.users.owner;
			someUser = ctx.users.someUser;
			otherUser = ctx.users.otherUser;

			if (!PerpsV2MarketHelper) {
				// Deploy it
				PerpsV2MarketHelper = await deployHelper({
					AddressResolver,
					owner,
					args: {
						proxy: PerpsV2ProxyETHPERP.address,
						marketState: PerpsV2MarketStateETHPERP.address,
						owner: owner.address,
						resolver: AddressResolver.address,
					},
				});
			}

			const unifiedAbis = unifyAbis([
				PerpsV2MarketImplETHPERP,
				PerpsV2MarketViewsETHPERP,
				PerpsV2MarketLiquidateETHPERP,
				PerpsV2DelayedIntentETHPERP,
				PerpsV2DelayedExecutionETHPERP,
			]);
			if (unifiedAbis && PerpsV2ProxyETHPERP) {
				PerpsV2MarketETH = proxiedContract(PerpsV2ProxyETHPERP, unifiedAbis, someUser);
			}
		});

		before('ensure users have sUSD ', async () => {
			await ensureBalance({ ctx, symbol: 'sUSD', user: someUser, balance: sUSDAmount });
		});

		after('reset the sUSD balance', async () => {
			await ensureBalance({ ctx, symbol: 'sUSD', user: someUser, balance: toBN(0) });
		});

		describe('position management', () => {
			let market, assetKey, marketKey, price, posSize1x, debt, priceImpactDelta;
			const margin = toUnit('1000');
			let skipTest;

			before('market and conditions', async () => {
				if (!PerpsV2MarketETH) {
					// Since we are forking mainnet-ovm, if there's no market defined (before adding PerpsV2 to production), it will fail to find it.
					skipTest = true;
					return;
				}
				market = PerpsV2MarketETH.connect(someUser);
				assetKey = await market.baseAsset();
				marketKey = await market.marketKey();
				price = await ExchangeRates.rateForCurrency(assetKey);
				posSize1x = divideDecimal(margin, price);
				priceImpactDelta = toUnit('0.5'); // 500bps (high bps to avoid affecting unrelated tests)
			});

			it('user can transferMargin and withdraw it', async () => {
				if (skipTest) {
					return;
				}
				// Cleanup any outstanding margin (flaky)
				await (await market.withdrawAllMargin()).wait();

				const balance = await SynthsUSD.balanceOf(someUser.address);
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
					if (skipTest) {
						return;
					}
					({ debt } = await FuturesMarketManager.totalDebt());
					await (await market.transferMargin(largerMargin)).wait();
				});

				it('perpsV2 debt increases roughly by the margin deposit', async () => {
					if (skipTest) {
						return;
					}
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
					if (skipTest) {
						return;
					}
					// open position
					const initialMargin = (await market.positions(someUser.address)).margin;
					const desiredFillPrice1 = (
						await PerpsV2MarketHelper.fillPriceWithMeta(posSize1x, priceImpactDelta, 0)
					)[1];
					await market.modifyPosition(posSize1x, desiredFillPrice1);

					const position = await market.positions(someUser.address);
					assert.bnGt(initialMargin, position.margin); // fee was taken
					assert.bnGt(position.margin, multiplyDecimal(initialMargin, toUnit(0.99))); // within 1%
					assert.bnEqual(position.size, posSize1x); // right position size

					// close
					const desiredFillPrice2 = (
						await PerpsV2MarketHelper.fillPriceWithMeta(
							multiplyDecimal(posSize1x, toUnit('-1')),
							priceImpactDelta,
							0
						)
					)[1];
					await (await market.closePosition(desiredFillPrice2)).wait();
					assert.bnEqual((await market.positions(someUser.address)).size, 0); // no position
				});

				it('user can modifyPosition to short', async () => {
					if (skipTest) {
						return;
					}
					const size = multiplyDecimal(posSize1x, toUnit('-2'));

					const desiredFillPrice1 = (
						await PerpsV2MarketHelper.fillPriceWithMeta(size, priceImpactDelta, 0)
					)[1];
					await market.modifyPosition(size, desiredFillPrice1);
					const position = await market.positions(someUser.address);
					assert.bnEqual(position.size, size); // right position size

					// close
					const desiredFillPrice2 = (
						await PerpsV2MarketHelper.fillPriceWithMeta(
							multiplyDecimal(size, toUnit('-1')),
							priceImpactDelta,
							0
						)
					)[1];
					await market.closePosition(desiredFillPrice2);
				});

				describe.skip('existing position', () => {
					// TODO recover test with proper configuration after params changed in mainnet
					before('with slightly under max leverage', async () => {
						if (skipTest) {
							return;
						}
						// reset to known margin
						await market.withdrawAllMargin();
						await market.transferMargin(margin);

						// ensure maxLeverage is set to 100 (mainnet vs localhost config)
						await PerpsV2MarketSettings.connect(owner).setMaxLeverage(marketKey, toUnit('100'));
						await PerpsV2MarketSettings.connect(owner).setMinKeeperFee(toUnit('2'));

						// lever up
						const maxLeverage = await PerpsV2MarketSettings.maxLeverage(marketKey);

						// can't use the _full_ max leverage because of priceImpactDelta. it must be a little below to account
						// for the premium if this is increasing the skew (which this test case it is).
						//
						// maxLeverage = 10x
						// price       = 1
						// margin      = 100
						//
						// size        = margin * price
						//             = 100 * 1       (1x) = 100
						//             = 100 * 1 * 10 (10x) = 1000
						//
						// however, opening a position with this will incur a premium of 0.01 (fillPrice = 1.01).
						//
						// size = margin * price
						//      = 100 * 1.01 * 10 (10x)
						//      = 1010
						//
						// causing a MaxLeverageExceeded error. we lower the multiple by 0.5 to stay within maxLev

						// Note: Since MaxLeverage is set to 100, we need to reduce more the size in order to prevent liquidations
						const size = multiplyDecimal(posSize1x, divideDecimal(maxLeverage, toUnit('7')));

						const desiredFillPrice = (
							await PerpsV2MarketHelper.fillPriceWithMeta(size, priceImpactDelta, 0)
						)[1];
						await market.modifyPosition(size, desiredFillPrice);
					});

					before('if new aggregator is set and price drops 20%', async () => {
						if (skipTest) {
							return;
						}
						const newRate = multiplyDecimal(price, toUnit(0.8)); // 20% drop
						await addAggregatorAndSetRate({ ctx, currencyKey: assetKey, rate: newRate });
					});

					it('user cannot withdraw or modify position', async () => {
						if (skipTest) {
							return;
						}
						// cannot withdraw
						await assert.revert(market.transferMargin(toBN(-1)), 'Insufficient margin');

						// cannot modify
						const desiredFillPrice = (
							await PerpsV2MarketHelper.fillPriceWithMeta(toBN(-1), priceImpactDelta, 0)
						)[1];
						await assert.revert(
							market.modifyPosition(toBN(-1), desiredFillPrice),
							'can be liquidated'
						);

						// cannot close
						await assert.revert(market.closePosition(desiredFillPrice), 'can be liquidated');
					});

					it('position can be liquidated by another user', async () => {
						if (skipTest) {
							return;
						}

						// can liquidate view
						assert.ok(await market.canLiquidate(someUser.address));

						// liquidation tx
						await (
							await FuturesMarketManager.connect(owner).addEndorsedAddresses([otherUser.address])
						).wait();
						const otherCaller = PerpsV2MarketETH.connect(otherUser);
						await (await otherCaller.flagPosition(someUser.address)).wait(); // flag
						await (await otherCaller.forceLiquidatePosition(someUser.address)).wait(); // force liquidate (to prevent reverts due to exceeded price impact)

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
			const marketKeyIsV2 = [];
			let skipTest;

			before('market and conditions', async () => {
				allMarketsAddresses = await FuturesMarketManager['allMarkets(bool)'](true); // only fetch proxied
				allSummaries = await PerpsV2MarketData.allProxiedMarketSummaries();

				if (allMarketsAddresses.length === 0) {
					console.log(
						chalk.yellow(
							'> Skipping markets and parameters since no perpsV2 markets were deployed.'
						)
					);
					skipTest = true;
					return;
				}

				// get market contracts
				allMarkets = [];
				for (const marketAddress of allMarketsAddresses) {
					// this assumes all markets have the same source and abi, which may not be true when a migration to new perpsV2 version happens since it's used to get basic, common params, we use a v1 market here to get the interface
					allMarkets.push(
						new ethers.Contract(marketAddress, FuturesMarketBTC.interface, ctx.provider)
					);
				}

				// get asset and market keys
				assetKeys = [];
				marketKeys = [];
				for (const someMarket of allMarkets) {
					assetKeys.push(await someMarket.baseAsset());
					const marketKey = await someMarket.marketKey();
					marketKeys.push(marketKey);
					const marketSummary = await FuturesMarketManager.marketSummaries([someMarket.address]);
					marketKeyIsV2[marketKey] = marketSummary[0].proxied;
				}
			});

			it('number of markets and summaries', async () => {
				if (skipTest) {
					return;
				}

				assert.ok(allMarketsAddresses.length >= 1);
				assert.ok(allMarketsAddresses.length === allSummaries.length);
			});

			it('assets are unique and have valid rates', async () => {
				if (skipTest) {
					return;
				}

				// ensure all assets are unique, this will not be true in case of migration to
				// newer version of perpsV2 markets, but is a good check for all cases
				// to ensure no market is being duplicated / redeployed etc
				// assert.ok(new Set(assetKeys).size === assetKeys.length);

				// this should be true always as the keys are keys into a mapping
				assert.ok(new Set(marketKeys).size === marketKeys.length);

				for (const assetKey of assetKeys) {
					const res = await ExchangeRates.rateAndInvalid(assetKey);
					assert.bnGt(res.rate, 0);
					assert.notOk(res.invalid);
				}
			});

			it(`per market parameters make sense`, async () => {
				if (skipTest) {
					return;
				}

				for (const marketKey of marketKeys) {
					// leverage
					const maxLeverage = marketKeyIsV2[marketKey]
						? await PerpsV2MarketSettings.maxLeverage(marketKey)
						: await FuturesMarketSettings.maxLeverage(marketKey);
					assert.bnGt(maxLeverage, toUnit(1));
					assert.bnLte(maxLeverage, toUnit(100));

					const maxMarketValue = marketKeyIsV2[marketKey]
						? await PerpsV2MarketSettings.maxMarketValue(marketKey)
						: await FuturesMarketSettings.maxMarketValueUSD(marketKey);
					assert.bnLt(maxMarketValue, toUnit(100000000));

					const skewScale = marketKeyIsV2[marketKey]
						? await PerpsV2MarketSettings.skewScale(marketKey)
						: await FuturesMarketSettings.skewScaleUSD(marketKey);
					// not too small, may not be true for a deprecated (winding down) market
					assert.bnGt(skewScale, toUnit(1));
				}
			});

			it(`global parameters make sense`, async () => {
				// minKeeperFee
				const minKeeperFee = await PerpsV2MarketSettings.minKeeperFee();
				assert.bnGte(minKeeperFee, toUnit(1));
				assert.bnLt(minKeeperFee, toUnit(100));

				// maxKeeperFee
				const maxKeeperFee = await PerpsV2MarketSettings.maxKeeperFee();
				assert.bnGte(maxKeeperFee, toUnit(100));
				assert.bnLt(maxKeeperFee, toUnit(10000));

				// minInitialMargin
				const minInitialMargin = await PerpsV2MarketSettings.minInitialMargin();
				assert.bnGt(minInitialMargin, toUnit(1));
				assert.bnLt(minInitialMargin, toUnit(200));
			});
		});
	});
}

module.exports = {
	itCanTrade,
};
