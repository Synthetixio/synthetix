const { artifacts, contract, web3 } = require('hardhat');
const { toWei, toBN } = web3.utils;
const { toBytes32 } = require('../../');
const { toUnit } = require('../utils')();
const { setupContract, setupAllContracts } = require('./setup');
const { assert } = require('./common');
const { setupPriceAggregators, updateAggregatorRates } = require('./helpers');

const FuturesMarket = artifacts.require('FuturesMarket');

contract('FuturesMarketData', accounts => {
	let addressResolver,
		futuresMarket,
		sethMarket,
		futuresMarketManager,
		futuresMarketSettings,
		futuresMarketData,
		exchangeRates,
		exchangeCircuitBreaker,
		sUSD,
		systemSettings,
		marketKey,
		baseAsset;
	const keySuffix = '-perp';
	const newMarketKey = toBytes32('sETH' + keySuffix);
	const newAssetKey = toBytes32('sETH');

	const owner = accounts[1];
	const trader1 = accounts[2];
	const trader2 = accounts[3];
	const trader3 = accounts[4];
	const traderInitialBalance = toUnit(1000000);

	async function setPrice(asset, price, resetCircuitBreaker = true) {
		await updateAggregatorRates(exchangeRates, [asset], [price]);
		// reset the last price to the new price, so that we don't trip the breaker
		// on various tests that change prices beyond the allowed deviation
		if (resetCircuitBreaker) {
			// flag defaults to true because the circuit breaker is not tested in most tests
			await exchangeCircuitBreaker.resetLastExchangeRate([asset], { from: owner });
		}
	}

	before(async () => {
		({
			AddressResolver: addressResolver,
			FuturesMarketBTC: futuresMarket,
			FuturesMarketManager: futuresMarketManager,
			FuturesMarketSettings: futuresMarketSettings,
			FuturesMarketData: futuresMarketData,
			ExchangeRates: exchangeRates,
			ExchangeCircuitBreaker: exchangeCircuitBreaker,
			SynthsUSD: sUSD,
			SystemSettings: systemSettings,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sBTC', 'sETH', 'sLINK'],
			contracts: [
				'FuturesMarketManager',
				'FuturesMarketSettings',
				'FuturesMarketBTC',
				'FuturesMarketData',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'ExchangeCircuitBreaker',
				'SystemStatus',
				'SystemSettings',
				'Synthetix',
				'CollateralManager',
			],
		}));

		// Add a couple of additional markets.
		for (const symbol of ['sETH', 'sLINK']) {
			const assetKey = toBytes32(symbol);
			const marketKey = toBytes32(symbol + keySuffix);

			const market = await setupContract({
				accounts,
				contract: 'FuturesMarket' + symbol,
				source: 'FuturesMarket',
				args: [
					addressResolver.address,
					assetKey, // base asset
					marketKey,
				],
			});

			await addressResolver.rebuildCaches([market.address], { from: owner });
			await futuresMarketManager.addMarkets([market.address], { from: owner });

			await setupPriceAggregators(exchangeRates, owner, [assetKey]);
			await setPrice(assetKey, toUnit(1000));

			// Now that the market exists we can set the all its parameters
			await futuresMarketSettings.setParameters(
				marketKey,
				toWei('0.005'), // 0.5% taker fee
				toWei('0.001'), // 0.1% maker fee
				toWei('0.0005'), // 0.05% taker fee next price
				toWei('0'), // 0% maker fee next price
				toBN('2'), // 2 rounds next price confirm window
				toWei('5'), // 5x max leverage
				toWei('1000000'), // 1000000 max total margin
				toWei('0.2'), // 20% max funding rate
				toWei('100000'), // 100000 USD skewScaleUSD
				{ from: owner }
			);
		}

		baseAsset = await futuresMarket.baseAsset();
		marketKey = await futuresMarket.marketKey();

		// Update the rates to ensure they aren't stale
		await setPrice(baseAsset, toUnit(100));

		// disable dynamic fee for simpler testing
		await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });

		// Issue the traders some sUSD
		await sUSD.issue(trader1, traderInitialBalance);
		await sUSD.issue(trader2, traderInitialBalance);
		await sUSD.issue(trader3, traderInitialBalance);

		// The traders take positions on market
		await futuresMarket.transferMargin(toUnit('1000'), { from: trader1 });
		await futuresMarket.modifyPosition(toUnit('5'), { from: trader1 });

		await futuresMarket.transferMargin(toUnit('750'), { from: trader2 });
		await futuresMarket.modifyPosition(toUnit('-10'), { from: trader2 });

		await setPrice(baseAsset, toUnit('100'));
		await futuresMarket.transferMargin(toUnit('4000'), { from: trader3 });
		await futuresMarket.modifyPosition(toUnit('1.25'), { from: trader3 });

		sethMarket = await FuturesMarket.at(await futuresMarketManager.marketForKey(newMarketKey));

		await sethMarket.transferMargin(toUnit('3000'), { from: trader3 });
		await sethMarket.modifyPosition(toUnit('4'), { from: trader3 });
		await setPrice(newAssetKey, toUnit('999'));
	});

	it('Resolver is properly set', async () => {
		assert.equal(await futuresMarketData.resolverProxy(), addressResolver.address);
	});

	describe('Globals', () => {
		it('Global futures settings are properly fetched', async () => {
			const globals = await futuresMarketData.globals();

			assert.bnEqual(await futuresMarketSettings.minInitialMargin(), globals.minInitialMargin);
			assert.bnEqual(globals.minInitialMargin, toUnit('40'));
			assert.bnEqual(await futuresMarketSettings.minKeeperFee(), globals.minKeeperFee);
			assert.bnEqual(globals.minKeeperFee, toUnit('20'));
			assert.bnEqual(
				await futuresMarketSettings.liquidationFeeRatio(),
				globals.liquidationFeeRatio
			);
			assert.bnEqual(globals.liquidationFeeRatio, toUnit('0.0035'));
			assert.bnEqual(
				await futuresMarketSettings.liquidationBufferRatio(),
				globals.liquidationBufferRatio
			);
			assert.bnEqual(globals.liquidationBufferRatio, toUnit('0.0025'));
		});
	});

	describe('Market details', () => {
		it('By address', async () => {
			const details = await futuresMarketData.marketDetails(futuresMarket.address);

			const params = await futuresMarketData.parameters(baseAsset);

			assert.equal(details.market, futuresMarket.address);
			assert.equal(details.baseAsset, baseAsset);
			assert.bnEqual(details.feeRates.takerFee, params.takerFee);
			assert.bnEqual(details.feeRates.makerFee, params.makerFee);
			assert.bnEqual(details.feeRates.takerFeeNextPrice, params.takerFeeNextPrice);
			assert.bnEqual(details.feeRates.makerFeeNextPrice, params.makerFeeNextPrice);
			assert.bnEqual(details.limits.maxLeverage, params.maxLeverage);
			assert.bnEqual(details.limits.maxMarketValueUSD, params.maxMarketValueUSD);

			assert.bnEqual(details.fundingParameters.maxFundingRate, params.maxFundingRate);
			assert.bnEqual(details.fundingParameters.skewScaleUSD, params.skewScaleUSD);

			assert.bnEqual(details.marketSizeDetails.marketSize, await futuresMarket.marketSize());
			const marketSizes = await futuresMarket.marketSizes();
			assert.bnEqual(details.marketSizeDetails.sides.long, marketSizes.long);
			assert.bnEqual(details.marketSizeDetails.sides.short, marketSizes.short);
			assert.bnEqual(details.marketSizeDetails.marketDebt, (await futuresMarket.marketDebt()).debt);
			assert.bnEqual(details.marketSizeDetails.marketSkew, await futuresMarket.marketSkew());

			const assetPrice = await futuresMarket.assetPrice();
			assert.bnEqual(details.priceDetails.price, assetPrice.price);
			assert.equal(details.priceDetails.invalid, assetPrice.invalid);
		});

		it('By market key', async () => {
			const details = await futuresMarketData.marketDetails(futuresMarket.address);
			const assetDetails = await futuresMarketData.marketDetailsForKey(marketKey);
			assert.equal(JSON.stringify(assetDetails), JSON.stringify(details));
		});
	});

	describe('Position details', () => {
		it('By address', async () => {
			const details = await futuresMarketData.positionDetails(futuresMarket.address, trader3);
			const details2 = await futuresMarketData.positionDetails(futuresMarket.address, trader1);

			const position = await futuresMarket.positions(trader1);
			assert.bnEqual(details2.position.margin, position.margin);
			assert.bnEqual(details2.position.size, position.size);
			assert.bnEqual(details2.position.lastPrice, position.lastPrice);
			assert.bnEqual(details2.position.lastFundingIndex, position.lastFundingIndex);

			const notional = await futuresMarket.notionalValue(trader1);
			assert.bnEqual(details2.notionalValue, notional.value);
			const profitLoss = await futuresMarket.profitLoss(trader1);
			assert.bnEqual(details2.profitLoss, profitLoss.pnl);
			const accruedFunding = await futuresMarket.accruedFunding(trader1);
			assert.bnEqual(details2.accruedFunding, accruedFunding.funding);
			const remaining = await futuresMarket.remainingMargin(trader1);
			assert.bnEqual(details2.remainingMargin, remaining.marginRemaining);
			const accessible = await futuresMarket.accessibleMargin(trader1);
			assert.bnEqual(details2.accessibleMargin, accessible.marginAccessible);
			const lp = await futuresMarket.liquidationPrice(trader1);
			assert.bnEqual(details2.liquidationPrice, lp[0]);
			assert.equal(details.canLiquidatePosition, await futuresMarket.canLiquidate(trader1));
		});

		it('By market key', async () => {
			const details = await futuresMarketData.positionDetails(futuresMarket.address, trader3);
			const details2 = await futuresMarketData.positionDetails(sethMarket.address, trader3);
			const detailsByAsset = await futuresMarketData.positionDetailsForMarketKey(
				marketKey,
				trader3
			);
			const detailsByAsset2 = await futuresMarketData.positionDetailsForMarketKey(
				newMarketKey,
				trader3
			);

			assert.equal(JSON.stringify(detailsByAsset), JSON.stringify(details));
			assert.equal(JSON.stringify(detailsByAsset2), JSON.stringify(details2));
		});
	});

	describe('Market summaries', () => {
		it('For markets', async () => {
			const sETHSummary = (await futuresMarketData.marketSummariesForKeys([newMarketKey]))[0];

			const params = await futuresMarketData.parameters(newMarketKey); // sETH

			assert.equal(sETHSummary.market, sethMarket.address);
			assert.equal(sETHSummary.asset, newAssetKey);
			assert.equal(sETHSummary.maxLeverage, params.maxLeverage);
			const price = await sethMarket.assetPrice();
			assert.equal(sETHSummary.price, price.price);
			assert.equal(sETHSummary.marketSize, await sethMarket.marketSize());
			assert.equal(sETHSummary.marketSkew, await sethMarket.marketSkew());
			assert.equal(sETHSummary.currentFundingRate, await sethMarket.currentFundingRate());
			assert.equal(sETHSummary.feeRates.takerFee, params.takerFee);
			assert.equal(sETHSummary.feeRates.makerFee, params.makerFee);
			assert.equal(sETHSummary.feeRates.takerFeeNextPrice, params.takerFeeNextPrice);
			assert.equal(sETHSummary.feeRates.makerFeeNextPrice, params.makerFeeNextPrice);
		});

		it('For market keys', async () => {
			const summaries = await futuresMarketData.marketSummaries([
				futuresMarket.address,
				sethMarket.address,
			]);
			const summariesForAsset = await futuresMarketData.marketSummariesForKeys(
				['sBTC', 'sETH' + keySuffix].map(toBytes32)
			);
			assert.equal(JSON.stringify(summaries), JSON.stringify(summariesForAsset));
		});

		it('All summaries', async () => {
			const summaries = await futuresMarketData.allMarketSummaries();

			const sBTCSummary = summaries.find(summary => summary.asset === toBytes32('sBTC'));
			const sETHSummary = summaries.find(summary => summary.asset === toBytes32('sETH'));
			const sLINKSummary = summaries.find(summary => summary.asset === toBytes32('sLINK'));

			const fmParams = await futuresMarketData.parameters(marketKey);

			assert.equal(sBTCSummary.market, futuresMarket.address);
			assert.equal(sBTCSummary.asset, baseAsset);
			assert.equal(sBTCSummary.maxLeverage, fmParams.maxLeverage);
			let price = await futuresMarket.assetPrice();
			assert.equal(sBTCSummary.price, price.price);
			assert.equal(sBTCSummary.marketSize, await futuresMarket.marketSize());
			assert.equal(sBTCSummary.marketSkew, await futuresMarket.marketSkew());
			assert.equal(sBTCSummary.currentFundingRate, await futuresMarket.currentFundingRate());
			assert.equal(sBTCSummary.feeRates.takerFee, fmParams.takerFee);
			assert.equal(sBTCSummary.feeRates.makerFee, fmParams.makerFee);
			assert.equal(sBTCSummary.feeRates.takerFeeNextPrice, fmParams.takerFeeNextPrice);
			assert.equal(sBTCSummary.feeRates.makerFeeNextPrice, fmParams.makerFeeNextPrice);

			const sETHParams = await futuresMarketData.parameters(newMarketKey); // sETH

			assert.equal(sETHSummary.market, sethMarket.address);
			assert.equal(sETHSummary.asset, newAssetKey);
			assert.equal(sETHSummary.maxLeverage, sETHParams.maxLeverage);
			price = await sethMarket.assetPrice();
			assert.equal(sETHSummary.price, price.price);
			assert.equal(sETHSummary.marketSize, await sethMarket.marketSize());
			assert.equal(sETHSummary.marketSkew, await sethMarket.marketSkew());
			assert.equal(sETHSummary.currentFundingRate, await sethMarket.currentFundingRate());
			assert.equal(sETHSummary.feeRates.takerFee, sETHParams.takerFee);
			assert.equal(sETHSummary.feeRates.makerFee, sETHParams.makerFee);
			assert.equal(sETHSummary.feeRates.takerFeeNextPrice, sETHParams.takerFeeNextPrice);
			assert.equal(sETHSummary.feeRates.makerFeeNextPrice, sETHParams.makerFeeNextPrice);

			assert.equal(
				sLINKSummary.market,
				await futuresMarketManager.marketForKey(toBytes32('sLINK' + keySuffix))
			);
			assert.equal(sLINKSummary.asset, toBytes32('sLINK'));
			assert.equal(sLINKSummary.maxLeverage, toUnit(5));
			assert.equal(sLINKSummary.price, toUnit(1000));
			assert.equal(sLINKSummary.marketSize, toUnit(0));
			assert.equal(sLINKSummary.marketSkew, toUnit(0));
			assert.equal(sLINKSummary.currentFundingRate, toUnit(0));
			assert.equal(sLINKSummary.feeRates.takerFee, toUnit('0.005'));
			assert.equal(sLINKSummary.feeRates.makerFee, toUnit('0.001'));
			assert.equal(sLINKSummary.feeRates.takerFeeNextPrice, toUnit('0.0005'));
			assert.equal(sLINKSummary.feeRates.makerFeeNextPrice, toUnit('0'));
		});
	});
});
