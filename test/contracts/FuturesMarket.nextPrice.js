const { contract, web3 } = require('hardhat');
const { toBytes32 } = require('../..');
const { toUnit, multiplyDecimal } = require('../utils')();
const { toBN } = web3.utils;

const { setupAllContracts } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { getDecodedLogs, decodedEventEqual, updateAggregatorRates } = require('./helpers');

contract('FuturesMarket MixinFuturesNextPriceOrders', accounts => {
	let futuresMarketSettings,
		futuresMarket,
		exchangeRates,
		circuitBreaker,
		sUSD,
		systemSettings,
		systemStatus,
		feePool;

	const owner = accounts[1];
	const trader = accounts[2];
	const trader2 = accounts[3];
	const trader3 = accounts[4];
	const traderInitialBalance = toUnit(1000000);

	const marketKeySuffix = '-perp';

	const marketKey = toBytes32('sBTC' + marketKeySuffix);
	const baseAsset = toBytes32('sBTC');
	const takerFeeNextPrice = toUnit('0.0005');
	const makerFeeNextPrice = toUnit('0.0001');
	const initialPrice = toUnit('100');

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
			FuturesMarketSettings: futuresMarketSettings,
			FuturesMarketBTC: futuresMarket,
			ExchangeRates: exchangeRates,
			CircuitBreaker: circuitBreaker,
			SynthsUSD: sUSD,
			FeePool: feePool,
			SystemSettings: systemSettings,
			SystemStatus: systemStatus,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sBTC', 'sETH'],
			contracts: [
				'FuturesMarketManager',
				'FuturesMarketSettings',
				{ contract: 'FuturesMarketBTC', properties: { perpSuffix: marketKeySuffix } },
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'CircuitBreaker',
				'SystemStatus',
				'SystemSettings',
				'Synthetix',
				'CollateralManager',
				'DebtCache',
			],
		}));

		// Update the rate so that it is not invalid
		await setPrice(baseAsset, initialPrice);

		// disable dynamic fee for most tests
		// it will be enabled for specific tests
		await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });

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
				emittedFrom: futuresMarket.address,
				args: [toBN('1'), trader, expectedMargin, 0, 0, price, toBN(2), 0],
				log: decodedLogs[1],
			});
			// NextPriceOrderSubmitted
			decodedEventEqual({
				event: 'NextPriceOrderSubmitted',
				emittedFrom: futuresMarket.address,
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

			it('if futures markets are suspended', async () => {
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					futuresMarket.submitNextPriceOrder(size, { from: trader }),
					'Futures markets are suspended'
				);
			});

			it('if market is suspended', async () => {
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					futuresMarket.submitNextPriceOrder(size, { from: trader }),
					'Market suspended'
				);
			});
		});
	});

	describe('submitNextPriceOrderWithTracking()', () => {
		const trackingCode = toBytes32('code');

		it('submitting an order results in correct views and events', async () => {
			// setup
			const roundId = await exchangeRates.getCurrentRoundId(baseAsset);
			const spotFee = (await futuresMarket.orderFee(size))[0];
			const keeperFee = await futuresMarketSettings.minKeeperFee();
			const tx = await futuresMarket.submitNextPriceOrderWithTracking(size, trackingCode, {
				from: trader,
			});

			// check order
			const order = await futuresMarket.nextPriceOrders(trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, roundId.add(toBN(1)));
			assert.bnEqual(order.commitDeposit, spotFee);
			assert.bnEqual(order.keeperDeposit, keeperFee);
			assert.bnEqual(order.trackingCode, trackingCode);

			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });

			// NextPriceOrderSubmitted
			decodedEventEqual({
				event: 'NextPriceOrderSubmitted',
				emittedFrom: futuresMarket.address,
				args: [trader, size, roundId.add(toBN(1)), spotFee, keeperFee, trackingCode],
				log: decodedLogs[2],
			});
		});

		it('executing an order emits the tracking event', async () => {
			// setup
			await futuresMarket.submitNextPriceOrderWithTracking(size, trackingCode, { from: trader });

			// go to next round
			await setPrice(baseAsset, price);

			const expectedFee = multiplyDecimal(size, multiplyDecimal(price, takerFeeNextPrice));

			// excute the order
			const tx = await futuresMarket.executeNextPriceOrder(trader, { from: trader });

			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });

			decodedEventEqual({
				event: 'FuturesTracking',
				emittedFrom: futuresMarket.address,
				args: [trackingCode, baseAsset, marketKey, size, expectedFee],
				log: decodedLogs[3],
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
						emittedFrom: futuresMarket.address,
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
					emittedFrom: futuresMarket.address,
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

			it('cannot cancel if futures markets are suspended', async () => {
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					futuresMarket.cancelNextPriceOrder(trader, { from: trader }),
					'Futures markets are suspended'
				);
			});

			it('cannot cancel if market is suspended', async () => {
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					futuresMarket.cancelNextPriceOrder(trader, { from: trader }),
					'Market suspended'
				);
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
						'Position can be liquidated'
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
						'Position can be liquidated'
					);
					// the difference in reverts is due to difference between refund into margin
					// in case of account owner and transfer in case of keeper
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
					emittedFrom: futuresMarket.address,
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
					emittedFrom: futuresMarket.address,
					args: [toBN('1'), trader, expectedMargin, size, size, targetPrice, toBN(2), expectedFee],
					log: decodedLogs.slice(-2, -1)[0],
				});

				// NextPriceOrderRemoved
				decodedEventEqual({
					event: 'NextPriceOrderRemoved',
					emittedFrom: futuresMarket.address,
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

					it('reverts if futures markets are suspended', async () => {
						await setPrice(baseAsset, targetPrice);
						await systemStatus.suspendFutures(toUnit(0), { from: owner });
						await assert.revert(
							futuresMarket.executeNextPriceOrder(trader, { from: trader }),
							'Futures markets are suspended'
						);
					});

					it('reverts if market is suspended', async () => {
						await setPrice(baseAsset, targetPrice);
						await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
						await assert.revert(
							futuresMarket.executeNextPriceOrder(trader, { from: trader }),
							'Market suspended'
						);
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

	describe('when dynamic fee is enabled', () => {
		beforeEach(async () => {
			const dynamicFeeRounds = 4;
			// set multiple past rounds
			for (let i = 0; i < dynamicFeeRounds; i++) {
				await setPrice(baseAsset, initialPrice);
			}
			// enable dynamic fees
			await systemSettings.setExchangeDynamicFeeRounds(dynamicFeeRounds, { from: owner });
		});

		describe('when dynamic fee is too high (price too volatile)', () => {
			const spikedPrice = multiplyDecimal(initialPrice, toUnit(1.1));
			beforeEach(async () => {
				// set up a healthy position
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });

				// submit an order
				await futuresMarket.submitNextPriceOrder(size, { from: trader });

				// spike the price
				await setPrice(baseAsset, spikedPrice);
			});

			it('canceling an order works', async () => {
				await futuresMarket.cancelNextPriceOrder(trader, { from: trader });
			});

			it('submitting an order reverts', async () => {
				// cancel existing
				await futuresMarket.cancelNextPriceOrder(trader, { from: trader });

				await assert.revert(
					futuresMarket.submitNextPriceOrder(size, { from: trader }),
					'Price too volatile'
				);
			});

			it('executing an order reverts', async () => {
				// advance to next round (same price, should be still volatile)
				await setPrice(baseAsset, spikedPrice);

				await assert.revert(
					futuresMarket.executeNextPriceOrder(trader, { from: trader }),
					'Price too volatile'
				);
			});
		});
	});
});
