const { contract, web3 } = require('hardhat');
const { toBytes32 } = require('../..');
const { toBN } = web3.utils;
const { toUnit, multiplyDecimal, divideDecimal } = require('../utils')();

const {
	setupAllContracts,
	constantsOverrides: { EXCHANGE_DYNAMIC_FEE_THRESHOLD },
} = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const {
	getDecodedLogs,
	decodedEventEqual,
	ensureOnlyExpectedMutativeFunctions,
	updateAggregatorRates,
} = require('./helpers');

contract('PerpsOrdersV2', accounts => {
	let perpsManager,
		// futuresMarketManager,
		perpsOrders,
		perpsEngine,
		// perpsStorage,
		exchangeRates,
		exchanger,
		circuitBreaker,
		// addressResolver,
		sUSD,
		systemSettings,
		systemStatus;

	const owner = accounts[1];
	const trader = accounts[2];
	const trader2 = accounts[3];
	const trader3 = accounts[4];
	const liquidator = accounts[5];
	const traderInitialBalance = toUnit('1000000');

	const marketKey = toBytes32('pBTC');
	const baseAsset = toBytes32('BTC');
	const baseFee = toUnit('0.003');
	const baseFeeNextPrice = toUnit('0.0005');
	const maxLeverage = toUnit('10');
	const maxSingleSideValueUSD = toUnit('100000');
	const maxFundingRate = toUnit('0.1');
	const skewScaleUSD = toUnit('100000');
	const initialPrice = toUnit('100');
	const minInitialMargin = toUnit('100');

	async function setPrice(asset, price, resetCircuitBreaker = true) {
		await updateAggregatorRates(
			exchangeRates,
			resetCircuitBreaker ? circuitBreaker : null,
			[asset],
			[price]
		);
	}

	async function transferAndModify({ account, fillPrice, marginDelta, sizeDelta }) {
		await perpsOrders.transferMargin(marketKey, marginDelta, { from: account });
		await setPrice(baseAsset, fillPrice);
		await perpsOrders.trade(marketKey, sizeDelta, { from: account });
	}

	before(async () => {
		({
			PerpsManagerV2: perpsManager,
			// FuturesMarketManager: futuresMarketManager,
			PerpsOrdersV2: perpsOrders,
			PerpsEngineV2: perpsEngine,
			// PerpsStorageV2: perpsStorage,
			ExchangeRates: exchangeRates,
			Exchanger: exchanger,
			CircuitBreaker: circuitBreaker,
			// AddressResolver: addressResolver,
			SynthsUSD: sUSD,
			SystemStatus: systemStatus,
			SystemSettings: systemSettings,
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
				'ExchangeRates',
				'ExchangeCircuitBreaker',
				'SystemStatus',
				'SystemSettings',
				'FeePool',
			],
		}));

		// Update the rate so that it is not invalid
		await setPrice(baseAsset, initialPrice);

		// disable dynamic fee for most tests
		// it will be enabled for specific tests
		await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });

		// tests assume 100, but in actual deployment is different
		await perpsManager.setMinInitialMargin(minInitialMargin, { from: owner });

		// Issue the trader some sUSD
		for (const t of [trader, trader2, trader3]) {
			await sUSD.issue(t, traderInitialBalance);
		}

		// allow owner to suspend system or synths
		await systemStatus.updateAccessControls(
			[toBytes32('System'), toBytes32('Synth')],
			[owner, owner],
			[true, true],
			[true, true],
			{ from: owner }
		);
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('Basic parameters', () => {
		it('only expected functions are mutative', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: perpsOrders.abi,
				ignoreParents: ['MixinResolver'],
				expected: [
					'transferMargin',
					'withdrawMaxMargin',
					'trade',
					'tradeWithTracking',
					'tradeAndTransfer',
					'transferAndTrade',
					'closeAndWithdraw',
					'closePosition',
					'closePositionWithTracking',
					'submitNextPriceOrder',
					'submitNextPriceOrderWithTracking',
					'cancelNextPriceOrder',
					'executeNextPriceOrder',
				],
			});
		});

		it('contract has CONTRACT_NAME getter', async () => {
			assert.equal(await perpsOrders.CONTRACT_NAME(), toBytes32('PerpsOrdersV2'));
		});

		it('static parameters are set properly after construction', async () => {
			const summary = await perpsOrders.marketSummary(marketKey);
			assert.equal(summary.baseAsset, baseAsset);
			assert.equal(summary.marketKey, marketKey);
			const parameters = await perpsManager.marketConfig(marketKey);
			assert.bnEqual(parameters.baseFee, baseFee);
			assert.bnEqual(parameters.baseFeeNextPrice, baseFeeNextPrice);
			assert.bnEqual(parameters.maxLeverage, maxLeverage);
			assert.bnEqual(parameters.maxSingleSideValueUSD, maxSingleSideValueUSD);
			assert.bnEqual(parameters.maxFundingRate, maxFundingRate);
			assert.bnEqual(parameters.skewScaleUSD, skewScaleUSD);
		});

		it('prices are properly fetched from summary', async () => {
			const price = toUnit(200);
			await setPrice(baseAsset, price);
			const summary = await perpsOrders.marketSummary(marketKey);

			assert.bnEqual(summary.price, price);
			assert.isFalse(summary.priceInvalid);
		});

		it('maxOrderSizes is as in engine', async () => {
			const res = await perpsOrders.maxOrderSizes(marketKey);
			const resEngine = await perpsEngine.maxOrderSizes(marketKey);
			assert.deepEqual(res, resEngine);
		});
	});

	describe('order fees', () => {
		const margin = toUnit('1000');

		// In this section, where inscrutable numbers are being compared, we're
		// following logic something like the following, to account for existing
		// positions that users already have (and the fees charged against them)
		// when placing a subsequent order.

		// φ1 : fee rate after first order
		// φ2 : fee rate after second order
		// m : initial margin
		// λ : leverage

		// 1. User deposits margin m
		//    remaining margin   = m

		// 2. User submits an order at leverage λ. Fees are deducted from margin at this point.
		//    notional value     = m λ
		//    order fee          = m λ φ1
		//    remaining margin   = m (1 - λ φ1)

		// 3. User deposit additional β m margin.
		//    remaining margin   = m (1 - λ φ1) + β m = m ((1+β) - λ φ1)

		// 4. User has deleveraged by depositing more margin; submits a new order
		//    to bring their leverage back to λ. The fee computed against the difference
		//    between the new position and the previous one.
		//    notional           = λ m ((1+β) - λ φ1)
		//    change in notional = λ m ((1+β)- λ φ1) - λ m = λ m (β - λ φ1)
		//    fee                = λ m φ2 (β - λ φ1)

		for (const leverage of ['3.5', '-3.5'].map(toUnit)) {
			const side = parseInt(leverage.toString()) > 0 ? 'long' : 'short';

			describe(`${side}`, () => {
				it('Ensure that the order fee is correct when the order is actually submitted', async () => {
					const price = toUnit('100');
					const t2size = toUnit('70');
					await transferAndModify({
						account: trader2,
						fillPrice: price,
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: t2size,
					});

					const t1size = toUnit('-35');
					await transferAndModify({
						account: trader,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta: t1size,
					});

					const fee = multiplyDecimal(multiplyDecimal(t1size.abs().mul(toBN(2)), price), baseFee);
					await perpsOrders.transferMargin(marketKey, margin.mul(toBN(2)), { from: trader });
					assert.bnEqual((await perpsOrders.orderFee(marketKey, t1size.mul(toBN(2)))).fee, fee);
					const tx = await perpsOrders.trade(marketKey, t1size.mul(toBN(2)), {
						from: trader,
					});

					// Fee is properly recorded and deducted.
					const decodedLogs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [perpsEngine],
					});

					decodedEventEqual({
						event: 'PositionModified',
						emittedFrom: perpsEngine.address,
						args: [
							marketKey,
							toBN('1'),
							trader,
							margin.mul(toBN(3)).sub(fee.mul(toBN(3)).div(toBN(2))),
							t1size.mul(toBN(3)),
							t1size.mul(toBN(2)),
							price,
							fee,
						],
						log: decodedLogs[2],
						bnCloseVariance: toUnit('0.01'),
					});
				});

				it('Submit a fresh order when there is no skew', async () => {
					await setPrice(baseAsset, toUnit('100'));
					await perpsOrders.transferMargin(marketKey, margin, { from: trader });
					const notional = multiplyDecimal(margin, leverage.abs());
					const fee = multiplyDecimal(notional, baseFee);
					assert.bnEqual((await perpsOrders.orderFee(marketKey, notional.div(toBN(100)))).fee, fee);
				});

				it('Submit a fresh order on the same side as the skew', async () => {
					await transferAndModify({
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: multiplyDecimal(leverage, margin).div(toBN('100')),
					});

					const notional = multiplyDecimal(margin, leverage);
					const fee = multiplyDecimal(notional, baseFee).abs();
					await perpsOrders.transferMargin(marketKey, margin, { from: trader });
					assert.bnEqual((await perpsOrders.orderFee(marketKey, notional.div(toBN(100)))).fee, fee);
				});

				it(`Submit a fresh order on the opposite side to the skew smaller than the skew`, async () => {
					await transferAndModify({
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: multiplyDecimal(leverage.neg(), margin).div(toBN('100')),
					});

					const notional = multiplyDecimal(margin.div(toBN(2)), leverage);
					const fee = multiplyDecimal(notional, baseFee).abs();
					await perpsOrders.transferMargin(marketKey, margin.div(toBN(2)), { from: trader });
					assert.bnEqual((await perpsOrders.orderFee(marketKey, notional.div(toBN(100)))).fee, fee);
				});

				it('Submit a fresh order on the opposite side to the skew larger than the skew', async () => {
					await transferAndModify({
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.div(toBN(2)),
						sizeDelta: multiplyDecimal(leverage.neg(), margin.div(toBN(2))).div(toBN('100')),
					});

					const notional = multiplyDecimal(margin, leverage);
					const fee = multiplyDecimal(notional, baseFee).abs();
					await perpsOrders.transferMargin(marketKey, margin, { from: trader });
					assert.bnEqual(
						(await perpsOrders.orderFee(marketKey, notional.div(toBN('100')))).fee,
						fee
					);
				});

				it('Increase an existing position on the side of the skew', async () => {
					await transferAndModify({
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: multiplyDecimal(leverage, margin).div(toBN('100')),
					});

					const fee = toUnit('5.25');
					assert.bnEqual(
						(
							await perpsOrders.orderFee(
								marketKey,
								multiplyDecimal(margin.div(toBN(2)), leverage).div(toBN('100'))
							)
						).fee,
						fee
					);
				});

				it('reduce an existing position on the side of the skew', async () => {
					const price = toUnit(100);
					const sizeDelta = multiplyDecimal(leverage, margin).div(price);
					await transferAndModify({
						account: trader,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta,
					});

					const adjustSize = sizeDelta.div(toBN(2)).neg();
					const expectedFee = multiplyDecimal(multiplyDecimal(adjustSize.abs(), price), baseFee);

					assert.bnEqual((await perpsOrders.orderFee(marketKey, adjustSize)).fee, expectedFee);
				});

				it('reduce an existing position opposite to the skew', async () => {
					const sizeDelta1 = multiplyDecimal(leverage, margin.mul(toBN(2))).div(toBN(100));
					await transferAndModify({
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: sizeDelta1,
					});

					const sizeDelta2 = multiplyDecimal(leverage.neg(), margin).div(toBN(100));
					await transferAndModify({
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: sizeDelta2,
					});

					const size = sizeDelta2.neg().div(toBN(2));
					const fee = multiplyDecimal(multiplyDecimal(size, toUnit('100')), baseFee).abs();
					assert.bnEqual((await perpsOrders.orderFee(marketKey, size)).fee, fee);
				});

				it('close an existing position on the side of the skew', async () => {
					const sizeDelta = multiplyDecimal(leverage, margin).div(toBN(100));
					await transferAndModify({
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta,
					});

					const size = sizeDelta.neg();
					const fee = multiplyDecimal(multiplyDecimal(size, toUnit('100')), baseFee).abs();
					assert.bnEqual((await perpsOrders.orderFee(marketKey, sizeDelta.neg())).fee, fee);
				});

				it('close an existing position opposite to the skew', async () => {
					const sizeDelta1 = multiplyDecimal(leverage, margin.mul(toBN(2))).div(toBN(100));
					await transferAndModify({
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: sizeDelta1,
					});

					const sizeDelta2 = multiplyDecimal(leverage.neg(), margin).div(toBN(100));
					await transferAndModify({
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: sizeDelta2,
					});

					const size = sizeDelta2.neg();
					const fee = multiplyDecimal(multiplyDecimal(size, toUnit('100')), baseFee).abs();
					assert.bnEqual((await perpsOrders.orderFee(marketKey, size)).fee, fee);
				});
			});
		}
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

		describe('when tooVolatile is true', () => {
			beforeEach(async () => {
				// set up a healthy position
				await perpsOrders.transferMargin(marketKey, toUnit('1000'), { from: trader });
				await perpsOrders.trade(marketKey, toUnit('1'), { from: trader });

				// set up a would be liqudatable position
				await perpsOrders.transferMargin(marketKey, toUnit('1000'), { from: trader2 });
				await perpsOrders.trade(marketKey, toUnit('-100'), { from: trader2 });

				// spike the price
				await setPrice(baseAsset, multiplyDecimal(initialPrice, toUnit(1.1)));
				// check is too volatile
				assert.ok(
					(await exchanger.dynamicFeeRateForExchange(toBytes32('sUSD'), baseAsset)).tooVolatile
				);
			});

			it('dynamicFeeRate view', async () => {
				const exchangerResult = await exchanger.dynamicFeeRateForExchange(
					toBytes32('sUSD'),
					baseAsset
				);
				const ownResult = await perpsOrders.dynamicFeeRate(marketKey);
				assert.bnEqual(exchangerResult.feeRate, ownResult.rate);
				assert.equal(exchangerResult.tooVolatile, ownResult.tooVolatile);
			});

			it('position modifying actions revert', async () => {
				const revertMessage = 'Price too volatile';

				await assert.revert(
					perpsOrders.trade(marketKey, toUnit('1'), { from: trader }),
					revertMessage
				);
				await assert.revert(perpsOrders.closePosition(marketKey, { from: trader }), revertMessage);
			});

			it('margin modifying actions do not revert', async () => {
				await perpsOrders.transferMargin(marketKey, toUnit('1000'), { from: trader });
				await perpsOrders.withdrawMaxMargin(marketKey, { from: trader });
			});

			it('liquidations do not revert', async () => {
				await perpsEngine.liquidatePosition(marketKey, trader2, liquidator, { from: trader });
			});

			it('settings parameter changes do not revert', async () => {
				await perpsManager.setMaxFundingRate(marketKey, 0, { from: owner });
				await perpsManager.setSkewScaleUSD(marketKey, toUnit('100'), { from: owner });
				await perpsManager.setMarketConfig(marketKey, 0, 0, 0, 0, 0, 0, 1, {
					from: owner,
				});
			});
		});

		describe('when dynamic fee is non zero, but tooVolatile false', () => {
			const priceDiff = 1.03;
			const spikedRate = multiplyDecimal(initialPrice, toUnit(priceDiff));
			const threshold = toBN(EXCHANGE_DYNAMIC_FEE_THRESHOLD);
			const expectedRate = toUnit(priceDiff)
				.sub(toUnit(1))
				.sub(threshold);
			const margin = toUnit('1000');

			beforeEach(async () => {
				// set up margin
				await perpsOrders.transferMargin(marketKey, margin, { from: trader });
				// spike the price
				await setPrice(baseAsset, spikedRate);
				// check is not too volatile
				const res = await exchanger.dynamicFeeRateForExchange(toBytes32('sUSD'), baseAsset);
				// check dynamic fee is as expected
				assert.bnClose(res.feeRate, expectedRate, toUnit('0.0000001'));
				assert.notOk(res.tooVolatile);
			});

			it('orderFee is calculated and applied correctly', async () => {
				const orderSize = toUnit('1');

				// expected fee is dynamic fee + base fee
				const expectedFee = multiplyDecimal(spikedRate, expectedRate.add(baseFee));

				// check view
				const rate = await perpsOrders.feeRate(marketKey);
				assert.bnClose(rate, expectedRate.add(baseFee), toUnit('0.0000001'));
				const res = await perpsOrders.orderFee(marketKey, orderSize);
				assert.bnClose(res.fee, expectedFee, toUnit('0.0000001'));

				// check event from modifying a position
				const tx = await perpsOrders.trade(marketKey, orderSize, { from: trader });

				// correct fee is properly recorded and deducted.
				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [perpsEngine] });

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsEngine.address,
					args: [
						marketKey,
						toBN('1'),
						trader,
						margin.sub(expectedFee),
						orderSize,
						orderSize,
						spikedRate,
						expectedFee,
					],
					log: decodedLogs[2],
					bnCloseVariance: toUnit('0.0000001'),
				});
			});

			it('mutative actions do not revert', async () => {
				await perpsOrders.trade(marketKey, toUnit('1'), { from: trader });
				await perpsOrders.closePosition(marketKey, { from: trader });

				await perpsOrders.transferMargin(marketKey, toUnit('1000'), { from: trader });
				await perpsOrders.withdrawMaxMargin(marketKey, { from: trader });
			});

			it('settings parameter changes do not revert', async () => {
				await perpsManager.setMaxFundingRate(marketKey, 0, { from: owner });
				await perpsManager.setSkewScaleUSD(marketKey, toUnit('100'), { from: owner });
				await perpsManager.setMarketConfig(marketKey, 0, 0, 0, 0, 0, 0, 1, {
					from: owner,
				});
			});
		});
	});

	describe('withTracking emit expected event data', () => {
		it('tradeWithTracking emits expected event', async () => {
			const margin = toUnit('1000');
			await perpsOrders.transferMargin(marketKey, margin, { from: trader });
			const size = toUnit('50');
			const price = toUnit('200');
			await setPrice(baseAsset, price);
			const fee = (await perpsOrders.orderFee(marketKey, size)).fee;
			const trackingCode = toBytes32('code');
			const tx = await perpsOrders.tradeWithTracking(marketKey, size, trackingCode, {
				from: trader,
			});

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsEngine] });
			assert.equal(decodedLogs.length, 4); // funding, issued, tracking, pos-modified
			decodedEventEqual({
				event: 'FeeSourceTracking',
				emittedFrom: perpsEngine.address,
				args: [trackingCode, marketKey, trader, size, fee],
				log: decodedLogs[2],
			});
		});

		it('closePositionWithTracking emits expected event', async () => {
			const size = toUnit('10');
			await transferAndModify({
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: size,
			});

			const trackingCode = toBytes32('code');
			const tx = await perpsOrders.closePositionWithTracking(marketKey, trackingCode, {
				from: trader,
			});

			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, perpsEngine],
			});

			assert.equal(decodedLogs.length, 4);
			const fee = multiplyDecimal(toUnit(2000), baseFee);

			decodedEventEqual({
				event: 'FeeSourceTracking',
				emittedFrom: perpsEngine.address,
				args: [trackingCode, marketKey, trader, size.neg(), fee],
				log: decodedLogs[2],
				bnCloseVariance: toUnit('0.1'),
			});
		});
	});

	describe('trade using shortcut methods', () => {
		describe('on transferAndTrade', () => {
			const executeTransferAndTradeWithFee = async (margin, size) => {
				const fee = (await perpsOrders.orderFee(marketKey, size)).fee;
				const tx = await perpsOrders.transferAndTrade(marketKey, margin, size, toBytes32(''), {
					from: trader,
				});
				return [fee, tx];
			};

			it('should succeed on valid invocation params', async () => {
				const margin = toUnit('1000');
				const size = toUnit('50');
				const price = toUnit('200');

				await setPrice(baseAsset, price);

				// Before executing a transfer and trade.
				const position1 = (await perpsOrders.positionSummary(marketKey, trader)).position;
				assert.equal(position1.id, '0');
				assert.bnEqual(position1.margin, '0', '(before) Margin does not match expected');
				assert.bnEqual(position1.size, '0', '(before) Size does not match expected');

				const [fee, tx] = await executeTransferAndTradeWithFee(margin, size);

				// After executing a transfer and trade.
				const position2 = (await perpsOrders.positionSummary(marketKey, trader)).position;

				assert.equal(position2.id, '1');
				assert.bnEqual(position2.margin, margin.sub(fee), '(after) Margin does not match expected');
				assert.bnEqual(position2.size, size, '(after) Size does not match expected');

				// Verify order of events.
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, perpsEngine],
				});
				assert.deepEqual(
					decodedLogs.map(log => log?.name).filter(name => !!name),
					['Burned', 'MarginModified', 'PositionModified', 'Issued', 'PositionModified']
				);
			});

			it('should succeed when an existing position is open', async () => {
				const margin = toUnit('1000');
				const size = toUnit('5');
				const price = toUnit('200');

				await setPrice(baseAsset, price);

				// 1000 margin, size 5.
				const [fee1] = await executeTransferAndTradeWithFee(margin, size); // 1000 margin, size 5.

				const { id: originalPositionId } = (
					await perpsOrders.positionSummary(marketKey, trader)
				).position;

				// Increase margin by 1000 (2x), no change in size.
				//
				// margin = 2000, price = 200, size = 2000/200 = 10
				const [fee2] = await executeTransferAndTradeWithFee(margin, size);

				const position = (await perpsOrders.positionSummary(marketKey, trader)).position;

				assert.equal(position.id, originalPositionId); // Existing position modified.
				assert.bnEqual(
					position.size,
					divideDecimal(margin.add(margin), price),
					'Size does not match expected'
				);
				assert.bnClose(
					position.margin,
					margin
						.add(margin)
						.sub(fee1)
						.sub(fee2),
					toUnit('0.1') // 10c USD variance
				);
			});

			it('should revert when transferring with zero margin', async () => {
				const margin = toUnit('0'); // zero margin.
				const size = toUnit('100');
				const price = toUnit('500');

				await setPrice(baseAsset, price);

				await assert.revert(
					perpsOrders.transferAndTrade(marketKey, margin, size, toBytes32(''), {
						from: trader,
					}),
					'Insufficient margin'
				);
			});

			it('should revert when zero size is provided', async () => {
				const margin = toUnit('1000');
				const size = toUnit('0'); // zero size.
				const price = toUnit('500');

				await setPrice(baseAsset, price);

				await assert.revert(
					perpsOrders.transferAndTrade(marketKey, margin, size, toBytes32(''), {
						from: trader,
					}),
					'Cannot submit empty order'
				);
			});

			it('should revert when -withdrawableMargin then trading on existing position', async () => {
				const margin = toUnit('1000');
				const price = toUnit('50');
				const size = divideDecimal(margin, price); // 1x

				await setPrice(baseAsset, price);

				// Create a valid position.
				await perpsOrders.transferAndTrade(marketKey, margin, size, toBytes32(''), {
					from: trader,
				});

				// Get total amount of margin trader is able to withdraw given open position.
				const withdrawableMargin = await perpsEngine.withdrawableMargin(marketKey, trader);

				// Attempt to withdraw all withdrawable margin then trading.
				await assert.revert(
					perpsOrders.transferAndTrade(
						marketKey,
						withdrawableMargin.neg(),
						size.add(toUnit('1')), // Tip the size over by just one additional unit.
						toBytes32(''),
						{
							from: trader,
						}
					),
					'Max leverage exceeded'
				);
			});
		});

		describe('on tradeAndTransfer', () => {
			it('should succeed when closing and withdrawing all remaining margin', async () => {
				const margin = toUnit('1000');
				const size = toUnit('50');
				const price = toUnit('10');

				await setPrice(baseAsset, price);

				// Transfer margin and open position.
				await perpsOrders.transferAndTrade(marketKey, margin, size, toBytes32(''), {
					from: trader,
				});

				const withdrawableMargin = await perpsEngine.withdrawableMargin(marketKey, trader);
				const tx = await perpsOrders.tradeAndTransfer(
					marketKey,
					withdrawableMargin.neg(),
					size.neg(),
					toBytes32(''),
					{
						from: trader,
					}
				);

				const updatedPosition = (await perpsOrders.positionSummary(marketKey, trader)).position;
				assert.equal(updatedPosition.size, '0');

				// Verify order of events.
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, perpsEngine],
				});
				assert.deepEqual(
					decodedLogs.map(log => log?.name).filter(name => !!name),
					['Issued', 'PositionModified', 'Issued', 'MarginModified', 'PositionModified']
				);
			});

			it('should revert when no position is available', async () => {
				const margin = toUnit('100');
				const size = toUnit('100');
				const price = toUnit('50');

				await setPrice(baseAsset, price);

				const position = (await perpsOrders.positionSummary(marketKey, trader)).position;
				assert.equal(position.id, '0');

				// No prior transfer means there's nothing to trade (i.e. no position).
				await assert.revert(
					perpsOrders.tradeAndTransfer(marketKey, margin, size, toBytes32(''), {
						from: trader,
					}),
					'Insufficient margin'
				);
			});

			it('should revert when transfer amount exceeds remaining', async () => {
				const margin = toUnit('1000');
				const size = toUnit('50');
				const price = toUnit('10');

				await setPrice(baseAsset, price);

				// Transfer margin and open position.
				await perpsOrders.transferAndTrade(marketKey, margin, size, toBytes32(''), {
					from: trader,
				});

				const position = (await perpsOrders.positionSummary(marketKey, trader)).position;

				// Close position and withdraw too much margin.
				const excessiveMarginBuffer = toUnit('5000'); // 5000 more margin than available.

				await assert.revert(
					perpsOrders.tradeAndTransfer(
						marketKey,
						toBN(position.margin)
							.add(excessiveMarginBuffer)
							.neg(),
						toBN(position.size).neg(),
						toBytes32(''),
						{
							from: trader,
						}
					),
					'Insufficient margin'
				);
			});
		});
	});
});
