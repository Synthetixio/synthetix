const { contract, web3 } = require('@nomiclabs/buidler');

const { toBytes32 } = require('../..');
const { currentTime, fastForward, toUnit, multiplyDecimalRound } = require('../utils')();
const { toBN } = web3.utils;

const { setupAllContracts } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

contract('FuturesMarket', accounts => {
	let futuresMarketManager, futuresMarket, exchangeRates, oracle, sUSD;

	const trader = accounts[2];
	const noBalance = accounts[3];
	const traderInitialBalance = toUnit(1000000);

	const baseAsset = toBytes32('BTC');
	const exchangeFee = toUnit('0.003');
	const maxLeverage = toUnit('10');
	const maxTotalMargin = toUnit('100000');
	const minInitialMargin = toUnit('100');
	const maxFundingRate = toUnit('0.1');
	const maxFundingRateSkew = toUnit('1');
	const maxFundingRateDelta = toUnit('0.0125');

	before(async () => {
		({
			FuturesMarketManager: futuresMarketManager,
			FuturesMarket: futuresMarket,
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSD,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'FuturesMarketManager',
				'FuturesMarket',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'SystemStatus',
				'Synthetix',
			],
		}));

		// Update the rate
		oracle = await exchangeRates.oracle();
		await exchangeRates.updateRates([baseAsset], [toUnit(100)], await currentTime(), {
			from: oracle,
		});

		// Issue the trader some sUSD
		await sUSD.issue(trader, traderInitialBalance);
	});

	addSnapshotBeforeRestoreAfterEach();

	describe.only('Basic parameters', () => {
		it('static parameters are set properly at construction', async () => {
			assert.equal(await futuresMarket.baseAsset(), baseAsset);
			assert.bnEqual(await futuresMarket.exchangeFee(), exchangeFee);
			assert.bnEqual(await futuresMarket.maxLeverage(), maxLeverage);
			assert.bnEqual(await futuresMarket.maxTotalMargin(), maxTotalMargin);
			assert.bnEqual(await futuresMarket.minInitialMargin(), minInitialMargin);

			const fundingParameters = await futuresMarket.fundingParameters();

			assert.bnEqual(fundingParameters.maxFundingRate, maxFundingRate);
			assert.bnEqual(fundingParameters.maxFundingRateSkew, maxFundingRateSkew);
			assert.bnEqual(fundingParameters.maxFundingRateDelta, maxFundingRateDelta);
		});

		it('prices are properly fetched', async () => {
			const roundId = await futuresMarket.currentRoundId();
			const price = toUnit(200);

			await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
				from: oracle,
			});
			const result = await futuresMarket.priceAndInvalid();

			assert.bnEqual(result.assetPrice, price);
			assert.isFalse(result.isInvalid);
			assert.bnEqual(await futuresMarket.currentRoundId(), toBN(roundId).add(toBN(1)));
		});
	});

	describe.only('Submitting orders', () => {
		it('can successfully submit an order', async () => {
			const margin = toUnit('1000');
			const leverage = toUnit('10');

			const preBalance = await sUSD.balanceOf(trader);
			const pendingOrderValue = await futuresMarket.pendingOrderValue();

			await futuresMarket.submitOrder(margin, leverage, { from: trader });

			const order = await futuresMarket.orders(trader);
			assert.isTrue(order.pending);
			assert.bnEqual(order.margin, margin);
			assert.bnEqual(order.leverage, leverage);
			assert.bnEqual(order.roundId, await futuresMarket.currentRoundId());

			assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(margin));
			assert.bnEqual(await futuresMarket.pendingOrderValue(), pendingOrderValue.add(margin));
		});

		it('submitting orders emits events properly.', async () => {
			assert.isTrue(false);
		});

		it('submitting a second order cancels the first one.', async () => {
			assert.isTrue(false);
		});

		it('max leverage cannot be exceeded', async () => {
			await assert.revert(
				futuresMarket.submitOrder(toUnit('1000'), toUnit('11'), { from: trader }),
				'Max leverage exceeded'
			);
		});

		it('min margin must be provided', async () => {
			await assert.revert(
				futuresMarket.submitOrder(toUnit('99'), toUnit('10'), { from: trader }),
				'Insufficient margin'
			);
		});

		it('trader must have sufficient balance', async () => {
			await assert.revert(
				futuresMarket.submitOrder(toUnit('100'), toUnit('10'), { from: noBalance }),
				'Insufficient balance'
			);
		});
	});

	describe.only('Cancelling orders', () => {
		it('can successfully cancel an order', async () => {
			const preBalance = await sUSD.balanceOf(trader);
			const margin = toUnit('1000');
			const leverage = toUnit('10');
			await futuresMarket.submitOrder(margin, leverage, { from: trader });

			const pendingOrderValue = await futuresMarket.pendingOrderValue();

			await futuresMarket.cancelOrder({ from: trader });

			const order = await futuresMarket.orders(trader);
			assert.isFalse(order.pending);
			assert.bnEqual(order.margin, toUnit(0));
			assert.bnEqual(order.leverage, toUnit(0));
			assert.bnEqual(order.roundId, toUnit(0));
			assert.bnEqual(await sUSD.balanceOf(trader), preBalance);
			assert.bnEqual(await futuresMarket.pendingOrderValue(), pendingOrderValue.sub(margin));
		});

		it('properly emits events', async () => {
			assert.isTrue(false);
		});

		it('cannot cancel an order if no pending order exists', async () => {
			await assert.revert(futuresMarket.cancelOrder({ from: trader }), 'No pending order');
		});
	});

	describe.only('Confirming orders', () => {
		it('can confirm a pending order once a new price arrives', async () => {
			const margin = toUnit('1000');
			const leverage = toUnit('10');
			await futuresMarket.submitOrder(margin, leverage, { from: trader });

			const price = toUnit('200');

			await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
				from: oracle,
			});

			await futuresMarket.confirmOrder(trader);

			const size = toUnit('50');

			const position = await futuresMarket.positions(trader);

			assert.bnEqual(position.margin, margin);
			assert.bnEqual(position.size, size);
			assert.bnEqual(position.entryPrice, price);
			assert.bnEqual(position.entryIndex, toBN(0));

			// Skew, size, entry notional sum, pending order value are updated.
			assert.bnEqual(await futuresMarket.marketSkew(), size);
			assert.bnEqual(await futuresMarket.marketSize(), size);
			assert.bnEqual(
				await futuresMarket.entryMarginMinusNotionalSkewSum(),
				margin.sub(multiplyDecimalRound(size, price))
			);
			assert.bnEqual(await futuresMarket.pendingOrderValue(), toBN(0));

			// Order values are deleted
			const order = await futuresMarket.orders(trader);
			assert.isFalse(order.pending);
			assert.bnEqual(order.margin, toUnit(0));
			assert.bnEqual(order.leverage, toUnit(0));
			assert.bnEqual(order.roundId, toUnit(0));
		});

		it('cannot confirm a pending order before a price has arrived', async () => {
			const margin = toUnit('1000');
			const leverage = toUnit('10');
			await futuresMarket.submitOrder(margin, leverage, { from: trader });

			await assert.revert(futuresMarket.confirmOrder(trader), 'Awaiting next price');
		});

		it('cannot confirm an order if none is pending', async () => {
			await assert.revert(futuresMarket.confirmOrder(trader), 'No pending order');
		});

		it('Cannot confirm an order if the price is invalid', async () => {
			const margin = toUnit('1000');
			const leverage = toUnit('10');
			await futuresMarket.submitOrder(margin, leverage, { from: trader });

			const price = toUnit('200');

			await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
				from: oracle,
			});

			await fastForward(4 * 7 * 24 * 60 * 60);

			await assert.revert(futuresMarket.confirmOrder(trader), 'Price is invalid');
		});

		it('Can confirm a set of multiple orders on both sides of the market', async () => {
			assert.isTrue(false);
		});
	});

	describe.only('Closing orders', () => {
		it('can close an open position once a new price arrives', async () => {
			const margin = toUnit('1000');
			const leverage = toUnit('10');
			await futuresMarket.submitOrder(margin, leverage, { from: trader });

			await exchangeRates.updateRates([baseAsset], [toUnit('200')], await currentTime(), {
				from: oracle,
			});
			await futuresMarket.confirmOrder(trader);

			await futuresMarket.closePosition({ from: trader });

			const price = toUnit('100');
			await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
				from: oracle,
			});
			await futuresMarket.confirmOrder(trader);

			const position = await futuresMarket.positions(trader);

			assert.bnEqual(position.margin, toUnit(0));
			assert.bnEqual(position.size, toUnit(0));
			assert.bnEqual(position.entryPrice, price);
			assert.bnEqual(position.entryIndex, toBN(0));

			// Skew, size, entry notional sum, pending order value are updated.
			assert.bnEqual(await futuresMarket.marketSkew(), toUnit(0));
			assert.bnEqual(await futuresMarket.marketSize(), toUnit(0));
			assert.bnEqual(await futuresMarket.entryMarginMinusNotionalSkewSum(), toUnit(0));
			assert.bnEqual(await futuresMarket.pendingOrderValue(), toBN(0));

			// Order values are deleted
			const order = await futuresMarket.orders(trader);
			assert.isFalse(order.pending);
			assert.bnEqual(order.margin, toUnit(0));
			assert.bnEqual(order.leverage, toUnit(0));
			assert.bnEqual(order.roundId, toUnit(0));
		});

		it('closing positions fails if a new price has not been set.', async () => {
			const margin = toUnit('1000');
			const leverage = toUnit('10');
			await futuresMarket.submitOrder(margin, leverage, { from: trader });

			await exchangeRates.updateRates([baseAsset], [toUnit('200')], await currentTime(), {
				from: oracle,
			});
			await futuresMarket.confirmOrder(trader);
			await futuresMarket.closePosition({ from: trader });

			await assert.revert(futuresMarket.confirmOrder(trader), 'Awaiting next price');
		});

		it('closing a position cancels any open orders.', async () => {
			assert.isFalse(true);
		});
	});
});
