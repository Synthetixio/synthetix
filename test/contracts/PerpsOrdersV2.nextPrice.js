const { contract, web3 } = require('hardhat');
const { toBytes32 } = require('../..');
const { toUnit, multiplyDecimal } = require('../utils')();
const { toBN } = web3.utils;

const { setupAllContracts } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { getDecodedLogs, decodedEventEqual, updateAggregatorRates } = require('./helpers');

contract('PerpsOrdersV2 mixin for next price orders', accounts => {
	let perpsManager,
		// futuresMarketManager,
		perpsOrders,
		perpsEngine,
		// perpsStorage,
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

	const marketKey = toBytes32('pBTC');
	const baseAsset = toBytes32('BTC');
	const baseFeeNextPrice = toUnit('0.0005');
	const initialPrice = toUnit('100');

	async function setPrice(asset, price, resetCircuitBreaker = true) {
		await updateAggregatorRates(
			exchangeRates,
			resetCircuitBreaker ? circuitBreaker : null,
			[asset],
			[price]
		);
	}

	async function getPositionSummary(account) {
		return perpsOrders.positionSummary(marketKey, account);
	}

	async function getPosition(account) {
		return (await getPositionSummary(account)).position;
	}

	before(async () => {
		({
			PerpsManagerV2: perpsManager,
			// FuturesMarketManager: futuresMarketManager,
			PerpsOrdersV2: perpsOrders,
			PerpsEngineV2: perpsEngine,
			// PerpsStorageV2: perpsStorage,
			ExchangeRates: exchangeRates,
			CircuitBreaker: circuitBreaker,
			SynthsUSD: sUSD,
			FeePool: feePool,
			SystemSettings: systemSettings,
			SystemStatus: systemStatus,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			feeds: ['BTC', 'ETH'],
			perps: [
				{ marketKey: 'pBTC', assetKey: 'BTC' },
				{ marketKey: 'pETH', assetKey: 'ETH' },
			],
			contracts: [
				'FuturesMarketManager',
				'PerpsManagerV2',
				'PerpsEngineV2',
				'PerpsOrdersV2',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'ExchangeCircuitBreaker',
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
		await perpsOrders.transferMargin(marketKey, margin, { from: trader });
		size = toUnit('50');
		price = toUnit('200');
		await setPrice(baseAsset, price);
	});

	describe('fee views', () => {
		it('are as expected', async () => {
			assert.bnEqual(await perpsOrders.baseFeeNextPrice(marketKey), baseFeeNextPrice);
		});
	});

	describe('submitNextPriceOrder()', () => {
		it('submitting an order results in correct views and events', async () => {
			// setup
			const roundId = await exchangeRates.getCurrentRoundId(baseAsset);
			const spotFee = (await perpsOrders.orderFee(marketKey, size))[0];
			const keeperFee = await perpsManager.minKeeperFee();
			const tx = await perpsOrders.submitNextPriceOrder(marketKey, size, { from: trader });

			// check order
			const order = await perpsOrders.nextPriceOrders(marketKey, trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, roundId.add(toBN(1)));
			assert.bnEqual(order.commitDeposit, spotFee);
			assert.bnEqual(order.keeperDeposit, keeperFee);

			// check margin
			const position = await getPosition(trader);
			const expectedMargin = margin.sub(spotFee.add(keeperFee));
			assert.bnEqual(position.margin, expectedMargin);
			// locked margin is as expected
			assert.bnEqual(position.lockedMargin, spotFee.add(keeperFee));

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [perpsEngine, perpsOrders],
			});
			assert.equal(decodedLogs.length, 4);
			// PositionModified
			decodedEventEqual({
				event: 'PositionModified',
				emittedFrom: perpsEngine.address,
				args: [marketKey, toBN('1'), trader, expectedMargin, 0, 0, price, 0],
				log: decodedLogs[2],
			});
			// NextPriceOrderSubmitted
			decodedEventEqual({
				event: 'NextPriceOrderSubmitted',
				emittedFrom: perpsOrders.address,
				args: [marketKey, trader, size, roundId.add(toBN(1)), spotFee, keeperFee, toBytes32('')],
				log: decodedLogs[3],
			});
		});

		describe('cannot submit an order when', () => {
			it('zero size', async () => {
				await assert.revert(
					perpsOrders.submitNextPriceOrder(marketKey, 0, { from: trader }),
					'Order would fail as spot'
				);
			});

			it('not enough margin', async () => {
				await perpsOrders.withdrawMaxMargin(marketKey, { from: trader });
				await assert.revert(
					perpsOrders.submitNextPriceOrder(marketKey, size, { from: trader }),
					'Order would fail as spot'
				);
			});

			it('too much leverage', async () => {
				await assert.revert(
					perpsOrders.submitNextPriceOrder(marketKey, size.mul(toBN(10)), { from: trader }),
					'Order would fail as spot'
				);
			});

			it('previous order exists', async () => {
				await perpsOrders.submitNextPriceOrder(marketKey, size, { from: trader });
				await assert.revert(
					perpsOrders.submitNextPriceOrder(marketKey, size, { from: trader }),
					'Previous order exists'
				);
			});

			it('if futures markets are suspended', async () => {
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					perpsOrders.submitNextPriceOrder(marketKey, size, { from: trader }),
					'Futures markets are suspended'
				);
			});

			it('if market is suspended', async () => {
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					perpsOrders.submitNextPriceOrder(marketKey, size, { from: trader }),
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
			const spotFee = (await perpsOrders.orderFee(marketKey, size))[0];
			const keeperFee = await perpsManager.minKeeperFee();
			const tx = await perpsOrders.submitNextPriceOrderWithTracking(marketKey, size, trackingCode, {
				from: trader,
			});

			// check order
			const order = await perpsOrders.nextPriceOrders(marketKey, trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, roundId.add(toBN(1)));
			assert.bnEqual(order.commitDeposit, spotFee);
			assert.bnEqual(order.keeperDeposit, keeperFee);
			assert.bnEqual(order.trackingCode, trackingCode);

			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsOrders] });

			// NextPriceOrderSubmitted
			decodedEventEqual({
				event: 'NextPriceOrderSubmitted',
				emittedFrom: perpsOrders.address,
				args: [marketKey, trader, size, roundId.add(toBN(1)), spotFee, keeperFee, trackingCode],
				log: decodedLogs[3],
			});
		});

		it('executing an order emits the tracking event', async () => {
			// setup
			await perpsOrders.submitNextPriceOrderWithTracking(marketKey, size, trackingCode, {
				from: trader,
			});

			// go to next round
			await setPrice(baseAsset, price);

			const expectedFee = multiplyDecimal(size, multiplyDecimal(price, baseFeeNextPrice));

			// check view
			assert.bnEqual((await perpsOrders.orderFeeNextPrice(marketKey, size))[0], expectedFee);

			// excute the order
			const tx = await perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader });

			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsEngine] });

			// funding, margin (refund), position (refund), issued (keeper), tracking, position (trade)
			decodedEventEqual({
				event: 'FeeSourceTracking',
				emittedFrom: perpsEngine.address,
				args: [trackingCode, marketKey, trader, size, expectedFee],
				log: decodedLogs[4],
			});
		});
	});

	describe('cancelNextPriceOrder()', () => {
		it('cannot cancel when there is no order', async () => {
			// account owner
			await assert.revert(
				perpsOrders.cancelNextPriceOrder(marketKey, trader, { from: trader }),
				'No previous order'
			);
			// keeper
			await assert.revert(
				perpsOrders.cancelNextPriceOrder(marketKey, trader, { from: trader2 }),
				'No previous order'
			);
		});

		describe('when an order exists', () => {
			let roundId, spotFee, keeperFee;

			// helper function to check cancellation tx effects
			async function checkCancellation(from) {
				const currentMargin = toBN((await getPosition(trader)).margin);
				// cancel the order
				const tx = await perpsOrders.cancelNextPriceOrder(marketKey, trader, { from: from });

				// check order is removed
				const order = await perpsOrders.nextPriceOrders(marketKey, trader);
				assert.bnEqual(order.sizeDelta, 0);
				assert.bnEqual(order.targetRoundId, 0);
				assert.bnEqual(order.commitDeposit, 0);
				assert.bnEqual(order.keeperDeposit, 0);

				// check margin
				const position = await getPosition(trader);
				const expectedMargin = from === trader ? currentMargin.add(keeperFee) : currentMargin;
				assert.bnEqual(position.margin, expectedMargin);
				// locked margin is as expected
				assert.bnEqual(position.lockedMargin, 0);

				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, perpsEngine, perpsOrders],
				});

				if (from === trader) {
					// trader gets refunded
					assert.equal(decodedLogs.length, 5);
					// keeper fee was refunded
					// PositionModified
					decodedEventEqual({
						event: 'PositionModified',
						emittedFrom: perpsEngine.address,
						args: [marketKey, toBN('1'), trader, currentMargin.add(keeperFee), 0, 0, price, 0],
						log: decodedLogs[2],
					});
				} else {
					// keeper gets paid
					assert.equal(decodedLogs.length, 6);
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
					emittedFrom: perpsOrders.address,
					args: [marketKey, trader, roundId, size, roundId.add(toBN(1)), spotFee, keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await perpsOrders.transferMargin(marketKey, margin, { from: trader });
				// and can submit new order
				await perpsOrders.submitNextPriceOrder(marketKey, size, { from: trader });
				const newOrder = await perpsOrders.nextPriceOrders(marketKey, trader);
				assert.bnEqual(newOrder.sizeDelta, size);
			}

			beforeEach(async () => {
				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				spotFee = (await perpsOrders.orderFee(marketKey, size))[0];
				keeperFee = await perpsManager.minKeeperFee();
				await perpsOrders.submitNextPriceOrder(marketKey, size, { from: trader });
			});

			it('cannot cancel if futures markets are suspended', async () => {
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					perpsOrders.cancelNextPriceOrder(marketKey, trader, { from: trader }),
					'Futures markets are suspended'
				);
			});

			it('cannot cancel if market is suspended', async () => {
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					perpsOrders.cancelNextPriceOrder(marketKey, trader, { from: trader }),
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
					await perpsOrders.withdrawMaxMargin(marketKey, { from: trader });
					// check execution would fail
					await assert.revert(
						perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader }),
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
						perpsOrders.cancelNextPriceOrder(marketKey, trader, { from: trader2 }),
						'Cannot be cancelled by keeper yet'
					);

					// target round
					await setPrice(baseAsset, price);
					await assert.revert(
						perpsOrders.cancelNextPriceOrder(marketKey, trader, { from: trader2 }),
						'Cannot be cancelled by keeper yet'
					);

					// next round after target round
					await setPrice(baseAsset, price);
					await assert.revert(
						perpsOrders.cancelNextPriceOrder(marketKey, trader, { from: trader2 }),
						'Cannot be cancelled by keeper yet'
					);

					// next one after that (for 2 roundId)
					await setPrice(baseAsset, price);
					await assert.revert(
						perpsOrders.cancelNextPriceOrder(marketKey, trader, { from: trader2 }),
						'Cannot be cancelled by keeper yet'
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
				perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader }),
				'No previous order'
			);
			// keeper
			await assert.revert(
				perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader2 }),
				'No previous order'
			);
		});

		describe('when an order exists', () => {
			let roundId, commitFee, keeperFee;

			beforeEach(async () => {
				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				// commitFee is the fee that would be chanrged for a spot trade when order is submitted
				commitFee = (await perpsOrders.orderFee(marketKey, size))[0];
				// keeperFee is the minimum keeperFee for the system
				keeperFee = await perpsManager.minKeeperFee();
				await perpsOrders.submitNextPriceOrder(marketKey, size, { from: trader });
			});

			describe('execution reverts', () => {
				it('in same round', async () => {
					// account owner
					await assert.revert(
						perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader }),
						'Target roundId not reached'
					);
					// keeper
					await assert.revert(
						perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader2 }),
						'Target roundId not reached'
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
						perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader }),
						'Order too old, use cancel'
					);
					// keeper
					await assert.revert(
						perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader2 }),
						'Order too old, use cancel'
					);
				});

				it('if margin removed', async () => {
					// go to target round
					await setPrice(baseAsset, price);
					// withdraw margin (will cause order to fail)
					await perpsOrders.withdrawMaxMargin(marketKey, { from: trader });

					// account owner
					await assert.revert(
						perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader }),
						'Position can be liquidated'
					);
					await assert.revert(
						perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader2 }),
						'Position can be liquidated'
					);
				});

				it('if price too high', async () => {
					// go to target round, set price too high
					await setPrice(baseAsset, price.mul(toBN(2)));

					// account owner
					await assert.revert(
						perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader }),
						'Max leverage exceeded'
					);
					// keeper
					await assert.revert(
						perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader2 }),
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
				const currentMargin = toBN((await getPosition(trader)).margin);
				// excute the order
				const tx = await perpsOrders.executeNextPriceOrder(marketKey, trader, { from: from });

				// check order is removed now
				const order = await perpsOrders.nextPriceOrders(marketKey, trader);
				assert.bnEqual(order.sizeDelta, 0);
				assert.bnEqual(order.targetRoundId, 0);
				assert.bnEqual(order.commitDeposit, 0);
				assert.bnEqual(order.keeperDeposit, 0);

				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, perpsOrders, perpsEngine],
				});

				let expectedRefund = commitFee; // at least the commitFee is refunded
				if (from === trader) {
					// trader gets refunded keeperFee
					expectedRefund = expectedRefund.add(keeperFee);
					// no event for keeper payment
					assert.equal(decodedLogs.length, 6);
					// funding, margin(refund), position(refund), issued (exchange fee), position(trade), order removed
				} else {
					// keeper gets paid
					assert.equal(decodedLogs.length, 7);
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
				const currentPrice = (await perpsEngine.assetPrice(marketKey)).price;
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsEngine.address,
					args: [marketKey, toBN('1'), trader, expectedMargin, 0, 0, currentPrice, 0],
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

				// check margin stored
				const position = await getPosition(trader);
				assert.bnEqual(position.margin, expectedMargin);
				// locked margin is as expected
				assert.bnEqual(position.lockedMargin, 0);

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsEngine.address,
					args: [
						marketKey,
						toBN('1'),
						trader,
						expectedMargin,
						size,
						size,
						targetPrice,
						expectedFee,
					],
					log: decodedLogs.slice(-2, -1)[0],
				});

				// NextPriceOrderRemoved
				decodedEventEqual({
					event: 'NextPriceOrderRemoved',
					emittedFrom: perpsOrders.address,
					args: [marketKey, trader, roundId, size, roundId.add(toBN(1)), commitFee, keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await perpsOrders.transferMargin(marketKey, margin, { from: trader });
				// and can submit new order
				await perpsOrders.submitNextPriceOrder(marketKey, size, { from: trader });
				const newOrder = await perpsOrders.nextPriceOrders(marketKey, trader);
				assert.bnEqual(newOrder.sizeDelta, size);
			}

			describe('execution results in correct views and events', () => {
				let targetPrice, spotTradeDetails, baseFee, defaultExecOptions;

				beforeEach(async () => {
					targetPrice = multiplyDecimal(price, toUnit(0.9));
					baseFee = await perpsOrders.baseFee(marketKey);
					defaultExecOptions = [baseFee, 0, toBytes32('')];
				});

				describe('during target round', () => {
					describe('taker trade', () => {
						beforeEach(async () => {
							// go to next round
							await setPrice(baseAsset, targetPrice);
							spotTradeDetails = await perpsEngine.simulateTrade(
								marketKey,
								trader,
								size,
								defaultExecOptions
							);
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetPrice, baseFeeNextPrice, spotTradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(trader2, targetPrice, baseFeeNextPrice, spotTradeDetails);
						});
					});

					describe('maker trade', () => {
						beforeEach(async () => {
							// skew the other way
							await perpsOrders.transferMargin(marketKey, margin.mul(toBN(2)), { from: trader3 });
							await perpsOrders.trade(marketKey, size.mul(toBN(-2)), { from: trader3 });
							// go to next round
							await setPrice(baseAsset, targetPrice);
							spotTradeDetails = await perpsEngine.simulateTrade(
								marketKey,
								trader,
								size,
								defaultExecOptions
							);
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetPrice, baseFeeNextPrice, spotTradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(trader2, targetPrice, baseFeeNextPrice, spotTradeDetails);
						});
					});

					it('reverts if futures markets are suspended', async () => {
						await setPrice(baseAsset, targetPrice);
						await systemStatus.suspendFutures(toUnit(0), { from: owner });
						await assert.revert(
							perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader }),
							'Futures markets are suspended'
						);
					});

					it('reverts if market is suspended', async () => {
						await setPrice(baseAsset, targetPrice);
						await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
						await assert.revert(
							perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader }),
							'Market suspended'
						);
					});
				});

				describe('after target round, but within confirmation window', () => {
					beforeEach(async () => {
						// target round has the new price
						await setPrice(baseAsset, targetPrice);
						spotTradeDetails = await perpsEngine.simulateTrade(
							marketKey,
							trader,
							size,
							defaultExecOptions
						);
						// other rounds are back to old price
						await setPrice(baseAsset, price);
					});

					describe('taker trade', () => {
						beforeEach(async () => {
							// go to next round
							await setPrice(baseAsset, price);
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetPrice, baseFeeNextPrice, spotTradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(trader2, targetPrice, baseFeeNextPrice, spotTradeDetails);
						});
					});

					describe('maker trade', () => {
						beforeEach(async () => {
							// skew the other way
							await perpsOrders.transferMargin(marketKey, margin.mul(toBN(2)), { from: trader3 });
							await perpsOrders.trade(marketKey, size.mul(toBN(-2)), { from: trader3 });
							// go to next round
							await setPrice(baseAsset, price);
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetPrice, baseFeeNextPrice, spotTradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(trader2, targetPrice, baseFeeNextPrice, spotTradeDetails);
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
				await perpsOrders.transferMargin(marketKey, toUnit('1000'), { from: trader });

				// submit an order
				await perpsOrders.submitNextPriceOrder(marketKey, size, { from: trader });

				// spike the price
				await setPrice(baseAsset, spikedPrice);
			});

			it('canceling an order works', async () => {
				await perpsOrders.cancelNextPriceOrder(marketKey, trader, { from: trader });
			});

			it('submitting an order reverts', async () => {
				// cancel existing
				await perpsOrders.cancelNextPriceOrder(marketKey, trader, { from: trader });

				await assert.revert(
					perpsOrders.submitNextPriceOrder(marketKey, size, { from: trader }),
					'Price too volatile'
				);
			});

			it('executing an order reverts', async () => {
				// advance to next round (same price, should be still volatile)
				await setPrice(baseAsset, spikedPrice);

				await assert.revert(
					perpsOrders.executeNextPriceOrder(marketKey, trader, { from: trader }),
					'Price too volatile'
				);

				// fee rate order reverts
				await assert.revert(perpsOrders.feeRateNextPrice(marketKey), 'Price too volatile');
			});
		});
	});
});
