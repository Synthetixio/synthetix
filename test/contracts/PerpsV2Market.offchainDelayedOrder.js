const { artifacts, contract, web3, ethers } = require('hardhat');
const { toBytes32 } = require('../..');
const { toUnit, multiplyDecimal, currentTime, fastForward } = require('../utils')();
const { toBN } = web3.utils;

const PerpsV2MarketHelper = artifacts.require('TestablePerpsV2Market');
const PerpsV2Market = artifacts.require('TestablePerpsV2MarketEmpty');

const { setupAllContracts, setupContract } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { getDecodedLogs, decodedEventEqual, updateAggregatorRates } = require('./helpers');

contract('PerpsV2Market PerpsV2MarketOffchainOrders', accounts => {
	let perpsV2MarketSettings,
		perpsV2Market,
		perpsV2MarketHelper,
		perpsV2MarketDelayedIntent,
		perpsV2MarketDelayedExecution,
		perpsV2MarketState,
		perpsV2ExchangeRate,
		mockPyth,
		exchangeRates,
		circuitBreaker,
		sUSD,
		systemSettings,
		systemStatus,
		debtCache;

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
	const priceImpactDelta = toUnit('0.5'); // 500bps (high bps to avoid affecting unrelated tests)
	const orderType = 2; // 0-Atomic, 1-Delayed, 2-Offchain

	const offchainDelayedOrderMinAge = 15;
	const offchainDelayedOrderMaxAge = 60;

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

	const pythFee = 100;

	async function setOnchainPrice(asset, price, resetCircuitBreaker = true) {
		await updateAggregatorRates(
			exchangeRates,
			resetCircuitBreaker ? circuitBreaker : null,
			[asset],
			[price]
		);
	}

	async function setOffchainPrice(user, priceData = {}) {
		const updateFeedData = await getFeedUpdateData(priceData);
		await perpsV2ExchangeRate.updatePythPrice(user, [updateFeedData], {
			from: user,
			value: pythFee,
		});
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
		return mockPyth.createPriceFeedUpdateData(
			id,
			price,
			conf,
			expo,
			emaPrice,
			emaConf,
			publishTime || (await currentTime())
		);
	}

	function feedBaseFromUNIT(price, feedExpo = defaultFeedExpo) {
		return toBN(price).div(toBN(10 ** (18 + feedExpo)));
	}

	before(async () => {
		({
			PerpsV2MarketSettings: perpsV2MarketSettings,
			ProxyPerpsV2MarketBTC: perpsV2Market,
			PerpsV2MarketDelayedIntentBTC: perpsV2MarketDelayedIntent,
			PerpsV2MarketDelayedExecutionBTC: perpsV2MarketDelayedExecution,
			PerpsV2MarketStateBTC: perpsV2MarketState,
			TestablePerpsV2MarketBTC: perpsV2MarketHelper,
			PerpsV2ExchangeRate: perpsV2ExchangeRate,
			ExchangeRates: exchangeRates,
			CircuitBreaker: circuitBreaker,
			SynthsUSD: sUSD,
			SystemSettings: systemSettings,
			SystemStatus: systemStatus,
			DebtCache: debtCache,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sBTC', 'sETH'],
			contracts: [
				'FuturesMarketManager',
				'PerpsV2MarketSettings',
				{ contract: 'PerpsV2MarketStateBTC', properties: { perpSuffix: marketKeySuffix } },
				'PerpsV2MarketBTC',
				'TestablePerpsV2MarketBTC',
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

		await debtCache.rebuildCache();

		// Update the rate so that it is not invalid
		await setOnchainPrice(baseAsset, initialPrice);

		// disable dynamic fee for most tests
		// it will be enabled for specific tests
		await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });

		// Issue the trader some sUSD
		for (const t of [trader, trader2, trader3]) {
			await sUSD.issue(t, traderInitialBalance);
		}

		// use implementation ABI on the proxy address to simplify calling
		perpsV2Market = await PerpsV2Market.at(perpsV2Market.address);
		perpsV2MarketHelper = await PerpsV2MarketHelper.at(perpsV2Market.address);

		// Setup mock pyth and perpsV2ExchangeRage
		mockPyth = await setupContract({
			accounts,
			contract: 'MockPyth',
			args: [60, 0],
		});

		await perpsV2ExchangeRate.setOffchainOracle(mockPyth.address, { from: owner });

		// Authorize markets (and users that call the function) to call updatePythPrice
		await perpsV2ExchangeRate.addAssociatedContracts(
			[perpsV2MarketDelayedExecution.address, owner, trader],
			{
				from: owner,
			}
		);

		for (const feed of feeds) {
			await perpsV2ExchangeRate.setOffchainPriceFeedId(feed.assetId, feed.feedId, {
				from: owner,
			});

			// set initial prices to have some valid data in Pyth
			await setOffchainPrice(owner, { id: feed.feedId });
		}
	});

	addSnapshotBeforeRestoreAfterEach();

	let margin,
		size,
		fillPrice,
		desiredFillPrice,
		price,
		offChainPrice,
		confidence,
		latestPublishTime;

	beforeEach(async () => {
		// prepare basic order parameters
		margin = toUnit('2000');
		await perpsV2Market.transferMargin(margin, { from: trader });
		size = toUnit('50');
		price = toUnit('200');
		offChainPrice = toUnit('190');
		confidence = toUnit('1');
		latestPublishTime = await currentTime();

		await setOnchainPrice(baseAsset, price);
		await setOffchainPrice(trader, {
			id: defaultFeedId,
			price: feedBaseFromUNIT(offChainPrice),
			conf: feedBaseFromUNIT(confidence),
			publishTime: latestPublishTime,
		});

		const fillPriceWithMeta = await perpsV2MarketHelper.fillPriceWithMeta(
			size,
			priceImpactDelta,
			0
		);
		fillPrice = fillPriceWithMeta[0];
		desiredFillPrice = fillPriceWithMeta[1];
	});

	describe('submitOffchainDelayedOrder()', () => {
		it('submitting an order results in correct views and events', async () => {
			// setup
			const roundId = await exchangeRates.getCurrentRoundId(baseAsset);
			const keeperFee = await perpsV2MarketSettings.minKeeperFee();

			const tx = await perpsV2Market.submitOffchainDelayedOrder(size, desiredFillPrice, {
				from: trader,
			});
			const txBlock = await ethers.provider.getBlock(tx.receipt.blockNumber);

			const order = await perpsV2MarketState.delayedOrders(trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, 0);
			assert.bnEqual(order.commitDeposit, 0);
			assert.bnEqual(order.keeperDeposit, keeperFee);
			assert.bnEqual(order.executableAtTime, 0);

			// check margin
			const position = await perpsV2Market.positions(trader);
			const expectedMargin = margin.sub(keeperFee);
			assert.bnEqual(position.margin, expectedMargin);

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [perpsV2Market, perpsV2MarketDelayedExecution, perpsV2MarketDelayedIntent],
			});
			assert.equal(decodedLogs.length, 3);
			decodedEventEqual({
				event: 'PositionModified',
				emittedFrom: perpsV2Market.address,
				args: [toBN('1'), trader, expectedMargin, 0, 0, fillPrice, toBN(2), 0, toBN(0)],
				log: decodedLogs[1],
			});
			decodedEventEqual({
				event: 'DelayedOrderSubmitted',
				emittedFrom: perpsV2Market.address,
				args: [trader, true, size, roundId.add(toBN(1)), txBlock.timestamp, 0, 0, keeperFee],
				log: decodedLogs[2],
			});
		});

		describe('cannot submit an order when', () => {
			it('zero size', async () => {
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(0, priceImpactDelta, { from: trader }),
					'Cannot submit empty order'
				);
			});

			it('not enough margin', async () => {
				await perpsV2Market.withdrawAllMargin({ from: trader });
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size, priceImpactDelta, { from: trader }),
					'Insufficient margin'
				);
			});

			it('too much leverage', async () => {
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size.mul(toBN(10)), priceImpactDelta, {
						from: trader,
					}),
					'Max leverage exceeded'
				);
			});

			it('previous delayed order exists', async () => {
				await perpsV2Market.submitOffchainDelayedOrder(size, priceImpactDelta, { from: trader });
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size, priceImpactDelta, { from: trader }),
					'previous order exists'
				);
			});

			it('if perpsV2 markets are suspended', async () => {
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size, priceImpactDelta, { from: trader }),
					'Futures markets are suspended'
				);
			});

			it('if market is suspended', async () => {
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size, priceImpactDelta, { from: trader }),
					'Market suspended'
				);
			});

			it('if oc virtual market is suspended', async () => {
				const ocMarketKet = await perpsV2MarketSettings.offchainMarketKey(marketKey);
				await systemStatus.suspendFuturesMarket(ocMarketKet, '0', { from: owner });
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size, priceImpactDelta, { from: trader }),
					'Market suspended'
				);
			});
		});
	});

	describe('submitOffchainDelayedOrderWithTracking()', () => {
		const trackingCode = toBytes32('code');

		it('submitting an order results in correct views and events', async () => {
			// setup
			const roundId = await exchangeRates.getCurrentRoundId(baseAsset);
			const keeperFee = await perpsV2MarketSettings.minKeeperFee();

			const tx = await perpsV2Market.submitOffchainDelayedOrderWithTracking(
				size,
				priceImpactDelta,
				trackingCode,
				{
					from: trader,
				}
			);
			const txBlock = await ethers.provider.getBlock(tx.receipt.blockNumber);

			// check order
			const order = await perpsV2MarketState.delayedOrders(trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, 0);
			assert.bnEqual(order.commitDeposit, 0);
			assert.bnEqual(order.keeperDeposit, keeperFee);
			assert.bnEqual(order.executableAtTime, 0);
			assert.bnEqual(order.trackingCode, trackingCode);

			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, perpsV2Market, perpsV2MarketDelayedExecution],
			});

			// OffchainDelayedOrderSubmitted
			decodedEventEqual({
				event: 'DelayedOrderSubmitted',
				emittedFrom: perpsV2Market.address,
				args: [
					trader,
					true,
					size,
					roundId.add(toBN(1)),
					txBlock.timestamp,
					0,
					0,
					keeperFee,
					trackingCode,
				],
				log: decodedLogs[2],
			});
		});

		it('executing an order emits the tracking event', async () => {
			await perpsV2MarketSettings.setOffchainDelayedOrderMinAge(marketKey, 0, { from: owner });

			// setup
			await perpsV2Market.submitOffchainDelayedOrderWithTracking(
				size,
				desiredFillPrice,
				trackingCode,
				{
					from: trader,
				}
			);

			// go to next round
			await setOnchainPrice(baseAsset, offChainPrice);

			latestPublishTime = await currentTime();

			const updateFeedData = await getFeedUpdateData({
				id: defaultFeedId,
				price: feedBaseFromUNIT(offChainPrice),
				conf: feedBaseFromUNIT(confidence),
				publishTime: latestPublishTime,
			});

			const fillPrice = (
				await perpsV2MarketHelper.fillPriceWithMeta(size, priceImpactDelta, offChainPrice)
			)[0];
			const expectedFee = multiplyDecimal(
				size,
				multiplyDecimal(fillPrice, takerFeeOffchainDelayedOrder)
			);

			// execute the order
			const tx = await perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
				from: trader,
			});

			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, perpsV2Market, perpsV2MarketDelayedExecution, perpsV2MarketDelayedIntent],
			});

			decodedEventEqual({
				event: 'PerpsTracking',
				emittedFrom: perpsV2Market.address,
				args: [trackingCode, baseAsset, marketKey, size, expectedFee],
				log: decodedLogs[6],
			});
		});
	});

	// For an in-depth and more holistic set of tests, refer to submitCloseDelayedOrderWithTracking
	describe('submitCloseOffchainDelayedOrderWithTracking()', () => {
		const trackingCode = toBytes32('code');

		const fastForwardAndExecuteAtPrice = async (account, price) => {
			await fastForward(offchainDelayedOrderMinAge + 1); // ff min + 1s buffer.

			const updateFeedData = await getFeedUpdateData({
				id: defaultFeedId,
				price: feedBaseFromUNIT(price),
				conf: feedBaseFromUNIT(confidence),
			});

			await perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
				from: account,
			});
			return perpsV2Market.positions(account);
		};

		it('can successfully close a position', async () => {
			// Submit and successfully open a position.
			const desiredFillPrice1 = (
				await perpsV2MarketHelper.fillPriceWithMeta(size, priceImpactDelta, price)
			)[1];
			await perpsV2Market.submitOffchainDelayedOrder(size, desiredFillPrice1, {
				from: trader,
			});
			const openedPosition = await fastForwardAndExecuteAtPrice(trader, price);

			assert.bnEqual(openedPosition.size, size);

			// Close said position.
			const desiredFillPrice2 = (
				await perpsV2MarketHelper.fillPriceWithMeta(
					multiplyDecimal(size, toUnit('-1')),
					priceImpactDelta,
					price
				)
			)[1];
			await perpsV2Market.submitCloseOffchainDelayedOrderWithTracking(
				desiredFillPrice2,
				trackingCode,
				{ from: trader }
			);

			const targetPrice = multiplyDecimal(price, toUnit('0.95'));
			await setOnchainPrice(baseAsset, targetPrice);
			await setOffchainPrice(trader, {
				id: defaultFeedId,
				price: feedBaseFromUNIT(targetPrice),
				conf: feedBaseFromUNIT(confidence),
				publishTime: await currentTime(),
			});
			const closedPosition = await fastForwardAndExecuteAtPrice(trader, targetPrice);
			assert.bnEqual(closedPosition.size, 0);
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
			let roundId, keeperFee;

			// helper function to check cancellation tx effects
			async function checkCancellation(from) {
				const currentMargin = toBN((await perpsV2Market.positions(trader)).margin);
				// cancel the order
				const tx = await perpsV2Market.cancelOffchainDelayedOrder(trader, { from: from });

				// check order is removed
				const order = await perpsV2MarketState.delayedOrders(trader);
				assert.bnEqual(order.sizeDelta, 0);
				assert.bnEqual(order.targetRoundId, 0);
				assert.bnEqual(order.commitDeposit, 0);
				assert.bnEqual(order.keeperDeposit, 0);

				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [
						sUSD,
						perpsV2Market,
						perpsV2MarketDelayedExecution,
						perpsV2MarketDelayedIntent,
					],
				});
				const decodedLogNames = decodedLogs.map(({ name }) => name);

				if (from === trader) {
					assert.deepEqual(decodedLogNames, [
						'FundingRecomputed',
						'PositionModified',
						'DelayedOrderRemoved',
					]);
					// trader gets refunded
					decodedEventEqual({
						event: 'PositionModified',
						emittedFrom: perpsV2Market.address,
						args: [
							toBN('1'),
							trader,
							currentMargin.add(keeperFee),
							0,
							0,
							price,
							toBN(2),
							0,
							toBN(0),
						],
						log: decodedLogs[1],
					});
				} else {
					// keeper gets paid
					assert.deepEqual(decodedLogNames, ['Issued', 'DelayedOrderRemoved']);
					decodedEventEqual({
						event: 'Issued',
						emittedFrom: sUSD.address,
						args: [from, keeperFee],
						log: decodedLogs[0],
					});
				}

				decodedEventEqual({
					event: 'DelayedOrderRemoved',
					emittedFrom: perpsV2Market.address,
					args: [trader, true, roundId, size, roundId.add(toBN(1)), 0, keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await perpsV2Market.transferMargin(margin, { from: trader });
				// and can submit new order
				await perpsV2Market.submitOffchainDelayedOrder(size, priceImpactDelta, { from: trader });
				const newOrder = await perpsV2MarketState.delayedOrders(trader);
				assert.bnEqual(newOrder.sizeDelta, size);
			}

			beforeEach(async () => {
				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				keeperFee = await perpsV2MarketSettings.minKeeperFee();
				await perpsV2Market.submitOffchainDelayedOrder(size, priceImpactDelta, { from: trader });
			});

			it('cannot cancel before time', async () => {
				await assert.revert(
					perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader }),
					'cannot cancel yet'
				);
			});

			it('cannot cancel if perpsV2 markets are suspended', async () => {
				await fastForward(offchainDelayedOrderMaxAge * 2);
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader }),
					'Futures markets are suspended'
				);
			});

			it('cannot cancel if market is suspended', async () => {
				await fastForward(offchainDelayedOrderMaxAge * 2);
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader }),
					'Market suspended'
				);
			});

			describe('account owner moving in time', () => {
				it('cannot cancel before time based 2 maxAge', async () => {
					// set a known and deterministic confirmation window.
					let ffDelta = 0;
					const maxAge = 60;
					const executionExpiredDelay = maxAge + 1;
					await perpsV2MarketSettings.setOffchainDelayedOrderMaxAge(marketKey, maxAge, {
						from: owner,
					});

					// no time has changed.
					await assert.revert(
						perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader }),
						'cannot cancel yet'
					);

					// time has moved forward, almost to reach the time it will be too late for update the price
					ffDelta = executionExpiredDelay - 10 - ffDelta;
					await fastForward(ffDelta);
					const updateFeedData = await getFeedUpdateData({
						id: defaultFeedId,
						price: feedBaseFromUNIT(offChainPrice),
						conf: feedBaseFromUNIT(confidence),
					});

					// cannot cancel yet (need to reach the execution/cancelation age)
					await assert.revert(
						perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader }),
						'cannot cancel yet'
					);

					// time has moved forward, order cannot be executed (due to maxAge) and is cancellable
					ffDelta = executionExpiredDelay - ffDelta;
					await fastForward(ffDelta);

					await assert.revert(
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
						'order too old, use cancel'
					);

					// now is cancellable
					await checkCancellation(trader);
				});
			});

			describe('non-account owner moving in time', () => {
				it('cannot cancel before time passed maxAge', async () => {
					// set a known and deterministic confirmation window.
					let ffDelta = 0;
					const maxAge = 60;
					const executionExpiredDelay = maxAge + 1;
					await perpsV2MarketSettings.setOffchainDelayedOrderMaxAge(marketKey, maxAge, {
						from: owner,
					});

					// no time has changed.
					await assert.revert(
						perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader2 }),
						'cannot cancel yet'
					);

					// time has moved forward, almost to reach the time it will be too late for update the price
					ffDelta = executionExpiredDelay - 10 - ffDelta;
					await fastForward(ffDelta);
					const updateFeedData = await getFeedUpdateData({
						id: defaultFeedId,
						price: feedBaseFromUNIT(offChainPrice),
						conf: feedBaseFromUNIT(confidence),
					});

					// cannot cancel yet (need to reach the execution/cancelation age)
					await assert.revert(
						perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader }),
						'cannot cancel yet'
					);

					// time has moved forward, order cannot be executed (due to maxAge) and is cancellable
					ffDelta = executionExpiredDelay - ffDelta;
					await fastForward(ffDelta);

					await assert.revert(
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader2 }),
						'order too old, use cancel'
					);

					//  is cancellable
					await checkCancellation(trader2);
				});
			});

			describe('an order that would revert on execution can be cancelled', () => {
				beforeEach(async () => {
					// remove minumun delay
					await perpsV2MarketSettings.setOffchainDelayedOrderMinAge(marketKey, 0, { from: owner });
					// go to next round
					await setOnchainPrice(baseAsset, price);
					// withdraw margin (will cause order to fail)
					await perpsV2Market.withdrawAllMargin({ from: trader });
					const updateFeedData = await getFeedUpdateData({
						id: defaultFeedId,
						price: feedBaseFromUNIT(offChainPrice),
						conf: feedBaseFromUNIT(confidence),
					});
					// check execution would fail
					await assert.revert(
						perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
						'Insufficient margin'
					);
				});

				it('by account owner', async () => {
					await fastForward(offchainDelayedOrderMaxAge * 2);
					await checkCancellation(trader);
				});

				it('by non-account owner', async () => {
					await fastForward(offchainDelayedOrderMaxAge * 2);
					// now cancel
					await checkCancellation(trader2);
				});
			});
		});
	});

	describe('executeOffchainDelayedOrder()', () => {
		it('cannot execute when there is no order', async () => {
			const updateFeedData = await getFeedUpdateData({
				id: defaultFeedId,
				price: feedBaseFromUNIT(offChainPrice),
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
			let keeperFee, updateFeedData;

			beforeEach(async () => {
				// keeperFee is the minimum keeperFee for the system
				keeperFee = await perpsV2MarketSettings.minKeeperFee();
			});

			async function submitOffchainOrderAndDelay(delay, feedTimeOffset = 0) {
				await setOffchainPrice(trader, {
					id: defaultFeedId,
					price: feedBaseFromUNIT(offChainPrice),
					conf: feedBaseFromUNIT(confidence),
					publishTime: (await currentTime()) + feedTimeOffset,
				});

				await perpsV2Market.submitOffchainDelayedOrder(size, desiredFillPrice, { from: trader });

				await fastForward(delay);

				updateFeedData = await getFeedUpdateData({
					id: defaultFeedId,
					price: feedBaseFromUNIT(offChainPrice),
					conf: feedBaseFromUNIT(confidence),
					publishTime: await currentTime(),
				});
			}

			describe('execution reverts', () => {
				describe('if min age was not reached', () => {
					beforeEach('submitOrder and prepare updateFeedData', async () => {
						// keeperFee is the minimum keeperFee for the system
						keeperFee = await perpsV2MarketSettings.minKeeperFee();

						await submitOffchainOrderAndDelay(offchainDelayedOrderMinAge - 10);
					});

					it('reverts for owner', async () => {
						// account owner
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'executability not reached'
						);
					});
					it('reverts for keeper', async () => {
						// keeper
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
								from: trader2,
							}),
							'executability not reached'
						);
					});
				});

				describe('if max age was exceeded for order', () => {
					beforeEach('submitOrder and prepare updateFeedData', async () => {
						// keeperFee is the minimum keeperFee for the system
						keeperFee = await perpsV2MarketSettings.minKeeperFee();

						await submitOffchainOrderAndDelay(offchainDelayedOrderMaxAge + 2);
					});

					it('reverts for owner', async () => {
						// account owner
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'order too old, use cancel'
						);
					});
					it('reverts for keeper', async () => {
						// keeper
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
								from: trader2,
							}),
							'order too old, use cancel'
						);
					});
				});

				describe('if max age was exceeded for price', () => {
					beforeEach('submitOrder and prepare updateFeedData', async () => {
						// keeperFee is the minimum keeperFee for the system
						keeperFee = await perpsV2MarketSettings.minKeeperFee();

						await submitOffchainOrderAndDelay(offchainDelayedOrderMaxAge - 1);

						updateFeedData = await getFeedUpdateData({
							id: defaultFeedId,
							price: feedBaseFromUNIT(offChainPrice),
							conf: feedBaseFromUNIT(confidence),
							publishTime: (await currentTime()) - offchainDelayedOrderMaxAge,
						});
					});

					it('reverts for owner', async () => {
						// account owner
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'no price available which is recent enough'
						);
					});
					it('reverts for keeper', async () => {
						// keeper
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
								from: trader2,
							}),
							'no price available which is recent enough'
						);
					});
				});

				describe('orders on time', () => {
					beforeEach('submitOrder and prepare updateFeedData', async () => {
						// keeperFee is the minimum keeperFee for the system
						keeperFee = await perpsV2MarketSettings.minKeeperFee();

						await submitOffchainOrderAndDelay(offchainDelayedOrderMinAge + 1);
					});

					it('if margin removed', async () => {
						// withdraw margin (will cause order to fail)
						await perpsV2Market.withdrawAllMargin({ from: trader });

						// account owner
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'Insufficient margin'
						);
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
								from: trader2,
							}),
							'Insufficient margin'
						);
					});

					it('if price too high', async () => {
						// set price too high
						await setOnchainPrice(baseAsset, offChainPrice.mul(toBN(5)));

						updateFeedData = await getFeedUpdateData({
							id: defaultFeedId,
							price: feedBaseFromUNIT(offChainPrice.mul(toBN(5))),
							conf: feedBaseFromUNIT(confidence),
						});

						// account owner
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'Max leverage exceeded'
						);
						// keeper
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
								from: trader2,
							}),
							'Max leverage exceeded'
						);
					});
				});

				describe('if off-chain price is zero', () => {
					beforeEach('submitOrder and prepare updateFeedData', async () => {
						// keeperFee is the minimum keeperFee for the system
						keeperFee = await perpsV2MarketSettings.minKeeperFee();

						await setOnchainPrice(baseAsset, price);

						await submitOffchainOrderAndDelay(offchainDelayedOrderMinAge + 1);

						updateFeedData = await getFeedUpdateData({
							id: defaultFeedId,
							price: feedBaseFromUNIT(0),
							conf: feedBaseFromUNIT(confidence),
							publishTime: await currentTime(),
						});
					});

					it('reverts', async () => {
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'invalid, price is 0'
						);
					});
				});

				describe('off-chain is a lot higher than diverts', () => {
					beforeEach('submitOrder and prepare updateFeedData', async () => {
						// keeperFee is the minimum keeperFee for the system
						keeperFee = await perpsV2MarketSettings.minKeeperFee();

						await setOnchainPrice(baseAsset, price);

						await submitOffchainOrderAndDelay(offchainDelayedOrderMinAge + 1);

						updateFeedData = await getFeedUpdateData({
							id: defaultFeedId,
							price: feedBaseFromUNIT(price.mul(toBN(2))),
							conf: feedBaseFromUNIT(confidence),
							publishTime: await currentTime(),
						});
					});

					it('reverts', async () => {
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'price divergence too high'
						);
					});
				});

				describe('on-chain is a lot higher than diverts', () => {
					beforeEach('submitOrder and prepare updateFeedData', async () => {
						// keeperFee is the minimum keeperFee for the system
						keeperFee = await perpsV2MarketSettings.minKeeperFee();

						await setOnchainPrice(baseAsset, price.mul(toBN(2)));

						await submitOffchainOrderAndDelay(offchainDelayedOrderMinAge + 1);

						updateFeedData = await getFeedUpdateData({
							id: defaultFeedId,
							price: feedBaseFromUNIT(price),
							conf: feedBaseFromUNIT(confidence),
							publishTime: await currentTime(),
						});
					});

					it('reverts', async () => {
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'price divergence too high'
						);
					});
				});

				describe('if off-chain virtual market is paused', () => {
					beforeEach('submitOrder and prepare updateFeedData', async () => {
						const ocMarketKet = await perpsV2MarketSettings.offchainMarketKey(marketKey);
						keeperFee = await perpsV2MarketSettings.minKeeperFee();

						await setOnchainPrice(baseAsset, price);
						await submitOffchainOrderAndDelay(offchainDelayedOrderMinAge + 1);

						updateFeedData = await getFeedUpdateData({
							id: defaultFeedId,
							price: feedBaseFromUNIT(price),
							conf: feedBaseFromUNIT(confidence),
							publishTime: await currentTime(),
						});

						// pause the market
						await systemStatus.suspendFuturesMarket(ocMarketKet, '0', { from: owner });
					});

					it('reverts', async () => {
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'Market suspended'
						);
					});
				});
			});

			// helper function to check execution and its results
			// from: which account is requesting the execution
			// currentOffchainPrice: current price of the asset (informed by offchain oracle)
			// targetPrice: the price that the order should be executed at
			// feeRate: expected exchange fee rate
			// tradeDetails: trade details of the same trade if it were to execute
			async function checkExecution(
				from,
				currentOffchainPrice,
				targetPrice,
				feeRate,
				tradeDetails,
				updateFeedData,
				preSkew = toBN(0)
			) {
				const roundId = await exchangeRates.getCurrentRoundId(baseAsset);

				const currentMargin = toBN((await perpsV2Market.positions(trader)).margin);
				// execute the order
				const tx = await perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
					from: from,
				});

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
					contracts: [
						mockPyth,
						sUSD,
						perpsV2Market,
						perpsV2MarketDelayedExecution,
						perpsV2MarketDelayedIntent,
					],
				});

				let expectedRefund = toUnit('0');
				if (from === trader) {
					// trader gets refunded keeperFee
					expectedRefund = expectedRefund.add(keeperFee);
					// no event for keeper payment
					console.log(decodedLogs.map(({ name }) => name));
					assert.deepEqual(
						decodedLogs.map(({ name }) => name),
						[
							'PriceFeedUpdate',
							'BatchPriceFeedUpdate',
							'UpdatePriceFeeds',
							'FundingRecomputed',
							'PositionModified',
							'Issued',
							'PositionModified',
							'DelayedOrderRemoved',
						]
					);
					// funding, position(refund), issued (exchange fee), position(trade), order removed
				} else {
					// keeper gets paid
					assert.equal(decodedLogs.length, 8);
					assert.deepEqual(
						decodedLogs.map(({ name }) => name),
						[
							'PriceFeedUpdate',
							'BatchPriceFeedUpdate',
							'UpdatePriceFeeds',
							'Issued',
							'FundingRecomputed',
							'Issued',
							'PositionModified',
							'DelayedOrderRemoved',
						]
					);
					decodedEventEqual({
						event: 'Issued',
						emittedFrom: sUSD.address,
						args: [from, keeperFee],
						log: decodedLogs[3],
					});
				}

				// trader was refunded correctly
				let expectedMargin = currentMargin.add(expectedRefund);

				if (from === trader) {
					decodedEventEqual({
						event: 'PositionModified',
						emittedFrom: perpsV2Market.address,
						args: [
							toBN('1'),
							trader,
							expectedMargin,
							0,
							0,
							currentOffchainPrice,
							toBN(2),
							0,
							preSkew,
						],
						log: decodedLogs.slice(-4, -3)[0],
					});
				}

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
					args: [
						toBN('1'),
						trader,
						expectedMargin,
						size,
						size,
						targetPrice,
						toBN(2),
						expectedFee,
						preSkew.add(size),
					],
					log: decodedLogs.slice(-2, -1)[0],
				});

				decodedEventEqual({
					event: 'DelayedOrderRemoved',
					emittedFrom: perpsV2Market.address,
					args: [trader, true, roundId, size, roundId.add(toBN(1)), toUnit('0'), keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await perpsV2Market.transferMargin(margin, { from: trader });
				// and can submit new order
				await perpsV2Market.submitOffchainDelayedOrder(size, desiredFillPrice, { from: trader });
				const newOrder = await perpsV2MarketState.delayedOrders(trader);
				assert.bnEqual(newOrder.sizeDelta, size);
			}

			describe('execution results in correct views and events', () => {
				let targetPrice, targetOffchainPrice, fillPrice, tradeDetails, updateFeedData;

				beforeEach(async () => {
					await perpsV2Market.submitOffchainDelayedOrder(size, desiredFillPrice, { from: trader });

					await fastForward(offchainDelayedOrderMinAge + 1);

					targetPrice = multiplyDecimal(price, toUnit(0.9));
					targetOffchainPrice = multiplyDecimal(offChainPrice, toUnit(0.9));

					updateFeedData = await getFeedUpdateData({
						id: defaultFeedId,
						price: feedBaseFromUNIT(targetOffchainPrice),
						conf: feedBaseFromUNIT(confidence),
					});
				});

				describe('during target round', () => {
					describe('taker trade', () => {
						beforeEach(async () => {
							// go to next round
							// Get tradeDetails with offchain price and back to original price
							await setOnchainPrice(baseAsset, targetOffchainPrice);
							tradeDetails = await perpsV2Market.postTradeDetails(
								size,
								toUnit('0'),
								orderType,
								trader
							);
							await setOnchainPrice(baseAsset, targetPrice);

							// note we need to calc the fillPrice _before_ executing the order because the p/d applied is based
							// on the skew at the time of trade. if we ran this _after_ then the premium would be lower as the
							// size delta as a % is lower post execution.
							//
							// e.g. 20 / 100 > 20 / 120
							//
							// also, we set it here because this is when both onchain and offchain prices are set. we do _not_
							// set the commitFee here because commitFee was _before_ the submit and price update.
							fillPrice = (
								await perpsV2MarketHelper.fillPriceWithMeta(
									size,
									priceImpactDelta,
									targetOffchainPrice
								)
							)[0];
						});

						it('from account owner', async () => {
							await checkExecution(
								trader,
								fillPrice,
								fillPrice,
								takerFeeOffchainDelayedOrder,
								tradeDetails,
								updateFeedData
							);
						});

						it('from keeper', async () => {
							await checkExecution(
								trader2,
								fillPrice,
								fillPrice,
								takerFeeOffchainDelayedOrder,
								tradeDetails,
								updateFeedData
							);
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
							// Get tradeDetails with offchain price and back to original price
							await setOnchainPrice(baseAsset, targetOffchainPrice);
							tradeDetails = await perpsV2Market.postTradeDetails(
								size,
								toUnit('0'),
								orderType,
								trader
							);
							await setOnchainPrice(baseAsset, targetPrice);

							fillPrice = (
								await perpsV2MarketHelper.fillPriceWithMeta(
									size,
									priceImpactDelta,
									targetOffchainPrice
								)
							)[0];
						});

						it('from account owner', async () => {
							await checkExecution(
								trader,
								fillPrice,
								fillPrice,
								makerFeeOffchainDelayedOrder,
								tradeDetails,
								updateFeedData,
								size.mul(toBN(-2))
							);
						});

						it('from keeper', async () => {
							await checkExecution(
								trader2,
								fillPrice,
								fillPrice,
								makerFeeOffchainDelayedOrder,
								tradeDetails,
								updateFeedData,
								size.mul(toBN(-2))
							);
						});
					});

					it('reverts if perpsV2 markets are suspended', async () => {
						await setOnchainPrice(baseAsset, targetPrice);
						await systemStatus.suspendFutures(toUnit(0), { from: owner });
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'Futures markets are suspended'
						);
					});

					it('reverts if market is suspended', async () => {
						await setOnchainPrice(baseAsset, targetPrice);
						await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
						await assert.revert(
							perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], { from: trader }),
							'Market suspended'
						);
					});
				});
			});
		});
	});

	describe('when pyth fee is > 0', () => {
		let updateFeedData, userBalanceBefore, pythBalanceBefore, perpsBalanceBefore;

		beforeEach('set pyth fee and an order', async () => {
			// set fee to pythFee
			await mockPyth.mockUpdateFee(pythFee, { from: owner });

			// create an order
			await setOffchainPrice(trader, {
				id: defaultFeedId,
				price: feedBaseFromUNIT(offChainPrice),
				conf: feedBaseFromUNIT(confidence),
				publishTime: await currentTime(),
			});

			await perpsV2Market.submitOffchainDelayedOrder(size, desiredFillPrice, { from: trader });

			await fastForward(offchainDelayedOrderMinAge + 1);

			updateFeedData = await getFeedUpdateData({
				id: defaultFeedId,
				price: feedBaseFromUNIT(offChainPrice),
				conf: feedBaseFromUNIT(confidence),
				publishTime: await currentTime(),
			});

			userBalanceBefore = await ethers.provider.getBalance(trader);
			pythBalanceBefore = await ethers.provider.getBalance(mockPyth.address);
			perpsBalanceBefore = await ethers.provider.getBalance(perpsV2ExchangeRate.address);
		});

		async function checkBalances(delta, gasUsed, reverted) {
			const userBalanceAfter = await ethers.provider.getBalance(trader);
			const pythBalanceAfter = await ethers.provider.getBalance(mockPyth.address);
			const perpsBalanceAfter = await ethers.provider.getBalance(perpsV2ExchangeRate.address);

			if (!reverted) {
				assert.bnEqual(userBalanceAfter, userBalanceBefore.sub(delta).sub(gasUsed));
			}
			assert.bnEqual(pythBalanceAfter, pythBalanceBefore.add(delta));
			assert.bnEqual(perpsBalanceAfter, perpsBalanceBefore);
		}

		describe('when executing with 0 value sent', () => {
			it('reverts and does not change balances', async () => {
				await assert.revert(
					perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
						from: trader,
					}),
					'Not enough eth for paying the fee'
				);

				await checkBalances(0, 0, true);
			});
		});

		describe('when executing without enough value sent', () => {
			it('reverts and does not change balances', async () => {
				await assert.revert(
					perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
						from: trader,
						value: 1,
					}),
					'Not enough eth for paying the fee'
				);

				await checkBalances(0, 0, true);
			});
		});

		describe('when executing with exact value sent', () => {
			it('executes the order and change balances as expected', async () => {
				const tx = await perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
					from: trader,
					value: pythFee,
				});

				const weiUsedInTx = tx.receipt.effectiveGasPrice * tx.receipt.gasUsed;

				await checkBalances(pythFee, weiUsedInTx, false);
			});
		});

		describe('when executing with more value than required sent', () => {
			it('executes the order and change balances as expected', async () => {
				const tx = await perpsV2Market.executeOffchainDelayedOrder(trader, [updateFeedData], {
					from: trader,
					value: pythFee * 2,
				});

				const weiUsedInTx = tx.receipt.effectiveGasPrice * tx.receipt.gasUsed;

				await checkBalances(pythFee, weiUsedInTx, false);
			});
		});
	});

	describe('when dynamic fee is enabled', () => {
		beforeEach(async () => {
			const dynamicFeeRounds = 4;
			// set multiple past rounds
			for (let i = 0; i < dynamicFeeRounds; i++) {
				await setOnchainPrice(baseAsset, initialPrice);
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
				await perpsV2Market.submitOffchainDelayedOrder(size, desiredFillPrice, { from: trader });

				// spike the price
				await setOnchainPrice(baseAsset, spikedPrice);
			});

			it('canceling an order works', async () => {
				await fastForward(offchainDelayedOrderMaxAge * 2);
				await perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader });
			});

			it('submitting an order reverts', async () => {
				// cancel existing
				await fastForward(offchainDelayedOrderMaxAge * 2);
				await perpsV2Market.cancelOffchainDelayedOrder(trader, { from: trader });

				await assert.revert(
					perpsV2Market.submitOffchainDelayedOrder(size, desiredFillPrice, { from: trader }),
					'Price too volatile'
				);
			});
		});
	});
});
