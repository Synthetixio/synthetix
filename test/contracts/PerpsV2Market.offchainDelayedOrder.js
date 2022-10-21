const { artifacts, contract, web3, ethers } = require('hardhat');
const { toBytes32 } = require('../..');
const { toUnit, multiplyDecimal, currentTime, fastForward } = require('../utils')();
const { toBN } = web3.utils;

const PerpsV2Market = artifacts.require('TestablePerpsV2Market');

const { setupAllContracts, setupContract } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { getDecodedLogs, decodedEventEqual, updateAggregatorRates } = require('./helpers');

contract('PerpsV2Market PerpsV2MarketPythOrders', accounts => {
	let perpsV2MarketSettings,
		perpsV2Market,
		perpsV2OffchainDelayedOrder,
		perpsV2MarketState,
		perpsV2ExchangeRate,
		mockPyth,
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
	const takerFeeOffchainDelayedOrder = toUnit('0.00005');
	const makerFeeOffchainDelayedOrder = toUnit('0.00001');
	const initialPrice = toUnit('100');

	const feeds = [
		{ assetId: baseAsset, feedId: toBytes32('feed-sBTC') },
		{ assetId: toBytes32('sETH'), feedId: toBytes32('feed-sETH') },
	];

	const defaultFeedId = feeds[0].feedId;
	const defaultFeedExpo = -6;
	const defaultFeedPrice = 1000;
	const defaultFeedConfidence = 1;
	const defaultFeedEMAPrice = 2100;
	const defaultFeedEMAConfidence = 1;

	async function setPrice(asset, price, resetCircuitBreaker = true) {
		await updateAggregatorRates(
			exchangeRates,
			resetCircuitBreaker ? circuitBreaker : null,
			[asset],
			[price]
		);
	}

	async function getFeedUpdateData({
		id = defaultFeedId,
		expo = defaultFeedExpo,
		price = feedBaseFromUNIT(defaultFeedPrice),
		conf = feedBaseFromUNIT(defaultFeedConfidence),
		emaPrice = feedBaseFromUNIT(defaultFeedEMAPrice),
		emaConf = feedBaseFromUNIT(defaultFeedEMAConfidence),
		publishTime,
	}) {
		const feedUpdateData = await mockPyth.createPriceFeedUpdateData(
			id,
			price,
			conf,
			expo,
			emaPrice,
			emaConf,
			publishTime || (await currentTime())
		);

		return feedUpdateData;
	}

	// function decimalToFeedBaseUNIT(price, feedExpo = defaultFeedExpo) {
	// 	// feedExpo should be negative
	// 	return toBN(price * 10 ** -feedExpo).mul(toBN(10 ** (18 + feedExpo)));
	// }

	function feedBaseFromUNIT(price, feedExpo = defaultFeedExpo) {
		return toBN(price).div(toBN(10 ** (18 + feedExpo)));
	}

	// function decimalFromFeedBaseWei(price, feedExpo = defaultFeedExpo) {
	// 	// feedExpo should be negative
	// 	return toBN(price).div(toBN(10 ** (18 + feedExpo))) / 10 ** -feedExpo;
	// }

	async function setOffchainPrice(user, priceData = {}) {
		const updateFeedData = await getFeedUpdateData(priceData);
		await perpsV2ExchangeRate.updatePythPrice(user, [updateFeedData], { from: user });
	}

	before(async () => {
		({
			PerpsV2MarketSettings: perpsV2MarketSettings,
			ProxyPerpsV2MarketBTC: perpsV2Market,
			PerpsV2PythOrdersBTC: perpsV2OffchainDelayedOrder,
			PerpsV2MarketStateBTC: perpsV2MarketState,
			PerpsV2ExchangeRate: perpsV2ExchangeRate,
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
				'PerpsV2MarketManager',
				'PerpsV2MarketSettings',
				{ contract: 'PerpsV2MarketStateBTC', properties: { perpSuffix: marketKeySuffix } },
				'PerpsV2MarketBTC',
				'PerpsV2ExchangeRate',
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

		// use implementation ABI on the proxy address to simplify calling
		perpsV2Market = await PerpsV2Market.at(perpsV2Market.address);

		// Setup mock pyth and perpsV2ExchangeRage
		mockPyth = await setupContract({
			accounts,
			contract: 'MockPyth',
			args: [60, 0],
		});

		await perpsV2ExchangeRate.setOffchainOracle(mockPyth.address, { from: owner });

		for (const feed of feeds) {
			await perpsV2ExchangeRate.setOffchainPriceFeedId(feed.assetId, feed.feedId, {
				from: owner,
			});

			// set initial prices to have some valid data in Pyth
			await setOffchainPrice(owner, { id: feed.feedId });
		}
	});

	addSnapshotBeforeRestoreAfterEach();

	let margin, size, price, confidence, desiredTimeDelta, minDelayTimeDelta, latestPublishTime;

	beforeEach(async () => {
		// prepare basic order parameters
		margin = toUnit('2000');
		await perpsV2Market.transferMargin(margin, { from: trader });
		size = toUnit('50');
		price = toUnit('200');
		confidence = toUnit('1');
		desiredTimeDelta = 60;
		minDelayTimeDelta = 60;
		latestPublishTime = await currentTime();

		await setPrice(baseAsset, price);

		await setOffchainPrice(trader, {
			id: defaultFeedId,
			price: feedBaseFromUNIT(price),
			conf: feedBaseFromUNIT(confidence),
			publishTime: latestPublishTime,
		});
	});

	describe('submitOffchainDelayedOrder()', () => {
		it('submitting an order results in correct views and events', async () => {
			// setup
			const roundId = await exchangeRates.getCurrentRoundId(baseAsset);
			const spotFee = (await perpsV2Market.orderFee(size))[0];
			const keeperFee = await perpsV2MarketSettings.minKeeperFee();
			const tx = await perpsV2Market.submitOffchainDelayedOrder(size, desiredTimeDelta, {
				from: trader,
			});
			const txBlock = await ethers.provider.getBlock(tx.receipt.blockNumber);
			const expectedExecutableAt = txBlock.timestamp + desiredTimeDelta;

			const order = await perpsV2MarketState.offchainDelayedOrders(trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, roundId.add(toBN(1)));
			assert.bnEqual(order.commitDeposit, spotFee);
			assert.bnEqual(order.keeperDeposit, keeperFee);
			assert.bnEqual(order.executableAtTime, expectedExecutableAt);
			assert.bnEqual(order.latestPublishTime, latestPublishTime);

			// check margin
			const position = await perpsV2Market.positions(trader);
			const expectedMargin = margin.sub(spotFee.add(keeperFee));
			assert.bnEqual(position.margin, expectedMargin);

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [perpsV2Market, perpsV2OffchainDelayedOrder],
			});
			assert.equal(decodedLogs.length, 3);
			// PositionModified
			decodedEventEqual({
				event: 'PositionModified',
				emittedFrom: perpsV2Market.address,
				args: [toBN('1'), trader, expectedMargin, 0, 0, price, toBN(2), 0],
				log: decodedLogs[1],
			});
			// OffchainDelayedOrderSubmitted
			decodedEventEqual({
				event: 'OffchainDelayedOrderSubmitted',
				emittedFrom: perpsV2Market.address,
				args: [
					trader,
					size,
					roundId.add(toBN(1)),
					expectedExecutableAt,
					latestPublishTime,
					spotFee,
					keeperFee,
				],
				log: decodedLogs[2],
			});
		});

		it('set desiredTimeDelta to minDelayTimeDelta when delta is 0', async () => {
			// setup
			const tx = await perpsV2Market.submitOffchainDelayedOrder(size, 0, { from: trader });
			const txBlock = await ethers.provider.getBlock(tx.receipt.blockNumber);

			const order = await perpsV2MarketState.offchainDelayedOrders(trader);
			assert.bnEqual(order.executableAtTime, txBlock.timestamp + minDelayTimeDelta);
		});

		describe('cannot submit an order when', () => {
			it('zero size', async () => {
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(0, desiredTimeDelta, { from: trader }),
					'Cannot submit empty order'
				);
			});

			it('not enough margin', async () => {
				await perpsV2Market.withdrawAllMargin({ from: trader });
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size, desiredTimeDelta, { from: trader }),
					'Insufficient margin'
				);
			});

			it('too much leverage', async () => {
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size.mul(toBN(10)), desiredTimeDelta, {
						from: trader,
					}),
					'Max leverage exceeded'
				);
			});

			it('previous delayed order exists', async () => {
				await perpsV2Market.submitOffchainDelayedOrder(size, desiredTimeDelta, { from: trader });
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size, desiredTimeDelta, { from: trader }),
					'previous order exists'
				);
			});

			it('if futures markets are suspended', async () => {
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size, desiredTimeDelta, { from: trader }),
					'Futures markets are suspended'
				);
			});

			it('if market is suspended', async () => {
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size, desiredTimeDelta, { from: trader }),
					'Market suspended'
				);
			});

			it('if desiredTimeDelta is below the minimum delay or negative', async () => {
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(0, 1, { from: trader }),
					'delay out of bounds'
				);
				try {
					await perpsV2Market.submitOffchainDelayedOrder(0, -1, { from: trader });
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
					perpsV2Market.submitOffchainDelayedOrder(0, 1000000, { from: trader }),
					'delay out of bounds'
				);
			});
		});
	});

	describe('submitOffchainDelayedOrderWithTracking()', () => {
		const trackingCode = toBytes32('code');

		it('submitting an order results in correct views and events', async () => {
			// setup
			const roundId = await exchangeRates.getCurrentRoundId(baseAsset);
			const spotFee = (await perpsV2Market.orderFee(size))[0];
			const keeperFee = await perpsV2MarketSettings.minKeeperFee();

			const tx = await perpsV2Market.submitOffchainDelayedOrderWithTracking(
				size,
				desiredTimeDelta,
				trackingCode,
				{
					from: trader,
				}
			);
			const txBlock = await ethers.provider.getBlock(tx.receipt.blockNumber);

			// check order
			const order = await perpsV2MarketState.offchainDelayedOrders(trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, roundId.add(toBN(1)));
			assert.bnEqual(order.commitDeposit, spotFee);
			assert.bnEqual(order.keeperDeposit, keeperFee);
			assert.bnEqual(order.executableAtTime, txBlock.timestamp + desiredTimeDelta);
			assert.bnEqual(order.trackingCode, trackingCode);

			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, perpsV2Market, perpsV2OffchainDelayedOrder],
			});

			// OffchainDelayedOrderSubmitted
			decodedEventEqual({
				event: 'OffchainDelayedOrderSubmitted',
				emittedFrom: perpsV2Market.address,
				args: [
					trader,
					size,
					roundId.add(toBN(1)),
					txBlock.timestamp + desiredTimeDelta,
					latestPublishTime,
					spotFee,
					keeperFee,
					trackingCode,
				],
				log: decodedLogs[2],
			});
		});

		it('executing an order emits the tracking event', async () => {
			// setup
			await perpsV2Market.submitOffchainDelayedOrderWithTracking(
				size,
				desiredTimeDelta,
				trackingCode,
				{
					from: trader,
				}
			);

			// go to next round
			await setPrice(baseAsset, price);

			latestPublishTime = await currentTime();

			const updateFeedData = await getFeedUpdateData({
				id: defaultFeedId,
				price: feedBaseFromUNIT(price),
				conf: feedBaseFromUNIT(confidence),
				publishTime: latestPublishTime,
			});

			const expectedFee = multiplyDecimal(
				size,
				multiplyDecimal(price, takerFeeOffchainDelayedOrder)
			);

			// execute the order
			const tx = await perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
				from: trader,
			});

			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, perpsV2Market, perpsV2OffchainDelayedOrder],
			});

			decodedEventEqual({
				event: 'FuturesTracking',
				emittedFrom: perpsV2Market.address,
				args: [trackingCode, baseAsset, marketKey, size, expectedFee],
				log: decodedLogs[6],
			});
		});
	});

	describe('cancelOffchainDelayedOrder()', () => {
		it('cannot cancel when there is no order', async () => {
			// account owner
			await assert.revert(
				perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader }),
				'no previous order'
			);
			// keeper
			await assert.revert(
				perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader2 }),
				'no previous order'
			);
		});

		describe('when an order exists', () => {
			let roundId, spotFee, keeperFee;

			// helper function to check cancellation tx effects
			async function checkCancellation(from) {
				const currentMargin = toBN((await perpsV2Market.positions(trader)).margin);
				// cancel the order
				const tx = await perpsV2Market.cancelOffchainDelayedOrder(trader, { from: from });

				// check order is removed
				const order = await perpsV2MarketState.offchainDelayedOrders(trader);
				assert.bnEqual(order.sizeDelta, 0);
				assert.bnEqual(order.targetRoundId, 0);
				assert.bnEqual(order.commitDeposit, 0);
				assert.bnEqual(order.keeperDeposit, 0);

				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, perpsV2Market, perpsV2OffchainDelayedOrder],
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

				// commitFee (equal to spotFee) paid to fee pool
				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [await feePool.FEE_ADDRESS(), spotFee],
					log: decodedLogs.slice(-2, -1)[0], // [-2]
				});
				// OffchainDelayedOrderRemoved
				decodedEventEqual({
					event: 'OffchainDelayedOrderRemoved',
					emittedFrom: perpsV2Market.address,
					args: [trader, roundId, size, roundId.add(toBN(1)), spotFee, keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await perpsV2Market.transferMargin(margin, { from: trader });
				// and can submit new order
				await perpsV2Market.submitOffchainDelayedOrder(size, desiredTimeDelta, { from: trader });
				const newOrder = await perpsV2MarketState.offchainDelayedOrders(trader);
				assert.bnEqual(newOrder.sizeDelta, size);
			}

			beforeEach(async () => {
				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				spotFee = (await perpsV2Market.orderFee(size))[0];
				keeperFee = await perpsV2MarketSettings.minKeeperFee();
				await perpsV2Market.submitOffchainDelayedOrder(size, desiredTimeDelta, { from: trader });
			});

			it('cannot cancel if futures markets are suspended', async () => {
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader }),
					'Futures markets are suspended'
				);
			});

			it('cannot cancel if market is suspended', async () => {
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader }),
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
					const updateFeedData = await getFeedUpdateData({
						id: defaultFeedId,
						price: feedBaseFromUNIT(price),
						conf: feedBaseFromUNIT(confidence),
					});
					// check execution would fail
					await assert.revert(
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
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
						perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// target round
					await setPrice(baseAsset, price);
					await assert.revert(
						perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// next round after target round
					await setPrice(baseAsset, price);
					await assert.revert(
						perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// next one after that (for 2 roundId)
					await setPrice(baseAsset, price);
					await assert.revert(
						perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader2 }),
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
						perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					const { timestamp } = await ethers.provider.getBlock('latest');
					const ffDelta = 5;

					// time has moved forward (no change to round) but not enough.
					const order = await perpsV2MarketState.offchainDelayedOrders(trader);
					const exectuableAtTimeDelta = order.executableAtTime.sub(toBN(timestamp)).toNumber();
					await fastForward(ffDelta); // fast forward by 5 seconds
					await assert.revert(
						perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// time has moved forward, order is executable but cancellable
					await fastForward(exectuableAtTimeDelta - ffDelta + 1);
					await assert.revert(
						perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader2 }),
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
			const updateFeedData = await getFeedUpdateData({
				id: defaultFeedId,
				price: feedBaseFromUNIT(price),
				conf: feedBaseFromUNIT(confidence),
			});
			// account owner
			await assert.revert(
				perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
				'no previous order'
			);
			// keeper
			await assert.revert(
				perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader2 }),
				'no previous order'
			);
		});

		describe('when an order exists', () => {
			let roundId, commitFee, keeperFee, updateFeedData;

			beforeEach(async () => {
				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				// commitFee is the fee that would be charged for a spot trade when order is submitted
				commitFee = (await perpsV2Market.orderFee(size))[0];
				// keeperFee is the minimum keeperFee for the system
				keeperFee = await perpsV2MarketSettings.minKeeperFee();
				await perpsV2Market.submitOffchainDelayedOrder(size, desiredTimeDelta, { from: trader });
				updateFeedData = await getFeedUpdateData({
					id: defaultFeedId,
					price: feedBaseFromUNIT(price),
					conf: feedBaseFromUNIT(confidence),
				});
			});

			describe('execution reverts', () => {
				it('in same round', async () => {
					// account owner
					await assert.revert(
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
						'executability not reached'
					);
					// keeper
					await assert.revert(
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader2 }),
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
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
						'order too old, use cancel'
					);
					// keeper
					await assert.revert(
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader2 }),
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
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
						'Position can be liquidated'
					);
					// the difference in reverts is due to difference between refund into margin
					// in case of account owner and transfer in case of keeper
					await assert.revert(
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader2 }),
						'Insufficient margin'
					);
				});

				it('if price too high', async () => {
					// go to target round, set price too high
					await setPrice(baseAsset, price.mul(toBN(5)));

					// account owner
					await assert.revert(
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
						'Max leverage exceeded'
					);
					// keeper
					await assert.revert(
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader2 }),
						'Max leverage exceeded'
					);
				});
			});

			// helper function to check execution and its results
			// from: which account is requesting the execution
			// targetPrice: the price that the order should be executed at
			// feeRate: expected exchange fee rate
			// spotTradeDetails: trade details of the same trade if it would happen as spot
			async function checkExecution(from, targetPrice, feeRate, spotTradeDetails, updateFeedData) {
				const currentMargin = toBN((await perpsV2Market.positions(trader)).margin);
				// execute the order
				const tx = await perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
					from: from,
				});

				// check order is removed now
				const order = await perpsV2MarketState.offchainDelayedOrders(trader);
				assert.bnEqual(order.sizeDelta, 0);
				assert.bnEqual(order.targetRoundId, 0);
				assert.bnEqual(order.commitDeposit, 0);
				assert.bnEqual(order.keeperDeposit, 0);
				assert.bnEqual(order.executableAtTime, 0);

				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, perpsV2Market, perpsV2OffchainDelayedOrder],
				});

				let expectedRefund = commitFee; // at least the commitFee is refunded
				if (from === trader) {
					// trader gets refunded keeperFee
					expectedRefund = expectedRefund.add(keeperFee);
					// no event for keeper payment
					assert.equal(decodedLogs.length, 8);
					// funding, position(refund), issued (exchange fee), position(trade), order removed
				} else {
					// keeper gets paid
					assert.equal(decodedLogs.length, 9);
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
				const currentPrice = (await perpsV2Market.assetPrice()).price;
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsV2Market.address,
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
					emittedFrom: perpsV2Market.address,
					args: [toBN('1'), trader, expectedMargin, size, size, targetPrice, toBN(2), expectedFee],
					log: decodedLogs.slice(-2, -1)[0],
				});

				// OffchainDelayedOrderRemoved
				decodedEventEqual({
					event: 'OffchainDelayedOrderRemoved',
					emittedFrom: perpsV2Market.address,
					args: [trader, roundId, size, roundId.add(toBN(1)), commitFee, keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await perpsV2Market.transferMargin(margin, { from: trader });
				// and can submit new order
				await perpsV2Market.submitOffchainDelayedOrder(size, desiredTimeDelta, { from: trader });
				const newOrder = await perpsV2MarketState.offchainDelayedOrders(trader);
				assert.bnEqual(newOrder.sizeDelta, size);
			}

			describe('execution results in correct views and events', () => {
				let targetPrice, spotTradeDetails;

				beforeEach(async () => {
					targetPrice = multiplyDecimal(price, toUnit(0.9));
				});

				it('before target round but after delay', async () => {
					// set target round to be many price updates into the future.
					await perpsV2MarketSettings.setNextPriceConfirmWindow(marketKey, 10, { from: owner });

					// check we cannot execute the order
					await assert.revert(
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader2 }),
						'executability not reached'
					);

					// fast-forward to the order's executableAtTime
					//
					// note that we do NOT update the price (to ensure target round is never reached)
					spotTradeDetails = await perpsV2Market.postTradeDetails(size, trader);
					await fastForward(desiredTimeDelta);

					updateFeedData = await getFeedUpdateData({
						id: defaultFeedId,
						price: feedBaseFromUNIT(price),
						conf: feedBaseFromUNIT(confidence),
					});

					// check we can execute.
					//
					// note the predicate uses `price` and not `targetPrice` because target is never reached
					await checkExecution(
						trader,
						price,
						takerFeeOffchainDelayedOrder,
						spotTradeDetails,
						updateFeedData
					);
				});

				describe('during target round', () => {
					let updateFeedData;
					beforeEach(async () => {
						updateFeedData = await getFeedUpdateData({
							id: defaultFeedId,
							price: feedBaseFromUNIT(targetPrice),
							conf: feedBaseFromUNIT(confidence),
						});
					});

					describe('taker trade', () => {
						beforeEach(async () => {
							// go to next round
							await setPrice(baseAsset, targetPrice);

							spotTradeDetails = await perpsV2Market.postTradeDetails(size, trader);
						});

						it('from account owner', async () => {
							await checkExecution(
								trader,
								targetPrice,
								takerFeeOffchainDelayedOrder,
								spotTradeDetails,
								updateFeedData
							);
						});

						it('from keeper', async () => {
							await checkExecution(
								trader2,
								targetPrice,
								takerFeeOffchainDelayedOrder,
								spotTradeDetails,
								updateFeedData
							);
						});
					});

					describe('maker trade', () => {
						beforeEach(async () => {
							// skew the other way
							await perpsV2Market.transferMargin(margin.mul(toBN(2)), { from: trader3 });
							await perpsV2Market.modifyPosition(size.mul(toBN(-2)), { from: trader3 });
							// go to next round
							await setPrice(baseAsset, targetPrice);
							spotTradeDetails = await perpsV2Market.postTradeDetails(size, trader);
						});

						it('from account owner', async () => {
							await checkExecution(
								trader,
								targetPrice,
								makerFeeOffchainDelayedOrder,
								spotTradeDetails,
								updateFeedData
							);
						});

						it('from keeper', async () => {
							await checkExecution(
								trader2,
								targetPrice,
								makerFeeOffchainDelayedOrder,
								spotTradeDetails,
								updateFeedData
							);
						});
					});

					it('reverts if futures markets are suspended', async () => {
						await setPrice(baseAsset, targetPrice);
						await systemStatus.suspendFutures(toUnit(0), { from: owner });
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'Futures markets are suspended'
						);
					});

					it('reverts if market is suspended', async () => {
						await setPrice(baseAsset, targetPrice);
						await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'Market suspended'
						);
					});
				});

				describe('after target round, but within confirmation window', () => {
					beforeEach(async () => {
						// target round has the new price
						await setPrice(baseAsset, targetPrice);
						spotTradeDetails = await perpsV2Market.postTradeDetails(size, trader);
						// other rounds are back to old price
						await setPrice(baseAsset, price);
					});

					describe('taker trade', () => {
						beforeEach(async () => {
							// go to next round
							await setPrice(baseAsset, price);
						});

						it('from account owner', async () => {
							await checkExecution(
								trader,
								targetPrice,
								takerFeeOffchainDelayedOrder,
								spotTradeDetails,
								updateFeedData
							);
						});

						it('from keeper', async () => {
							await checkExecution(
								trader2,
								targetPrice,
								takerFeeOffchainDelayedOrder,
								spotTradeDetails,
								updateFeedData
							);
						});
					});

					describe('maker trade', () => {
						beforeEach(async () => {
							// skew the other way
							await perpsV2Market.transferMargin(margin.mul(toBN(2)), { from: trader3 });
							await perpsV2Market.modifyPosition(size.mul(toBN(-2)), { from: trader3 });
							// go to next round
							await setPrice(baseAsset, price);
						});

						it('from account owner', async () => {
							await checkExecution(
								trader,
								targetPrice,
								makerFeeOffchainDelayedOrder,
								spotTradeDetails,
								updateFeedData
							);
						});

						it('from keeper', async () => {
							await checkExecution(
								trader2,
								targetPrice,
								makerFeeOffchainDelayedOrder,
								spotTradeDetails,
								updateFeedData
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
			let updateFeedData;
			beforeEach(async () => {
				// set up a healthy position
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });

				// submit an order
				await perpsV2Market.submitOffchainDelayedOrder(size, desiredTimeDelta, { from: trader });

				// spike the price
				await setPrice(baseAsset, spikedPrice);

				updateFeedData = await getFeedUpdateData({
					id: defaultFeedId,
					price: feedBaseFromUNIT(price),
					conf: feedBaseFromUNIT(confidence),
				});
			});

			it('canceling an order works', async () => {
				await perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader });
			});

			it('submitting an order reverts', async () => {
				// cancel existing
				await perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader });

				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size, desiredTimeDelta, { from: trader }),
					'Price too volatile'
				);
			});

			it('executing an order reverts', async () => {
				// advance to next round (same price, should be still volatile)
				await setPrice(baseAsset, spikedPrice);

				await assert.revert(
					perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
					'Price too volatile'
				);
			});
		});
	});
});
