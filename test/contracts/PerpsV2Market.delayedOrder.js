const { artifacts, contract, web3, ethers } = require('hardhat');
const { toBytes32 } = require('../..');
const { toUnit, multiplyDecimal, divideDecimal, fastForward } = require('../utils')();
const { toBN } = web3.utils;

const PerpsV2MarketHelper = artifacts.require('TestablePerpsV2Market');
const PerpsV2Market = artifacts.require('TestablePerpsV2MarketEmpty');

const { setupAllContracts } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { getDecodedLogs, decodedEventEqual, updateAggregatorRates } = require('./helpers');

contract('PerpsV2Market PerpsV2MarketDelayedOrders', accounts => {
	let perpsV2MarketSettings,
		perpsV2Market,
		perpsV2MarketHelper,
		perpsV2MarketDelayedIntent,
		perpsV2MarketDelayedExecution,
		perpsV2MarketState,
		exchangeRates,
		circuitBreaker,
		sUSD,
		systemSettings,
		systemStatus;

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

	const fastForwardAndExecute = async account => {
		await fastForward(minDelayTimeDelta + 1); // ff min + 1s buffer.
		await perpsV2Market.executeDelayedOrder(account, { from: account });
		return perpsV2Market.positions(account);
	};

	const submitAndFastForwardAndExecute = async (sizeDelta, desiredFillPrice, account) => {
		await perpsV2Market.submitDelayedOrder(sizeDelta, desiredTimeDelta, desiredFillPrice, {
			from: account,
		});
		return fastForwardAndExecute(account);
	};

	before(async () => {
		({
			PerpsV2MarketSettings: perpsV2MarketSettings,
			ProxyPerpsV2MarketBTC: perpsV2Market,
			PerpsV2MarketDelayedIntentBTC: perpsV2MarketDelayedIntent,
			PerpsV2MarketDelayedExecutionBTC: perpsV2MarketDelayedExecution,
			PerpsV2MarketStateBTC: perpsV2MarketState,
			TestablePerpsV2MarketBTC: perpsV2MarketHelper,
			ExchangeRates: exchangeRates,
			CircuitBreaker: circuitBreaker,
			SynthsUSD: sUSD,
			SystemSettings: systemSettings,
			SystemStatus: systemStatus,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sBTC', 'sETH'],
			contracts: [
				'PerpsV2MarketSettings',
				{ contract: 'PerpsV2MarketStateBTC', properties: { perpSuffix: marketKeySuffix } },
				'PerpsV2MarketBTC',
				'TestablePerpsV2MarketBTC',
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

	let margin,
		size,
		price,
		fillPrice,
		desiredFillPrice,
		desiredTimeDelta,
		minDelayTimeDelta,
		confirmTimeWindow;

	beforeEach(async () => {
		// prepare basic order parameters
		margin = toUnit('2000');
		await perpsV2Market.transferMargin(margin, { from: trader });
		size = toUnit('50');
		price = toUnit('200');
		desiredTimeDelta = 60;
		minDelayTimeDelta = 60;
		confirmTimeWindow = 30;
		await setPrice(baseAsset, price);
		const fillPriceWithMeta = await perpsV2MarketHelper.fillPriceWithMeta(
			size,
			priceImpactDelta,
			0
		);
		fillPrice = fillPriceWithMeta[0];
		desiredFillPrice = fillPriceWithMeta[1];
	});

	describe('submitDelayedOrder()', () => {
		it('submitting an order results in correct views and events', async () => {
			// setup
			const roundId = await exchangeRates.getCurrentRoundId(baseAsset);
			const keeperFee = await perpsV2MarketSettings.minKeeperFee();
			const tx = await perpsV2Market.submitDelayedOrder(size, desiredTimeDelta, desiredFillPrice, {
				from: trader,
			});
			const txBlock = await ethers.provider.getBlock(tx.receipt.blockNumber);

			const order = await perpsV2MarketState.delayedOrders(trader);
			assert.bnEqual(order.sizeDelta, size);
			assert.bnEqual(order.targetRoundId, roundId.add(toBN(1)));
			assert.bnEqual(order.commitDeposit, 0);
			assert.bnEqual(order.keeperDeposit, keeperFee);
			assert.bnEqual(order.executableAtTime, txBlock.timestamp + desiredTimeDelta);

			// check margin
			const position = await perpsV2Market.positions(trader);
			const expectedMargin = margin.sub(keeperFee);
			assert.bnEqual(position.margin, expectedMargin);

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [perpsV2Market, perpsV2MarketDelayedIntent, perpsV2MarketDelayedExecution],
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
				args: [
					trader,
					false,
					size,
					roundId.add(toBN(1)),
					txBlock.timestamp,
					order.executableAtTime,
					0,
					keeperFee,
				],
				log: decodedLogs[2],
			});
		});

		it('set desiredTimeDelta to minDelayTimeDelta when delta is 0', async () => {
			// setup
			const tx = await perpsV2Market.submitDelayedOrder(size, 0, desiredFillPrice, {
				from: trader,
			});
			const txBlock = await ethers.provider.getBlock(tx.receipt.blockNumber);

			const order = await perpsV2MarketState.delayedOrders(trader);
			assert.bnEqual(order.executableAtTime, txBlock.timestamp + minDelayTimeDelta);
		});

		describe('modifying while with degen leverage', () => {
			let maxLeverage, price, skewScale;

			beforeEach(async () => {
				skewScale = toUnit('1000000'); // 1M
				await perpsV2MarketSettings.setSkewScale(marketKey, skewScale, { from: owner });
				maxLeverage = toUnit('25'); // 25x
				await perpsV2MarketSettings.setMaxLeverage(marketKey, maxLeverage, { from: owner });
				price = toUnit('1000');
				await setPrice(baseAsset, price);
				const fillPriceWithMeta = await perpsV2MarketHelper.fillPriceWithMeta(
					size,
					priceImpactDelta,
					0
				);
				fillPrice = fillPriceWithMeta[0];
				desiredFillPrice = fillPriceWithMeta[1];
			});

			it('should allow submit for close when above maxLeverage but not liquidated', async () => {
				// Submit an order with a high degen leverage (say, 24x).
				//
				// Note: `trader` has 2k margin, at 24x, 1k per unit is a size 48
				const leverage = toUnit('24');
				const sizeDelta = divideDecimal(multiplyDecimal(leverage, margin), price);
				const position = await submitAndFastForwardAndExecute(sizeDelta, desiredFillPrice, trader);

				// Price moves in the opposite direction -0.5% (50bps) - now above maxLeverage
				const newPrice = multiplyDecimal(price, toUnit('0.995'));
				await setPrice(baseAsset, newPrice);
				assert.bnGt((await perpsV2MarketHelper.currentLeverage(trader))[0], maxLeverage);

				// Attempt to close the position - should not revert if above maxLeverage
				const closeSizeDelta = multiplyDecimal(position.size, toUnit('-1')); // Inverted to close.
				const newDesiredFillPrice = (
					await perpsV2MarketHelper.fillPriceWithMeta(closeSizeDelta, priceImpactDelta, 0)
				)[1];
				const closedPosition = await submitAndFastForwardAndExecute(
					closeSizeDelta,
					newDesiredFillPrice,
					trader
				);

				// Successfully closed position.
				assert.bnEqual(closedPosition.size, toUnit('0'));
			});

			it('should allow submit for close when below maxLeverage and not liquidated', async () => {
				const leverage = toUnit('24');
				const sizeDelta = divideDecimal(multiplyDecimal(leverage, margin), price);
				const position = await submitAndFastForwardAndExecute(sizeDelta, desiredFillPrice, trader);

				const newPrice = multiplyDecimal(price, toUnit('1.03'));
				await setPrice(baseAsset, newPrice);
				assert.bnLt((await perpsV2MarketHelper.currentLeverage(trader))[0], maxLeverage);

				// Attempt to close the position - should not revert if above maxLeverage
				const closeSizeDelta = multiplyDecimal(position.size, toUnit('-1')); // Inverted to close.
				const newDesiredFillPrice = (
					await perpsV2MarketHelper.fillPriceWithMeta(closeSizeDelta, priceImpactDelta, 0)
				)[1];
				const closedPosition = await submitAndFastForwardAndExecute(
					closeSizeDelta,
					newDesiredFillPrice,
					trader
				);

				// Successfully closed position.
				assert.bnEqual(closedPosition.size, toUnit('0'));
			});

			it('should not allow submit when position can be liquidated', async () => {
				const leverage = toUnit('24');
				const sizeDelta = divideDecimal(multiplyDecimal(leverage, margin), price);
				const position = await submitAndFastForwardAndExecute(sizeDelta, desiredFillPrice, trader);

				// -10% loss
				const newPrice = multiplyDecimal(price, toUnit('0.9'));
				await setPrice(baseAsset, newPrice);
				assert.bnLt((await perpsV2MarketHelper.currentLeverage(trader))[0], maxLeverage);
				assert.isTrue(await perpsV2Market.canLiquidate(trader));

				// Attempt to close the position - must revert due to `canLiquidate`.
				const closeSizeDelta = multiplyDecimal(position.size, toUnit('-1')); // Inverted to close.
				await fastForward(minDelayTimeDelta + 1); // ff min + 1s buffer.

				await assert.revert(
					perpsV2Market.submitDelayedOrder(closeSizeDelta, desiredTimeDelta, desiredFillPrice, {
						from: trader,
					}),
					'Position can be liquidated'
				);
			});

			it('should not allow submit for close when newPos is still above maxLeverage', async () => {
				const leverage = toUnit('24');
				const sizeDelta = divideDecimal(multiplyDecimal(leverage, margin), price);
				const position = await submitAndFastForwardAndExecute(sizeDelta, desiredFillPrice, trader);

				// Price moves in the opposite direction -0.5% (50bps) - now above maxLeverage
				await setPrice(baseAsset, multiplyDecimal(price, toUnit('0.995')));
				assert.bnGt((await perpsV2MarketHelper.currentLeverage(trader))[0], maxLeverage);

				// Attempt to decrease the position but stay above maxLev
				const closeSizeDelta = multiplyDecimal(position.size, toUnit('-0.01'));
				await fastForward(minDelayTimeDelta + 1); // ff min + 1s buffer.

				await assert.revert(
					perpsV2Market.submitDelayedOrder(closeSizeDelta, desiredTimeDelta, desiredFillPrice, {
						from: trader,
					}),
					'Max leverage exceeded'
				);
			});

			it('should not allow submit for modification when newPos is above maxLeverage', async () => {
				const leverage = toUnit('24');
				const sizeDelta = divideDecimal(multiplyDecimal(leverage, margin), price);
				const position = await submitAndFastForwardAndExecute(sizeDelta, desiredFillPrice, trader);

				// Price moves in the opposite direction -0.5% (50bps) - now above maxLeverage
				await setPrice(baseAsset, multiplyDecimal(price, toUnit('0.995')));
				assert.bnGt((await perpsV2MarketHelper.currentLeverage(trader))[0], maxLeverage);

				// Increase position above pushing further above maxLeverage.
				const closeSizeDelta = multiplyDecimal(position.size, toUnit('0.05'));
				await fastForward(minDelayTimeDelta + 1); // ff min + 1s buffer.

				await assert.revert(
					perpsV2Market.submitDelayedOrder(closeSizeDelta, desiredTimeDelta, desiredFillPrice, {
						from: trader,
					}),
					'Max leverage exceeded'
				);
			});

			it('should allow submit for close when newPos is now below maxLeverage', async () => {
				const leverage = toUnit('24');
				const sizeDelta = divideDecimal(multiplyDecimal(leverage, margin), price);
				const position = await submitAndFastForwardAndExecute(sizeDelta, desiredFillPrice, trader);

				// Price moves in the opposite direction -0.5% (50bps) - now above maxLeverage
				const newPrice = multiplyDecimal(price, toUnit('0.995'));
				await setPrice(baseAsset, newPrice);
				assert.bnGt((await perpsV2MarketHelper.currentLeverage(trader))[0], maxLeverage);

				// Attempt to decrease the position but below maxLev.
				const closeSizeDelta = multiplyDecimal(position.size, toUnit('-0.25'));
				const newDesiredFillPrice = (
					await perpsV2MarketHelper.fillPriceWithMeta(closeSizeDelta, priceImpactDelta, 0)
				)[1];
				const closedPosition = await submitAndFastForwardAndExecute(
					closeSizeDelta,
					newDesiredFillPrice,
					trader
				);

				// Successfully closed position.
				assert.bnEqual(closedPosition.size, multiplyDecimal(position.size, toUnit('0.75')));
			});
		});

		describe('cannot submit an order when', () => {
			it('zero size', async () => {
				await assert.revert(
					perpsV2Market.submitDelayedOrder(0, desiredTimeDelta, desiredFillPrice, { from: trader }),
					'Cannot submit empty order'
				);
			});

			it('not enough margin', async () => {
				await perpsV2Market.withdrawAllMargin({ from: trader });
				await assert.revert(
					perpsV2Market.submitDelayedOrder(size, desiredTimeDelta, desiredFillPrice, {
						from: trader,
					}),
					'Insufficient margin'
				);
			});

			it('too much leverage', async () => {
				await assert.revert(
					perpsV2Market.submitDelayedOrder(size.mul(toBN(10)), desiredTimeDelta, desiredFillPrice, {
						from: trader,
					}),
					'Max leverage exceeded'
				);
			});

			it('previous order exists', async () => {
				await perpsV2Market.submitDelayedOrder(size, desiredTimeDelta, desiredFillPrice, {
					from: trader,
				});
				await assert.revert(
					perpsV2Market.submitDelayedOrder(size, desiredTimeDelta, desiredFillPrice, {
						from: trader,
					}),
					'previous order exists'
				);
			});

			it('if perps markets are suspended', async () => {
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.submitDelayedOrder(size, desiredTimeDelta, desiredFillPrice, {
						from: trader,
					}),
					'Futures markets are suspended'
				);
			});

			it('if market is suspended', async () => {
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await assert.revert(
					perpsV2Market.submitDelayedOrder(size, desiredTimeDelta, desiredFillPrice, {
						from: trader,
					}),
					'Market suspended'
				);
			});

			it('if desiredTimeDelta is below the minimum delay or negative', async () => {
				await assert.revert(
					perpsV2Market.submitDelayedOrder(0, 1, desiredFillPrice, { from: trader }),
					'delay out of bounds'
				);
				try {
					await perpsV2Market.submitDelayedOrder(0, -1, desiredFillPrice, { from: trader });
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
					perpsV2Market.submitDelayedOrder(0, 1000000, desiredFillPrice, { from: trader }),
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
			const keeperFee = await perpsV2MarketSettings.minKeeperFee();

			const tx = await perpsV2Market.submitDelayedOrderWithTracking(
				size,
				desiredTimeDelta,
				desiredFillPrice,
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
			assert.bnEqual(order.commitDeposit, 0);
			assert.bnEqual(order.keeperDeposit, keeperFee);
			assert.bnEqual(order.executableAtTime, txBlock.timestamp + desiredTimeDelta);
			assert.bnEqual(order.trackingCode, trackingCode);

			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, perpsV2Market, perpsV2MarketDelayedIntent],
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
					0,
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
				desiredTimeDelta,
				desiredFillPrice,
				trackingCode,
				{
					from: trader,
				}
			);

			// go to next round
			await setPrice(baseAsset, price);
			const fillPrice = (await perpsV2MarketHelper.fillPriceWithMeta(size, priceImpactDelta, 0))[0];
			const expectedFee = multiplyDecimal(size, multiplyDecimal(fillPrice, takerFeeDelayedOrder));

			// execute the order
			const tx = await perpsV2Market.executeDelayedOrder(trader, { from: trader });

			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, perpsV2Market, perpsV2MarketDelayedIntent],
			});

			decodedEventEqual({
				event: 'PerpsTracking',
				emittedFrom: perpsV2Market.address,
				args: [trackingCode, baseAsset, marketKey, size, expectedFee],
				log: decodedLogs[3],
			});
		});
	});

	describe('submitCloseDelayedOrderWithTracking()', () => {
		const trackingCode = toBytes32('code');

		it('can successfully close a position', async () => {
			// Submit and successfully open a position.
			const openedPosition = await submitAndFastForwardAndExecute(size, desiredFillPrice, trader);
			assert.bnEqual(openedPosition.size, size);

			const closeSizeDelta = multiplyDecimal(size, toUnit('-1'));
			const newDesiredFillPrice = (
				await perpsV2MarketHelper.fillPriceWithMeta(closeSizeDelta, priceImpactDelta, 0)
			)[1];
			await perpsV2Market.submitCloseDelayedOrderWithTracking(
				desiredTimeDelta,
				newDesiredFillPrice,
				trackingCode,
				{ from: trader }
			);
			const closedPosition = await fastForwardAndExecute(trader);
			assert.bnEqual(closedPosition.size, 0);
		});

		it('cannot close when there is no position', async () => {
			await assert.revert(
				perpsV2Market.submitCloseDelayedOrderWithTracking(
					desiredTimeDelta,
					desiredFillPrice,
					trackingCode,
					{ from: trader }
				),
				'No position open'
			);
		});

		it('cannot close when canLiquidate', async () => {
			const skewScale = toUnit('1000000'); // 1M
			await perpsV2MarketSettings.setSkewScale(marketKey, skewScale, { from: owner });
			const maxLeverage = toUnit('25'); // 25x
			await perpsV2MarketSettings.setMaxLeverage(marketKey, maxLeverage, { from: owner });
			const price = toUnit('1000');
			await setPrice(baseAsset, price);

			const leverage = toUnit('24');
			const sizeDelta = divideDecimal(multiplyDecimal(leverage, margin), price);
			const openDesiredFillPrice = (
				await perpsV2MarketHelper.fillPriceWithMeta(sizeDelta, priceImpactDelta, 0)
			)[1];
			await submitAndFastForwardAndExecute(sizeDelta, openDesiredFillPrice, trader);

			// -10% loss
			const newPrice = multiplyDecimal(price, toUnit('0.9'));
			await setPrice(baseAsset, newPrice);
			assert.bnLt((await perpsV2MarketHelper.currentLeverage(trader))[0], maxLeverage);
			assert.isTrue(await perpsV2Market.canLiquidate(trader));

			await fastForward(minDelayTimeDelta + 1); // ff min + 1s buffer.

			const closeSizeDelta = multiplyDecimal(size, toUnit('-1'));
			const closeDesiredFillPrice = (
				await perpsV2MarketHelper.fillPriceWithMeta(closeSizeDelta, priceImpactDelta, 0)
			)[1];

			// Attempt to close the position - must revert due to `canLiquidate`.
			await assert.revert(
				perpsV2Market.submitCloseDelayedOrderWithTracking(
					desiredTimeDelta,
					closeDesiredFillPrice,
					trackingCode,
					{
						from: trader,
					}
				),
				'Position can be liquidated'
			);
		});

		it('cannot close when an order already exists', async () => {
			const sizeDelta = toUnit('1');

			// Submit and successfully open a position.
			await submitAndFastForwardAndExecute(sizeDelta, desiredFillPrice, trader);

			// Submit an order to modify position
			await perpsV2Market.submitDelayedOrder(sizeDelta, desiredTimeDelta, desiredFillPrice, {
				from: trader,
			});

			// An order already exists, cannot submit another.
			await assert.revert(
				perpsV2Market.submitCloseDelayedOrderWithTracking(
					desiredTimeDelta,
					desiredFillPrice,
					trackingCode,
					{ from: trader }
				),
				'previous order exists'
			);
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
			let roundId, keeperFee;

			// helper function to check cancellation tx effects
			async function checkCancellation(
				from,
				priceToVerify = price,
				desiredPriceToUse = desiredFillPrice,
				newSize = size
			) {
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
					contracts: [sUSD, perpsV2Market, perpsV2MarketDelayedIntent],
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
							priceToVerify,
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
					args: [trader, false, roundId, size, roundId.add(toBN(1)), 0, keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await perpsV2Market.transferMargin(margin, { from: trader });
				// and can submit new order
				await perpsV2Market.submitDelayedOrder(newSize, desiredTimeDelta, desiredPriceToUse, {
					from: trader,
				});
				const newOrder = await perpsV2MarketState.delayedOrders(trader);
				assert.bnEqual(newOrder.sizeDelta, newSize);
			}

			beforeEach(async () => {
				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				keeperFee = await perpsV2MarketSettings.minKeeperFee();
				await perpsV2Market.submitDelayedOrder(size, desiredTimeDelta, desiredFillPrice, {
					from: trader,
				});
			});

			it('cannot cancel if perps markets are suspended', async () => {
				// Fast-forward to allow for cancelling but revert because suspended.
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
				await fastForward(minDelayTimeDelta + confirmTimeWindow + 1); // ff min + confirm + 1s buffer.

				await assert.revert(
					perpsV2Market.cancelDelayedOrder(trader, { from: trader }),
					'Futures markets are suspended'
				);
			});

			it('cannot cancel if market is suspended', async () => {
				// Fast-forward to allow for cancelling but revert because suspended.
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
				await fastForward(minDelayTimeDelta + confirmTimeWindow + 1); // ff min + confirm + 1s buffer.

				await assert.revert(
					perpsV2Market.cancelDelayedOrder(trader, { from: trader }),
					'Market suspended'
				);
			});

			describe('account owner cannot cancel', () => {
				it('in same round', async () => {
					await assert.revert(
						perpsV2Market.cancelDelayedOrder(trader, { from: trader }),
						'cannot be cancelled by keeper yet'
					);
				});

				it('in target round', async () => {
					await setPrice(baseAsset, price);
					await assert.revert(
						perpsV2Market.cancelDelayedOrder(trader, { from: trader }),
						'cannot be cancelled by keeper yet'
					);
				});
			});

			describe('account owner can cancel', () => {
				it('after confirmation window', async () => {
					await setPrice(baseAsset, price);
					await setPrice(baseAsset, price);
					await setPrice(baseAsset, price);
					await setPrice(baseAsset, price);
					await checkCancellation(trader);
				});
			});

			describe('an order that would revert on execution can be cancelled', () => {
				let largePrice, largeDesiredPrice;
				beforeEach(async () => {
					largePrice = price.mul(toBN(10));
					largeDesiredPrice = (
						await perpsV2MarketHelper.fillPriceWithMeta(largePrice, priceImpactDelta, 0)
					)[1];
					// go to next round and update price to a price that will make it revert
					await setPrice(baseAsset, largePrice);
					// check execution would fail
					await assert.revert(
						perpsV2Market.executeDelayedOrder(trader, { from: trader }),
						'Max leverage exceeded'
					);
				});

				it('by account owner', async () => {
					await setPrice(baseAsset, largePrice);
					await setPrice(baseAsset, largePrice);
					await setPrice(baseAsset, largePrice);
					await setPrice(baseAsset, largePrice);
					// can only be cancellable after confirmation window
					await checkCancellation(trader, largePrice, largeDesiredPrice, size.div(toBN(10)));
				});

				it('by non-account owner, after confirmation window', async () => {
					await setPrice(baseAsset, largePrice);
					await setPrice(baseAsset, largePrice);
					await setPrice(baseAsset, largePrice);
					await setPrice(baseAsset, largePrice);
					// now cancel
					await checkCancellation(trader2, largePrice, largeDesiredPrice, size.div(toBN(10)));
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
					const executableAtTimeDelta = toBN(order.executableAtTime)
						.sub(toBN(timestamp))
						.toNumber();
					await fastForward(ffDelta); // fast-forward by 5 seconds
					await assert.revert(
						perpsV2Market.cancelDelayedOrder(trader, { from: trader2 }),
						'cannot be cancelled by keeper yet'
					);

					// time has moved forward, order is executable but cancellable
					await fastForward(executableAtTimeDelta - ffDelta + 1);
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
			let roundId, keeperFee;

			beforeEach(async () => {
				// the beginning of each test, `trader` submits a delayed order with `size`.
				//
				// the commitFee they pay is relative to the current skew and price. this means we want to track
				// their commitFee upfront now (as this is the fee refunded if they are also the keeper).

				roundId = await exchangeRates.getCurrentRoundId(baseAsset);
				// keeperFee is the minimum keeperFee for the system
				keeperFee = await perpsV2MarketSettings.minKeeperFee();

				await perpsV2Market.submitDelayedOrder(size, desiredTimeDelta, desiredFillPrice, {
					from: trader,
				});
			});

			describe('order and margin modifications', () => {
				let sizeDelta, desiredFillPrice, trackingCode;
				beforeEach('prepare variables', async () => {
					sizeDelta = toUnit('1');
					desiredFillPrice = toUnit('1');
					trackingCode = toBytes32('code');
				});

				it('prevents margin to be increased', async () => {
					const increaseMargin = margin; // increase the margin by same margin amount
					await assert.revert(
						perpsV2Market.transferMargin(increaseMargin, { from: trader }),
						'Pending order exists'
					);
				});

				it('prevents margin to be reduced', async () => {
					const reduceMargin = multiplyDecimal(margin, toUnit('-0.1')); // small fraction of margin to reduce
					await assert.revert(
						perpsV2Market.transferMargin(reduceMargin, { from: trader }),
						'Pending order exists'
					);
				});

				it('prevents margin to be removed', async () => {
					await assert.revert(
						perpsV2Market.withdrawAllMargin({ from: trader }),
						'Pending order exists'
					);
				});

				it('prevents position to be modified (spot)', async () => {
					await assert.revert(
						perpsV2Market.modifyPosition(sizeDelta, desiredFillPrice, { from: trader }),
						'Pending order exists'
					);
				});

				it('prevents position to be modified (spot with tracking)', async () => {
					await assert.revert(
						perpsV2Market.modifyPositionWithTracking(sizeDelta, desiredFillPrice, trackingCode, {
							from: trader,
						}),
						'Pending order exists'
					);
				});

				it('prevents position to be closed (spot)', async () => {
					await assert.revert(
						perpsV2Market.closePosition(desiredFillPrice, { from: trader }),
						'Pending order exists'
					);
				});

				it('prevents position to be closed (spot with tracking)', async () => {
					await assert.revert(
						perpsV2Market.closePositionWithTracking(desiredFillPrice, trackingCode, {
							from: trader,
						}),
						'Pending order exists'
					);
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
			async function checkExecution(from, targetPrice, feeRate, tradeDetails, preSkew = toBN(0)) {
				const currentMargin = toBN((await perpsV2Market.positions(trader)).margin);

				// note we need to calc the fillPrice _before_ executing the order because the p/d applied is based
				// on the skew at the time of trade. if we ran this _after_ then the premium would be lower as the
				// size delta as a % is lower post execution.
				//
				// e.g. 20 / 100 > 20 / 120
				const fillPrice = (
					await perpsV2MarketHelper.fillPriceWithMeta(size, priceImpactDelta, 0)
				)[0];

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
					contracts: [sUSD, perpsV2Market, perpsV2MarketDelayedIntent],
				});

				let expectedRefund = toUnit('0'); // $0 refund because we don't take a commitFee.
				if (from === trader) {
					// trader gets refunded keeperFee
					expectedRefund = expectedRefund.add(keeperFee);
					// no event for keeper payment
					assert.equal(decodedLogs.length, 5);
					assert.deepEqual(
						decodedLogs.map(({ name }) => name),
						[
							'FundingRecomputed',
							'PositionModified',
							'Issued',
							'PositionModified',
							'DelayedOrderRemoved',
						]
					);
				} else {
					// keeper gets paid
					assert.equal(decodedLogs.length, 5);
					assert.deepEqual(
						decodedLogs.map(({ name }) => name),
						['Issued', 'FundingRecomputed', 'Issued', 'PositionModified', 'DelayedOrderRemoved']
					);
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
				if (from === trader) {
					decodedEventEqual({
						event: 'PositionModified',
						emittedFrom: perpsV2Market.address,
						args: [toBN('1'), trader, expectedMargin, 0, 0, fillPrice, toBN(2), 0, preSkew],
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
					args: [trader, false, roundId, size, roundId.add(toBN(1)), toUnit('0'), keeperFee],
					log: decodedLogs.slice(-1)[0],
				});

				// transfer more margin
				await perpsV2Market.transferMargin(margin, { from: trader });
				// and can submit new order
				await perpsV2Market.submitDelayedOrder(size, desiredTimeDelta, desiredFillPrice, {
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
					const expectedPrice = (
						await perpsV2MarketHelper.fillPriceWithMeta(size, priceImpactDelta, 0)
					)[0];
					await checkExecution(trader, expectedPrice, takerFeeDelayedOrder, tradeDetails);
				});

				describe('during target round', () => {
					let targetFillPrice;

					describe('taker trade', () => {
						beforeEach(async () => {
							// go to next round
							await setPrice(baseAsset, targetPrice);
							targetFillPrice = (
								await perpsV2MarketHelper.fillPriceWithMeta(size, priceImpactDelta, 0)
							)[0];
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
							// skew the other way (trader3 has an open position of -1 size).
							await perpsV2Market.transferMargin(margin.mul(toBN(2)), { from: trader3 });
							const invertedSizeDelta = multiplyDecimal(size, toUnit('-2'));
							const desiredFillPrice = (
								await perpsV2MarketHelper.fillPriceWithMeta(invertedSizeDelta, priceImpactDelta, 0)
							)[1];
							await perpsV2Market.modifyPosition(invertedSizeDelta, desiredFillPrice, {
								from: trader3,
							});

							// go to next round (targetPrice is -10% of price).
							await setPrice(baseAsset, targetPrice);
							targetFillPrice = (
								await perpsV2MarketHelper.fillPriceWithMeta(size, priceImpactDelta, 0)
							)[0];
							tradeDetails = await perpsV2Market.postTradeDetails(
								size,
								toUnit('0'),
								orderType,
								trader
							);
						});

						it('from account owner', async () => {
							await checkExecution(
								trader,
								targetFillPrice,
								makerFeeDelayedOrder,
								tradeDetails,
								size.mul(toBN(-2))
							);
						});

						it('from keeper', async () => {
							await checkExecution(
								trader2,
								targetFillPrice,
								makerFeeDelayedOrder,
								tradeDetails,
								size.mul(toBN(-2))
							);
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
							targetFillPrice = (
								await perpsV2MarketHelper.fillPriceWithMeta(size, priceImpactDelta, 0)
							)[0];
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

							const invertedSizeDelta = multiplyDecimal(size, toUnit('-2'));
							const desiredFillPrice = (
								await perpsV2MarketHelper.fillPriceWithMeta(invertedSizeDelta, priceImpactDelta, 0)
							)[1];
							await perpsV2Market.modifyPosition(invertedSizeDelta, desiredFillPrice, {
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
							targetFillPrice = (
								await perpsV2MarketHelper.fillPriceWithMeta(size, priceImpactDelta, 0)
							)[0];
						});

						it('from account owner', async () => {
							await checkExecution(
								trader,
								targetFillPrice,
								makerFeeDelayedOrder,
								tradeDetails,
								size.mul(toBN(-2))
							);
						});

						it('from keeper', async () => {
							await checkExecution(
								trader2,
								targetFillPrice,
								makerFeeDelayedOrder,
								tradeDetails,
								size.mul(toBN(-2))
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
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });

				// submit an order
				await perpsV2Market.submitDelayedOrder(size, desiredTimeDelta, desiredFillPrice, {
					from: trader,
				});

				// spike the price
				await setPrice(baseAsset, spikedPrice);
			});

			it('cannot cancel an order', async () => {
				await assert.revert(
					perpsV2Market.cancelDelayedOrder(trader, { from: trader }),
					'cannot be cancelled by keeper yet'
				);
			});

			it('submitting an order reverts', async () => {
				// cancel existing
				await fastForward(minDelayTimeDelta + confirmTimeWindow + 1); // ff min + confirm + 1s buffer.
				await perpsV2Market.cancelDelayedOrder(trader, { from: trader });

				await assert.revert(
					perpsV2Market.submitDelayedOrder(size, desiredTimeDelta, desiredFillPrice, {
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
