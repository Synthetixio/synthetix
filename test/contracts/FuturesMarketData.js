const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
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
			const market = await setupContract({
				accounts,
				contract: 'FuturesMarketETH',
				source: 'FuturesMarket',
				args: [
					accounts[1],
					addressResolver.address,
					toBytes32(key), // base asset
					toWei('0.005'), // 0.5% exchange fee
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

			await market.setResolverAndSyncCache(addressResolver.address, { from: accounts[1] });

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
		await futuresMarket.submitOrder(toUnit('1000'), toUnit('5'), { from: trader1 });
		await futuresMarket.submitOrder(toUnit('-750'), toUnit('10'), { from: trader2 });
		await exchangeRates.updateRates([baseAsset], [toUnit('100')], await currentTime(), {
			from: oracle,
		});
		await futuresMarket.confirmOrder(trader1);
		await futuresMarket.confirmOrder(trader2);

		await futuresMarket.submitOrder(toUnit('4000'), toUnit('1.25'), { from: trader3 });

		sethMarket = await FuturesMarket.at(await futuresMarketManager.marketForAsset(newAsset));

		await sethMarket.submitOrder(toUnit('3000'), toUnit('4'), { from: trader3 });
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

			assert.equal(details.market, futuresMarket.address);
			assert.equal(details.baseAsset, baseAsset);
			assert.bnEqual(details.exchangeFee, await futuresMarket.exchangeFee());
			assert.bnEqual(details.limits.maxLeverage, await futuresMarket.maxLeverage());
			assert.bnEqual(details.limits.maxMarketDebt, await futuresMarket.maxMarketDebt());
			assert.bnEqual(details.limits.minInitialMargin, await futuresMarket.minInitialMargin());

			const fundingParameters = await futuresMarket.fundingParameters();
			assert.bnEqual(details.fundingParameters.maxFundingRate, fundingParameters.maxFundingRate);
			assert.bnEqual(
				details.fundingParameters.maxFundingRateSkew,
				fundingParameters.maxFundingRateSkew
			);
			assert.bnEqual(
				details.fundingParameters.maxFundingRateDelta,
				fundingParameters.maxFundingRateDelta
			);

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
				details.marketSizeDetails.entryMarginSumMinusNotionalSkew,
				await futuresMarket.entryMarginSumMinusNotionalSkew()
			);

			assert.bnEqual(
				details.marketSizeDetails.pendingOrderValue,
				await futuresMarket.pendingOrderValue()
			);

			const priceAndInvalid = await futuresMarket.priceAndInvalid();
			assert.bnEqual(details.priceDetails.price, priceAndInvalid.assetPrice);
			assert.bnEqual(details.priceDetails.isInvalid, priceAndInvalid.isInvalid);
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
			assert.equal(details.order.pending, order.pending);
			assert.bnEqual(details.order.margin, order.margin);
			assert.bnEqual(details.order.leverage, order.leverage);
			assert.bnEqual(details.order.fee, order.fee);
			assert.bnEqual(details.order.roundId, order.roundId);

			const position = await futuresMarket.positions(trader1);
			assert.bnEqual(details2.position.margin, position.margin);
			assert.bnEqual(details2.position.size, position.size);
			assert.bnEqual(details2.position.entryPrice, position.entryPrice);
			assert.bnEqual(details2.position.entryIndex, position.entryIndex);

			const notional = await futuresMarket.notionalValue(trader1);
			assert.bnEqual(details2.notionalValue, notional.value);
			const profitLoss = await futuresMarket.profitLoss(trader1);
			assert.bnEqual(details2.profitLoss, profitLoss.pnl);
			const accruedFunding = await futuresMarket.accruedFunding(trader1);
			assert.bnEqual(details2.accruedFunding, accruedFunding.funding);
			const remaining = await futuresMarket.remainingMargin(trader1);
			assert.bnEqual(details2.remainingMargin, remaining.marginRemaining);
			assert.bnEqual(
				details2.liquidationPrice,
				await futuresMarket.liquidationPrice(trader1, true)
			);
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

			assert.equal(sETHSummary.market, sethMarket.address);
			assert.equal(sETHSummary.asset, newAsset);
			assert.equal(sETHSummary.maxLeverage, await sethMarket.maxLeverage());
			const price = await sethMarket.priceAndInvalid();
			assert.equal(sETHSummary.price, price.assetPrice);
			assert.equal(sETHSummary.marketSize, await sethMarket.marketSize());
			assert.equal(sETHSummary.marketSkew, await sethMarket.marketSkew());
			assert.equal(sETHSummary.currentFundingRate, await sethMarket.currentFundingRate());
			assert.equal(sETHSummary.exchangeFee, await sethMarket.exchangeFee());
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

			assert.equal(sBTCSummary.market, futuresMarket.address);
			assert.equal(sBTCSummary.asset, baseAsset);
			assert.equal(sBTCSummary.maxLeverage, await futuresMarket.maxLeverage());
			let price = await futuresMarket.priceAndInvalid();
			assert.equal(sBTCSummary.price, price.assetPrice);
			assert.equal(sBTCSummary.marketSize, await futuresMarket.marketSize());
			assert.equal(sBTCSummary.marketSkew, await futuresMarket.marketSkew());
			assert.equal(sBTCSummary.currentFundingRate, await futuresMarket.currentFundingRate());
			assert.equal(sBTCSummary.exchangeFee, await futuresMarket.exchangeFee());

			assert.equal(sETHSummary.market, sethMarket.address);
			assert.equal(sETHSummary.asset, newAsset);
			assert.equal(sETHSummary.maxLeverage, await sethMarket.maxLeverage());
			price = await sethMarket.priceAndInvalid();
			assert.equal(sETHSummary.price, price.assetPrice);
			assert.equal(sETHSummary.marketSize, await sethMarket.marketSize());
			assert.equal(sETHSummary.marketSkew, await sethMarket.marketSkew());
			assert.equal(sETHSummary.currentFundingRate, await sethMarket.currentFundingRate());
			assert.equal(sETHSummary.exchangeFee, await sethMarket.exchangeFee());

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
			assert.equal(sLINKSummary.exchangeFee, toUnit('0.005'));
		});
	});
});
