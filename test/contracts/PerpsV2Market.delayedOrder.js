const { artifacts, contract, web3, ethers } = require('hardhat');
const { toBytes32 } = require('../..');
const { toUnit, multiplyDecimal, fastForward } = require('../utils')();
const { toBN } = web3.utils;

const PerpsV2Market = artifacts.require('TestablePerpsV2Market');

const { setupAllContracts } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const {
	getDecodedLogs,
	decodedEventEqual,
	// setupPriceAggregators,
	updateAggregatorRates,
} = require('./helpers');

contract('PerpsV2Market PerpsV2MarketDelayedOrders', accounts => {
	let futuresMarketSettings,
		futuresMarket,
		futuresDelayedOrder,
		futuresMarketState,
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
	const takerFeeDelayedOrder = toUnit('0.0005');
	const makerFeeDelayedOrder = toUnit('0.0001');
	const initialPrice = toUnit('100');
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
			PerpsV2MarketSettings: futuresMarketSettings,
			ProxyPerpsV2MarketBTC: futuresMarket,
			PerpsV2DelayedOrderBTC: futuresDelayedOrder,
			PerpsV2MarketStateBTC: futuresMarketState,
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
				'PerpsV2MarketSettings',
				{ contract: 'PerpsV2MarketStateBTC', properties: { perpSuffix: marketKeySuffix } },
				'PerpsV2MarketViewsBTC',
				'PerpsV2MarketBTC',
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

		// use implementation ABI on the proxy address to simplify calling
		futuresMarket = await PerpsV2Market.at(futuresMarket.address);

		// Update the rate so that it is not invalid
		// await setupPriceAggregators(exchangeRates, owner, ['sUSD', 'sBTC', 'sETH'].map(toBytes32));
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

	let margin, size, price, fillPrice, desiredTimeDelta, minDelayTimeDelta;

	beforeEach(async () => {
		// prepare basic order parameters
		margin = toUnit('2000');
		await futuresMarket.transferMargin(margin, { from: trader });
		size = toUnit('50');
		price = toUnit('200');
		desiredTimeDelta = 60;
		minDelayTimeDelta = 60;
		await setPrice(baseAsset, price);
		fillPrice = (await futuresMarket.fillPriceWithBasePrice(size, 0))[0];
	});

	describe('submitDelayedOrder()', () => {
		it('submitting an order results in correct views and events', async () => {
			// setup
			const roundId = await exchangeRates.getCurrentRoundId(baseAsset);
			const spotFee = (await futuresMarket.orderFee(size))[0];
			const keeperFee = await futuresMarketSettings.minKeeperFee();
			const tx = await futuresMarket.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
				from: trader,
			});
			const txBlock = await ethers.provider.getBlock(tx.receipt.blockNumber);

			const order = await futuresMarketState.delayedOrders(trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, roundId.add(toBN(1)));
			assert.bnEqual(order.commitDeposit, spotFee);
			assert.bnEqual(order.keeperDeposit, keeperFee);
			assert.bnEqual(order.executableAtTime, txBlock.timestamp + desiredTimeDelta);

			// check margin
			const position = await futuresMarket.positions(trader);
			const expectedMargin = margin.sub(spotFee.add(keeperFee));
			assert.bnEqual(position.margin, expectedMargin);

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [futuresMarket, futuresDelayedOrder],
			});
			assert.equal(decodedLogs.length, 3);

			decodedEventEqual({
				event: 'PositionModified',
				emittedFrom: futuresMarket.address,
				args: [toBN('1'), trader, expectedMargin, 0, 0, fillPrice, toBN(2), 0],
				log: decodedLogs[1],
			});
			decodedEventEqual({
				event: 'DelayedOrderSubmitted',
				emittedFrom: futuresMarket.address,
				args: [
					trader,
					false,
					size,
					roundId.add(toBN(1)),
					order.executableAtTime,
					spotFee,
					keeperFee,
				],
				log: decodedLogs[2],
			});
		});

		it('set desiredTimeDelta to minDelayTimeDelta when delta is 0', async () => {
			// setup
			const tx = await futuresMarket.submitDelayedOrder(size, priceImpactDelta, 0, {
				from: trader,
			});
			const txBlock = await ethers.provider.getBlock(tx.receipt.blockNumber);

			const order = await futuresMarketState.delayedOrders(trader);
			assert.bnEqual(order.executableAtTime, txBlock.timestamp + minDelayTimeDelta);
		});

		describe('cannot submit an order when', () => {
			it('zero size', async () => {
				await assert.revert(
					futuresMarket.submitDelayedOrder(0, priceImpactDelta, desiredTimeDelta, { from: trader }),
					'Cannot submit empty order'
				);
			});

			it('not enough margin', async () => {
				await futuresMarket.withdrawAllMargin({ from: trader });
				await assert.revert(
					futuresMarket.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
						from: trader,
					}),
					'Insufficient margin'
				);
			});

			it('too much leverage', async () => {
				await assert.revert(
					futuresMarket.submitDelayedOrder(size.mul(toBN(10)), priceImpactDelta, desiredTimeDelta, {
						from: trader,
					}),
					'Max leverage exceeded'
				);
			});

			it('previous order exists', async () => {
				await futuresMarket.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
					from: trader,
				});
				await assert.revert(
					futuresMarket.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
						from: trader,
					}),
					'previous order exists'
				);
			});

			it('if futures markets are suspended', async () => {
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					futuresMarket.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
						from: trader,
					}),
					'Futures markets are suspended'
				);
			});

			it('if market is suspended', async () => {
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					futuresMarket.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
						from: trader,
					}),
					'Market suspended'
				);
			});

			it('if desiredTimeDelta is below the minimum delay or negative', async () => {
				await assert.revert(
					futuresMarket.submitDelayedOrder(0, priceImpactDelta, 1, { from: trader }),
					'delay out of bounds'
				);
				try {
					await futuresMarket.submitDelayedOrder(0, priceImpactDelta, -1, { from: trader });
				} catch (err) {
					const { reason, code, argument } = err;
					assert.deepEqual(
						{
							reason: 'value out-of-bounds',
							code: 'INVALID_ARGUMENT',
							argument: 'desiredTimeDelta',
						},
						{ reason, code, argument }
					);
				}
			});

			it('if desiredTimeDelta is above the maximum delay', async () => {
				await assert.revert(
					futuresMarket.submitDelayedOrder(0, priceImpactDelta, 1000000, { from: trader }),
					'delay out of bounds'
				);
			});
		});
	});

	describe('submitDelayedOrderWithTracking()', () => {
		const trackingCode = toBytes32('code');

		it('submitting an order results in correct views and events', async () => {
			// setup
			const roundId = await exchangeRates.getCurrentRoundId(baseAsset);
			const spotFee = (await futuresMarket.orderFee(size))[0];
			const keeperFee = await futuresMarketSettings.minKeeperFee();

			const tx = await futuresMarket.submitDelayedOrderWithTracking(
				size,
				priceImpactDelta,
				desiredTimeDelta,
				trackingCode,
				{
					from: trader,
				}
			);
			const txBlock = await ethers.provider.getBlock(tx.receipt.blockNumber);

			// check order
			const order = await futuresMarketState.delayedOrders(trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, roundId.add(toBN(1)));
			assert.bnEqual(order.commitDeposit, spotFee);
			assert.bnEqual(order.keeperDeposit, keeperFee);
			assert.bnEqual(order.executableAtTime, txBlock.timestamp + desiredTimeDelta);
			assert.bnEqual(order.trackingCode, trackingCode);

			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, futuresMarket, futuresDelayedOrder],
			});

			// DelayedOrderSubmitted
			decodedEventEqual({
				event: 'DelayedOrderSubmitted',
				emittedFrom: futuresMarket.address,
				args: [
					trader,
					false,
					size,
					roundId.add(toBN(1)),
					order.executableAtTime,
					spotFee,
					keeperFee,
					trackingCode,
				],
				log: decodedLogs[2],
			});
		});

		it('executing an order emits the tracking event', async () => {
			// setup
			await futuresMarket.submitDelayedOrderWithTracking(
				size,
				priceImpactDelta,
				desiredTimeDelta,
				trackingCode,
				{
					from: trader,
				}
			);

			// go to next round
			await setPrice(baseAsset, price);
			const fillPrice = (await futuresMarket.fillPriceWithBasePrice(size, 0))[0];
			const expectedFee = multiplyDecimal(size, multiplyDecimal(fillPrice, takerFeeDelayedOrder));

			// execute the order
			const tx = await futuresMarket.executeDelayedOrder(trader, { from: trader });

			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, futuresMarket, futuresDelayedOrder],
			});

			decodedEventEqual({
				event: 'FuturesTracking',
				emittedFrom: futuresMarket.address,
				args: [trackingCode, baseAsset, marketKey, size, expectedFee],
				log: decodedLogs[3],
			});
		});
	});

	describe('cancelDelayedOrder()', () => {
		it('cannot cancel when there is no order', async () => {
			// account owner
			await assert.revert(
				futuresMarket.cancelDelayedOrder(trader, { from: trader }),
				'no previous order'
			);
			// keeper
			await assert.revert(
				futuresMarket.cancelDelayedOrder(trader, { from: trader2 }),
				'no previous order'
			);
		});

		describe('when an order exists', () => {
			let roundId, spotFee, keeperFee;

			// helper function to check cancellation tx effects
			async function checkCancellation(from) {
				const currentMargin = toBN((await futuresMarket.positions(trader)).margin);
				// cancel the order
				const tx = await futuresMarket.cancelDelayedOrder(trader, { from: from });

				// check order is removed
				const order = await futuresMarketState.delayedOrders(trader);
				assert.bnEqual(order.sizeDelta, 0);
				assert.bnEqual(order.targetRoundId, 0);
				assert.bnEqual(order.commitDeposit, 0);
				assert.bnEqual(order.keeperDeposit, 0);

				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, futuresMarket, futuresDelayedOrder],
				});

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
				// DelayedOrderRemoved
				decodedEventEqual({
					event: 'DelayedOrderRemoved',
					emittedFrom: futuresMarket.address,
					args: [trader, roundId, size, roundId.add(toBN(1)), spotFee, keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await futuresMarket.transferMargin(margin, { from: trader });
				// and can submit new order
				await futuresMarket.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
					from: trader,
				});
				const newOrder = await futuresMarketState.delayedOrders(trader);
				assert.bnEqual(newOrder.sizeDelta, size);
			}

			beforeEach(async () => {
				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				spotFee = (await futuresMarket.orderFee(size))[0];
				keeperFee = await futuresMarketSettings.minKeeperFee();
				await futuresMarket.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
					from: trader,
				});
			});

			it('cannot cancel if futures markets are suspended', async () => {
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					futuresMarket.cancelDelayedOrder(trader, { from: trader }),
					'Futures markets are suspended'
				);
			});

			it('cannot cancel if market is suspended', async () => {
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					futuresMarket.cancelDelayedOrder(trader, { from: trader }),
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
						futuresMarket.executeDelayedOrder(trader, { from: trader }),
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
						futuresMarket.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// target round
					await setPrice(baseAsset, price);
					await assert.revert(
						futuresMarket.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// next round after target round
					await setPrice(baseAsset, price);
					await assert.revert(
						futuresMarket.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// next one after that (for 2 roundId)
					await setPrice(baseAsset, price);
					await assert.revert(
						futuresMarket.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// ok now
					await setPrice(baseAsset, price);
					await checkCancellation(trader2);
				});

				it('cannot cancel before time based confirmation window is over', async () => {
					// set a known and deterministic confirmation window.
					const delayedOrderConfirmWindow = 60;
					await futuresMarketSettings.setDelayedOrderConfirmWindow(
						marketKey,
						delayedOrderConfirmWindow,
						{ from: owner }
					);

					// no time has changed.
					await assert.revert(
						futuresMarket.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					const { timestamp } = await ethers.provider.getBlock('latest');
					const ffDelta = 5;

					// time has moved forward (no change to round) but not enough.
					const order = await futuresMarketState.delayedOrders(trader);
					const exectuableAtTimeDelta = order.executableAtTime.sub(toBN(timestamp)).toNumber();
					await fastForward(ffDelta); // fast forward by 5 seconds
					await assert.revert(
						futuresMarket.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// time has moved forward, order is executable but cancellable
					await fastForward(exectuableAtTimeDelta - ffDelta + 1);
					await assert.revert(
						futuresMarket.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// time has moved forward and now past confirmation window (still no round change)
					await fastForward(delayedOrderConfirmWindow);
					await checkCancellation(trader2);
				});
			});
		});
	});

	describe('executeDelayedOrder()', () => {
		it('cannot execute when there is no order', async () => {
			// account owner
			await assert.revert(
				futuresMarket.executeDelayedOrder(trader, { from: trader }),
				'no previous order'
			);
			// keeper
			await assert.revert(
				futuresMarket.executeDelayedOrder(trader, { from: trader2 }),
				'no previous order'
			);
		});

		describe('when an order exists', () => {
			let roundId, commitFee, keeperFee;

			beforeEach(async () => {
				// the beginning of each test, `trader` submits a delayed order with `size`.
				//
				// the commitFee they pay is relative to the current skew and price. this means we want to track
				// their commitFee upfront now (as this is the fee refunded if they are also the keeper).

				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				// keeperFee is the minimum keeperFee for the system
				keeperFee = await futuresMarketSettings.minKeeperFee();
				// commitFee is the fee that would be charged for a spot trade when order is submitted
				commitFee = (await futuresMarket.orderFee(size))[0];

				await futuresMarket.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
					from: trader,
				});
			});

			describe('execution reverts', () => {
				it('in same round', async () => {
					// account owner
					await assert.revert(
						futuresMarket.executeDelayedOrder(trader, { from: trader }),
						'executability not reached'
					);
					// keeper
					await assert.revert(
						futuresMarket.executeDelayedOrder(trader, { from: trader2 }),
						'executability not reached'
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
						futuresMarket.executeDelayedOrder(trader, { from: trader }),
						'order too old, use cancel'
					);
					// keeper
					await assert.revert(
						futuresMarket.executeDelayedOrder(trader, { from: trader2 }),
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
						futuresMarket.executeDelayedOrder(trader, { from: trader }),
						'Position can be liquidated'
					);
					// the difference in reverts is due to difference between refund into margin
					// in case of account owner and transfer in case of keeper
					await assert.revert(
						futuresMarket.executeDelayedOrder(trader, { from: trader2 }),
						'Insufficient margin'
					);
				});

				it('if price too high', async () => {
					// go to target round, set price too high
					await setPrice(baseAsset, price.mul(toBN(5)));

					// account owner
					await assert.revert(
						futuresMarket.executeDelayedOrder(trader, { from: trader }),
						'Max leverage exceeded'
					);
					// keeper
					await assert.revert(
						futuresMarket.executeDelayedOrder(trader, { from: trader2 }),
						'Max leverage exceeded'
					);
				});
			});

			// helper function to check execution and its results
			// from: which account is requesting the execution
			// targetPrice: the price that the order should be executed at
			// feeRate: expected exchange fee rate
			// spotTradeDetails: trade details of the same trade if it would happen as spot
			async function checkExecution(from, targetPrice, feeRate, spotTradeDetails) {
				const currentMargin = toBN((await futuresMarket.positions(trader)).margin);

				// note we need to calc the fillPrice _before_ executing the order because the p/d applied is based
				// on the skew at the time of trade. if we ran this _after_ then the premium would be lower as the
				// size delta as a % is lower post execution.
				//
				// e.g. 20 / 100 > 20 / 120
				const fillPrice = (await futuresMarket.fillPriceWithBasePrice(size, 0))[0];

				// execute the order
				const tx = await futuresMarket.executeDelayedOrder(trader, { from: from });

				// check order is removed now
				const order = await futuresMarketState.delayedOrders(trader);
				assert.bnEqual(order.sizeDelta, 0);
				assert.bnEqual(order.targetRoundId, 0);
				assert.bnEqual(order.commitDeposit, 0);
				assert.bnEqual(order.keeperDeposit, 0);
				assert.bnEqual(order.executableAtTime, 0);

				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, futuresMarket, futuresDelayedOrder],
				});

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

				let expectedMargin = currentMargin.add(expectedRefund);

				// trader was refunded correctly
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: futuresMarket.address,
					args: [toBN('1'), trader, expectedMargin, 0, 0, fillPrice, toBN(2), 0],
					log: decodedLogs.slice(-4, -3)[0],
				});

				// trade was executed correctly
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

				// DelayedOrderRemoved
				decodedEventEqual({
					event: 'DelayedOrderRemoved',
					emittedFrom: futuresMarket.address,
					args: [trader, roundId, size, roundId.add(toBN(1)), commitFee, keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await futuresMarket.transferMargin(margin, { from: trader });
				// and can submit new order
				await futuresMarket.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
					from: trader,
				});
				const newOrder = await futuresMarketState.delayedOrders(trader);
				assert.bnEqual(newOrder.sizeDelta, size);
			}

			describe('execution results in correct views and events', () => {
				let targetPrice, spotTradeDetails;

				beforeEach(async () => {
					targetPrice = multiplyDecimal(price, toUnit(0.9));
				});

				it('before target round but after delay', async () => {
					// set target round to be many price updates into the future.
					await futuresMarketSettings.setNextPriceConfirmWindow(marketKey, 10, { from: owner });

					// check we cannot execute the order
					await assert.revert(
						futuresMarket.executeDelayedOrder(trader, { from: trader2 }),
						'executability not reached'
					);

					// fast-forward to the order's executableAtTime
					//
					// note that we do NOT update the price (to ensure target round is never reached)
					spotTradeDetails = await futuresMarket.postTradeDetails(size, toUnit('0'), trader);
					await fastForward(desiredTimeDelta);

					// check we can execute.
					//
					// note the predicate uses `price` and not `targetPrice` because target is never reached
					const expectedPrice = (await futuresMarket.fillPriceWithBasePrice(size, 0))[0];
					await checkExecution(trader, expectedPrice, takerFeeDelayedOrder, spotTradeDetails);
				});

				describe('during target round', () => {
					let targetFillPrice;
					describe('taker trade', () => {
						beforeEach(async () => {
							// go to next round
							await setPrice(baseAsset, targetPrice);
							targetFillPrice = (await futuresMarket.fillPriceWithBasePrice(size, 0))[0];
							spotTradeDetails = await futuresMarket.postTradeDetails(size, toUnit('0'), trader);
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetFillPrice, takerFeeDelayedOrder, spotTradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(
								trader2,
								targetFillPrice,
								takerFeeDelayedOrder,
								spotTradeDetails
							);
						});
					});

					describe('maker trade', () => {
						beforeEach(async () => {
							// skew the other way
							await futuresMarket.transferMargin(margin.mul(toBN(2)), { from: trader3 });
							await futuresMarket.modifyPosition(size.mul(toBN(-2)), priceImpactDelta, {
								from: trader3,
							});
							// go to next round
							await setPrice(baseAsset, targetPrice);
							targetFillPrice = (await futuresMarket.fillPriceWithBasePrice(size, 0))[0];
							spotTradeDetails = await futuresMarket.postTradeDetails(size, toUnit('0'), trader);
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetFillPrice, makerFeeDelayedOrder, spotTradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(
								trader2,
								targetFillPrice,
								makerFeeDelayedOrder,
								spotTradeDetails
							);
						});
					});

					it('reverts if futures markets are suspended', async () => {
						await setPrice(baseAsset, targetPrice);
						await systemStatus.suspendFutures(toUnit(0), { from: owner });
						await assert.revert(
							futuresMarket.executeDelayedOrder(trader, { from: trader }),
							'Futures markets are suspended'
						);
					});

					it('reverts if market is suspended', async () => {
						await setPrice(baseAsset, targetPrice);
						await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
						await assert.revert(
							futuresMarket.executeDelayedOrder(trader, { from: trader }),
							'Market suspended'
						);
					});
				});

				describe('after target round, but within confirmation window', () => {
					beforeEach(async () => {
						// target round has the new price
						await setPrice(baseAsset, targetPrice);

						// other rounds are back to old price
						await setPrice(baseAsset, price);

						// latest price = the price we use.
						spotTradeDetails = await futuresMarket.postTradeDetails(size, toUnit('0'), trader);
					});

					describe('taker trade', () => {
						let targetFillPrice;

						beforeEach(async () => {
							// go to next round
							await setPrice(baseAsset, price);
							targetFillPrice = (await futuresMarket.fillPriceWithBasePrice(size, 0))[0];
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetFillPrice, takerFeeDelayedOrder, spotTradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(
								trader2,
								targetFillPrice,
								takerFeeDelayedOrder,
								spotTradeDetails
							);
						});
					});

					describe('maker trade', () => {
						let targetFillPrice;

						beforeEach(async () => {
							// skew the other way
							//
							// note: we need to update spotTradeDetails because this modifies the skew and hence
							// will affect the p/d on fillPrice. since this existing trade is short, the execution
							// of the delay order contracts the skew hence targetFillPrice will be a discount on price.
							await futuresMarket.transferMargin(margin.mul(toBN(2)), { from: trader3 });
							await futuresMarket.modifyPosition(size.mul(toBN(-2)), priceImpactDelta, {
								from: trader3,
							});

							spotTradeDetails = await futuresMarket.postTradeDetails(size, toUnit('0'), trader);

							// go to next round
							await setPrice(baseAsset, price);
							targetFillPrice = (await futuresMarket.fillPriceWithBasePrice(size, 0))[0];
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetFillPrice, makerFeeDelayedOrder, spotTradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(
								trader2,
								targetFillPrice,
								makerFeeDelayedOrder,
								spotTradeDetails
							);
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
				await futuresMarket.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
					from: trader,
				});

				// spike the price
				await setPrice(baseAsset, spikedPrice);
			});

			it('canceling an order works', async () => {
				await futuresMarket.cancelDelayedOrder(trader, { from: trader });
			});

			it('submitting an order reverts', async () => {
				// cancel existing
				await futuresMarket.cancelDelayedOrder(trader, { from: trader });

				await assert.revert(
					futuresMarket.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
						from: trader,
					}),
					'Price too volatile'
				);
			});

			it('executing an order reverts', async () => {
				// advance to next round (same price, should be still volatile)
				await setPrice(baseAsset, spikedPrice);

				await assert.revert(
					futuresMarket.executeDelayedOrder(trader, { from: trader }),
					'Price too volatile'
				);
			});
		});
	});
});
