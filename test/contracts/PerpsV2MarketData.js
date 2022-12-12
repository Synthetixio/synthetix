const { artifacts, contract, web3 } = require('hardhat');
const { toWei, toBN } = web3.utils;
const { toBytes32 } = require('../..');
const { toUnit } = require('../utils')();
const {
	setupContract,
	setupAllContracts,
	excludedFunctions,
	getFunctionSignatures,
} = require('./setup');
const { assert } = require('./common');
const { setupPriceAggregators, updateAggregatorRates } = require('./helpers');

const PerpsV2Market = artifacts.require('TestablePerpsV2Market');

contract('PerpsV2MarketData', accounts => {
	let addressResolver,
		perpsV2Market,
		sethMarket,
		futuresMarketManager,
		perpsV2MarketSettings,
		perpsV2MarketData,
		exchangeRates,
		circuitBreaker,
		sUSD,
		systemSettings,
		marketKey,
		baseAsset;
	const keySuffix = '-perp';
	const newMarketKey = toBytes32('sETH' + keySuffix);
	const newAssetKey = toBytes32('sETH');
	const offchainPrefix = 'oc';

	const owner = accounts[1];
	const trader1 = accounts[2];
	const trader2 = accounts[3];
	const trader3 = accounts[4];
	const traderInitialBalance = toUnit(1000000);
	const priceImpactDelta = toUnit('0.5'); // 500bps (high bps to avoid affecting unrelated tests)

	async function setPrice(asset, price, resetCircuitBreaker = true) {
		await updateAggregatorRates(
			exchangeRates,
			resetCircuitBreaker ? circuitBreaker : null,
			[asset],
			[price]
		);
	}

	before(async () => {
		({
			AddressResolver: addressResolver,
			ProxyPerpsV2MarketBTC: perpsV2Market,
			FuturesMarketManager: futuresMarketManager,
			PerpsV2MarketSettings: perpsV2MarketSettings,
			PerpsV2MarketData: perpsV2MarketData,
			ExchangeRates: exchangeRates,
			CircuitBreaker: circuitBreaker,
			SynthsUSD: sUSD,
			SystemSettings: systemSettings,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sBTC', 'sETH', 'sLINK'],
			contracts: [
				'FuturesMarketManager',
				'PerpsV2MarketSettings',
				'PerpsV2MarketStateBTC',
				'PerpsV2MarketViewsBTC',
				'PerpsV2MarketBTC',
				'PerpsV2MarketData',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'CircuitBreaker',
				'SystemStatus',
				'SystemSettings',
				'Synthetix',
				'CollateralManager',
			],
		}));

		// use implementation ABI on the proxy address to simplify calling
		perpsV2Market = await PerpsV2Market.at(perpsV2Market.address);

		// Add a couple of additional markets.
		for (const symbol of ['sETH', 'sLINK']) {
			let filteredFunctions;

			const assetKey = toBytes32(symbol);
			const marketKey = toBytes32(symbol + keySuffix);
			const offchainMarketKey = toBytes32(offchainPrefix + symbol + keySuffix);

			const marketState = await setupContract({
				accounts,
				contract: 'PerpsV2MarketStateAdded' + symbol,
				source: 'PerpsV2MarketState',
				args: [
					owner,
					[owner],
					assetKey, // base asset
					marketKey,
				],
			});

			const market = await setupContract({
				accounts,
				contract: 'ProxyPerpsV2MarketAdded' + symbol,
				source: 'ProxyPerpsV2',
				args: [owner],
			});

			const marketImpl = await setupContract({
				accounts,
				contract: 'PerpsV2MarketAdded' + symbol,
				source: 'PerpsV2Market',
				args: [market.address, marketState.address, owner, addressResolver.address],
			});

			const marketViews = await setupContract({
				accounts,
				contract: 'PerpsV2MarketViewsAdded' + symbol,
				source: 'PerpsV2MarketViews',
				args: [marketState.address, owner, addressResolver.address],
			});

			const marketDelayedOrder = await setupContract({
				accounts,
				contract: 'PerpsV2DelayedOrderAdded' + symbol,
				source: 'PerpsV2MarketDelayedOrders',
				args: [market.address, marketState.address, owner, addressResolver.address],
			});

			await marketState.addAssociatedContracts([marketImpl.address, marketDelayedOrder.address], {
				from: owner,
			});

			filteredFunctions = getFunctionSignatures(marketImpl, excludedFunctions);
			await Promise.all(
				filteredFunctions.map(e =>
					market.addRoute(e.signature, marketImpl.address, e.isView, {
						from: owner,
					})
				)
			);

			filteredFunctions = getFunctionSignatures(marketViews, excludedFunctions);
			await Promise.all(
				filteredFunctions.map(e =>
					market.addRoute(e.signature, marketViews.address, e.isView, {
						from: owner,
					})
				)
			);

			filteredFunctions = getFunctionSignatures(marketDelayedOrder, excludedFunctions);
			await Promise.all(
				filteredFunctions.map(e =>
					market.addRoute(e.signature, marketDelayedOrder.address, e.isView, {
						from: owner,
					})
				)
			);

			await futuresMarketManager.addProxiedMarkets([market.address], {
				from: owner,
			});

			await addressResolver.rebuildCaches(
				[marketImpl.address, marketViews.address, marketDelayedOrder.address],
				{
					from: owner,
				}
			);

			await setupPriceAggregators(exchangeRates, owner, [assetKey]);
			await setPrice(assetKey, toUnit(1000));

			// Now that the market exists we can set the all its parameters
			await perpsV2MarketSettings.setParameters(
				marketKey,
				[
					toUnit('0.005'), // 0.5% taker fee
					toUnit('0.001'), // 0.1% maker fee
					toUnit('0.0005'), // 0.05% taker fee delayed order
					toUnit('0'), // 0% maker fee delayed order
					toUnit('0.00005'), // 0.005% taker fee offchain delayed order
					toUnit('0'), // 0% maker fee offchain delayed order

					toWei('5'), // 5x max leverage
					toWei('1000'), // 1000 max market value
					toWei('0.2'), // 20% max funding velocity
					toWei('100000'), // 100k native units skewScale

					toBN('2'), // 2 rounds next price confirm window
					30, // 30s delay confirm window

					60, // 60s minimum delay time in seconds
					120, // 120s maximum delay time in seconds
					15, // offchainDelayedOrderMinAge
					60, // offchainDelayedOrderMaxAge

					offchainMarketKey,
					toUnit('0.05'),
				],
				{ from: owner }
			);
		}

		baseAsset = await perpsV2Market.baseAsset();
		marketKey = await perpsV2Market.marketKey();

		// Update the rates to ensure they aren't stale
		await setPrice(baseAsset, toUnit(100));

		// disable dynamic fee for simpler testing
		await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });

		// Issue the traders some sUSD
		await sUSD.issue(trader1, traderInitialBalance);
		await sUSD.issue(trader2, traderInitialBalance);
		await sUSD.issue(trader3, traderInitialBalance);

		// The traders take positions on market
		await perpsV2Market.transferMargin(toUnit('1000'), { from: trader1 });
		await perpsV2Market.modifyPosition(toUnit('5'), priceImpactDelta, { from: trader1 });

		await perpsV2Market.transferMargin(toUnit('750'), { from: trader2 });
		await perpsV2Market.modifyPosition(toUnit('-10'), priceImpactDelta, { from: trader2 });

		await setPrice(baseAsset, toUnit('100'));
		await perpsV2Market.transferMargin(toUnit('4000'), { from: trader3 });
		await perpsV2Market.modifyPosition(toUnit('1.25'), priceImpactDelta, { from: trader3 });

		sethMarket = await PerpsV2Market.at(await futuresMarketManager.marketForKey(newMarketKey));

		await sethMarket.transferMargin(toUnit('3000'), { from: trader3 });
		await sethMarket.modifyPosition(toUnit('4'), priceImpactDelta, { from: trader3 });
		await setPrice(newAssetKey, toUnit('999'));
	});

	it('Resolver is properly set', async () => {
		assert.equal(await perpsV2MarketData.resolverProxy(), addressResolver.address);
	});

	describe('Globals', () => {
		it('Global perpsV2 settings are properly fetched', async () => {
			const globals = await perpsV2MarketData.globals();

			assert.bnEqual(await perpsV2MarketSettings.minInitialMargin(), globals.minInitialMargin);
			assert.bnEqual(globals.minInitialMargin, toUnit('40'));
			assert.bnEqual(await perpsV2MarketSettings.minKeeperFee(), globals.minKeeperFee);
			assert.bnEqual(globals.minKeeperFee, toUnit('20'));
			assert.bnEqual(
				await perpsV2MarketSettings.liquidationFeeRatio(),
				globals.liquidationFeeRatio
			);
			assert.bnEqual(globals.liquidationFeeRatio, toUnit('0.0035'));
			assert.bnEqual(
				await perpsV2MarketSettings.liquidationBufferRatio(),
				globals.liquidationBufferRatio
			);
			assert.bnEqual(globals.liquidationBufferRatio, toUnit('0.0025'));
		});
	});

	describe('Market details', () => {
		it('By address', async () => {
			const details = await perpsV2MarketData.marketDetails(perpsV2Market.address);

			const params = await perpsV2MarketData.parameters(baseAsset);

			assert.equal(details.market, perpsV2Market.address);
			assert.equal(details.baseAsset, baseAsset);
			assert.bnEqual(details.feeRates.takerFee, params.takerFee);
			assert.bnEqual(details.feeRates.makerFee, params.makerFee);
			assert.bnEqual(details.feeRates.takerFeeDelayedOrder, params.takerFeeDelayedOrder);
			assert.bnEqual(details.feeRates.makerFeeDelayedOrder, params.makerFeeDelayedOrder);
			assert.bnEqual(
				details.feeRates.takerFeeOffchainDelayedOrder,
				params.takerFeeOffchainDelayedOrder
			);
			assert.bnEqual(
				details.feeRates.makerFeeOffchainDelayedOrder,
				params.makerFeeOffchainDelayedOrder
			);
			assert.bnEqual(details.limits.maxLeverage, params.maxLeverage);
			assert.bnEqual(details.limits.maxMarketValue, params.maxMarketValue);

			assert.bnEqual(details.fundingParameters.maxFundingVelocity, params.maxFundingVelocity);
			assert.bnEqual(details.fundingParameters.skewScale, params.skewScale);

			assert.bnEqual(details.marketSizeDetails.marketSize, await perpsV2Market.marketSize());
			const marketSizes = await perpsV2Market.marketSizes();
			assert.bnEqual(details.marketSizeDetails.sides.long, marketSizes.long);
			assert.bnEqual(details.marketSizeDetails.sides.short, marketSizes.short);
			assert.bnEqual(details.marketSizeDetails.marketDebt, (await perpsV2Market.marketDebt()).debt);
			assert.bnEqual(details.marketSizeDetails.marketSkew, await perpsV2Market.marketSkew());

			// TODO: Include min/max delayed order

			const assetPrice = await perpsV2Market.assetPrice();
			assert.bnEqual(details.priceDetails.price, assetPrice.price);
			assert.equal(details.priceDetails.invalid, assetPrice.invalid);
		});

		it('By market key', async () => {
			const details = await perpsV2MarketData.marketDetails(perpsV2Market.address);
			const assetDetails = await perpsV2MarketData.marketDetailsForKey(marketKey);
			assert.equal(JSON.stringify(assetDetails), JSON.stringify(details));
		});
	});

	describe('Position details', () => {
		it('By address', async () => {
			const details = await perpsV2MarketData.positionDetails(perpsV2Market.address, trader3);
			const details2 = await perpsV2MarketData.positionDetails(perpsV2Market.address, trader1);

			const position = await perpsV2Market.positions(trader1);
			assert.bnEqual(details2.position.margin, position.margin);
			assert.bnEqual(details2.position.size, position.size);
			assert.bnEqual(details2.position.lastPrice, position.lastPrice);
			assert.bnEqual(details2.position.lastFundingIndex, position.lastFundingIndex);

			const notional = await perpsV2Market.notionalValue(trader1);
			assert.bnEqual(details2.notionalValue, notional.value);
			const profitLoss = await perpsV2Market.profitLoss(trader1);
			assert.bnEqual(details2.profitLoss, profitLoss.pnl);
			const accruedFunding = await perpsV2Market.accruedFunding(trader1);
			assert.bnEqual(details2.accruedFunding, accruedFunding.funding);
			const remaining = await perpsV2Market.remainingMargin(trader1);
			assert.bnEqual(details2.remainingMargin, remaining.marginRemaining);
			const accessible = await perpsV2Market.accessibleMargin(trader1);
			assert.bnEqual(details2.accessibleMargin, accessible.marginAccessible);
			const lp = await perpsV2Market.liquidationPrice(trader1);
			assert.bnEqual(details2.liquidationPrice, lp[0]);
			assert.equal(details.canLiquidatePosition, await perpsV2Market.canLiquidate(trader1));
		});

		it('By market key', async () => {
			const details = await perpsV2MarketData.positionDetails(perpsV2Market.address, trader3);
			const details2 = await perpsV2MarketData.positionDetails(sethMarket.address, trader3);
			const detailsByAsset = await perpsV2MarketData.positionDetailsForMarketKey(
				marketKey,
				trader3
			);
			const detailsByAsset2 = await perpsV2MarketData.positionDetailsForMarketKey(
				newMarketKey,
				trader3
			);

			assert.equal(JSON.stringify(detailsByAsset), JSON.stringify(details));
			assert.equal(JSON.stringify(detailsByAsset2), JSON.stringify(details2));
		});
	});

	describe('Market summaries', () => {
		it('For markets', async () => {
			const sETHSummary = (await perpsV2MarketData.marketSummariesForKeys([newMarketKey]))[0];

			const params = await perpsV2MarketData.parameters(newMarketKey); // sETH

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
			assert.equal(sETHSummary.feeRates.takerFeeDelayedOrder, params.takerFeeDelayedOrder);
			assert.equal(sETHSummary.feeRates.makerFeeDelayedOrder, params.makerFeeDelayedOrder);
			assert.equal(
				sETHSummary.feeRates.takerFeeOffchainDelayedOrder,
				params.takerFeeOffchainDelayedOrder
			);
			assert.equal(
				sETHSummary.feeRates.makerFeeOffchainDelayedOrder,
				params.makerFeeOffchainDelayedOrder
			);
		});

		it('For market keys', async () => {
			const summaries = await perpsV2MarketData.marketSummaries([
				perpsV2Market.address,
				sethMarket.address,
			]);
			const summariesForAsset = await perpsV2MarketData.marketSummariesForKeys(
				['sBTC', 'sETH' + keySuffix].map(toBytes32)
			);
			assert.equal(JSON.stringify(summaries), JSON.stringify(summariesForAsset));
		});

		it('All summaries', async () => {
			const summaries = await perpsV2MarketData.allMarketSummaries();

			const sBTCSummary = summaries.find(summary => summary.asset === toBytes32('sBTC'));
			const sETHSummary = summaries.find(summary => summary.asset === toBytes32('sETH'));
			const sLINKSummary = summaries.find(summary => summary.asset === toBytes32('sLINK'));

			const fmParams = await perpsV2MarketData.parameters(marketKey);

			assert.equal(sBTCSummary.market, perpsV2Market.address);
			assert.equal(sBTCSummary.asset, baseAsset);
			assert.equal(sBTCSummary.maxLeverage, fmParams.maxLeverage);
			let price = await perpsV2Market.assetPrice();
			assert.equal(sBTCSummary.price, price.price);
			assert.equal(sBTCSummary.marketSize, await perpsV2Market.marketSize());
			assert.equal(sBTCSummary.marketSkew, await perpsV2Market.marketSkew());
			assert.equal(sBTCSummary.currentFundingRate, await perpsV2Market.currentFundingRate());
			assert.equal(sBTCSummary.feeRates.takerFee, fmParams.takerFee);
			assert.equal(sBTCSummary.feeRates.makerFee, fmParams.makerFee);
			assert.equal(sBTCSummary.feeRates.takerFeeDelayedOrder, fmParams.takerFeeDelayedOrder);
			assert.equal(sBTCSummary.feeRates.makerFeeDelayedOrder, fmParams.makerFeeDelayedOrder);
			assert.equal(
				sBTCSummary.feeRates.takerFeeOffchainDelayedOrder,
				fmParams.takerFeeOffchainDelayedOrder
			);
			assert.equal(
				sBTCSummary.feeRates.makerFeeOffchainDelayedOrder,
				fmParams.makerFeeOffchainDelayedOrder
			);

			const sETHParams = await perpsV2MarketData.parameters(newMarketKey); // sETH

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
			assert.equal(sETHSummary.feeRates.takerFeeDelayedOrder, sETHParams.takerFeeDelayedOrder);
			assert.equal(sETHSummary.feeRates.makerFeeDelayedOrder, sETHParams.makerFeeDelayedOrder);
			assert.equal(
				sETHSummary.feeRates.takerFeeOffchainDelayedOrder,
				sETHParams.takerFeeOffchainDelayedOrder
			);
			assert.equal(
				sETHSummary.feeRates.makerFeeOffchainDelayedOrder,
				sETHParams.makerFeeOffchainDelayedOrder
			);

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
			assert.equal(sLINKSummary.feeRates.takerFeeDelayedOrder, toUnit('0.0005'));
			assert.equal(sLINKSummary.feeRates.makerFeeDelayedOrder, toUnit('0'));
			assert.equal(sLINKSummary.feeRates.takerFeeOffchainDelayedOrder, toUnit('0.00005'));
			assert.equal(sLINKSummary.feeRates.makerFeeOffchainDelayedOrder, toUnit('0'));
		});
	});
});
