const { contract, web3 } = require('@nomiclabs/buidler');

const { toBytes32 } = require('../..');
const { currentTime, fastForward, toUnit, fromUnit, multiplyDecimalRound } = require('../utils')();
const { toBN } = web3.utils;

const { setupAllContracts } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

contract('FuturesMarket', accounts => {
	let systemSettings, futuresMarketManager, futuresMarket, exchangeRates, oracle, sUSD;

	const owner = accounts[1];
	const trader = accounts[2];
	const trader2 = accounts[3];
	const trader3 = accounts[4];
	const noBalance = accounts[5];
	const traderInitialBalance = toUnit(1000000);

	const baseAsset = toBytes32('sBTC');
	const exchangeFee = toUnit('0.003');
	const maxLeverage = toUnit('10');
	const maxMarketDebt = toUnit('100000');
	const minInitialMargin = toUnit('100');
	const maxFundingRate = toUnit('0.1');
	const maxFundingRateSkew = toUnit('1');
	const maxFundingRateDelta = toUnit('0.0125');
	const initialPrice = toUnit('100');
	const liquidationFee = toUnit('20');

	async function submitAndConfirmOrder({ market, account, fillPrice, margin, leverage }) {
		await market.submitOrder(margin, leverage, { from: account });
		await exchangeRates.updateRates([await market.baseAsset()], [fillPrice], await currentTime(), {
			from: oracle,
		});
		await market.confirmOrder(account);
	}

	before(async () => {
		({
			FuturesMarketManager: futuresMarketManager,
			FuturesMarket: futuresMarket,
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSD,
			SystemSettings: systemSettings,
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
				'SystemSettings',
				'Synthetix',
			],
		}));

		// Update the rate so that it is not invalid
		oracle = await exchangeRates.oracle();
		await exchangeRates.updateRates([baseAsset], [initialPrice], await currentTime(), {
			from: oracle,
		});

		// Issue the trader some sUSD
		for (const t of [trader, trader2, trader3]) {
			await sUSD.issue(t, traderInitialBalance);
		}
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('Basic parameters', () => {
		it('static parameters are set properly at construction', async () => {
			assert.equal(await futuresMarket.baseAsset(), baseAsset);
			assert.bnEqual(await futuresMarket.exchangeFee(), exchangeFee);
			assert.bnEqual(await futuresMarket.maxLeverage(), maxLeverage);
			assert.bnEqual(await futuresMarket.maxMarketDebt(), maxMarketDebt);
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

	describe('Order fees', () => {
		const leverage = toUnit('3.5');

		for (const margin of ['1000', '-1000'].map(toUnit)) {
			const side = parseInt(margin.toString()) > 0 ? 'long' : 'short';

			describe(`${side}`, () => {
				it(`Submit a fresh order when there is no skew (${side})`, async () => {
					const notional = multiplyDecimalRound(margin.abs(), leverage);
					const fee = multiplyDecimalRound(notional, exchangeFee);
					assert.bnEqual(await futuresMarket.orderFee(trader, margin, leverage), fee);
				});

				it(`Submit a fresh order on the same side as the skew (${side})`, async () => {
					await submitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						margin,
						leverage,
					});

					const notional = multiplyDecimalRound(margin.abs(), leverage);
					const fee = multiplyDecimalRound(notional, exchangeFee);
					assert.bnEqual(await futuresMarket.orderFee(trader, margin, leverage), fee);
				});

				it(`Submit a fresh order on the opposite side to the skew smaller than the skew (${side})`, async () => {
					await submitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						margin: margin.neg(),
						leverage,
					});

					assert.bnEqual(
						await futuresMarket.orderFee(trader, margin.div(toBN(2)), leverage),
						toBN(0)
					);
				});

				it('Submit an fresh order on the opposite side to the skew larger than the skew', async () => {
					await submitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						margin: margin.neg().div(toBN(2)),
						leverage,
					});

					const { fromUnit } = require('../utils')();
					console.log(fromUnit(await futuresMarket.marketSkew()));

					const notional = multiplyDecimalRound(margin.abs(), leverage);
					const fee = multiplyDecimalRound(notional, exchangeFee).div(toBN(2));
					assert.bnEqual(await futuresMarket.orderFee(trader, margin, leverage), fee);
				});

				it('Increase an existing position', async () => {
					assert.isTrue(false);
				});

				it('reduce an existing position', async () => {
					assert.isTrue(false);
				});

				it('smaller order on opposite side of an existing position', async () => {
					assert.isTrue(false);
				});

				it('larger order on opposite side of an existing position', async () => {
					assert.isTrue(false);
				});
			});
		}
	});

	describe('Submitting orders', () => {
		it('can successfully submit an order', async () => {
			const margin = toUnit('1000');
			const leverage = toUnit('10');
			const fee = await futuresMarket.orderFee(trader, margin, leverage);

			const preBalance = await sUSD.balanceOf(trader);
			const pendingOrderValue = await futuresMarket.pendingOrderValue();

			await futuresMarket.submitOrder(margin, leverage, { from: trader });

			const order = await futuresMarket.orders(trader);
			assert.isTrue(order.pending);
			assert.bnEqual(order.margin, margin);
			assert.bnEqual(order.leverage, leverage);
			assert.bnEqual(order.roundId, await futuresMarket.currentRoundId());

			assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(margin.add(fee)));
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

	describe('Cancelling orders', () => {
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

	describe('Confirming orders', () => {
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
			assert.bnEqual(position.entryIndex, toBN(2)); // submission and confirmation

			// Skew, size, entry notional sum, pending order value are updated.
			assert.bnEqual(await futuresMarket.marketSkew(), size);
			assert.bnEqual(await futuresMarket.marketSize(), size);
			assert.bnEqual(
				await futuresMarket.entryMarginSumMinusNotionalSkew(),
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

	describe('Closing orders', () => {
		it('can close an open position once a new price arrives', async () => {
			const margin = toUnit('1000');
			const leverage = toUnit('10');
			await futuresMarket.submitOrder(margin, leverage, { from: trader });

			await exchangeRates.updateRates([baseAsset], [toUnit('200')], await currentTime(), {
				from: oracle,
			});
			await futuresMarket.confirmOrder(trader);

			await futuresMarket.closePosition({ from: trader });

			const price = toUnit('199');
			await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
				from: oracle,
			});
			await futuresMarket.confirmOrder(trader);

			const position = await futuresMarket.positions(trader);

			assert.bnEqual(position.margin, toUnit(0));
			assert.bnEqual(position.size, toUnit(0));
			assert.bnEqual(position.entryPrice, toUnit(0));
			assert.bnEqual(position.entryIndex, toBN(0));

			// Skew, size, entry notional sum, pending order value are updated.
			assert.bnEqual(await futuresMarket.marketSkew(), toUnit(0));
			assert.bnEqual(await futuresMarket.marketSize(), toUnit(0));
			assert.bnEqual(await futuresMarket.entryMarginSumMinusNotionalSkew(), toUnit(0));
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

	describe('Liquidations', () => {
		describe('Liquidation price', () => {
			it('Liquidation price is accurate with no funding', async () => {
				await futuresMarket.submitOrder(toUnit('1000'), toUnit('10'), { from: trader });
				const price = toUnit(100);

				await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
					from: oracle,
				});
				await futuresMarket.confirmOrder(trader);

				const liquidationPrice = await futuresMarket.liquidationPrice(trader, true);
				const liquidationPriceNoFunding = await futuresMarket.liquidationPrice(trader, false);

				assert.bnEqual(liquidationPrice.price, liquidationPriceNoFunding.price);
				assert.bnEqual(liquidationPrice.price, toUnit('90.2'));
				assert.isFalse(liquidationPrice.isInvalid);
				assert.isFalse(liquidationPriceNoFunding.isInvalid);
			});

			it('Liquidation price is accurate if the liquidation fee changes', async () => {
				await futuresMarket.submitOrder(toUnit('1000'), toUnit('5'), { from: trader });
				const price = toUnit(250);

				await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
					from: oracle,
				});
				await futuresMarket.confirmOrder(trader);

				assert.bnEqual((await futuresMarket.liquidationPrice(trader, true)).price, toUnit(201));

				await systemSettings.setFuturesLiquidationFee(toUnit('100'), { from: owner });

				assert.bnEqual((await futuresMarket.liquidationPrice(trader, true)).price, toUnit(205));

				await systemSettings.setFuturesLiquidationFee(toUnit('0'), { from: owner });

				assert.bnEqual((await futuresMarket.liquidationPrice(trader, true)).price, toUnit(200));
			});

			it('Liquidation price includes funding', async () => {
				assert.isTrue(false);
			});

			it('Liquidation price reports invalidity properly', async () => {
				assert.isTrue(false);
			});
		});

		describe('canLiquidate', () => {
			it('Can liquidate an underwater position', async () => {
				await futuresMarket.submitOrder(toUnit('1000'), toUnit('5'), { from: trader });
				let price = toUnit(250);
				await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
					from: oracle,
				});
				await futuresMarket.confirmOrder(trader);
				price = (await futuresMarket.liquidationPrice(trader, true)).price;
				await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
					from: oracle,
				});
				assert.isTrue(await futuresMarket.canLiquidate(trader));
			});

			it('Empty positions cannot be liquidated', async () => {
				assert.isFalse(await futuresMarket.canLiquidate(trader));
			});

			it('No liquidations while prices are invalid', async () => {
				await futuresMarket.submitOrder(toUnit('1000'), toUnit('5'), { from: trader });
				let price = toUnit(250);
				await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
					from: oracle,
				});
				await futuresMarket.confirmOrder(trader);
				price = toUnit(25);
				await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
					from: oracle,
				});

				await fastForward(60 * 60 * 24 * 7); // Stale the price
				assert.isFalse(await futuresMarket.canLiquidate(trader));
			});
		});

		it('Cannot liquidate nonexistent positions', async () => {
			await assert.revert(futuresMarket.liquidatePosition(trader), 'Position cannot be liquidated');
		});

		it('Cannot liquidate when the price is invalid', async () => {
			assert.isTrue(false);
		});

		it('Can liquidate a position with less than the liquidation fee margin remaining', async () => {
			await futuresMarket.submitOrder(toUnit('1000'), toUnit('10'), { from: trader2 });
			await futuresMarket.submitOrder(toUnit('-1000'), toUnit('10'), { from: trader3 });
			await futuresMarket.submitOrder(toUnit('1000'), toUnit('10'), { from: trader });
			let price = toUnit(250);
			await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
				from: oracle,
			});
			await futuresMarket.confirmOrder(trader);
			await futuresMarket.confirmOrder(trader2);
			await futuresMarket.confirmOrder(trader3);

			price = (await futuresMarket.liquidationPrice(trader, true)).price;
			await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
				from: oracle,
			});

			const positionSize = (await futuresMarket.positions(trader)).size;

			const tx = await futuresMarket.liquidatePosition(trader, { from: noBalance });

			assert.eventEqual(tx.logs[0], 'PositionLiquidated', {
				account: trader,
				liquidator: noBalance,
				size: positionSize,
				liquidationPrice: price,
			});

			// TODO: Position is wiped out.
			const position = await futuresMarket.positions(trader, { from: noBalance });
			assert.bnEqual(position.margin, toUnit(0));
			assert.bnEqual(position.size, toUnit(0));
			assert.bnEqual(position.entryPrice, toUnit(0));
			assert.bnEqual(position.entryIndex, 0);

			assert.bnEqual(await sUSD.balanceOf(noBalance), liquidationFee);

			// TODO: Overall market size, skew etc. reduced
			// const entry
			// entrymargin minus notional skew
			// market size
			// market skew
			assert.isTrue(false);
		});

		it('Can liquidate a position with zero margin remaining', async () => {
			assert.isTrue(false);
		});

		it('Liquidation cancels any outstanding orders', async () => {
			assert.isTrue(false);
		});

		it('Liquidation fee is remitted to the liquidator', async () => {
			assert.isTrue(false);
		});
	});

	describe('Funding rate', () => {
		it('An empty market induces zero funding rate', async () => {
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));
		});

		it('A balanced market induces zero funding rate', async () => {
			for (const marginTrader of [
				['1000', trader],
				['-1000', trader2],
			]) {
				await submitAndConfirmOrder({
					market: futuresMarket,
					account: marginTrader[1],
					fillPrice: toUnit('100'),
					margin: marginTrader[0],
					leverage: toUnit('10'),
				});
			}
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));
		});

		for (const margin of ['1000', '-1000'].map(toUnit)) {
			const side = parseInt(margin.toString()) > 0 ? 'long' : 'short';

			describe(`${side}`, () => {
				it('100% skew induces maximum funding rate', async () => {
					await submitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						margin: toUnit('1000'),
						leverage: toUnit('10'),
					});
					assert.bnEqual(await futuresMarket.currentFundingRate(), maxFundingRate);
				});

				// TODO: Loop for other funding rate levels.
				// TODO: Change funding rate parameters and see if the numbers are still accurate
			});
		}
	});
});
