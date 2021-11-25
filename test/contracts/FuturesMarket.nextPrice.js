const { contract, web3 } = require('hardhat');
const { toBytes32 } = require('../..');
const { currentTime, toUnit, multiplyDecimal } = require('../utils')();
const { toBN } = web3.utils;

const { setupAllContracts } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { getDecodedLogs, decodedEventEqual } = require('./helpers');

contract('FuturesMarket MixinFuturesNextPriceOrders', accounts => {
	let proxyFuturesMarket,
		futuresMarketSettings,
		// futuresMarketManager,
		futuresMarket,
		exchangeRates,
		exchangeRatesCircuitBreaker,
		oracle,
		sUSD,
		feePool;

	const owner = accounts[1];
	const trader = accounts[2];
	const trader2 = accounts[3];
	const trader3 = accounts[4];
	const traderInitialBalance = toUnit(1000000);

	const baseAsset = toBytes32('sBTC');
	const takerFeeNextPrice = toUnit('0.0005');
	const makerFeeNextPrice = toUnit('0.0001');
	const initialPrice = toUnit('100');

	async function setPrice(asset, price, resetCircuitBreaker = true) {
		await exchangeRates.updateRates([asset], [price], await currentTime(), {
			from: oracle,
		});
		// reset the last price to the new price, so that we don't trip the breaker
		// on various tests that change prices beyond the allowed deviation
		if (resetCircuitBreaker) {
			// flag defaults to true because the circuit breaker is not tested in most tests
			await exchangeRatesCircuitBreaker.resetLastExchangeRate([asset], { from: owner });
		}
	}

	before(async () => {
		({
			ProxyFuturesMarketBTC: proxyFuturesMarket,
			FuturesMarketSettings: futuresMarketSettings,
			// FuturesMarketManager: futuresMarketManager,
			FuturesMarketBTC: futuresMarket,
			ExchangeRates: exchangeRates,
			ExchangeRatesCircuitBreaker: exchangeRatesCircuitBreaker,
			SynthsUSD: sUSD,
			FeePool: feePool,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sBTC', 'sETH'],
			contracts: [
				'FuturesMarketManager',
				'FuturesMarketSettings',
				'ProxyFuturesMarketBTC',
				'ProxyFuturesMarketETH',
				'FuturesMarketBTC',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'ExchangeRatesCircuitBreaker',
				'SystemStatus',
				'Synthetix',
				'CollateralManager',
				'DebtCache',
			],
		}));

		// Update the rate so that it is not invalid
		oracle = await exchangeRates.oracle();
		await setPrice(baseAsset, initialPrice);

		// Issue the trader some sUSD
		for (const t of [trader, trader2, trader3]) {
			await sUSD.issue(t, traderInitialBalance);
		}
	});

	addSnapshotBeforeRestoreAfterEach();

	let margin, size, price;

	beforeEach(async () => {
		// prepare basic order parameters
		margin = toUnit('1000');
		await futuresMarket.transferMargin(margin, { from: trader });
		size = toUnit('50');
		price = toUnit('200');
		await setPrice(baseAsset, price);
	});

	describe('submitNextPriceOrder()', () => {
		it('submitting an order results in correct views and events', async () => {
			// setup
			const roundId = await exchangeRates.getCurrentRoundId(baseAsset);
			const spotFee = (await futuresMarket.orderFee(size))[0];
			const keeperFee = await futuresMarketSettings.minKeeperFee();
			const tx = await futuresMarket.submitNextPriceOrder(size, { from: trader });

			// check order
			const order = await futuresMarket.nextPriceOrders(trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, roundId.add(toBN(1)));
			assert.bnEqual(order.commitDeposit, spotFee);
			assert.bnEqual(order.keeperDeposit, keeperFee);

			// check margin
			const position = await futuresMarket.positions(trader);
			const expectedMargin = margin.sub(spotFee.add(keeperFee));
			assert.bnEqual(position.margin, expectedMargin);

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [futuresMarket] });
			assert.equal(decodedLogs.length, 3);
			// PositionModified
			decodedEventEqual({
				event: 'PositionModified',
				emittedFrom: proxyFuturesMarket.address,
				args: [toBN('1'), trader, expectedMargin, 0, 0, price, toBN(2), 0],
				log: decodedLogs[1],
			});
			// NextPriceOrderSubmitted
			decodedEventEqual({
				event: 'NextPriceOrderSubmitted',
				emittedFrom: proxyFuturesMarket.address,
				args: [trader, size, roundId.add(toBN(1)), spotFee, keeperFee],
				log: decodedLogs[2],
			});
		});

		describe('cannot submit an order when', () => {
			it('zero size', async () => {
				await assert.revert(
					futuresMarket.submitNextPriceOrder(0, { from: trader }),
					'Cannot submit empty order'
				);
			});

			it('not enough margin', async () => {
				await futuresMarket.withdrawAllMargin({ from: trader });
				await assert.revert(
					futuresMarket.submitNextPriceOrder(size, { from: trader }),
					'Insufficient margin'
				);
			});

			it('too much leverage', async () => {
				await assert.revert(
					futuresMarket.submitNextPriceOrder(size.mul(toBN(10)), { from: trader }),
					'Max leverage exceeded'
				);
			});

			it('previous order exists', async () => {
				await futuresMarket.submitNextPriceOrder(size, { from: trader });
				await assert.revert(
					futuresMarket.submitNextPriceOrder(size, { from: trader }),
					'previous order exists'
				);
			});
		});
	});

	describe('cancelNextPriceOrder()', () => {
		it('cannot cancel when there is no order', async () => {
			// account owner
			await assert.revert(
				futuresMarket.cancelNextPriceOrder(trader, { from: trader }),
				'no previous order'
			);
			// keeper
			await assert.revert(
				futuresMarket.cancelNextPriceOrder(trader, { from: trader2 }),
				'no previous order'
			);
		});

		describe('when an order exists', () => {
			let roundId, spotFee, keeperFee;

			// helper function to check cancellation tx effects
			async function checkCancellation(from) {
				const currentMargin = (await futuresMarket.positions(trader)).margin;
				// cancel the order
				const tx = await futuresMarket.cancelNextPriceOrder(trader, { from: from });

				// check order is removed
				const order = await futuresMarket.nextPriceOrders(trader);
				assert.bnEqual(order.sizeDelta, 0);
				assert.bnEqual(order.targetRoundId, 0);
				assert.bnEqual(order.commitDeposit, 0);
				assert.bnEqual(order.keeperDeposit, 0);

				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });

				if (from === trader) {
					// trader gets refunded
					assert.equal(decodedLogs.length, 4);
					// keeper fee was refunded
					// PositionModified
					decodedEventEqual({
						event: 'PositionModified',
						emittedFrom: proxyFuturesMarket.address,
						args: [toBN('1'), trader, currentMargin.add(keeperFee), 0, 0, price, toBN(2), 0],
						log: decodedLogs[1],
					});
				} else {
					// keeper gets paid
					assert.equal(decodedLogs.length, 3);
					decodedEventEqual({
						event: 'Issued',
						emittedFrom: sUSD.address,
						args: [from, keeperFee],
						log: decodedLogs[0],
					});
				}

				// commitFee (equal to spotFee) paid to fee pool
				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [await feePool.FEE_ADDRESS(), spotFee],
					log: decodedLogs.slice(-2, -1)[0], // [-2]
				});
				// NextPriceOrderRemoved
				decodedEventEqual({
					event: 'NextPriceOrderRemoved',
					emittedFrom: proxyFuturesMarket.address,
					args: [trader, roundId, size, roundId.add(toBN(1)), spotFee, keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await futuresMarket.transferMargin(margin, { from: trader });
				// and can submit new order
				await futuresMarket.submitNextPriceOrder(size, { from: trader });
				const newOrder = await futuresMarket.nextPriceOrders(trader);
				assert.bnEqual(newOrder.sizeDelta, size);
			}

			beforeEach(async () => {
				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				spotFee = (await futuresMarket.orderFee(size))[0];
				keeperFee = await futuresMarketSettings.minKeeperFee();
				await futuresMarket.submitNextPriceOrder(size, { from: trader });
			});

			describe('account owner can cancel', () => {
				it('in same round', async () => {
					await checkCancellation(trader);
				});

				it('in target round', async () => {
					await setPrice(baseAsset, price);
					await checkCancellation(trader);
				});

				it('after confirmation window', async () => {
					await setPrice(baseAsset, price);
					await setPrice(baseAsset, price);
					await setPrice(baseAsset, price);
					await checkCancellation(trader);
				});
			});

			describe('an order that would revert on execution can be cancelled', () => {
				beforeEach(async () => {
					// go to next round
					await setPrice(baseAsset, price);
					// withdraw margin (will cause order to fail)
					await futuresMarket.withdrawAllMargin({ from: trader });
					// check execution would fail
					await assert.revert(
						futuresMarket.executeNextPriceOrder(trader, { from: trader }),
						'Insufficient margin'
					);
				});

				it('by account owner', async () => {
					await checkCancellation(trader);
				});

				it('by non-account owner, after confirmation window', async () => {
					await setPrice(baseAsset, price);
					await setPrice(baseAsset, price);
					await setPrice(baseAsset, price);
					// now cancel
					await checkCancellation(trader2);
				});
			});

			describe('non-account owner', () => {
				it('cannot cancel before confirmation window is over', async () => {
					// same round
					await assert.revert(
						futuresMarket.cancelNextPriceOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// target round
					await setPrice(baseAsset, price);
					await assert.revert(
						futuresMarket.cancelNextPriceOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// next round after target round
					await setPrice(baseAsset, price);
					await assert.revert(
						futuresMarket.cancelNextPriceOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// next one after that (for 2 roundId)
					await setPrice(baseAsset, price);
					await assert.revert(
						futuresMarket.cancelNextPriceOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// ok now
					await setPrice(baseAsset, price);
					await checkCancellation(trader2);
				});
			});
		});
	});

	describe('executeNextPriceOrder()', () => {
		it('cannot execute when there is no order', async () => {
			// account owner
			await assert.revert(
				futuresMarket.executeNextPriceOrder(trader, { from: trader }),
				'no previous order'
			);
			// keeper
			await assert.revert(
				futuresMarket.executeNextPriceOrder(trader, { from: trader2 }),
				'no previous order'
			);
		});

		describe('when an order exists', () => {
			let roundId, commitFee, keeperFee;

			beforeEach(async () => {
				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				// commitFee is the fee that would be chanrged for a spot trade when order is submitted
				commitFee = (await futuresMarket.orderFee(size))[0];
				// keeperFee is the minimum keeperFee for the system
				keeperFee = await futuresMarketSettings.minKeeperFee();
				await futuresMarket.submitNextPriceOrder(size, { from: trader });
			});

			describe('execution reverts', () => {
				it('in same round', async () => {
					// account owner
					await assert.revert(
						futuresMarket.executeNextPriceOrder(trader, { from: trader }),
						'target roundId not reached'
					);
					// keeper
					await assert.revert(
						futuresMarket.executeNextPriceOrder(trader, { from: trader2 }),
						'target roundId not reached'
					);
				});

				it('after confirmation window', async () => {
					// target round
					await setPrice(baseAsset, price);
					await setPrice(baseAsset, price);
					await setPrice(baseAsset, price);
					// after window
					await setPrice(baseAsset, price);

					// account owner
					await assert.revert(
						futuresMarket.executeNextPriceOrder(trader, { from: trader }),
						'order too old, use cancel'
					);
					// keeper
					await assert.revert(
						futuresMarket.executeNextPriceOrder(trader, { from: trader2 }),
						'order too old, use cancel'
					);
				});

				it('if margin removed', async () => {
					// go to target round
					await setPrice(baseAsset, price);
					// withdraw margin (will cause order to fail)
					await futuresMarket.withdrawAllMargin({ from: trader });

					// account owner
					await assert.revert(
						futuresMarket.executeNextPriceOrder(trader, { from: trader }),
						'Insufficient margin'
					);
					// keeper
					await assert.revert(
						futuresMarket.executeNextPriceOrder(trader, { from: trader2 }),
						'Insufficient margin'
					);
				});

				it('if price too high', async () => {
					// go to target round, set price too high
					await setPrice(baseAsset, price.mul(toBN(2)));

					// account owner
					await assert.revert(
						futuresMarket.executeNextPriceOrder(trader, { from: trader }),
						'Max leverage exceeded'
					);
					// keeper
					await assert.revert(
						futuresMarket.executeNextPriceOrder(trader, { from: trader2 }),
						'Max leverage exceeded'
					);
				});
			});

			// helper function to check excutiion and its results
			// from: which account is requesting the execution
			// targetPrice: the price that the order should be executed at
			// feeRate: expected exchange fee rate
			// spotTradeDetails: trade details of the same trade if it would happen as spot
			async function checkExecution(from, targetPrice, feeRate, spotTradeDetails) {
				const currentMargin = (await futuresMarket.positions(trader)).margin;
				// excute the order
				const tx = await futuresMarket.executeNextPriceOrder(trader, { from: from });

				// check order is removed now
				const order = await futuresMarket.nextPriceOrders(trader);
				assert.bnEqual(order.sizeDelta, 0);
				assert.bnEqual(order.targetRoundId, 0);
				assert.bnEqual(order.commitDeposit, 0);
				assert.bnEqual(order.keeperDeposit, 0);

				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });

				let expectedRefund = commitFee; // at least the commitFee is refunded
				if (from === trader) {
					// trader gets refunded keeperFee
					expectedRefund = expectedRefund.add(keeperFee);
					// no event for keeper payment
					assert.equal(decodedLogs.length, 5);
					// funding, position(refund), issued (exchange fee), position(trade), order removed
				} else {
					// keeper gets paid
					assert.equal(decodedLogs.length, 6);
					// keeper fee, funding, position(refund), issued (exchange fee), position(trade), order removed
					decodedEventEqual({
						event: 'Issued',
						emittedFrom: sUSD.address,
						args: [from, keeperFee],
						log: decodedLogs[0],
					});
				}

				// trader was refunded correctly
				// PositionModified
				let expectedMargin = currentMargin.add(expectedRefund);
				const currentPrice = (await futuresMarket.assetPrice()).price;
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: proxyFuturesMarket.address,
					args: [toBN('1'), trader, expectedMargin, 0, 0, currentPrice, toBN(2), 0],
					log: decodedLogs.slice(-4, -3)[0],
				});

				// trade was executed correctly
				// PositionModified
				const expectedFee = multiplyDecimal(size, multiplyDecimal(targetPrice, feeRate));

				// calculate the expected margin after trade
				expectedMargin = spotTradeDetails.margin
					.add(spotTradeDetails.fee)
					.sub(expectedFee)
					.add(expectedRefund);

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: proxyFuturesMarket.address,
					args: [toBN('1'), trader, expectedMargin, size, size, targetPrice, toBN(2), expectedFee],
					log: decodedLogs.slice(-2, -1)[0],
				});

				// NextPriceOrderRemoved
				decodedEventEqual({
					event: 'NextPriceOrderRemoved',
					emittedFrom: proxyFuturesMarket.address,
					args: [trader, roundId, size, roundId.add(toBN(1)), commitFee, keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await futuresMarket.transferMargin(margin, { from: trader });
				// and can submit new order
				await futuresMarket.submitNextPriceOrder(size, { from: trader });
				const newOrder = await futuresMarket.nextPriceOrders(trader);
				assert.bnEqual(newOrder.sizeDelta, size);
			}

			describe('execution results in correct views and events', () => {
				let targetPrice, spotTradeDetails;

				beforeEach(async () => {
					targetPrice = multiplyDecimal(price, toUnit(0.9));
				});

				describe('during target round', () => {
					describe('taker trade', () => {
						beforeEach(async () => {
							// go to next round
							await setPrice(baseAsset, targetPrice);
							spotTradeDetails = await futuresMarket.postTradeDetails(size, trader);
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetPrice, takerFeeNextPrice, spotTradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(trader2, targetPrice, takerFeeNextPrice, spotTradeDetails);
						});
					});

					describe('maker trade', () => {
						beforeEach(async () => {
							// skew the other way
							await futuresMarket.transferMargin(margin.mul(toBN(2)), { from: trader3 });
							await futuresMarket.modifyPosition(size.mul(toBN(-2)), { from: trader3 });
							// go to next round
							await setPrice(baseAsset, targetPrice);
							spotTradeDetails = await futuresMarket.postTradeDetails(size, trader);
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetPrice, makerFeeNextPrice, spotTradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(trader2, targetPrice, makerFeeNextPrice, spotTradeDetails);
						});
					});
				});

				describe('after target round, but within confirmation window', () => {
					beforeEach(async () => {
						// target round has the new price
						await setPrice(baseAsset, targetPrice);
						spotTradeDetails = await futuresMarket.postTradeDetails(size, trader);
						// other rounds are back to old price
						await setPrice(baseAsset, price);
					});

					describe('taker trade', () => {
						beforeEach(async () => {
							// go to next round
							await setPrice(baseAsset, price);
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetPrice, takerFeeNextPrice, spotTradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(trader2, targetPrice, takerFeeNextPrice, spotTradeDetails);
						});
					});

					describe('maker trade', () => {
						beforeEach(async () => {
							// skew the other way
							await futuresMarket.transferMargin(margin.mul(toBN(2)), { from: trader3 });
							await futuresMarket.modifyPosition(size.mul(toBN(-2)), { from: trader3 });
							// go to next round
							await setPrice(baseAsset, price);
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetPrice, makerFeeNextPrice, spotTradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(trader2, targetPrice, makerFeeNextPrice, spotTradeDetails);
						});
					});
				});
			});
		});
	});
});
