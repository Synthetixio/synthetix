const { artifacts, contract, web3, ethers } = require('hardhat');
const { toBytes32 } = require('../..');
const { toUnit, multiplyDecimal, fastForward } = require('../utils')();
const { toBN } = web3.utils;

const PerpsV2MarketHelper = artifacts.require('TestablePerpsV2Market');
const PerpsV2Market = artifacts.require('TestablePerpsV2MarketEmpty');

const { setupAllContracts } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const {
	getDecodedLogs,
	decodedEventEqual,
	// setupPriceAggregators,
	updateAggregatorRates,
} = require('./helpers');

contract('PerpsV2Market PerpsV2MarketDelayedOrders', accounts => {
	let perpsV2MarketSettings,
		perpsV2Market,
		perpsV2MarketHelper,
		perpsV2MarketDelayedOrder,
		perpsV2MarketState,
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
	const orderType = 1; // 0-Atomic, 1-Delayed, 2-Offchain

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
			PerpsV2MarketSettings: perpsV2MarketSettings,
			ProxyPerpsV2MarketBTC: perpsV2Market,
			PerpsV2DelayedOrderBTC: perpsV2MarketDelayedOrder,
			PerpsV2MarketStateBTC: perpsV2MarketState,
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
		perpsV2Market = await PerpsV2Market.at(perpsV2Market.address);
		perpsV2MarketHelper = await PerpsV2MarketHelper.at(perpsV2Market.address);

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
		await perpsV2Market.transferMargin(margin, { from: trader });
		size = toUnit('50');
		price = toUnit('200');
		desiredTimeDelta = 60;
		minDelayTimeDelta = 60;
		await setPrice(baseAsset, price);
		fillPrice = (await perpsV2MarketHelper.fillPriceWithBasePrice(size, 0))[0];
	});

	describe('submitDelayedOrder()', () => {
		it('submitting an order results in correct views and events', async () => {
			// setup
			const roundId = await exchangeRates.getCurrentRoundId(baseAsset);
			const orderFee = (await perpsV2Market.orderFee(size, orderType))[0];
			const keeperFee = await perpsV2MarketSettings.minKeeperFee();
			const tx = await perpsV2Market.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
				from: trader,
			});
			const txBlock = await ethers.provider.getBlock(tx.receipt.blockNumber);

			const order = await perpsV2MarketState.delayedOrders(trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, roundId.add(toBN(1)));
			assert.bnEqual(order.commitDeposit, orderFee);
			assert.bnEqual(order.keeperDeposit, keeperFee);
			assert.bnEqual(order.executableAtTime, txBlock.timestamp + desiredTimeDelta);

			// check margin
			const position = await perpsV2Market.positions(trader);
			const expectedMargin = margin.sub(orderFee.add(keeperFee));
			assert.bnEqual(position.margin, expectedMargin);

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [perpsV2Market, perpsV2MarketDelayedOrder],
			});
			assert.equal(decodedLogs.length, 3);

			decodedEventEqual({
				event: 'PositionModified',
				emittedFrom: perpsV2Market.address,
				args: [toBN('1'), trader, expectedMargin, 0, 0, fillPrice, toBN(2), 0],
				log: decodedLogs[1],
			});
			decodedEventEqual({
				event: 'DelayedOrderSubmitted',
				emittedFrom: perpsV2Market.address,
				args: [
					trader,
					false,
					size,
					roundId.add(toBN(1)),
					txBlock.timestamp,
					order.executableAtTime,
					orderFee,
					keeperFee,
				],
				log: decodedLogs[2],
			});
		});

		it('set desiredTimeDelta to minDelayTimeDelta when delta is 0', async () => {
			// setup
			const tx = await perpsV2Market.submitDelayedOrder(size, priceImpactDelta, 0, {
				from: trader,
			});
			const txBlock = await ethers.provider.getBlock(tx.receipt.blockNumber);

			const order = await perpsV2MarketState.delayedOrders(trader);
			assert.bnEqual(order.executableAtTime, txBlock.timestamp + minDelayTimeDelta);
		});

		describe('cannot submit an order when', () => {
			it('zero size', async () => {
				await assert.revert(
					perpsV2Market.submitDelayedOrder(0, priceImpactDelta, desiredTimeDelta, { from: trader }),
					'Cannot submit empty order'
				);
			});

			it('not enough margin', async () => {
				await perpsV2Market.withdrawAllMargin({ from: trader });
				await assert.revert(
					perpsV2Market.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
						from: trader,
					}),
					'Insufficient margin'
				);
			});

			it('too much leverage', async () => {
				await assert.revert(
					perpsV2Market.submitDelayedOrder(size.mul(toBN(10)), priceImpactDelta, desiredTimeDelta, {
						from: trader,
					}),
					'Max leverage exceeded'
				);
			});

			it('previous order exists', async () => {
				await perpsV2Market.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
					from: trader,
				});
				await assert.revert(
					perpsV2Market.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
						from: trader,
					}),
					'previous order exists'
				);
			});

			it('if perps markets are suspended', async () => {
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
						from: trader,
					}),
					'Futures markets are suspended'
				);
			});

			it('if market is suspended', async () => {
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
						from: trader,
					}),
					'Market suspended'
				);
			});

			it('if desiredTimeDelta is below the minimum delay or negative', async () => {
				await assert.revert(
					perpsV2Market.submitDelayedOrder(0, priceImpactDelta, 1, { from: trader }),
					'delay out of bounds'
				);
				try {
					await perpsV2Market.submitDelayedOrder(0, priceImpactDelta, -1, { from: trader });
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
					perpsV2Market.submitDelayedOrder(0, priceImpactDelta, 1000000, { from: trader }),
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
			const orderFee = (await perpsV2Market.orderFee(size, orderType))[0];
			const keeperFee = await perpsV2MarketSettings.minKeeperFee();

			const tx = await perpsV2Market.submitDelayedOrderWithTracking(
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
			const order = await perpsV2MarketState.delayedOrders(trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, roundId.add(toBN(1)));
			assert.bnEqual(order.commitDeposit, orderFee);
			assert.bnEqual(order.keeperDeposit, keeperFee);
			assert.bnEqual(order.executableAtTime, txBlock.timestamp + desiredTimeDelta);
			assert.bnEqual(order.trackingCode, trackingCode);

			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, perpsV2Market, perpsV2MarketDelayedOrder],
			});

			// DelayedOrderSubmitted
			decodedEventEqual({
				event: 'DelayedOrderSubmitted',
				emittedFrom: perpsV2Market.address,
				args: [
					trader,
					false,
					size,
					roundId.add(toBN(1)),
					txBlock.timestamp,
					order.executableAtTime,
					orderFee,
					keeperFee,
					trackingCode,
				],
				log: decodedLogs[2],
			});
		});

		it('executing an order emits the tracking event', async () => {
			// setup
			await perpsV2Market.submitDelayedOrderWithTracking(
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
			const fillPrice = (await perpsV2MarketHelper.fillPriceWithBasePrice(size, 0))[0];
			const expectedFee = multiplyDecimal(size, multiplyDecimal(fillPrice, takerFeeDelayedOrder));

			// execute the order
			const tx = await perpsV2Market.executeDelayedOrder(trader, { from: trader });

			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, perpsV2Market, perpsV2MarketDelayedOrder],
			});

			decodedEventEqual({
				event: 'PerpsTracking',
				emittedFrom: perpsV2Market.address,
				args: [trackingCode, baseAsset, marketKey, size, expectedFee],
				log: decodedLogs[3],
			});
		});
	});

	describe('cancelDelayedOrder()', () => {
		it('cannot cancel when there is no order', async () => {
			// account owner
			await assert.revert(
				perpsV2Market.cancelDelayedOrder(trader, { from: trader }),
				'no previous order'
			);
			// keeper
			await assert.revert(
				perpsV2Market.cancelDelayedOrder(trader, { from: trader2 }),
				'no previous order'
			);
		});

		describe('when an order exists', () => {
			let roundId, orderFee, keeperFee;

			// helper function to check cancellation tx effects
			async function checkCancellation(from) {
				const currentMargin = toBN((await perpsV2Market.positions(trader)).margin);
				// cancel the order
				const tx = await perpsV2Market.cancelDelayedOrder(trader, { from: from });

				// check order is removed
				const order = await perpsV2MarketState.delayedOrders(trader);
				assert.bnEqual(order.sizeDelta, 0);
				assert.bnEqual(order.targetRoundId, 0);
				assert.bnEqual(order.commitDeposit, 0);
				assert.bnEqual(order.keeperDeposit, 0);

				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, perpsV2Market, perpsV2MarketDelayedOrder],
				});

				if (from === trader) {
					// trader gets refunded
					assert.equal(decodedLogs.length, 4);
					// keeper fee was refunded
					// PositionModified
					decodedEventEqual({
						event: 'PositionModified',
						emittedFrom: perpsV2Market.address,
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

				// commitFee (equal to orderFee) paid to fee pool
				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [await feePool.FEE_ADDRESS(), orderFee],
					log: decodedLogs.slice(-2, -1)[0], // [-2]
				});
				decodedEventEqual({
					event: 'DelayedOrderRemoved',
					emittedFrom: perpsV2Market.address,
					args: [trader, false, roundId, size, roundId.add(toBN(1)), orderFee, keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await perpsV2Market.transferMargin(margin, { from: trader });
				// and can submit new order
				await perpsV2Market.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
					from: trader,
				});
				const newOrder = await perpsV2MarketState.delayedOrders(trader);
				assert.bnEqual(newOrder.sizeDelta, size);
			}

			beforeEach(async () => {
				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				orderFee = (await perpsV2Market.orderFee(size, orderType))[0];
				keeperFee = await perpsV2MarketSettings.minKeeperFee();
				await perpsV2Market.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
					from: trader,
				});
			});

			it('cannot cancel if perps markets are suspended', async () => {
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.cancelDelayedOrder(trader, { from: trader }),
					'Futures markets are suspended'
				);
			});

			it('cannot cancel if market is suspended', async () => {
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.cancelDelayedOrder(trader, { from: trader }),
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
					await perpsV2Market.withdrawAllMargin({ from: trader });
					// check execution would fail
					await assert.revert(
						perpsV2Market.executeDelayedOrder(trader, { from: trader }),
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
						perpsV2Market.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// target round
					await setPrice(baseAsset, price);
					await assert.revert(
						perpsV2Market.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// next round after target round
					await setPrice(baseAsset, price);
					await assert.revert(
						perpsV2Market.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// next one after that (for 2 roundId)
					await setPrice(baseAsset, price);
					await assert.revert(
						perpsV2Market.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// ok now
					await setPrice(baseAsset, price);
					await checkCancellation(trader2);
				});

				it('cannot cancel before time based confirmation window is over', async () => {
					// set a known and deterministic confirmation window.
					const delayedOrderConfirmWindow = 60;
					await perpsV2MarketSettings.setDelayedOrderConfirmWindow(
						marketKey,
						delayedOrderConfirmWindow,
						{ from: owner }
					);

					// no time has changed.
					await assert.revert(
						perpsV2Market.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					const { timestamp } = await ethers.provider.getBlock('latest');
					const ffDelta = 5;

					// time has moved forward (no change to round) but not enough.
					const order = await perpsV2MarketState.delayedOrders(trader);
					const exectuableAtTimeDelta = order.executableAtTime.sub(toBN(timestamp)).toNumber();
					await fastForward(ffDelta); // fast-forward by 5 seconds
					await assert.revert(
						perpsV2Market.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// time has moved forward, order is executable but cancellable
					await fastForward(exectuableAtTimeDelta - ffDelta + 1);
					await assert.revert(
						perpsV2Market.cancelDelayedOrder(trader, { from: trader2 }),
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
				perpsV2Market.executeDelayedOrder(trader, { from: trader }),
				'no previous order'
			);
			// keeper
			await assert.revert(
				perpsV2Market.executeDelayedOrder(trader, { from: trader2 }),
				'no previous order'
			);
		});

		describe('when an order exists', () => {
			let roundId, orderFee, keeperFee;

			beforeEach(async () => {
				// the beginning of each test, `trader` submits a delayed order with `size`.
				//
				// the commitFee they pay is relative to the current skew and price. this means we want to track
				// their commitFee upfront now (as this is the fee refunded if they are also the keeper).

				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				// keeperFee is the minimum keeperFee for the system
				keeperFee = await perpsV2MarketSettings.minKeeperFee();
				// commitFee is the fee that would be charged for a trade when order is submitted
				orderFee = (await perpsV2Market.orderFee(size, orderType))[0];

				await perpsV2Market.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
					from: trader,
				});
			});

			describe('execution reverts', () => {
				it('in same round', async () => {
					// account owner
					await assert.revert(
						perpsV2Market.executeDelayedOrder(trader, { from: trader }),
						'executability not reached'
					);
					// keeper
					await assert.revert(
						perpsV2Market.executeDelayedOrder(trader, { from: trader2 }),
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
						perpsV2Market.executeDelayedOrder(trader, { from: trader }),
						'order too old, use cancel'
					);
					// keeper
					await assert.revert(
						perpsV2Market.executeDelayedOrder(trader, { from: trader2 }),
						'order too old, use cancel'
					);
				});

				it('if margin removed', async () => {
					// go to target round
					await setPrice(baseAsset, price);
					// withdraw margin (will cause order to fail)
					await perpsV2Market.withdrawAllMargin({ from: trader });

					// account owner
					await assert.revert(
						perpsV2Market.executeDelayedOrder(trader, { from: trader }),
						'Insufficient margin'
					);
					await assert.revert(
						perpsV2Market.executeDelayedOrder(trader, { from: trader2 }),
						'Insufficient margin'
					);
				});

				it('if price too high', async () => {
					// go to target round, set price too high
					await setPrice(baseAsset, price.mul(toBN(5)));

					// account owner
					await assert.revert(
						perpsV2Market.executeDelayedOrder(trader, { from: trader }),
						'Max leverage exceeded'
					);
					// keeper
					await assert.revert(
						perpsV2Market.executeDelayedOrder(trader, { from: trader2 }),
						'Max leverage exceeded'
					);
				});
			});

			// helper function to check execution and its results
			// from: which account is requesting the execution
			// targetPrice: the price that the order should be executed at
			// feeRate: expected exchange fee rate
			// tradeDetails: trade details of the same trade if it would happen as spot
			async function checkExecution(from, targetPrice, feeRate, tradeDetails) {
				const currentMargin = toBN((await perpsV2Market.positions(trader)).margin);

				// note we need to calc the fillPrice _before_ executing the order because the p/d applied is based
				// on the skew at the time of trade. if we ran this _after_ then the premium would be lower as the
				// size delta as a % is lower post execution.
				//
				// e.g. 20 / 100 > 20 / 120
				const fillPrice = (await perpsV2MarketHelper.fillPriceWithBasePrice(size, 0))[0];

				// execute the order
				const tx = await perpsV2Market.executeDelayedOrder(trader, { from: from });

				// check order is removed now
				const order = await perpsV2MarketState.delayedOrders(trader);
				assert.bnEqual(order.sizeDelta, 0);
				assert.bnEqual(order.targetRoundId, 0);
				assert.bnEqual(order.commitDeposit, 0);
				assert.bnEqual(order.keeperDeposit, 0);
				assert.bnEqual(order.executableAtTime, 0);

				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, perpsV2Market, perpsV2MarketDelayedOrder],
				});

				let expectedRefund = orderFee; // at least the commitFee is refunded
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
					emittedFrom: perpsV2Market.address,
					args: [toBN('1'), trader, expectedMargin, 0, 0, fillPrice, toBN(2), 0],
					log: decodedLogs.slice(-4, -3)[0],
				});

				// trade was executed correctly
				const expectedFee = multiplyDecimal(size, multiplyDecimal(targetPrice, feeRate));

				// calculate the expected margin after trade
				expectedMargin = tradeDetails.margin
					.add(tradeDetails.fee)
					.sub(expectedFee)
					.add(expectedRefund);

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsV2Market.address,
					args: [toBN('1'), trader, expectedMargin, size, size, targetPrice, toBN(2), expectedFee],
					log: decodedLogs.slice(-2, -1)[0],
				});

				decodedEventEqual({
					event: 'DelayedOrderRemoved',
					emittedFrom: perpsV2Market.address,
					args: [trader, false, roundId, size, roundId.add(toBN(1)), orderFee, keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await perpsV2Market.transferMargin(margin, { from: trader });
				// and can submit new order
				await perpsV2Market.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
					from: trader,
				});
				const newOrder = await perpsV2MarketState.delayedOrders(trader);
				assert.bnEqual(newOrder.sizeDelta, size);
			}

			describe('execution results in correct views and events', () => {
				let targetPrice, tradeDetails;

				beforeEach(async () => {
					targetPrice = multiplyDecimal(price, toUnit(0.9));
				});

				it('before target round but after delay', async () => {
					// set target round to be many price updates into the future.
					await perpsV2MarketSettings.setNextPriceConfirmWindow(marketKey, 10, { from: owner });

					// check we cannot execute the order
					await assert.revert(
						perpsV2Market.executeDelayedOrder(trader, { from: trader2 }),
						'executability not reached'
					);

					// fast-forward to the order's executableAtTime
					//
					// note that we do NOT update the price (to ensure target round is never reached)
					tradeDetails = await perpsV2Market.postTradeDetails(size, toUnit('0'), orderType, trader);
					await fastForward(desiredTimeDelta);

					// check we can execute.
					//
					// note the predicate uses `price` and not `targetPrice` because target is never reached
					const expectedPrice = (await perpsV2MarketHelper.fillPriceWithBasePrice(size, 0))[0];
					await checkExecution(trader, expectedPrice, takerFeeDelayedOrder, tradeDetails);
				});

				describe('during target round', () => {
					let targetFillPrice;
					describe('taker trade', () => {
						beforeEach(async () => {
							// go to next round
							await setPrice(baseAsset, targetPrice);
							targetFillPrice = (await perpsV2MarketHelper.fillPriceWithBasePrice(size, 0))[0];
							tradeDetails = await perpsV2Market.postTradeDetails(
								size,
								toUnit('0'),
								orderType,
								trader
							);
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetFillPrice, takerFeeDelayedOrder, tradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(trader2, targetFillPrice, takerFeeDelayedOrder, tradeDetails);
						});
					});

					describe('maker trade', () => {
						beforeEach(async () => {
							// skew the other way
							await perpsV2Market.transferMargin(margin.mul(toBN(2)), { from: trader3 });
							await perpsV2Market.modifyPosition(size.mul(toBN(-2)), priceImpactDelta, {
								from: trader3,
							});
							// go to next round
							await setPrice(baseAsset, targetPrice);
							targetFillPrice = (await perpsV2MarketHelper.fillPriceWithBasePrice(size, 0))[0];
							tradeDetails = await perpsV2Market.postTradeDetails(
								size,
								toUnit('0'),
								orderType,
								trader
							);
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetFillPrice, makerFeeDelayedOrder, tradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(trader2, targetFillPrice, makerFeeDelayedOrder, tradeDetails);
						});
					});

					it('reverts if perps markets are suspended', async () => {
						await setPrice(baseAsset, targetPrice);
						await systemStatus.suspendFutures(toUnit(0), { from: owner });
						await assert.revert(
							perpsV2Market.executeDelayedOrder(trader, { from: trader }),
							'Futures markets are suspended'
						);
					});

					it('reverts if market is suspended', async () => {
						await setPrice(baseAsset, targetPrice);
						await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
						await assert.revert(
							perpsV2Market.executeDelayedOrder(trader, { from: trader }),
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
						tradeDetails = await perpsV2Market.postTradeDetails(
							size,
							toUnit('0'),
							orderType,
							trader
						);
					});

					describe('taker trade', () => {
						let targetFillPrice;

						beforeEach(async () => {
							// go to next round
							await setPrice(baseAsset, price);
							targetFillPrice = (await perpsV2MarketHelper.fillPriceWithBasePrice(size, 0))[0];
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetFillPrice, takerFeeDelayedOrder, tradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(trader2, targetFillPrice, takerFeeDelayedOrder, tradeDetails);
						});
					});

					describe('maker trade', () => {
						let targetFillPrice;

						beforeEach(async () => {
							// skew the other way
							//
							// note: we need to update tradeDetails because this modifies the skew and hence
							// will affect the p/d on fillPrice. since this existing trade is short, the execution
							// of the delay order contracts the skew hence targetFillPrice will be a discount on price.
							await perpsV2Market.transferMargin(margin.mul(toBN(2)), { from: trader3 });
							await perpsV2Market.modifyPosition(size.mul(toBN(-2)), priceImpactDelta, {
								from: trader3,
							});

							tradeDetails = await perpsV2Market.postTradeDetails(
								size,
								toUnit('0'),
								orderType,
								trader
							);

							// go to next round
							await setPrice(baseAsset, price);
							targetFillPrice = (await perpsV2MarketHelper.fillPriceWithBasePrice(size, 0))[0];
						});

						it('from account owner', async () => {
							await checkExecution(trader, targetFillPrice, makerFeeDelayedOrder, tradeDetails);
						});

						it('from keeper', async () => {
							await checkExecution(trader2, targetFillPrice, makerFeeDelayedOrder, tradeDetails);
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
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });

				// submit an order
				await perpsV2Market.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
					from: trader,
				});

				// spike the price
				await setPrice(baseAsset, spikedPrice);
			});

			it('canceling an order works', async () => {
				await perpsV2Market.cancelDelayedOrder(trader, { from: trader });
			});

			it('submitting an order reverts', async () => {
				// cancel existing
				await perpsV2Market.cancelDelayedOrder(trader, { from: trader });

				await assert.revert(
					perpsV2Market.submitDelayedOrder(size, priceImpactDelta, desiredTimeDelta, {
						from: trader,
					}),
					'Price too volatile'
				);
			});

			it('executing an order reverts', async () => {
				// advance to next round (same price, should be still volatile)
				await setPrice(baseAsset, spikedPrice);

				await assert.revert(
					perpsV2Market.executeDelayedOrder(trader, { from: trader }),
					'Price too volatile'
				);
			});
		});
	});
});
