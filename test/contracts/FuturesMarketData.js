const { contract } = require('@nomiclabs/buidler');
const { currentTime, toUnit } = require('../utils')();
const { setupAllContracts } = require('./setup');
const { assert } = require('./common');

contract('FuturesMarketData', accounts => {
	let futuresMarket, futuresMarketData, exchangeRates, oracle, sUSD;
	let baseAsset;

	const trader1 = accounts[2];
	const trader2 = accounts[3];
	const traderInitialBalance = toUnit(1000000);

	before(async () => {
		({
			FuturesMarket: futuresMarket,
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

		baseAsset = await futuresMarket.baseAsset();

		// Update the rate
		oracle = await exchangeRates.oracle();
		await exchangeRates.updateRates([baseAsset], [toUnit(100)], await currentTime(), {
			from: oracle,
		});

		// Issue the traders some sUSD
		await sUSD.issue(trader1, traderInitialBalance);
		await sUSD.issue(trader2, traderInitialBalance);

		// The traders take positions on market
		await futuresMarket.submitOrder(toUnit('1000'), toUnit('5'), { from: trader1 });
		await futuresMarket.submitOrder(toUnit('-750'), toUnit('10'), { from: trader2 });
		await exchangeRates.updateRates([baseAsset], [toUnit('100')], await currentTime(), {
			from: oracle,
		});
		await futuresMarket.confirmOrder(trader1);
		await futuresMarket.confirmOrder(trader2);
	});

	it.only('Market details', async () => {
		const details = await futuresMarketData.marketDetails(futuresMarket.address);

		console.log(details);
		assert.equal(details.baseAsset, baseAsset);
		assert.bnEqual(details.exchangeFee, await futuresMarket.exchangeFee());
		assert.bnEqual(details.limits.maxLeverage, await futuresMarket.maxLeverage());
		assert.bnEqual(details.limits.maxTotalMargin, await futuresMarket.maxTotalMargin());
		assert.bnEqual(details.limits.minInitialMargin, await futuresMarket.minInitialMargin());
	});

	it('Position details', async () => {});
});
