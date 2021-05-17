const { artifacts, contract, web3 } = require('hardhat');
const { toWei } = web3.utils;
const { toBytes32 } = require('../../');
const { currentTime, toUnit } = require('../utils')();
const { setupContract, setupAllContracts } = require('./setup');
const { assert } = require('./common');

const FuturesMarket = artifacts.require('FuturesMarket');

contract('FuturesMarketData', accounts => {
	let addressResolver,
		futuresMarket,
		sethMarket,
		futuresMarketManager,
		futuresMarketData,
		exchangeRates,
		oracle,
		sUSD,
		baseAsset;
	const newAsset = toBytes32('sETH');

	const trader1 = accounts[2];
	const trader2 = accounts[3];
	const trader3 = accounts[4];
	const traderInitialBalance = toUnit(1000000);

	before(async () => {
		({
			AddressResolver: addressResolver,
			FuturesMarket: futuresMarket,
			FuturesMarketManager: futuresMarketManager,
			FuturesMarketData: futuresMarketData,
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSD,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'FuturesMarketManager',
				'FuturesMarket',
				'FuturesMarketData',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'SystemStatus',
				'Synthetix',
			],
		}));

		// Add a couple of additional markets.
		const marketsToAdd = [];
		for (const key of ['sETH', 'sLINK']) {
			const proxy = await setupContract({
				accounts,
				contract: 'ProxyFuturesMarket' + key,
				source: 'Proxy',
				args: [accounts[1]],
			});

			const market = await setupContract({
				accounts,
				contract: 'FuturesMarket' + key,
				source: 'FuturesMarket',
				args: [
					proxy.address,
					accounts[1],
					addressResolver.address,
					toBytes32(key), // base asset
					toWei('0.005'), // 0.5% taker fee
					toWei('0.001'), // 0.1% maker fee
					toWei('5'), // 5x max leverage
					toWei('1000000'), // 1000000 max total margin
					toWei('10'), // 10 sUSD minimum initial margin
					[
						toWei('0.2'), // 20% max funding rate
						toWei('0.5'), // 50% max funding rate skew
						toWei('0.025'), // 2.5% per hour max funding rate of change
					],
				],
			});

			await proxy.setTarget(market.address, { from: accounts[1] });
			await addressResolver.rebuildCaches([market.address]);
			marketsToAdd.push(market.address);
		}

		await futuresMarketManager.addMarkets(marketsToAdd, { from: accounts[1] });

		baseAsset = await futuresMarket.baseAsset();

		// Update the rates to ensure they aren't stale
		oracle = await exchangeRates.oracle();
		await exchangeRates.updateRates([baseAsset], [toUnit(100)], await currentTime(), {
			from: oracle,
		});
		await exchangeRates.updateRates([newAsset], [toUnit(1000)], await currentTime(), {
			from: oracle,
		});

		// Issue the traders some sUSD
		await sUSD.issue(trader1, traderInitialBalance);
		await sUSD.issue(trader2, traderInitialBalance);
		await sUSD.issue(trader3, traderInitialBalance);

		// The traders take positions on market
		await futuresMarket.modifyMargin(toUnit('1000'), { from: trader1 });
		await futuresMarket.submitOrder(toUnit('5'), { from: trader1 });

		await futuresMarket.modifyMargin(toUnit('750'), { from: trader2 });
		await futuresMarket.submitOrder(toUnit('-10'), { from: trader2 });

		await exchangeRates.updateRates([baseAsset], [toUnit('100')], await currentTime(), {
			from: oracle,
		});
		await futuresMarket.confirmOrder(trader1);
		await futuresMarket.confirmOrder(trader2);

		await futuresMarket.modifyMargin(toUnit('4000'), { from: trader3 });
		await futuresMarket.submitOrder(toUnit('1.25'), { from: trader3 });

		sethMarket = await FuturesMarket.at(await futuresMarketManager.marketForAsset(newAsset));

		await sethMarket.modifyMargin(toUnit('3000'), { from: trader3 });
		await sethMarket.submitOrder(toUnit('4'), { from: trader3 });
		await exchangeRates.updateRates([newAsset], [toUnit('999')], await currentTime(), {
			from: oracle,
		});
		await sethMarket.confirmOrder(trader3);
	});

	it('Resolver is properly set', async () => {
		assert.equal(await futuresMarketData.resolverProxy(), addressResolver.address);
	});

	describe('Market details', () => {
		it('By address', async () => {
			const details = await futuresMarketData.marketDetails(futuresMarket.address);

			const params = await futuresMarket.parameters();

			assert.equal(details.market, futuresMarket.address);
			assert.equal(details.baseAsset, baseAsset);
			assert.bnEqual(details.feeRates.takerFee, params.takerFee);
			assert.bnEqual(details.feeRates.makerFee, params.makerFee);
			assert.bnEqual(details.limits.maxLeverage, params.maxLeverage);
			assert.bnEqual(details.limits.maxMarketValue, params.maxMarketValue);
			assert.bnEqual(details.limits.minInitialMargin, params.minInitialMargin);

			assert.bnEqual(details.fundingParameters.maxFundingRate, params.maxFundingRate);
			assert.bnEqual(details.fundingParameters.maxFundingRateSkew, params.maxFundingRateSkew);
			assert.bnEqual(details.fundingParameters.maxFundingRateDelta, params.maxFundingRateDelta);

			assert.bnEqual(details.marketSizeDetails.marketSize, await futuresMarket.marketSize());
			const marketSizes = await futuresMarket.marketSizes();
			assert.bnEqual(details.marketSizeDetails.sides.long, marketSizes.long);
			assert.bnEqual(details.marketSizeDetails.sides.short, marketSizes.short);
			assert.bnEqual(details.marketSizeDetails.marketDebt, (await futuresMarket.marketDebt()).debt);
			assert.bnEqual(details.marketSizeDetails.marketSkew, await futuresMarket.marketSkew());
			assert.bnEqual(
				details.marketSizeDetails.proportionalSkew,
				await futuresMarket.proportionalSkew()
			);
			assert.bnEqual(
				details.marketSizeDetails.entryDebtCorrection,
				await futuresMarket.entryDebtCorrection()
			);

			const assetPrice = await futuresMarket.assetPrice();
			assert.bnEqual(details.priceDetails.price, assetPrice.price);
			assert.equal(details.priceDetails.invalid, assetPrice.invalid);
			assert.bnEqual(details.priceDetails.currentRoundId, await futuresMarket.currentRoundId());
		});

		it('By asset', async () => {
			const details = await futuresMarketData.marketDetails(futuresMarket.address);
			const assetDetails = await futuresMarketData.marketDetailsForAsset(baseAsset);
			assert.equal(JSON.stringify(assetDetails), JSON.stringify(details));
		});
	});

	describe('Position details', () => {
		it('By address', async () => {
			const details = await futuresMarketData.positionDetails(futuresMarket.address, trader3);
			const details2 = await futuresMarketData.positionDetails(futuresMarket.address, trader1);

			const order = await futuresMarket.orders(trader3);
			assert.equal(details.orderPending, await futuresMarket.orderPending(trader3));
			assert.bnEqual(details.order.id, order.id);
			assert.bnEqual(details.order.leverage, order.leverage);
			assert.bnEqual(details.order.fee, order.fee);
			assert.bnEqual(details.order.roundId, order.roundId);

			const position = await futuresMarket.positions(trader1);
			assert.bnEqual(details2.position.margin, position.margin);
			assert.bnEqual(details2.position.size, position.size);
			assert.bnEqual(details2.position.lastPrice, position.lastPrice);
			assert.bnEqual(details2.position.fundingIndex, position.fundingIndex);

			const notional = await futuresMarket.notionalValue(trader1);
			assert.bnEqual(details2.notionalValue, notional.value);
			const profitLoss = await futuresMarket.profitLoss(trader1);
			assert.bnEqual(details2.profitLoss, profitLoss.pnl);
			const accruedFunding = await futuresMarket.accruedFunding(trader1);
			assert.bnEqual(details2.accruedFunding, accruedFunding.funding);
			const remaining = await futuresMarket.remainingMargin(trader1);
			assert.bnEqual(details2.remainingMargin, remaining.marginRemaining);
			const lp = await futuresMarket.liquidationPrice(trader1, true);
			assert.bnEqual(details2.liquidationPrice, lp[0]);
		});

		it('By asset', async () => {
			const details = await futuresMarketData.positionDetails(futuresMarket.address, trader3);
			const details2 = await futuresMarketData.positionDetails(sethMarket.address, trader3);
			const detailsByAsset = await futuresMarketData.positionDetailsForAsset(baseAsset, trader3);
			const detailsByAsset2 = await futuresMarketData.positionDetailsForAsset(newAsset, trader3);

			assert.equal(JSON.stringify(detailsByAsset), JSON.stringify(details));
			assert.equal(JSON.stringify(detailsByAsset2), JSON.stringify(details2));
		});
	});

	describe('Market summaries', () => {
		it('For markets', async () => {
			const sETHSummary = (
				await futuresMarketData.marketSummariesForAssets([toBytes32('sETH')])
			)[0];

			const params = await sethMarket.parameters();

			assert.equal(sETHSummary.market, sethMarket.address);
			assert.equal(sETHSummary.asset, newAsset);
			assert.equal(sETHSummary.maxLeverage, params.maxLeverage);
			const price = await sethMarket.assetPrice();
			assert.equal(sETHSummary.price, price.price);
			assert.equal(sETHSummary.marketSize, await sethMarket.marketSize());
			assert.equal(sETHSummary.marketSkew, await sethMarket.marketSkew());
			assert.equal(sETHSummary.currentFundingRate, await sethMarket.currentFundingRate());
			assert.equal(sETHSummary.feeRates.takerFee, params.takerFee);
			assert.equal(sETHSummary.feeRates.makerFee, params.makerFee);
		});

		it('For assets', async () => {
			const summaries = await futuresMarketData.marketSummaries([
				futuresMarket.address,
				sethMarket.address,
			]);
			const summariesForAsset = await futuresMarketData.marketSummariesForAssets(
				['sBTC', 'sETH'].map(toBytes32)
			);
			assert.equal(JSON.stringify(summaries), JSON.stringify(summariesForAsset));
		});

		it('All summaries', async () => {
			const summaries = await futuresMarketData.allMarketSummaries();

			const sBTCSummary = summaries.find(summary => summary.asset === toBytes32('sBTC'));
			const sETHSummary = summaries.find(summary => summary.asset === toBytes32('sETH'));
			const sLINKSummary = summaries.find(summary => summary.asset === toBytes32('sLINK'));

			const fmParams = await futuresMarket.parameters();

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

			const sETHParams = await sethMarket.parameters();

			assert.equal(sETHSummary.market, sethMarket.address);
			assert.equal(sETHSummary.asset, newAsset);
			assert.equal(sETHSummary.maxLeverage, sETHParams.maxLeverage);
			price = await sethMarket.assetPrice();
			assert.equal(sETHSummary.price, price.price);
			assert.equal(sETHSummary.marketSize, await sethMarket.marketSize());
			assert.equal(sETHSummary.marketSkew, await sethMarket.marketSkew());
			assert.equal(sETHSummary.currentFundingRate, await sethMarket.currentFundingRate());
			assert.equal(sETHSummary.feeRates.takerFee, sETHParams.takerFee);
			assert.equal(sETHSummary.feeRates.makerFee, sETHParams.makerFee);

			assert.equal(
				sLINKSummary.market,
				await futuresMarketManager.marketForAsset(toBytes32('sLINK'))
			);
			assert.equal(sLINKSummary.asset, toBytes32('sLINK'));
			assert.equal(sLINKSummary.maxLeverage, toUnit(5));
			assert.equal(sLINKSummary.price, toUnit(0));
			assert.equal(sLINKSummary.marketSize, toUnit(0));
			assert.equal(sLINKSummary.marketSkew, toUnit(0));
			assert.equal(sLINKSummary.currentFundingRate, toUnit(0));
			assert.equal(sLINKSummary.feeRates.takerFee, toUnit('0.005'));
			assert.equal(sLINKSummary.feeRates.makerFee, toUnit('0.001'));
		});
	});
});
