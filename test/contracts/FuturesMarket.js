const { contract, web3 } = require('@nomiclabs/buidler');

const { toBytes32 } = require('../..');
const { currentTime, fastForward, toUnit, fromUnit, multiplyDecimalRound } = require('../utils')();
const { toBN } = web3.utils;

const { setupAllContracts } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { getDecodedLogs, decodedEventEqual } = require('./helpers');

contract('FuturesMarket', accounts => {
	let systemSettings,
		futuresMarketManager,
		proxyFuturesMarket,
		futuresMarket,
		exchangeRates,
		oracle,
		sUSD,
		feePool;

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
			ProxyFuturesMarket: proxyFuturesMarket,
			FuturesMarket: futuresMarket,
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSD,
			FeePool: feePool,
			SystemSettings: systemSettings,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'FuturesMarketManager',
				'ProxyFuturesMarket',
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
			const parameters = await futuresMarket.parameters();
			assert.equal(await futuresMarket.baseAsset(), baseAsset);
			assert.bnEqual(parameters.exchangeFee, exchangeFee);
			assert.bnEqual(parameters.maxLeverage, maxLeverage);
			assert.bnEqual(parameters.maxMarketDebt, maxMarketDebt);
			assert.bnEqual(parameters.minInitialMargin, minInitialMargin);
			assert.bnEqual(parameters.maxFundingRate, maxFundingRate);
			assert.bnEqual(parameters.maxFundingRateSkew, maxFundingRateSkew);
			assert.bnEqual(parameters.maxFundingRateDelta, maxFundingRateDelta);
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

		describe('Setters', () => {
			it('setters', async () => {
				const params = [
					['exchangeFee', '0.01', futuresMarket.setExchangeFee],
					['maxLeverage', '20', futuresMarket.setMaxLeverage],
					['maxMarketDebt', '50000', futuresMarket.setMaxMarketDebt],
					['minInitialMargin', '500', futuresMarket.setMinInitialMargin],
					['maxFundingRate', '0.5', futuresMarket.setMaxFundingRate],
					['maxFundingRateSkew', '0.5', futuresMarket.setMaxFundingRateSkew],
					['maxFundingRateDelta', '0.02', futuresMarket.setMaxFundingRateDelta],
				];

				for (const p of params) {
					const param = toBytes32(p[0]);
					const value = toUnit(p[1]);
					const setter = p[2];

					// Only settable by the owner
					await assert.revert(setter(value, { from: trader }), 'Owner only function');

					const tx = await setter(value, { from: owner });
					const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [futuresMarket] });

					assert.equal(decodedLogs.length, 1);
					decodedEventEqual({
						event: 'ParameterUpdated',
						emittedFrom: proxyFuturesMarket.address,
						args: [param, value],
						log: decodedLogs[0],
					});

					// And the parameter was actually set properly
					assert.bnEqual((await futuresMarket.parameters())[p[0]], value);
				}
			});
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

			const tx = await futuresMarket.submitOrder(margin, leverage, { from: trader });

			const id = toBN(1);
			const roundId = await futuresMarket.currentRoundId();
			const order = await futuresMarket.orders(trader);
			assert.isTrue(order.pending);
			assert.bnEqual(order.id, id);
			assert.bnEqual(order.margin, margin);
			assert.bnEqual(order.leverage, leverage);
			assert.bnEqual(order.roundId, roundId);

			assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(margin.add(fee)));
			assert.bnEqual(await futuresMarket.pendingOrderValue(), pendingOrderValue.add(margin));

			// And it properly emits the relevant events.
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'Burned',
				emittedFrom: sUSD.address,
				args: [trader, margin.add(fee)],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'OrderSubmitted',
				emittedFrom: proxyFuturesMarket.address,
				args: [id, trader, margin, leverage, fee, roundId],
				log: decodedLogs[1],
			});
		});

		it('submitting orders increments the order id', async () => {
			const margin = toUnit('200');
			const leverage = toUnit('5');

			await futuresMarket.submitOrder(margin, leverage, { from: trader });
			const id = (await futuresMarket.orders(trader)).id;
			await futuresMarket.submitOrder(margin, leverage, { from: trader });
			assert.bnEqual((await futuresMarket.orders(trader)).id, id.add(toBN(1)));
			await futuresMarket.submitOrder(margin, leverage, { from: trader2 });
			assert.bnEqual((await futuresMarket.orders(trader2)).id, id.add(toBN(2)));
		});

		it('submitting a second order cancels the first one.', async () => {
			const margin = toUnit('1000');
			const leverage = toUnit('10');
			const fee = await futuresMarket.orderFee(trader, margin, leverage);

			const preBalance = await sUSD.balanceOf(trader);
			const pendingOrderValue = await futuresMarket.pendingOrderValue();

			await futuresMarket.submitOrder(margin, leverage, { from: trader });

			const id1 = toBN(1);
			const roundId1 = await futuresMarket.currentRoundId();
			const order1 = await futuresMarket.orders(trader);
			assert.isTrue(order1.pending);
			assert.bnEqual(order1.id, id1);
			assert.bnEqual(order1.margin, margin);
			assert.bnEqual(order1.leverage, leverage);
			assert.bnEqual(order1.roundId, roundId1);

			assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(margin.add(fee)));
			assert.bnEqual(await futuresMarket.pendingOrderValue(), pendingOrderValue.add(margin));

			await fastForward(24 * 60 * 60);
			const price = toUnit('100');
			await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
				from: oracle,
			});

			const margin2 = toUnit('500');
			const leverage2 = toUnit('5');
			const fee2 = await futuresMarket.orderFee(trader, margin2, leverage2);

			const tx = await futuresMarket.submitOrder(margin2, leverage2, { from: trader });

			const id2 = toBN(2);
			const roundId2 = await futuresMarket.currentRoundId();
			const order2 = await futuresMarket.orders(trader);
			assert.bnGt(roundId2, roundId1);
			assert.isTrue(order2.pending);
			assert.bnEqual(order2.id, id2);
			assert.bnEqual(order2.margin, margin2);
			assert.bnEqual(order2.leverage, leverage2);
			assert.bnEqual(order2.roundId, roundId2);

			assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(margin2.add(fee2)));
			assert.bnEqual(await futuresMarket.pendingOrderValue(), pendingOrderValue.add(margin2));

			// And it properly emits the relevant events.
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
			assert.equal(decodedLogs.length, 4);
			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSD.address,
				args: [trader, margin.add(fee)],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'OrderCancelled',
				emittedFrom: proxyFuturesMarket.address,
				args: [id1, trader],
				log: decodedLogs[1],
			});
			decodedEventEqual({
				event: 'Burned',
				emittedFrom: sUSD.address,
				args: [trader, margin2.add(fee2)],
				log: decodedLogs[2],
			});
			decodedEventEqual({
				event: 'OrderSubmitted',
				emittedFrom: proxyFuturesMarket.address,
				args: [id2, trader, margin2, leverage2, fee2, roundId2],
				log: decodedLogs[3],
			});
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
			const fee = await futuresMarket.orderFee(trader, margin, leverage);
			await futuresMarket.submitOrder(margin, leverage, { from: trader });

			const pendingOrderValue = await futuresMarket.pendingOrderValue();

			const tx = await futuresMarket.cancelOrder({ from: trader });

			const id = toBN(1);
			const order = await futuresMarket.orders(trader);
			assert.isFalse(order.pending);
			assert.bnEqual(order.id, toUnit(0));
			assert.bnEqual(order.margin, toUnit(0));
			assert.bnEqual(order.leverage, toUnit(0));
			assert.bnEqual(order.roundId, toUnit(0));
			assert.bnEqual(await sUSD.balanceOf(trader), preBalance);
			assert.bnEqual(await futuresMarket.pendingOrderValue(), pendingOrderValue.sub(margin));

			// And the relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSD.address,
				args: [trader, margin.add(fee)],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'OrderCancelled',
				emittedFrom: proxyFuturesMarket.address,
				args: [id, trader],
				log: decodedLogs[1],
			});
		});

		it('cannot cancel an order if no pending order exists', async () => {
			await assert.revert(futuresMarket.cancelOrder({ from: trader }), 'No pending order');
		});
	});

	describe('Confirming orders', () => {
		it('can confirm a pending order once a new price arrives', async () => {
			const margin = toUnit('1000');
			const leverage = toUnit('10');
			const fee = await futuresMarket.orderFee(trader, margin, leverage);
			await futuresMarket.submitOrder(margin, leverage, { from: trader });

			const price = toUnit('200');

			await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
				from: oracle,
			});

			const tx = await futuresMarket.confirmOrder(trader);

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

			// And the relevant events are properly emitted
			const id = toBN(1);
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSD.address,
				args: [await feePool.FEE_ADDRESS(), fee],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'OrderConfirmed',
				emittedFrom: proxyFuturesMarket.address,
				args: [id, trader, margin, size, price, toBN(2)],
				log: decodedLogs[1],
			});
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

	describe('Closing positions', () => {
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

	describe('Profit & Loss, margin, leverage', () => {
		describe('PnL', () => {
			beforeEach(async () => {
				await futuresMarket.submitOrder(toUnit('1000'), toUnit('5'), { from: trader });
				await futuresMarket.submitOrder(toUnit('-4000'), toUnit('1'), { from: trader2 });
				await exchangeRates.updateRates([baseAsset], [toUnit('100')], await currentTime(), {
					from: oracle,
				});
				await futuresMarket.confirmOrder(trader);
				await futuresMarket.confirmOrder(trader2);
			});

			it('steady price', async () => {
				assert.bnEqual((await futuresMarket.profitLoss(trader))[0], toBN(0));
				assert.bnEqual((await futuresMarket.profitLoss(trader2))[0], toBN(0));
			});

			it('price increase', async () => {
				await exchangeRates.updateRates([baseAsset], [toUnit('150')], await currentTime(), {
					from: oracle,
				});

				assert.bnEqual((await futuresMarket.profitLoss(trader))[0], toUnit('2500'));
				assert.bnEqual((await futuresMarket.profitLoss(trader2))[0], toUnit('2000'));
			});

			it('price decrease', async () => {
				await exchangeRates.updateRates([baseAsset], [toUnit('90')], await currentTime(), {
					from: oracle,
				});

				assert.bnEqual((await futuresMarket.profitLoss(trader))[0], toUnit('-500'));
				assert.bnEqual((await futuresMarket.profitLoss(trader2))[0], toUnit('-400'));
			});

			it('Reports invalid prices properly', async () => {
				await fastForward(7 * 24 * 60 * 60); // Stale the prices
				assert.isTrue((await futuresMarket.profitLoss(trader))[1]);
			});
		});

		describe('Remaining margin', async () => {
			it('Remaining margin unchanged with no funding or profit', async () => {
				assert.isTrue(false);
			});

			describe('no funding and profit', async () => {
				it('positive profit', async () => {
					assert.isTrue(false);
				});

				it('negative profit', async () => {
					assert.isTrue(false);
				});
			});

			describe('funding and no profit', async () => {
				it('positive funding', async () => {
					assert.isTrue(false);
				});

				it('negative funding', async () => {
					assert.isTrue(false);
				});
			});

			describe('funding and profit', async () => {
				it('positive sum', async () => {
					assert.isTrue(false);
				});

				it('negative sum', async () => {
					assert.isTrue(false);
				});
			});

			it('Remaining margin is clamped to zero if losses exceed initial margin', async () => {
				assert.isTrue(false);
			});
		});

		describe('Leverage', async () => {
			it('current leverage', async () => {
				let price = toUnit(100);

				await futuresMarket.submitOrder(toUnit('1000'), toUnit('5'), { from: trader });
				await futuresMarket.submitOrder(toUnit('-1000'), toUnit('10'), { from: trader2 });
				await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
					from: oracle,
				});
				await futuresMarket.confirmOrder(trader);
				await futuresMarket.confirmOrder(trader2);

				// With no price motion and no funding rate, leverage should be unchanged.
				assert.bnClose((await futuresMarket.currentLeverage(trader))[0], toUnit(5), toUnit(0.001));
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader2))[0],
					toUnit(10),
					toUnit(0.001)
				);

				price = toUnit(105);
				await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
					from: oracle,
				});

				// Price moves to 105:
				// long notional value 5000 -> 5250; long remaining margin 1000 -> 1250; leverage 5 -> 4.2
				// short notional value -10000 -> 10500; short remaining margin -1000 -> -500; leverage 10 -> 21;
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader))[0],
					toUnit(4.2),
					toUnit(0.001)
				);
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader2))[0],
					toUnit(21),
					toUnit(0.001)
				);
			});

			it('current leverage: no position', async () => {
				const currentLeverage = await futuresMarket.currentLeverage(trader);
				assert.bnEqual(currentLeverage[0], toBN('0'));
			});

			it('current leverage properly reports invalid prices', async () => {
				await fastForward(7 * 24 * 60 * 60);
				const currentLeverage = await futuresMarket.currentLeverage(trader);
				assert.isTrue(currentLeverage[1]);
			});
		});
	});

	describe('Funding', () => {
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
					margin: toUnit(marginTrader[0]),
					leverage: toUnit('10'),
				});
			}
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));
		});

		it('A balanced market (with differing leverage) induces zero funding rate', async () => {
			for (const marginTrader of [
				['1000', '5', trader],
				['-2000', '2.5', trader2],
			]) {
				await submitAndConfirmOrder({
					market: futuresMarket,
					account: marginTrader[2],
					fillPrice: toUnit('100'),
					margin: toUnit(marginTrader[0]),
					leverage: toUnit(marginTrader[1]),
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
						margin,
						leverage: toUnit('10'),
					});

					const expected = side === 'long' ? -maxFundingRate : maxFundingRate;

					assert.bnEqual(await futuresMarket.currentFundingRate(), expected);
				});

				// TODO: Loop for other funding rate levels.
				// TODO: Change funding rate parameters and see if the numbers are still accurate
			});
		}
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

				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader, true)).price,
					toUnit(201),
					toUnit('0.001')
				);

				await systemSettings.setFuturesLiquidationFee(toUnit('100'), { from: owner });

				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader, true)).price,
					toUnit(205),
					toUnit('0.001')
				);

				await systemSettings.setFuturesLiquidationFee(toUnit('0'), { from: owner });

				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader, true)).price,
					toUnit(200),
					toUnit('0.001')
				);
			});

			it('Liquidation price is accurate with funding', async () => {
				// Submit orders that induce -0.05 funding rate
				await futuresMarket.submitOrder(toUnit('1500'), toUnit('5'), { from: trader });
				await futuresMarket.submitOrder(toUnit('-500'), toUnit('5'), { from: trader2 });
				const price = toUnit(250);

				await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
					from: oracle,
				});
				await futuresMarket.confirmOrder(trader);
				await futuresMarket.confirmOrder(trader2);

				// One day of funding
				await fastForward(24 * 60 * 60);

				// Trader must pay (1500 * 5) / 20 = 375 funding
				// liquidation price = ((30 * 250) + 20 - (1500 - 375)) / 30 = 213.166...
				let lPrice = await futuresMarket.liquidationPrice(trader, true);
				assert.bnClose(lPrice[0], toUnit(213.167), toUnit(0.001));

				// trader2 receives (500 * 5) / 20 = 125 funding
				// liquidation price = ((10 * 250) + 20 - (500 + 125)) / 10 = 189.50
				lPrice = await futuresMarket.liquidationPrice(trader2, true);
				assert.bnClose(lPrice[0], toUnit(189.5), toUnit(0.001));
			});

			it('Liquidation price reports invalidity properly', async () => {
				await futuresMarket.submitOrder(toUnit('1500'), toUnit('5'), { from: trader });
				await futuresMarket.submitOrder(toUnit('-1000'), toUnit('5'), { from: trader2 });
				const price = toUnit(250);
				await exchangeRates.updateRates([baseAsset], [price], await currentTime(), {
					from: oracle,
				});
				await futuresMarket.confirmOrder(trader);
				await futuresMarket.confirmOrder(trader2);

				await fastForward(60 * 60 * 24 * 7); // Stale the price

				const lPrice = await futuresMarket.liquidationPrice(trader, true);
				assert.bnClose(lPrice[0], toUnit(235.667), toUnit(0.001));
				assert.isTrue(lPrice[1]);
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

			// TODO: Ensure liquidation price is accurate here.
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });

			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSD.address,
				args: [noBalance, liquidationFee],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'PositionLiquidated',
				emittedFrom: proxyFuturesMarket.address,
				args: [trader, noBalance, positionSize, price],
				log: decodedLogs[1],
				bnCloseVariance: toUnit('0.001'),
			});
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
});
