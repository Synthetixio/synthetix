const { artifacts, contract, web3 } = require('hardhat');
const { toBytes32 } = require('../..');
const { toBN } = web3.utils;
const { currentTime, fastForward, toUnit, multiplyDecimal, divideDecimal } = require('../utils')();

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

const MockExchanger = artifacts.require('MockExchanger');

const Status = {
	Ok: 0,
	InvalidPrice: 1,
	PriceOutOfBounds: 2,
	CanLiquidate: 3,
	CannotLiquidate: 4,
	MaxMarketSizeExceeded: 5,
	MaxLeverageExceeded: 6,
	InsufficientMargin: 7,
	NotPermitted: 8,
	NilOrder: 9,
	NoPositionOpen: 10,
	PriceTooVolatile: 11,
};

contract('PerpsV2Market', accounts => {
	let perpsSettings,
		futuresMarketManager,
		perpsMarket,
		exchangeRates,
		exchanger,
		circuitBreaker,
		addressResolver,
		sUSD,
		synthetix,
		feePool,
		debtCache,
		systemSettings,
		systemStatus;

	let baseAssetAggregatorAddress;

	const owner = accounts[1];
	const trader = accounts[2];
	const trader2 = accounts[3];
	const trader3 = accounts[4];
	const noBalance = accounts[5];
	const traderInitialBalance = toUnit(1000000);

	const marketKey = toBytes32('pBTC');
	const baseAsset = toBytes32('BTC');
	const baseFee = toUnit('0.003');
	const baseFeeNextPrice = toUnit('0.0005');
	const maxLeverage = toUnit('10');
	const maxSingleSideValueUSD = toUnit('100000');
	const maxFundingRate = toUnit('0.1');
	const skewScaleUSD = toUnit('100000');
	const initialPrice = toUnit('100');
	const minKeeperFee = toUnit('20');
	const minInitialMargin = toUnit('100');

	const initialFundingIndex = toBN(0);

	async function setPrice(asset, price, resetCircuitBreaker = true) {
		await updateAggregatorRates(
			exchangeRates,
			resetCircuitBreaker ? circuitBreaker : null,
			[asset],
			[price]
		);
	}

	async function transferMarginAndModifyPosition({
		market,
		account,
		fillPrice,
		marginDelta,
		sizeDelta,
	}) {
		await market.transferMargin(marginDelta, { from: account });
		await setPrice(await market.baseAsset(), fillPrice);
		await market.modifyPosition(sizeDelta, {
			from: account,
		});
	}

	async function closePositionAndWithdrawMargin({ market, account, fillPrice }) {
		await setPrice(await market.baseAsset(), fillPrice);
		await market.closePosition({ from: account });
		await market.withdrawAllMargin({ from: account });
	}

	before(async () => {
		({
			PerpsV2Settings: perpsSettings,
			FuturesMarketManager: futuresMarketManager,
			PerpsV2MarketpBTC: perpsMarket,
			ExchangeRates: exchangeRates,
			Exchanger: exchanger,
			CircuitBreaker: circuitBreaker,
			AddressResolver: addressResolver,
			SynthsUSD: sUSD,
			Synthetix: synthetix,
			FeePool: feePool,
			DebtCache: debtCache,
			SystemStatus: systemStatus,
			SystemSettings: systemSettings,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			feeds: ['BTC', 'ETH'],
			contracts: [
				'FuturesMarketManager',
				'PerpsV2Settings',
				'PerpsV2MarketpBTC',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'Exchanger',
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

		// tests assume 100, but in actual deployment is different
		await perpsSettings.setMinInitialMargin(minInitialMargin, { from: owner });

		// Issue the trader some sUSD
		for (const t of [trader, trader2, trader3]) {
			await sUSD.issue(t, traderInitialBalance);
		}

		// allow ownder to suspend system or synths
		await systemStatus.updateAccessControls(
			[toBytes32('System'), toBytes32('Synth')],
			[owner, owner],
			[true, true],
			[true, true],
			{ from: owner }
		);

		// Need base aggregator address to verify calculations on circuit breaker
		baseAssetAggregatorAddress = await exchangeRates.aggregators(baseAsset);
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('Basic parameters', () => {
		it('Only expected functions are mutative', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: perpsMarket.abi,
				ignoreParents: ['PerpsV2SettingsMixin'],
				expected: [
					'transferMargin',
					'withdrawAllMargin',
					'modifyPosition',
					'modifyPositionWithTracking',
					'closePosition',
					'closePositionWithTracking',
					'liquidatePosition',
					'recomputeFunding',
					'submitNextPriceOrder',
					'submitNextPriceOrderWithTracking',
					'cancelNextPriceOrder',
					'executeNextPriceOrder',
				],
			});
		});

		it('contract has CONTRACT_NAME getter', async () => {
			assert.equal(await perpsMarket.CONTRACT_NAME(), toBytes32('PerpsV2Market'));
		});

		it('static parameters are set properly at construction', async () => {
			assert.equal(await perpsMarket.baseAsset(), baseAsset);
			assert.equal(await perpsMarket.marketKey(), marketKey);
			const parameters = await perpsSettings.parameters(marketKey);
			assert.bnEqual(parameters.baseFee, baseFee);
			assert.bnEqual(parameters.baseFeeNextPrice, baseFeeNextPrice);
			assert.bnEqual(parameters.maxLeverage, maxLeverage);
			assert.bnEqual(parameters.maxSingleSideValueUSD, maxSingleSideValueUSD);
			assert.bnEqual(parameters.maxFundingRate, maxFundingRate);
			assert.bnEqual(parameters.skewScaleUSD, skewScaleUSD);
		});

		it('prices are properly fetched', async () => {
			const price = toUnit(200);
			await setPrice(baseAsset, price);
			const result = await perpsMarket.assetPrice();

			assert.bnEqual(result.price, price);
			assert.isFalse(result.invalid);
		});

		it('market size and skew', async () => {
			const minScale = (await perpsSettings.parameters(marketKey)).skewScaleUSD;
			const price = 100;
			let sizes = await perpsMarket.marketSizes();
			let marketSkew = await perpsMarket.marketSkew();

			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(await perpsMarket.marketSize(), toUnit('0'));
			assert.bnEqual(await perpsMarket.marketSkew(), toUnit('0'));
			assert.bnEqual(await perpsMarket.proportionalSkew(), toUnit('0'));

			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader,
				fillPrice: toUnit(price),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});

			sizes = await perpsMarket.marketSizes();
			marketSkew = await perpsMarket.marketSkew();

			assert.bnEqual(sizes[0], toUnit('50'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(await perpsMarket.marketSize(), toUnit('50'));
			assert.bnEqual(await perpsMarket.marketSkew(), toUnit('50'));
			assert.bnEqual(
				await perpsMarket.proportionalSkew(),
				divideDecimal(multiplyDecimal(marketSkew, toUnit(price)), minScale)
			);

			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader2,
				fillPrice: toUnit(price * 1.2),
				marginDelta: toUnit('600'),
				sizeDelta: toUnit('-35'),
			});

			sizes = await perpsMarket.marketSizes();
			marketSkew = await perpsMarket.marketSkew();
			assert.bnEqual(sizes[0], toUnit('50'));
			assert.bnEqual(sizes[1], toUnit('35'));
			assert.bnEqual(await perpsMarket.marketSize(), toUnit('85'));
			assert.bnEqual(await perpsMarket.marketSkew(), toUnit('15'));
			assert.bnClose(
				await perpsMarket.proportionalSkew(),
				divideDecimal(multiplyDecimal(marketSkew, toUnit(price * 1.2)), minScale)
			);

			await closePositionAndWithdrawMargin({
				market: perpsMarket,
				account: trader,
				fillPrice: toUnit(price * 1.1),
			});

			sizes = await perpsMarket.marketSizes();
			marketSkew = await perpsMarket.marketSkew();
			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('35'));
			assert.bnEqual(await perpsMarket.marketSize(), toUnit('35'));
			assert.bnEqual(await perpsMarket.marketSkew(), toUnit('-35'));
			assert.bnClose(
				await perpsMarket.proportionalSkew(),
				divideDecimal(multiplyDecimal(marketSkew, toUnit(price * 1.1)), minScale)
			);

			await closePositionAndWithdrawMargin({
				market: perpsMarket,
				account: trader2,
				fillPrice: toUnit(price),
			});

			sizes = await perpsMarket.marketSizes();
			marketSkew = await perpsMarket.marketSkew();
			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(await perpsMarket.marketSize(), toUnit('0'));
			assert.bnEqual(await perpsMarket.marketSkew(), toUnit('0'));
			assert.bnEqual(await perpsMarket.proportionalSkew(), toUnit('0'));
		});
	});

	describe('Order fees', () => {
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
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader2,
						fillPrice: price,
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: t2size,
					});

					const t1size = toUnit('-35');
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta: t1size,
					});

					const fee = multiplyDecimal(multiplyDecimal(t1size.abs().mul(toBN(2)), price), baseFee);
					await perpsMarket.transferMargin(margin.mul(toBN(2)), { from: trader });
					assert.bnEqual((await perpsMarket.orderFee(t1size.mul(toBN(2)))).fee, fee);
					const tx = await perpsMarket.modifyPosition(t1size.mul(toBN(2)), { from: trader });

					// Fee is properly recorded and deducted.
					const decodedLogs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [perpsMarket],
					});

					decodedEventEqual({
						event: 'PositionModified',
						emittedFrom: perpsMarket.address,
						args: [
							toBN('1'),
							trader,
							margin.mul(toBN(3)).sub(fee.mul(toBN(3)).div(toBN(2))),
							t1size.mul(toBN(3)),
							t1size.mul(toBN(2)),
							price,
							toBN(3),
							fee,
						],
						log: decodedLogs[2],
						bnCloseVariance: toUnit('0.01'),
					});
				});

				it('Submit a fresh order when there is no skew', async () => {
					await setPrice(baseAsset, toUnit('100'));
					await perpsMarket.transferMargin(margin, { from: trader });
					const notional = multiplyDecimal(margin, leverage.abs());
					const fee = multiplyDecimal(notional, baseFee);
					assert.bnEqual((await perpsMarket.orderFee(notional.div(toBN(100))))[0], fee);
				});

				it('Submit a fresh order on the same side as the skew', async () => {
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: multiplyDecimal(leverage, margin).div(toBN('100')),
					});

					const notional = multiplyDecimal(margin, leverage);
					const fee = multiplyDecimal(notional, baseFee).abs();
					await perpsMarket.transferMargin(margin, { from: trader });
					assert.bnEqual((await perpsMarket.orderFee(notional.div(toBN(100))))[0], fee);
				});

				it(`Submit a fresh order on the opposite side to the skew smaller than the skew`, async () => {
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: multiplyDecimal(leverage.neg(), margin).div(toBN('100')),
					});

					const notional = multiplyDecimal(margin.div(toBN(2)), leverage);
					const fee = multiplyDecimal(notional, baseFee).abs();
					await perpsMarket.transferMargin(margin.div(toBN(2)), { from: trader });
					assert.bnEqual((await perpsMarket.orderFee(notional.div(toBN(100))))[0], fee);
				});

				it('Submit a fresh order on the opposite side to the skew larger than the skew', async () => {
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.div(toBN(2)),
						sizeDelta: multiplyDecimal(leverage.neg(), margin.div(toBN(2))).div(toBN('100')),
					});

					const notional = multiplyDecimal(margin, leverage);
					const fee = multiplyDecimal(notional, baseFee).abs();
					await perpsMarket.transferMargin(margin, { from: trader });
					assert.bnEqual((await perpsMarket.orderFee(notional.div(toBN('100'))))[0], fee);
				});

				it('Increase an existing position on the side of the skew', async () => {
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: multiplyDecimal(leverage, margin).div(toBN('100')),
					});

					const fee = toUnit('5.25');
					assert.bnEqual(
						(
							await perpsMarket.orderFee(
								multiplyDecimal(margin.div(toBN(2)), leverage).div(toBN('100'))
							)
						)[0],
						fee
					);
				});

				it('reduce an existing position on the side of the skew', async () => {
					const price = toUnit(100);
					const sizeDelta = multiplyDecimal(leverage, margin).div(price);
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta,
					});

					const adjustSize = sizeDelta.div(toBN(2)).neg();
					const expectedFee = multiplyDecimal(multiplyDecimal(adjustSize.abs(), price), baseFee);

					assert.bnEqual((await perpsMarket.orderFee(adjustSize)).fee, expectedFee);
				});

				it('reduce an existing position opposite to the skew', async () => {
					const sizeDelta1 = multiplyDecimal(leverage, margin.mul(toBN(2))).div(toBN(100));
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: sizeDelta1,
					});

					const sizeDelta2 = multiplyDecimal(leverage.neg(), margin).div(toBN(100));
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: sizeDelta2,
					});

					const size = sizeDelta2.neg().div(toBN(2));
					const fee = multiplyDecimal(multiplyDecimal(size, toUnit('100')), baseFee).abs();
					assert.bnEqual((await perpsMarket.orderFee(size)).fee, fee);
				});

				it('close an existing position on the side of the skew', async () => {
					const sizeDelta = multiplyDecimal(leverage, margin).div(toBN(100));
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta,
					});

					const size = sizeDelta.neg();
					const fee = multiplyDecimal(multiplyDecimal(size, toUnit('100')), baseFee).abs();
					assert.bnEqual((await perpsMarket.orderFee(sizeDelta.neg())).fee, fee);
				});

				it('close an existing position opposite to the skew', async () => {
					const sizeDelta1 = multiplyDecimal(leverage, margin.mul(toBN(2))).div(toBN(100));
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: sizeDelta1,
					});

					const sizeDelta2 = multiplyDecimal(leverage.neg(), margin).div(toBN(100));
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: sizeDelta2,
					});

					const size = sizeDelta2.neg();
					const fee = multiplyDecimal(multiplyDecimal(size, toUnit('100')), baseFee).abs();
					assert.bnEqual((await perpsMarket.orderFee(size)).fee, fee);
				});
			});
		}
	});

	describe('Transferring margin', () => {
		it.skip('Transferring margin updates margin, last price, funding index, but not size', async () => {
			// We'll need to distinguish between the size = 0 case, when last price and index are not altered,
			// and the size > 0 case, when last price and index ARE altered.
			assert.isTrue(false);
		});

		describe('sUSD balance', () => {
			it(`Can't deposit more sUSD than owned`, async () => {
				const preBalance = await sUSD.balanceOf(trader);
				await assert.revert(
					perpsMarket.transferMargin(preBalance.add(toUnit('1')), { from: trader }),
					'subtraction overflow'
				);
			});

			it(`Can't withdraw more sUSD than is in the margin`, async () => {
				await perpsMarket.transferMargin(toUnit('100'), { from: trader });
				await assert.revert(
					perpsMarket.transferMargin(toUnit('-101'), { from: trader }),
					'Insufficient margin'
				);
			});

			it('Positive delta -> burn sUSD', async () => {
				const preBalance = await sUSD.balanceOf(trader);
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(toUnit('1000')));
			});

			it('Negative delta -> mint sUSD', async () => {
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				const preBalance = await sUSD.balanceOf(trader);
				await perpsMarket.transferMargin(toUnit('-500'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.add(toUnit('500')));
			});

			it('Zero delta -> NOP', async () => {
				const preBalance = await sUSD.balanceOf(trader);
				await perpsMarket.transferMargin(toUnit('0'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(toUnit('0')));
			});

			it('fee reclamation is respected', async () => {
				// Set up a mock exchanger
				const mockExchanger = await MockExchanger.new(synthetix.address);
				await addressResolver.importAddresses(
					['Exchanger'].map(toBytes32),
					[mockExchanger.address],
					{
						from: owner,
					}
				);
				await synthetix.rebuildCache();
				await futuresMarketManager.rebuildCache();

				// Set up a starting balance
				const preBalance = await sUSD.balanceOf(trader);
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });

				// Now set a reclamation event
				await mockExchanger.setReclaim(toUnit('10'));
				await mockExchanger.setNumEntries('1');

				// Issuance works fine
				await perpsMarket.transferMargin(toUnit('-900'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(toUnit('100')));
				assert.bnEqual((await perpsMarket.remainingMargin(trader))[0], toUnit('100'));

				// But burning properly deducts the reclamation amount
				await perpsMarket.transferMargin(preBalance.sub(toUnit('100')), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(owner), toUnit('0'));
				assert.bnEqual(
					(await perpsMarket.remainingMargin(trader))[0],
					preBalance.sub(toUnit('10'))
				);
			});

			it('events are emitted properly upon margin transfers', async () => {
				// Deposit some balance
				let tx = await perpsMarket.transferMargin(toUnit('1000'), { from: trader3 });
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, perpsMarket],
				});

				decodedEventEqual({
					event: 'Burned',
					emittedFrom: sUSD.address,
					args: [trader3, toUnit('1000')],
					log: decodedLogs[1],
				});

				decodedEventEqual({
					event: 'MarginTransferred',
					emittedFrom: perpsMarket.address,
					args: [trader3, toUnit('1000')],
					log: decodedLogs[2],
				});

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsMarket.address,
					args: [
						toBN('1'),
						trader3,
						toUnit('1000'),
						toBN('0'),
						toBN('0'),
						(await perpsMarket.assetPrice()).price,
						await perpsMarket.fundingSequenceLength(),
						toBN('0'),
					],
					log: decodedLogs[3],
				});

				// Zero delta means no PositionModified, MarginTransferred, or sUSD events
				tx = await perpsMarket.transferMargin(toUnit('0'), { from: trader3 });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, perpsMarket],
				});
				assert.equal(decodedLogs.length, 1);
				assert.equal(decodedLogs[0].name, 'FundingRecomputed');

				// Now withdraw the margin back out
				tx = await perpsMarket.transferMargin(toUnit('-1000'), { from: trader3 });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, perpsMarket],
				});

				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [trader3, toUnit('1000')],
					log: decodedLogs[1],
				});

				decodedEventEqual({
					event: 'MarginTransferred',
					emittedFrom: perpsMarket.address,
					args: [trader3, toUnit('-1000')],
					log: decodedLogs[2],
				});

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsMarket.address,
					args: [
						toBN('1'),
						trader3,
						toUnit('0'),
						toBN('0'),
						toBN('0'),
						(await perpsMarket.assetPrice()).price,
						await perpsMarket.fundingSequenceLength(),
						toBN('0'),
					],
					log: decodedLogs[3],
				});
			});
		});

		it('Reverts if the price is invalid', async () => {
			await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
			await fastForward(7 * 24 * 60 * 60);
			await assert.revert(
				perpsMarket.transferMargin(toUnit('-1000'), { from: trader }),
				'Invalid price'
			);
		});

		it('Reverts if the system is suspended', async () => {
			await perpsMarket.transferMargin(toUnit('1000'), { from: trader });

			// suspend
			await systemStatus.suspendSystem('3', { from: owner });
			// should revert
			await assert.revert(
				perpsMarket.transferMargin(toUnit('-1000'), { from: trader }),
				'Synthetix is suspended'
			);

			// resume
			await systemStatus.resumeSystem({ from: owner });
			// should work now
			await perpsMarket.transferMargin(toUnit('-1000'), { from: trader });
			assert.bnClose((await perpsMarket.accessibleMargin(trader))[0], toBN('0'), toUnit('0.1'));
		});

		describe('No position', async () => {
			it('New margin', async () => {
				assert.bnEqual((await perpsMarket.positions(trader)).margin, toBN(0));
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual((await perpsMarket.positions(trader)).margin, toUnit('1000'));
			});

			it('Increase margin', async () => {
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual((await perpsMarket.positions(trader)).margin, toUnit('2000'));
			});

			it('Decrease margin', async () => {
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.transferMargin(toUnit('-500'), { from: trader });
				assert.bnEqual((await perpsMarket.positions(trader)).margin, toUnit('500'));
			});

			it('Abolish margin', async () => {
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.transferMargin(toUnit('-1000'), { from: trader });
				assert.bnEqual((await perpsMarket.positions(trader)).margin, toUnit('0'));
			});

			it('Cannot decrease margin past zero.', async () => {
				await assert.revert(
					perpsMarket.transferMargin(toUnit('-1'), { from: trader }),
					'Insufficient margin'
				);
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await assert.revert(
					perpsMarket.transferMargin(toUnit('-2000'), { from: trader }),
					'Insufficient margin'
				);
			});
		});

		describe('Existing position', () => {
			it.skip('Increase margin', async () => {
				assert.isTrue(false);
			});

			it.skip('Decrease margin', async () => {
				assert.isTrue(false);
			});

			it.skip('Cannot decrease margin past liquidation point', async () => {
				assert.isTrue(false);
			});

			it.skip('Cannot decrease margin past liquidation point', async () => {
				assert.isTrue(false);
			});

			it.skip('Cannot decrease margin past max leverage', async () => {
				assert.isTrue(false);
			});

			it.skip('Transferring margin realises profit and funding', async () => {
				assert.isTrue(false);
			});
		});
	});

	describe('Modifying positions', () => {
		it('can modify a position', async () => {
			const margin = toUnit('1000');
			await perpsMarket.transferMargin(margin, { from: trader });
			const size = toUnit('50');
			const price = toUnit('200');
			await setPrice(baseAsset, price);
			const fee = (await perpsMarket.orderFee(size))[0];
			const tx = await perpsMarket.modifyPosition(size, { from: trader });

			const position = await perpsMarket.positions(trader);
			assert.bnEqual(position.margin, margin.sub(fee));
			assert.bnEqual(position.size, size);
			assert.bnEqual(position.lastPrice, price);
			assert.bnEqual(position.lastFundingIndex, initialFundingIndex.add(toBN(2))); // margin transfer and position modification

			// Skew, size, entry notional sum, pending order value are updated.
			assert.bnEqual(await perpsMarket.marketSkew(), size);
			assert.bnEqual(await perpsMarket.marketSize(), size);
			assert.bnEqual(
				await perpsMarket.entryDebtCorrection(),
				margin.sub(fee).sub(multiplyDecimal(size, price))
			);

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsMarket] });
			assert.equal(decodedLogs.length, 3);
			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSD.address,
				args: [await feePool.FEE_ADDRESS(), fee],
				log: decodedLogs[1],
			});
			decodedEventEqual({
				event: 'PositionModified',
				emittedFrom: perpsMarket.address,
				args: [toBN('1'), trader, margin.sub(fee), size, size, price, toBN(2), fee],
				log: decodedLogs[2],
			});
		});

		it('modifyPositionWithTracking emits expected event', async () => {
			const margin = toUnit('1000');
			await perpsMarket.transferMargin(margin, { from: trader });
			const size = toUnit('50');
			const price = toUnit('200');
			await setPrice(baseAsset, price);
			const fee = (await perpsMarket.orderFee(size))[0];
			const trackingCode = toBytes32('code');
			const tx = await perpsMarket.modifyPositionWithTracking(size, trackingCode, {
				from: trader,
			});

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsMarket] });
			assert.equal(decodedLogs.length, 4); // funding, issued, tracking, pos-modified
			decodedEventEqual({
				event: 'Tracking',
				emittedFrom: perpsMarket.address,
				args: [trackingCode, baseAsset, marketKey, size, fee],
				log: decodedLogs[2],
			});
		});

		it('Cannot modify a position if the price is invalid', async () => {
			const margin = toUnit('1000');
			await perpsMarket.transferMargin(margin, { from: trader });
			const size = toUnit('10');
			await perpsMarket.modifyPosition(size, { from: trader });

			await setPrice(baseAsset, toUnit('200'));

			await fastForward(4 * 7 * 24 * 60 * 60);

			const postDetails = await perpsMarket.postTradeDetails(size, trader);
			assert.equal(postDetails.status, Status.InvalidPrice);

			await assert.revert(perpsMarket.modifyPosition(size, { from: trader }), 'Invalid price');
		});

		it('Cannot modify a position if the system is suspended', async () => {
			const margin = toUnit('1000');
			await perpsMarket.transferMargin(margin, { from: trader });
			const size = toUnit('10');
			const price = toUnit('200');
			await setPrice(baseAsset, price);

			// suspend
			await systemStatus.suspendSystem('3', { from: owner });
			// should revert modifying position
			await assert.revert(
				perpsMarket.modifyPosition(size, { from: trader }),
				'Synthetix is suspended'
			);

			// resume
			await systemStatus.resumeSystem({ from: owner });
			// should work now
			await perpsMarket.modifyPosition(size, { from: trader });
			const position = await perpsMarket.positions(trader);
			assert.bnEqual(position.size, size);
			assert.bnEqual(position.lastPrice, price);
		});

		it('Empty orders fail', async () => {
			const margin = toUnit('1000');
			await perpsMarket.transferMargin(margin, { from: trader });
			await assert.revert(
				perpsMarket.modifyPosition(toBN('0'), { from: trader }),
				'Cannot submit empty order'
			);
			const postDetails = await perpsMarket.postTradeDetails(toBN('0'), trader);
			assert.equal(postDetails.status, Status.NilOrder);
		});

		it('Cannot modify a position if it is liquidating', async () => {
			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});

			await setPrice(baseAsset, toUnit('100'));
			// User realises the price has crashed and tries to outrun their liquidation, but it fails

			const sizeDelta = toUnit('-50');
			const postDetails = await perpsMarket.postTradeDetails(sizeDelta, trader);
			assert.equal(postDetails.status, Status.CanLiquidate);

			await assert.revert(
				perpsMarket.modifyPosition(sizeDelta, { from: trader }),
				'Position can be liquidated'
			);
		});

		it('Order modification properly records the exchange fee with the fee pool', async () => {
			const FEE_ADDRESS = await feePool.FEE_ADDRESS();
			const preBalance = await sUSD.balanceOf(FEE_ADDRESS);
			const preDistribution = (await feePool.recentFeePeriods(0))[3];
			await setPrice(baseAsset, toUnit('200'));
			const fee = (await perpsMarket.orderFee(toUnit('50')))[0];
			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});

			assert.bnEqual(await sUSD.balanceOf(FEE_ADDRESS), preBalance.add(fee));
			assert.bnEqual((await feePool.recentFeePeriods(0))[3], preDistribution.add(fee));
		});

		it('Modifying a position without closing it should not change its id', async () => {
			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});
			const { id: oldPositionId } = await perpsMarket.positions(trader);

			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-25'),
			});
			const { id: newPositionId } = await perpsMarket.positions(trader);
			assert.bnEqual(oldPositionId, newPositionId);
		});

		it('max leverage cannot be exceeded', async () => {
			await setPrice(baseAsset, toUnit('100'));
			await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
			await perpsMarket.transferMargin(toUnit('1000'), { from: trader2 });
			await assert.revert(
				perpsMarket.modifyPosition(toUnit('101'), { from: trader }),
				'Max leverage exceeded'
			);
			let postDetails = await perpsMarket.postTradeDetails(toUnit('101'), trader);
			assert.equal(postDetails.status, Status.MaxLeverageExceeded);

			await assert.revert(
				perpsMarket.modifyPosition(toUnit('-101'), { from: trader2 }),
				'Max leverage exceeded'
			);
			postDetails = await perpsMarket.postTradeDetails(toUnit('-101'), trader2);
			assert.equal(postDetails.status, Status.MaxLeverageExceeded);

			// But we actually allow up to 10.01x leverage to account for rounding issues.
			await perpsMarket.modifyPosition(toUnit('100.09'), { from: trader });
			await perpsMarket.modifyPosition(toUnit('-100.09'), { from: trader2 });
		});

		it('min margin must be provided', async () => {
			await setPrice(baseAsset, toUnit('10'));
			await perpsMarket.transferMargin(minInitialMargin.sub(toUnit('1')), { from: trader });
			await assert.revert(
				perpsMarket.modifyPosition(toUnit('10'), { from: trader }),
				'Insufficient margin'
			);

			let postDetails = await perpsMarket.postTradeDetails(toUnit('10'), trader);
			assert.equal(postDetails.status, Status.InsufficientMargin);

			// But it works after transferring the remaining $1
			await perpsMarket.transferMargin(toUnit('1'), { from: trader });

			postDetails = await perpsMarket.postTradeDetails(toUnit('10'), trader);
			assert.bnEqual(postDetails.margin, minInitialMargin.sub(toUnit('0.3')));
			assert.bnEqual(postDetails.size, toUnit('10'));
			assert.bnEqual(postDetails.price, toUnit('10'));
			// liqMargin = max(20, 10*10*0.0035) + 10*10*0.0025 = 20.25
			// 10 + (20.25 − (100 - 0.3))÷10 = 2.055
			assert.bnEqual(postDetails.liqPrice, toUnit('2.055'));
			assert.bnEqual(postDetails.fee, toUnit('0.3'));
			assert.equal(postDetails.status, Status.Ok);

			await perpsMarket.modifyPosition(toUnit('10'), { from: trader });
		});

		describe('Max market size constraints', () => {
			it('properly reports the max order size on each side', async () => {
				let maxOrderSizes = await perpsMarket.maxOrderSizes();

				assert.bnEqual(maxOrderSizes.long, divideDecimal(maxSingleSideValueUSD, initialPrice));
				assert.bnEqual(maxOrderSizes.short, divideDecimal(maxSingleSideValueUSD, initialPrice));

				let newPrice = toUnit('193');
				await setPrice(baseAsset, newPrice);

				maxOrderSizes = await perpsMarket.maxOrderSizes();

				assert.bnEqual(maxOrderSizes.long, divideDecimal(maxSingleSideValueUSD, newPrice));
				assert.bnEqual(maxOrderSizes.short, divideDecimal(maxSingleSideValueUSD, newPrice));

				// Submit order on one side, leaving part of what's left.

				// 400 units submitted, out of 666.66.. available
				newPrice = toUnit('150');
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: newPrice,
					marginDelta: toUnit('10000'),
					sizeDelta: toUnit('400'),
				});

				maxOrderSizes = await perpsMarket.maxOrderSizes();
				assert.bnEqual(
					maxOrderSizes.long,
					divideDecimal(maxSingleSideValueUSD, newPrice).sub(toUnit('400'))
				);
				assert.bnEqual(maxOrderSizes.short, divideDecimal(maxSingleSideValueUSD, newPrice));

				// Submit order on the other side, removing all available supply.
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader2,
					fillPrice: newPrice,
					marginDelta: toUnit('10001'),
					sizeDelta: toUnit('-666.733'),
				});

				maxOrderSizes = await perpsMarket.maxOrderSizes();
				assert.bnEqual(
					maxOrderSizes.long,
					divideDecimal(maxSingleSideValueUSD, newPrice).sub(toUnit('400'))
				); // Long side is unaffected
				assert.bnEqual(maxOrderSizes.short, toUnit('0'));

				// An additional few units on the long side by another trader
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader3,
					fillPrice: newPrice,
					marginDelta: toUnit('10000'),
					sizeDelta: toUnit('200'),
				});

				maxOrderSizes = await perpsMarket.maxOrderSizes();
				assert.bnEqual(
					maxOrderSizes.long,
					divideDecimal(maxSingleSideValueUSD, newPrice).sub(toUnit('600'))
				);
				assert.bnEqual(maxOrderSizes.short, toUnit('0'));

				// Price increases - no more supply allowed.
				await setPrice(baseAsset, newPrice.mul(toBN(2)));
				maxOrderSizes = await perpsMarket.maxOrderSizes();
				assert.bnEqual(maxOrderSizes.long, toUnit('0')); // Long side is unaffected
				assert.bnEqual(maxOrderSizes.short, toUnit('0'));

				// Price decreases - more supply allowed again.
				newPrice = newPrice.div(toBN(4));
				await setPrice(baseAsset, newPrice);
				maxOrderSizes = await perpsMarket.maxOrderSizes();
				assert.bnEqual(
					maxOrderSizes.long,
					divideDecimal(maxSingleSideValueUSD, newPrice).sub(toUnit('600'))
				);
				assert.bnClose(
					maxOrderSizes.short,
					divideDecimal(maxSingleSideValueUSD, newPrice).sub(toUnit('666.73333')),
					toUnit('0.001')
				);
			});

			for (const side of ['long', 'short']) {
				describe(`${side}`, () => {
					let maxSize, maxMargin, orderSize;
					const leverage = side === 'long' ? toUnit('10') : toUnit('-10');

					beforeEach(async () => {
						await perpsSettings.setMaxSingleSideValueUSD(marketKey, toUnit('10000'), {
							from: owner,
						});
						await setPrice(baseAsset, toUnit('1'));

						const maxOrderSizes = await perpsMarket.maxOrderSizes();
						maxSize = maxOrderSizes[side];
						maxMargin = maxSize;
						orderSize = side === 'long' ? maxSize : maxSize.neg();
					});

					it('Orders are blocked if they exceed max market size', async () => {
						await perpsMarket.transferMargin(maxMargin.add(toUnit('11')), { from: trader });
						const tooBig = orderSize.div(toBN('10')).mul(toBN('11'));

						const postDetails = await perpsMarket.postTradeDetails(tooBig, trader);
						assert.equal(postDetails.status, Status.MaxMarketSizeExceeded);

						await assert.revert(
							perpsMarket.modifyPosition(tooBig, {
								from: trader,
							}),
							'Max market size exceeded'
						);

						// orders are allowed a bit over the formal limit to account for rounding etc.
						await perpsMarket.modifyPosition(orderSize.add(toBN('1')), { from: trader });
					});

					it('Orders are allowed a touch of extra size to account for price motion on confirmation', async () => {
						// Ensure there's some existing order size for prices to shunt around.
						await perpsMarket.transferMargin(maxMargin, {
							from: trader2,
						});
						await perpsMarket.modifyPosition(orderSize.div(toBN(10)).mul(toBN(7)), {
							from: trader2,
						});

						await perpsMarket.transferMargin(maxMargin, {
							from: trader,
						});

						// The price moves, so the value of the already-confirmed order shunts out the pending one.
						await setPrice(baseAsset, toUnit('1.08'));

						const sizeDelta = orderSize.div(toBN(100)).mul(toBN(25));
						const postDetails = await perpsMarket.postTradeDetails(sizeDelta, trader);
						assert.equal(postDetails.status, Status.MaxMarketSizeExceeded);
						await assert.revert(
							perpsMarket.modifyPosition(sizeDelta, {
								from: trader,
							}),
							'Max market size exceeded'
						);

						// Price moves back partially and allows the order to confirm
						await setPrice(baseAsset, toUnit('1.04'));
						await perpsMarket.modifyPosition(orderSize.div(toBN(100)).mul(toBN(25)), {
							from: trader,
						});
					});

					it('Orders are allowed to reduce in size (or close) even if the result is still over the max', async () => {
						const sideVar = leverage.div(leverage.abs());
						const initialSize = orderSize.div(toBN('10')).mul(toBN('8'));

						await perpsMarket.transferMargin(maxMargin.mul(toBN('10')), {
							from: trader,
						});
						await perpsMarket.modifyPosition(initialSize, { from: trader });

						// Now exceed max size (but price isn't so high that shorts would be liquidated)
						await setPrice(baseAsset, toUnit('1.9'));

						const sizes = await perpsMarket.maxOrderSizes();
						assert.bnEqual(sizes[leverage.gt(toBN('0')) ? 0 : 1], toBN('0'));

						// Reduce the order size, even though we are above the maximum
						await perpsMarket.modifyPosition(toUnit('-1').mul(sideVar), {
							from: trader,
						});
					});
				});
			}
		});

		describe('Closing positions', () => {
			it('can close an open position', async () => {
				const margin = toUnit('1000');
				await perpsMarket.transferMargin(margin, { from: trader });
				await setPrice(baseAsset, toUnit('200'));
				await perpsMarket.modifyPosition(toUnit('50'), { from: trader });

				await setPrice(baseAsset, toUnit('199'));
				await perpsMarket.closePosition({ from: trader });
				const position = await perpsMarket.positions(trader);
				const remaining = (await perpsMarket.remainingMargin(trader))[0];

				assert.bnEqual(position.margin, remaining);
				assert.bnEqual(position.size, toUnit(0));
				assert.bnEqual(position.lastPrice, toUnit('199'));

				// Skew, size, entry notional sum, debt are updated.
				assert.bnEqual(await perpsMarket.marketSkew(), toUnit(0));
				assert.bnEqual(await perpsMarket.marketSize(), toUnit(0));
				assert.bnEqual((await perpsMarket.marketDebt())[0], remaining);
				assert.bnEqual(await perpsMarket.entryDebtCorrection(), remaining);
			});

			it('Cannot close a position if it is liquidating', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('200'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('50'),
				});

				await setPrice(baseAsset, toUnit('100'));

				await assert.revert(
					perpsMarket.closePosition({ from: trader }),
					'Position can be liquidated'
				);
			});

			it('Cannot close an already-closed position', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('200'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('50'),
				});

				await perpsMarket.closePosition({ from: trader });
				const { size } = await perpsMarket.positions(trader);
				assert.bnEqual(size, toUnit(0));

				await assert.revert(perpsMarket.closePosition({ from: trader }), 'No position open');
			});

			it('position closure emits the appropriate event', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				await setPrice(baseAsset, toUnit('200'));
				const tx = await perpsMarket.closePosition({ from: trader });

				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, perpsMarket],
				});

				assert.equal(decodedLogs.length, 3);
				const fee = multiplyDecimal(toUnit(1000), baseFee).add(
					multiplyDecimal(toUnit(2000), baseFee)
				);

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsMarket.address,
					args: [
						toBN('1'),
						trader,
						toUnit('2000').sub(fee),
						toBN('0'),
						toUnit('-10'),
						(await perpsMarket.assetPrice()).price,
						await perpsMarket.fundingSequenceLength(),
						multiplyDecimal(toUnit(2000), baseFee),
					],
					log: decodedLogs[2],
					bnCloseVariance: toUnit('0.1'),
				});
			});

			it('closePositionWithTracking emits expected event', async () => {
				const size = toUnit('10');
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('200'),
					marginDelta: toUnit('1000'),
					sizeDelta: size,
				});

				const trackingCode = toBytes32('code');
				const tx = await perpsMarket.closePositionWithTracking(trackingCode, { from: trader });

				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, perpsMarket],
				});

				assert.equal(decodedLogs.length, 4);
				const fee = multiplyDecimal(toUnit(2000), baseFee);

				decodedEventEqual({
					event: 'Tracking',
					emittedFrom: perpsMarket.address,
					args: [trackingCode, baseAsset, marketKey, size.neg(), fee],
					log: decodedLogs[2],
					bnCloseVariance: toUnit('0.1'),
				});
			});

			it('transferring margin sets position id', async () => {
				await setPrice(baseAsset, toUnit('100'));

				// no positions
				assert.equal(await perpsMarket.lastPositionId(), 0);

				// Trader 1 gets position id 1.
				let tx = await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsMarket],
				});
				assert.equal(decodedLogs[3].name, 'PositionModified');
				assert.equal(decodedLogs[3].events[0].name, 'id');
				assert.bnEqual(decodedLogs[3].events[0].value, toBN('1'));
				assert.equal(await perpsMarket.positionIdOwner(1), trader);

				// next is 2
				assert.equal(await perpsMarket.lastPositionId(), 1);

				// trader 2 gets 2
				tx = await perpsMarket.transferMargin(toUnit('1000'), { from: trader2 });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsMarket],
				});
				assert.equal(decodedLogs[3].name, 'PositionModified');
				assert.equal(decodedLogs[3].events[0].name, 'id');
				assert.bnEqual(decodedLogs[3].events[0].value, toBN('2'));
				assert.equal(await perpsMarket.positionIdOwner(2), trader2);

				// next is 3
				assert.equal(await perpsMarket.lastPositionId(), 2);

				// And the ids have been modified
				let positionId = (await perpsMarket.positions(trader)).id;
				assert.bnEqual(positionId, toBN('1'));
				positionId = (await perpsMarket.positions(trader2)).id;
				assert.bnEqual(positionId, toBN('2'));
			});

			it('modifying a position retains the same id', async () => {
				await setPrice(baseAsset, toUnit('100'));
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });

				// Trader gets position id 1.
				let tx = await perpsMarket.modifyPosition(toUnit('10'), { from: trader });
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsMarket],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('1'));

				let positionId = (await perpsMarket.positions(trader)).id;
				assert.bnEqual(positionId, toBN('1'));

				// Modification (but not closure) does not alter the id
				tx = await perpsMarket.modifyPosition(toUnit('-5'), { from: trader });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsMarket],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('1'));

				// And the ids have been modified
				positionId = (await perpsMarket.positions(trader)).id;
				assert.bnEqual(positionId, toBN('1'));
			});

			it('closing a position does not delete the id', async () => {
				await setPrice(baseAsset, toUnit('100'));
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader2 });

				// Close by closePosition
				let tx = await perpsMarket.modifyPosition(toUnit('10'), { from: trader });
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsMarket],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('1'));

				let positionId = (await perpsMarket.positions(trader)).id;
				assert.bnEqual(positionId, toBN('1'));

				tx = await perpsMarket.closePosition({ from: trader });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsMarket],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('1'));

				positionId = (await perpsMarket.positions(trader)).id;
				assert.bnEqual(positionId, toBN('1'));

				// Close by modifyPosition
				tx = await perpsMarket.modifyPosition(toUnit('10'), { from: trader2 });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsMarket],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('2'));

				positionId = (await perpsMarket.positions(trader2)).id;
				assert.bnEqual(positionId, toBN('2'));

				tx = await perpsMarket.modifyPosition(toUnit('-10'), { from: trader2 });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsMarket],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('2'));
			});

			it('closing a position and opening one after should not increment the position id', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				const { id: oldPositionId } = await perpsMarket.positions(trader);
				assert.bnEqual(oldPositionId, toBN('1'));

				await setPrice(baseAsset, toUnit('200'));
				let tx = await perpsMarket.closePosition({ from: trader });

				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsMarket],
				});

				// No fee => no fee minting log, so decodedLogs index == 1
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('1'));

				tx = await perpsMarket.modifyPosition(toUnit('10'), { from: trader });

				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsMarket],
				});

				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('1'));

				const { id: newPositionId } = await perpsMarket.positions(trader);
				assert.bnEqual(newPositionId, toBN('1'));

				assert.bnEqual(await perpsMarket.positionIdOwner(toBN('1')), trader);
			});
		});

		describe('post-trade position details', async () => {
			const getPositionDetails = async ({ account }) => {
				const newPosition = await perpsMarket.positions(account);
				const { price: liquidationPrice } = await perpsMarket.approxLiquidationPriceAndFee(account);
				return {
					...newPosition,
					liquidationPrice,
				};
			};
			const sizeDelta = toUnit('10');

			it('can get position details for new position', async () => {
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await setPrice(await perpsMarket.baseAsset(), toUnit('240'));

				const expectedDetails = await perpsMarket.postTradeDetails(sizeDelta, trader);

				// Now execute the trade.
				await perpsMarket.modifyPosition(sizeDelta, {
					from: trader,
				});

				const details = await getPositionDetails({ account: trader });

				assert.bnClose(expectedDetails.margin, details.margin, toUnit(0.01)); // one block of funding rate has accrued
				assert.bnEqual(expectedDetails.size, details.size);
				assert.bnEqual(expectedDetails.price, details.lastPrice);
				assert.bnClose(expectedDetails.liqPrice, details.liquidationPrice, toUnit(0.01));
				assert.bnEqual(expectedDetails.fee, toUnit('7.2'));
				assert.bnEqual(expectedDetails.status, Status.Ok);
			});

			it('uses the margin of an existing position', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('240'),
					marginDelta: toUnit('1000'),
					sizeDelta,
				});

				const expectedDetails = await perpsMarket.postTradeDetails(sizeDelta, trader);

				// Now execute the trade.
				await perpsMarket.modifyPosition(sizeDelta, {
					from: trader,
				});

				const details = await getPositionDetails({ account: trader });

				assert.bnClose(expectedDetails.margin, details.margin, toUnit(0.01)); // one block of funding rate has accrued
				assert.bnEqual(expectedDetails.size, details.size);
				assert.bnEqual(expectedDetails.price, details.lastPrice);
				assert.bnClose(expectedDetails.positionLiquidationPrice, details.liqPrice, toUnit(0.01));
				assert.bnEqual(expectedDetails.fee, toUnit('7.2'));
				assert.bnEqual(expectedDetails.status, Status.Ok);
			});
		});
	});

	describe('Profit & Loss, margin, leverage', () => {
		describe('PnL', () => {
			beforeEach(async () => {
				await setPrice(baseAsset, toUnit('100'));
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('50'), { from: trader });
				await perpsMarket.transferMargin(toUnit('4000'), { from: trader2 });
				await perpsMarket.modifyPosition(toUnit('-40'), { from: trader2 });
			});

			it('steady price', async () => {
				assert.bnEqual((await perpsMarket.profitLoss(trader))[0], toBN(0));
				assert.bnEqual((await perpsMarket.profitLoss(trader2))[0], toBN(0));
			});

			it('price increase', async () => {
				await setPrice(baseAsset, toUnit('150'));
				assert.bnEqual((await perpsMarket.profitLoss(trader))[0], toUnit('2500'));
				assert.bnEqual((await perpsMarket.profitLoss(trader2))[0], toUnit('-2000'));
			});

			it('price decrease', async () => {
				await setPrice(baseAsset, toUnit('90'));

				assert.bnEqual((await perpsMarket.profitLoss(trader))[0], toUnit('-500'));
				assert.bnEqual((await perpsMarket.profitLoss(trader2))[0], toUnit('400'));
			});

			it('Reports invalid prices properly', async () => {
				assert.isFalse((await perpsMarket.profitLoss(trader))[1]);
				await fastForward(7 * 24 * 60 * 60); // Stale the prices
				assert.isTrue((await perpsMarket.profitLoss(trader))[1]);
			});

			it.skip('Zero profit on a zero-size position', async () => {
				assert.isTrue(false);
			});
		});

		describe('Remaining margin', async () => {
			let fee, fee2;

			beforeEach(async () => {
				await setPrice(baseAsset, toUnit('100'));
				fee = (await perpsMarket.orderFee(toUnit('50')))[0];
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('50'), { from: trader });
				fee2 = (await perpsMarket.orderFee(toUnit('-50')))[0];
				await perpsMarket.transferMargin(toUnit('5000'), { from: trader2 });
				await perpsMarket.modifyPosition(toUnit('-50'), { from: trader2 });
			});

			it('Remaining margin unchanged with no funding or profit', async () => {
				await fastForward(24 * 60 * 60);
				// Note that the first guy paid a bit of funding as there was a delay between confirming
				// the first and second orders
				assert.bnClose(
					(await perpsMarket.remainingMargin(trader))[0],
					toUnit('1000').sub(fee),
					toUnit('0.1')
				);
				assert.bnEqual((await perpsMarket.remainingMargin(trader2))[0], toUnit('5000').sub(fee2));
			});

			describe.skip('profit and no funding', async () => {
				it('positive profit', async () => {
					assert.isTrue(false);
				});

				it('negative profit', async () => {
					assert.isTrue(false);
				});
			});

			describe.skip('funding and no profit', async () => {
				it('positive funding', async () => {
					assert.isTrue(false);
				});

				it('negative funding', async () => {
					assert.isTrue(false);
				});
			});

			describe.skip('funding and profit', async () => {
				it('positive sum', async () => {
					assert.isTrue(false);
				});

				it('negative sum', async () => {
					assert.isTrue(false);
				});
			});

			it.skip('Remaining margin is clamped to zero if losses exceed initial margin', async () => {
				assert.isTrue(false);
			});

			it('Remaining margin reports invalid prices properly', async () => {
				assert.isFalse((await perpsMarket.remainingMargin(trader))[1]);
				await fastForward(7 * 24 * 60 * 60); // Stale the prices
				assert.isTrue((await perpsMarket.remainingMargin(trader))[1]);
			});
		});

		describe('Accessible margin', async () => {
			const withdrawAccessibleAndValidate = async account => {
				let accessible = (await perpsMarket.accessibleMargin(account))[0];
				await perpsMarket.transferMargin(accessible.neg(), { from: account });
				accessible = (await perpsMarket.accessibleMargin(account))[0];
				assert.bnClose(accessible, toBN('0'), toUnit('1'));
				await assert.revert(
					perpsMarket.transferMargin(toUnit('-1'), { from: account }),
					'Insufficient margin'
				);
			};

			it('With no position, entire margin is accessible.', async () => {
				const margin = toUnit('1234.56789');
				await perpsMarket.transferMargin(margin, { from: trader3 });
				assert.bnEqual((await perpsMarket.accessibleMargin(trader3))[0], margin);
				await withdrawAccessibleAndValidate(trader3);
			});

			it('With a tiny position, minimum margin requirement is enforced.', async () => {
				const margin = toUnit('1234.56789');
				const size = margin.div(toBN(10000));
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: margin,
					sizeDelta: size,
				});
				assert.bnClose(
					(await perpsMarket.accessibleMargin(trader3))[0],
					margin.sub(minInitialMargin),
					toUnit('0.1')
				);
				await withdrawAccessibleAndValidate(trader3);

				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: margin,
					sizeDelta: size.neg(),
				});
				assert.bnClose(
					(await perpsMarket.accessibleMargin(trader2))[0],
					margin.sub(minInitialMargin),
					toUnit('0.1')
				);
				await withdrawAccessibleAndValidate(trader2);
			});

			it('At max leverage, no margin is accessible.', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('123.4'),
				});
				assert.bnEqual((await perpsMarket.accessibleMargin(trader3))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader3);

				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('-123.4'),
				});
				assert.bnEqual((await perpsMarket.accessibleMargin(trader2))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader2);
			});

			it('At above max leverage, no margin is accessible.', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('12.34').mul(toBN('8')),
				});

				await setPrice(baseAsset, toUnit('90'));

				assert.bnGt((await perpsMarket.currentLeverage(trader3))[0], maxLeverage);
				assert.bnEqual((await perpsMarket.accessibleMargin(trader3))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader3);

				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('-12.34').mul(toBN('8')),
					leverage: toUnit('-8'),
				});

				await setPrice(baseAsset, toUnit('110'));

				assert.bnGt((await perpsMarket.currentLeverage(trader2))[0].neg(), maxLeverage);
				assert.bnEqual((await perpsMarket.accessibleMargin(trader2))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader2);
			});

			it('If a position is subject to liquidation, no margin is accessible.', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('12.34').mul(toBN('8')),
				});

				await setPrice(baseAsset, toUnit('80'));
				assert.isTrue(await perpsMarket.canLiquidate(trader3));
				assert.bnEqual((await perpsMarket.accessibleMargin(trader3))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader3);

				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('12.34').mul(toBN('-8')),
				});

				await setPrice(baseAsset, toUnit('120'));
				assert.isTrue(await perpsMarket.canLiquidate(trader2));
				assert.bnEqual((await perpsMarket.accessibleMargin(trader2))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader2);
			});

			it('If remaining margin is below minimum initial margin, no margin is accessible.', async () => {
				const size = toUnit('10.5');
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('105'),
					sizeDelta: size,
				});

				// The price moves down, eating into the margin, but the leverage is reduced to acceptable levels
				let price = toUnit('95');
				await setPrice(baseAsset, price);
				let remaining = (await perpsMarket.remainingMargin(trader3))[0];
				const sizeFor9x = divideDecimal(remaining.mul(toBN('9')), price);
				await perpsMarket.modifyPosition(sizeFor9x.sub(size), { from: trader3 });

				assert.bnEqual((await perpsMarket.accessibleMargin(trader3))[0], toUnit('0'));

				price = toUnit('100');
				await setPrice(baseAsset, price);
				remaining = (await perpsMarket.remainingMargin(trader3))[0];
				const sizeForNeg10x = divideDecimal(remaining.mul(toBN('-10')), price);

				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('105'),
					sizeDelta: sizeForNeg10x.sub(sizeFor9x),
				});

				// The price moves up, eating into the margin, but the leverage is reduced to acceptable levels
				price = toUnit('111');
				await setPrice(baseAsset, price);
				remaining = (await perpsMarket.remainingMargin(trader3))[0];
				const sizeForNeg9x = divideDecimal(remaining.mul(toBN('-9')), price);
				await perpsMarket.modifyPosition(sizeForNeg10x.sub(sizeForNeg9x), { from: trader3 });

				assert.bnEqual((await perpsMarket.accessibleMargin(trader3))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader3);
			});

			it('With a fraction of max leverage position, a complementary fraction of margin is accessible', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('50'),
				});
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-20'),
				});

				// Give fairly wide bands to account for fees
				assert.bnClose(
					(await perpsMarket.accessibleMargin(trader))[0],
					toUnit('500'),
					toUnit('20')
				);
				await withdrawAccessibleAndValidate(trader);
				assert.bnClose(
					(await perpsMarket.accessibleMargin(trader2))[0],
					toUnit('800'),
					toUnit('7')
				);
				await withdrawAccessibleAndValidate(trader2);
			});

			it('After some profit, more margin becomes accessible', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('100'),
				});
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-50'),
				});

				// No margin is accessible at max leverage
				assert.bnEqual((await perpsMarket.accessibleMargin(trader))[0], toUnit('0'));

				// The more conservative trader has about half margin accessible
				assert.bnClose(
					(await perpsMarket.accessibleMargin(trader2))[0],
					toUnit('500'),
					toUnit('16')
				);

				// Price goes up 10%
				await setPrice(baseAsset, toUnit('110'));

				// At 10x, the trader makes 100% on their margin
				assert.bnClose(
					(await perpsMarket.accessibleMargin(trader))[0],
					toUnit('1000').sub(minInitialMargin),
					toUnit('40')
				);
				await withdrawAccessibleAndValidate(trader);

				// Price goes down 10% relative to the original price
				await setPrice(baseAsset, toUnit('90'));

				// The 5x short trader makes 50% on their margin
				assert.bnClose(
					(await perpsMarket.accessibleMargin(trader2))[0],
					toUnit('1000'), // no deduction of min initial margin because the trader would still be above the min at max leverage
					toUnit('50')
				);
				await withdrawAccessibleAndValidate(trader2);
			});

			it('After a loss, less margin is accessible', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('20'),
				});
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-50'),
				});

				// The more conservative trader has about 80% margin accessible
				assert.bnClose(
					(await perpsMarket.accessibleMargin(trader))[0],
					toUnit('800'),
					toUnit('10')
				);

				// The other, about 50% margin accessible
				assert.bnClose(
					(await perpsMarket.accessibleMargin(trader2))[0],
					toUnit('500'),
					toUnit('16')
				);

				// Price goes falls 10%
				await setPrice(baseAsset, toUnit('90'));

				// At 2x, the trader loses 20% of their margin
				assert.bnClose(
					(await perpsMarket.accessibleMargin(trader))[0],
					toUnit('600'),
					toUnit('40')
				);
				await withdrawAccessibleAndValidate(trader);

				// Price goes up 5% relative to the original price
				await setPrice(baseAsset, toUnit('105'));

				// The 5x short trader loses 25% of their margin
				assert.bnClose(
					(await perpsMarket.accessibleMargin(trader2))[0],
					toUnit('250'),
					toUnit('50')
				);
				await withdrawAccessibleAndValidate(trader2);
			});

			it('Larger position', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('10000'),
					sizeDelta: toUnit('1000'),
				});

				// No margin is accessible at max leverage
				assert.bnEqual((await perpsMarket.accessibleMargin(trader))[0], toUnit('0'));

				// Price goes up 10%
				await setPrice(baseAsset, toUnit('110'));

				// At 10x, the trader makes 100% on their margin
				assert.bnClose(
					(await perpsMarket.accessibleMargin(trader))[0],
					toUnit('10000')
						.sub(minInitialMargin)
						.sub(toUnit('1200')),
					toUnit('10')
				);
				await withdrawAccessibleAndValidate(trader);
			});

			it('Accessible margin function properly reports invalid price', async () => {
				assert.isFalse((await perpsMarket.accessibleMargin(trader))[1]);
				await fastForward(7 * 24 * 60 * 60);
				assert.isTrue((await perpsMarket.accessibleMargin(trader))[1]);
			});

			describe('withdrawAllMargin', () => {
				it('Reverts if the price is invalid', async () => {
					await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
					await fastForward(7 * 24 * 60 * 60);
					await assert.revert(perpsMarket.withdrawAllMargin({ from: trader }), 'Invalid price');
				});

				it('Reverts if the system is suspended', async () => {
					await perpsMarket.transferMargin(toUnit('1000'), { from: trader });

					// suspend
					await systemStatus.suspendSystem('3', { from: owner });
					// should revert
					await assert.revert(
						perpsMarket.withdrawAllMargin({ from: trader }),
						'Synthetix is suspended'
					);

					// resume
					await systemStatus.resumeSystem({ from: owner });
					// should work now
					await perpsMarket.withdrawAllMargin({ from: trader });
					assert.bnClose((await perpsMarket.accessibleMargin(trader))[0], toBN('0'), toUnit('0.1'));
				});

				it('allows users to withdraw all their margin', async () => {
					await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
					await perpsMarket.transferMargin(toUnit('3000'), { from: trader2 });
					await perpsMarket.transferMargin(toUnit('10000'), { from: trader3 });

					await setPrice(baseAsset, toUnit('10'));

					await perpsMarket.modifyPosition(toUnit('500'), { from: trader });
					await perpsMarket.modifyPosition(toUnit('-1100'), { from: trader2 });
					await perpsMarket.modifyPosition(toUnit('9000'), { from: trader3 });

					assert.bnGt((await perpsMarket.accessibleMargin(trader))[0], toBN('0'));
					assert.bnGt((await perpsMarket.accessibleMargin(trader2))[0], toBN('0'));
					assert.bnGt((await perpsMarket.accessibleMargin(trader3))[0], toBN('0'));

					await perpsMarket.withdrawAllMargin({ from: trader });

					await setPrice(baseAsset, toUnit('11.4847'));

					await perpsMarket.withdrawAllMargin({ from: trader });
					await perpsMarket.withdrawAllMargin({ from: trader2 });
					await perpsMarket.withdrawAllMargin({ from: trader3 });

					assert.bnClose((await perpsMarket.accessibleMargin(trader))[0], toBN('0'), toUnit('0.1'));
					assert.bnClose(
						(await perpsMarket.accessibleMargin(trader2))[0],
						toBN('0'),
						toUnit('0.1')
					);
					assert.bnClose(
						(await perpsMarket.accessibleMargin(trader3))[0],
						toBN('0'),
						toUnit('0.1')
					);
				});

				it('Does nothing with an empty margin', async () => {
					let margin = await perpsMarket.remainingMargin(trader);
					assert.bnEqual(margin[0], toBN('0'));
					await perpsMarket.withdrawAllMargin({ from: trader });
					margin = await perpsMarket.remainingMargin(trader);
					assert.bnEqual(margin[0], toBN('0'));
				});

				it('Withdraws everything with no position', async () => {
					await perpsMarket.transferMargin(toUnit('1000'), { from: trader });

					let margin = await perpsMarket.remainingMargin(trader);
					assert.bnEqual(margin[0], toUnit('1000'));

					await perpsMarket.withdrawAllMargin({ from: trader });
					margin = await perpsMarket.remainingMargin(trader);
					assert.bnEqual(margin[0], toBN('0'));
				});

				it('Profit allows more to be withdrawn', async () => {
					await perpsMarket.transferMargin(toUnit('1239.2487'), { from: trader });

					await setPrice(baseAsset, toUnit('15.53'));
					await perpsMarket.modifyPosition(toUnit('-322'), { from: trader });

					await perpsMarket.withdrawAllMargin({ from: trader });
					assert.bnClose((await perpsMarket.accessibleMargin(trader))[0], toBN('0'), toUnit('0.1'));
					await setPrice(baseAsset, toUnit('1.777'));
					assert.bnGt((await perpsMarket.accessibleMargin(trader))[0], toBN('0'));

					await perpsMarket.withdrawAllMargin({ from: trader });
					assert.bnClose((await perpsMarket.accessibleMargin(trader))[0], toBN('0'), toUnit('0.1'));
				});
			});
		});

		describe('Leverage', async () => {
			it('current leverage', async () => {
				let price = toUnit(100);

				await setPrice(baseAsset, price);
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('50'), { from: trader }); // 5x
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsMarket.modifyPosition(toUnit('-100'), { from: trader2 }); // -10x

				const fee1 = multiplyDecimal(toUnit('5000'), baseFee);
				const fee2 = multiplyDecimal(toUnit('10000'), baseFee);

				const lev = (notional, margin, fee) => divideDecimal(notional, margin.sub(fee));

				// With no price motion and no funding rate, leverage should be unchanged.
				assert.bnClose(
					(await perpsMarket.currentLeverage(trader))[0],
					lev(toUnit('5000'), toUnit('1000'), fee1),
					toUnit(0.1)
				);
				assert.bnClose(
					(await perpsMarket.currentLeverage(trader2))[0],
					lev(toUnit('-10000'), toUnit('1000'), fee2),
					toUnit(0.1)
				);

				price = toUnit(105);
				await setPrice(baseAsset, price);

				// Price moves to 105:
				// long notional value 5000 -> 5250; long remaining margin 1000 -> 1250; leverage 5 -> 4.2
				// short notional value -10000 -> -10500; short remaining margin 1000 -> 500; leverage 10 -> 21;
				assert.bnClose(
					(await perpsMarket.currentLeverage(trader))[0],
					lev(toUnit('5250'), toUnit('1250'), fee1),
					toUnit(0.1)
				);
				assert.bnClose(
					(await perpsMarket.currentLeverage(trader2))[0],
					lev(toUnit('-10500'), toUnit('500'), fee2),
					toUnit(0.1)
				);
			});

			it('current leverage can be less than 1', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('5'),
				});

				assert.bnEqual((await perpsMarket.positions(trader)).size, toUnit('5'));
				assert.bnClose((await perpsMarket.currentLeverage(trader))[0], toUnit(0.5), toUnit(0.001));

				// The response of leverage to price with leverage < 1 is opposite to leverage > 1
				// When leverage is fractional, increasing the price increases leverage
				await setPrice(baseAsset, toUnit('300'));
				assert.bnClose((await perpsMarket.currentLeverage(trader))[0], toUnit(0.75), toUnit(0.001));
				// ...while decreasing the price deleverages the position.
				await setPrice(baseAsset, toUnit('100').div(toBN(3)));
				assert.bnClose((await perpsMarket.currentLeverage(trader))[0], toUnit(0.25), toUnit(0.001));
			});

			it('current leverage: no position', async () => {
				const currentLeverage = await perpsMarket.currentLeverage(trader);
				assert.bnEqual(currentLeverage[0], toBN('0'));
			});

			it('current leverage properly reports invalid prices', async () => {
				assert.isFalse((await perpsMarket.currentLeverage(trader))[1]);
				await fastForward(7 * 24 * 60 * 60);
				assert.isTrue((await perpsMarket.currentLeverage(trader))[1]);
			});
		});
	});

	describe('Funding', () => {
		it('An empty market induces zero funding rate', async () => {
			assert.bnEqual(await perpsMarket.currentFundingRate(), toUnit(0));
		});

		it('A balanced market induces zero funding rate', async () => {
			for (const traderDetails of [
				['100', trader],
				['-100', trader2],
			]) {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: traderDetails[1],
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit(traderDetails[0]),
				});
			}
			assert.bnEqual(await perpsMarket.currentFundingRate(), toUnit(0));
		});

		it('A balanced market (with differing leverage) induces zero funding rate', async () => {
			for (const traderDetails of [
				['1000', '50', trader],
				['2000', '-50', trader2],
			]) {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: traderDetails[2],
					fillPrice: toUnit('100'),
					marginDelta: toUnit(traderDetails[0]),
					sizeDelta: toUnit(traderDetails[1]),
				});
			}
			assert.bnEqual(await perpsMarket.currentFundingRate(), toUnit(0));
		});

		it('Various skew rates', async () => {
			// Market is balanced
			assert.bnEqual(await perpsMarket.currentFundingRate(), toUnit(0));

			const price = toUnit(250);

			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader,
				fillPrice: price,
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('12'),
			});

			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader2,
				fillPrice: price,
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-12'),
			});

			assert.bnEqual(await perpsMarket.currentFundingRate(), toUnit(0));

			const minScale = divideDecimal(
				(await perpsSettings.parameters(marketKey)).skewScaleUSD,
				price
			);
			const maxFundingRate = await perpsMarket.maxFundingRate();
			// Market is 24 units long skewed (24 / 100000)
			await perpsMarket.modifyPosition(toUnit('24'), { from: trader });
			let marketSkew = await perpsMarket.marketSkew();
			assert.bnEqual(
				await perpsMarket.currentFundingRate(),
				multiplyDecimal(divideDecimal(marketSkew, minScale), maxFundingRate.neg())
			);

			// 50% the other way ()
			await perpsMarket.modifyPosition(toUnit('-32'), { from: trader });
			marketSkew = await perpsMarket.marketSkew();
			assert.bnClose(
				await perpsMarket.currentFundingRate(),
				multiplyDecimal(divideDecimal(marketSkew, minScale), maxFundingRate.neg())
			);

			// Market is 100% skewed
			await perpsMarket.closePosition({ from: trader });
			marketSkew = await perpsMarket.marketSkew();
			assert.bnClose(
				await perpsMarket.currentFundingRate(),
				multiplyDecimal(divideDecimal(marketSkew, minScale), maxFundingRate.neg())
			);

			// 100% the other way
			await perpsMarket.modifyPosition(toUnit('4'), { from: trader });
			await perpsMarket.closePosition({ from: trader2 });
			marketSkew = await perpsMarket.marketSkew();
			assert.bnClose(
				await perpsMarket.currentFundingRate(),
				multiplyDecimal(divideDecimal(marketSkew, minScale), maxFundingRate.neg())
			);
		});

		it('Altering the max funding has a proportional effect', async () => {
			// 0, +-50%, +-100%
			assert.bnEqual(await perpsMarket.currentFundingRate(), toUnit(0));

			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('12'),
			});

			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader2,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-4'),
			});

			const expectedFunding = toUnit('-0.002'); // 8 * 250 / 100_000 skew * 0.1 max funding rate
			assert.bnEqual(await perpsMarket.currentFundingRate(), expectedFunding);

			await perpsSettings.setMaxFundingRate(marketKey, toUnit('0.2'), { from: owner });
			assert.bnEqual(
				await perpsMarket.currentFundingRate(),
				multiplyDecimal(expectedFunding, toUnit(2))
			);
			await perpsSettings.setMaxFundingRate(marketKey, toUnit('0'), { from: owner });
			assert.bnEqual(await perpsMarket.currentFundingRate(), toUnit('0'));
		});

		it('Altering the skewScaleUSD has a proportional effect', async () => {
			const initialPrice = 100;
			const price = 250;
			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader,
				fillPrice: toUnit(price),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-12'),
			});

			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader2,
				fillPrice: toUnit(price),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('4'),
			});

			const expectedFunding = toUnit('0.002'); // 8 * 250 / 100_000 skew * 0.1 max funding rate
			assert.bnEqual(await perpsMarket.currentFundingRate(), expectedFunding);

			await perpsSettings.setSkewScaleUSD(marketKey, toUnit(500 * initialPrice), {
				from: owner,
			});
			assert.bnEqual(
				await perpsMarket.currentFundingRate(),
				multiplyDecimal(expectedFunding, toUnit('2'))
			);

			await perpsSettings.setSkewScaleUSD(marketKey, toUnit(250 * initialPrice), {
				from: owner,
			});
			assert.bnEqual(
				await perpsMarket.currentFundingRate(),
				multiplyDecimal(expectedFunding, toUnit('4'))
			);

			await perpsSettings.setSkewScaleUSD(marketKey, toUnit(2000 * initialPrice), {
				from: owner,
			});
			assert.bnEqual(
				await perpsMarket.currentFundingRate(),
				multiplyDecimal(expectedFunding, toUnit('0.5'))
			);

			// skewScaleUSD is below market size
			await perpsSettings.setSkewScaleUSD(marketKey, toUnit(4 * price), { from: owner });
			assert.bnEqual(await perpsMarket.currentFundingRate(), toUnit('0.1')); // max funding rate
		});

		for (const leverage of ['1', '-1'].map(toUnit)) {
			const side = parseInt(leverage.toString()) > 0 ? 'long' : 'short';

			describe(`${side}`, () => {
				beforeEach(async () => {
					await perpsSettings.setMaxSingleSideValueUSD(marketKey, toUnit('100000'), {
						from: owner,
					});
				});
				it('100% skew induces maximum funding rate', async () => {
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader,
						fillPrice: toUnit('1'),
						marginDelta: toUnit('1000000'),
						sizeDelta: divideDecimal(multiplyDecimal(leverage, toUnit('1000000')), toUnit('10')),
					});

					const expected = side === 'long' ? -maxFundingRate : maxFundingRate;

					assert.bnEqual(await perpsMarket.currentFundingRate(), expected);
				});

				it('Different skew rates induce proportional funding levels', async () => {
					// skewScaleUSD is below actual skew
					const skewScaleUSD = toUnit(100 * 100);
					await perpsSettings.setSkewScaleUSD(marketKey, skewScaleUSD, { from: owner });

					const traderPos = leverage.mul(toBN('10'));
					await transferMarginAndModifyPosition({
						market: perpsMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: toUnit('1000'),
						sizeDelta: traderPos,
					});
					await perpsMarket.transferMargin(toUnit('1000'), { from: trader2 });

					const points = 5;

					await setPrice(baseAsset, toUnit('100'));

					for (const maxFR of ['0.1', '0.2', '0.05'].map(toUnit)) {
						await perpsSettings.setMaxFundingRate(marketKey, maxFR, { from: owner });

						for (let i = points; i >= 0; i--) {
							// now lerp from leverage*k to leverage
							const frac = leverage.mul(toBN(i)).div(toBN(points));
							const oppLev = frac.neg();
							const size = oppLev.mul(toBN('10'));
							if (size.abs().gt(toBN('0'))) {
								await perpsMarket.modifyPosition(size, { from: trader2 });
							}

							const skewUSD = multiplyDecimal(traderPos.add(size), toUnit('100'));
							let expected = maxFR
								.mul(skewUSD)
								.div(skewScaleUSD)
								.neg();

							if (expected.gt(maxFR)) {
								expected = maxFR;
							}

							assert.bnClose(await perpsMarket.currentFundingRate(), expected, toUnit('0.01'));

							if (size.abs().gt(toBN(0))) {
								await perpsMarket.closePosition({ from: trader2 });
							}
						}
					}
				});
			});
		}

		it('Funding can be paused when market is paused', async () => {
			assert.bnEqual(await perpsMarket.currentFundingRate(), toUnit(0));

			const price = toUnit('250');
			await transferMarginAndModifyPosition({
				market: perpsMarket,
				account: trader,
				fillPrice: price,
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('12'),
			});

			const fundingRate = toUnit('-0.003'); // 12 * 250 / 100_000 skew * 0.1 max funding rate
			assert.bnEqual(await perpsMarket.currentFundingRate(), fundingRate);

			// 1 day
			await fastForward(24 * 60 * 60);
			await setPrice(baseAsset, price);

			// pause the market
			await systemStatus.suspendFuturesMarket(marketKey, '0', { from: owner });
			// set funding rate to 0
			await perpsSettings.setMaxFundingRate(marketKey, toUnit('0'), { from: owner });

			// check accrued
			const accrued = (await perpsMarket.accruedFunding(trader))[0];
			assert.bnClose(accrued, fundingRate.mul(toBN(250 * 12)), toUnit('0.01'));

			// 2 days of pause
			await fastForward(2 * 24 * 60 * 60);
			await setPrice(baseAsset, price);

			// check no funding accrued
			assert.bnEqual((await perpsMarket.accruedFunding(trader))[0], accrued);

			// set funding rate to 0.1 again
			await perpsSettings.setMaxFundingRate(marketKey, toUnit('0.1'), { from: owner });
			// resume
			await systemStatus.resumeFuturesMarket(marketKey, { from: owner });

			// 1 day
			await fastForward(24 * 60 * 60);
			await setPrice(baseAsset, price);

			// check more funding accrued
			assert.bnGt((await perpsMarket.accruedFunding(trader))[0].abs(), accrued.abs());
		});

		describe('Funding sequence', () => {
			const price = toUnit('100');
			beforeEach(async () => {
				// Set up some market skew so that funding is being incurred.
				// Proportional Skew = 0.5, so funding rate is 0.05 per day.
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: price,
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('90'),
				});

				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader2,
					fillPrice: price,
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-30'),
				});
			});

			it.skip('Funding sequence is recomputed by order submission', async () => {
				assert.isTrue(false);
			});

			it.skip('Funding sequence is recomputed by order confirmation', async () => {
				assert.isTrue(false);
			});

			it.skip('Funding sequence is recomputed by order cancellation', async () => {
				assert.isTrue(false);
			});

			it.skip('Funding sequence is recomputed by position closure', async () => {
				assert.isTrue(false);
			});

			it.skip('Funding sequence is recomputed by liquidation', async () => {
				assert.isTrue(false);
			});

			it.skip('Funding sequence is recomputed by margin transfers', async () => {
				assert.isTrue(false);
			});

			it('Funding sequence is recomputed by setting funding rate parameters', async () => {
				// no skewScaleUSD
				await perpsSettings.setSkewScaleUSD(marketKey, toUnit('10000'), { from: owner });

				assert.bnEqual(await perpsMarket.fundingSequenceLength(), initialFundingIndex.add(toBN(6)));
				await fastForward(24 * 60 * 60);
				await setPrice(baseAsset, toUnit('100'));
				assert.bnClose((await perpsMarket.unrecordedFunding())[0], toUnit('-6'), toUnit('0.01'));

				await perpsSettings.setMaxFundingRate(marketKey, toUnit('0.2'), { from: owner });
				const time = await currentTime();

				assert.bnEqual(await perpsMarket.fundingSequenceLength(), initialFundingIndex.add(toBN(7)));
				assert.bnEqual(await perpsMarket.fundingLastRecomputed(), time);
				assert.bnClose(
					await perpsMarket.fundingSequence(initialFundingIndex.add(toBN(6))),
					toUnit('-6'),
					toUnit('0.01')
				);
				assert.bnClose((await perpsMarket.unrecordedFunding())[0], toUnit('0'), toUnit('0.01'));

				await fastForward(24 * 60 * 60);
				await setPrice(baseAsset, toUnit('200'));
				assert.bnClose((await perpsMarket.unrecordedFunding())[0], toUnit('-40'), toUnit('0.01'));

				assert.bnEqual(await perpsMarket.fundingSequenceLength(), initialFundingIndex.add(toBN(7)));

				await fastForward(24 * 60 * 60);
				await setPrice(baseAsset, toUnit('300'));
				assert.bnClose((await perpsMarket.unrecordedFunding())[0], toUnit('-120'), toUnit('0.01'));
			});
		});

		it.skip('A zero-size position accrues no funding', async () => {
			assert.isTrue(false);
		});
	});

	describe('Market Debt', () => {
		it('Basic debt movements', async () => {
			assert.bnEqual(await perpsMarket.entryDebtCorrection(), toUnit('0'));
			assert.bnEqual((await perpsMarket.marketDebt())[0], toUnit('0'));

			await setPrice(baseAsset, toUnit('100'));
			await perpsMarket.transferMargin(toUnit('1000'), { from: trader }); // Debt correction: +1000
			const fee1 = (await perpsMarket.orderFee(toUnit('50')))[0];
			await perpsMarket.modifyPosition(toUnit('50'), { from: trader }); // Debt correction: -5000 - fee1

			assert.bnEqual(await perpsMarket.entryDebtCorrection(), toUnit('-4000').sub(fee1));
			assert.bnEqual((await perpsMarket.marketDebt())[0], toUnit('1000').sub(fee1));

			await setPrice(baseAsset, toUnit('120'));
			await perpsMarket.transferMargin(toUnit('600'), { from: trader2 }); // Debt correction: +600
			const fee2 = (await perpsMarket.orderFee(toUnit('-35')))[0];
			await perpsMarket.modifyPosition(toUnit('-35'), { from: trader2 }); // Debt correction: +4200 - fee2

			assert.bnClose(
				await perpsMarket.entryDebtCorrection(),
				toUnit('800')
					.sub(fee1)
					.sub(fee2),
				toUnit('0.1')
			);

			// 1600 margin, plus 1000 profit by trader1
			assert.bnClose(
				(await perpsMarket.marketDebt())[0],
				toUnit('2600')
					.sub(fee1)
					.sub(fee2),
				toUnit('0.1')
			);

			await closePositionAndWithdrawMargin({
				market: perpsMarket,
				account: trader,
				fillPrice: toUnit('110'),
			});

			assert.bnClose(await perpsMarket.entryDebtCorrection(), toUnit('4800'), toUnit('13'));
			assert.bnClose((await perpsMarket.marketDebt())[0], toUnit('950'), toUnit('13'));

			await closePositionAndWithdrawMargin({
				market: perpsMarket,
				account: trader2,
				fillPrice: toUnit('100'),
			});

			assert.bnEqual(await perpsMarket.entryDebtCorrection(), toUnit('0'));
			assert.bnEqual((await perpsMarket.marketDebt())[0], toUnit('0'));
		});

		it.skip('Market debt is the sum of remaining margins', async () => {
			assert.isTrue(false);
		});

		it.skip('Liquidations accurately update market debt and overall system debt', async () => {
			assert.isTrue(false);
		});

		describe('market debt incorporates funding flow', async () => {
			it.skip('funding profits increase debt', async () => {
				assert.isTrue(false);
			});

			it.skip('funding losses decrease debt', async () => {
				assert.isTrue(false);
			});
		});

		describe('market debt incorporates profits', async () => {
			it.skip('profits increase debt', async () => {
				assert.isTrue(false);
			});

			it.skip('losses decrease debt', async () => {
				assert.isTrue(false);
			});
		});

		it.skip('After many trades and liquidations, the market debt is still the sum of remaining margins', async () => {
			assert.isTrue(false);
		});

		it.skip('Enough pending liquidation value can cause market debt to fall to zero, corrected by liquidating', async () => {
			assert.isTrue(false);
		});

		it('Market debt is reported as invalid when price is stale', async () => {
			assert.isFalse((await perpsMarket.marketDebt())[1]);
			await fastForward(7 * 24 * 60 * 60);
			assert.isTrue((await perpsMarket.marketDebt())[1]);
		});

		describe('Market debt is accurately reflected in total system debt', () => {
			it('Margin transfers do not alter total system debt', async () => {
				const debt = (await debtCache.currentDebt())[0];
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual((await debtCache.currentDebt())[0], debt);
				await perpsMarket.transferMargin(toUnit('-500'), { from: trader });
				assert.bnEqual((await debtCache.currentDebt())[0], debt);
			});

			it('Prices altering market debt are reflected in total system debt', async () => {
				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('100'),
				});

				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-50'),
				});

				// Price move of $5 upwards should produce long profit of $500,
				// Short losses of -$250. The debt should increase overall by $250.
				const debt = (await debtCache.currentDebt())[0];
				await setPrice(baseAsset, toUnit('105'));
				assert.bnClose((await debtCache.currentDebt())[0], debt.add(toUnit('250')), toUnit('0.01'));
				// Negate the signs for a downwards price movement.
				await setPrice(baseAsset, toUnit('95'));
				assert.bnClose((await debtCache.currentDebt())[0], debt.sub(toUnit('250')), toUnit('0.01'));
			});
		});
	});

	describe('Liquidations', () => {
		describe('Liquidation price', () => {
			it('Liquidation price is accurate without funding', async () => {
				await setPrice(baseAsset, toUnit('100'));
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('100'), { from: trader });
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsMarket.modifyPosition(toUnit('-100'), { from: trader2 });

				let liquidationPrice = await perpsMarket.approxLiquidationPriceAndFee(trader);

				// fee = 100 * 100 * 0.003 = 30
				// liqMargin = max(20, 100*100*0.0035) + 100*100*0.0025 = 60
				// liqPrice = 100 + (60 − (1000 - 30))÷100 = 90.9
				assert.bnClose(liquidationPrice.price, toUnit('90.9'), toUnit('0.001'));
				assert.isFalse(liquidationPrice.invalid);

				liquidationPrice = await perpsMarket.approxLiquidationPriceAndFee(trader2);

				// fee = 100 * 100 * 0.003 = 30
				// liqMargin = max(20, 100*100*0.0035) + 100*100*0.0025 = 60
				// liqPrice = 100 + (60 − (1000 - 30))÷(-100) = 109.1
				assert.bnEqual(liquidationPrice.price, toUnit('109.1'));
				assert.isFalse(liquidationPrice.invalid);
			});

			it('Liquidation price is accurate if the liquidation margin changes', async () => {
				await setPrice(baseAsset, toUnit('250'));
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('20'), { from: trader });
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsMarket.modifyPosition(toUnit('-20'), { from: trader2 });

				// fee = 250 * 20 * 0.003 = 15
				// liqMargin = max(20, 250 * 20 *0.0035) + 250 * 20*0.0025 = 20 + 12.5 = 32.5
				// liqPrice = 250 + (32.5 − (1000 - 15))÷(20) = 202.375
				assert.bnClose(
					(await perpsMarket.approxLiquidationPriceAndFee(trader)).price,
					toUnit(202.375),
					toUnit('0.001')
				);
				// fee = 250 * 20 * 0.003 = 15
				// liqPrice = 250 + (32.5 − (1000 - 15))÷(-20) = 297.625
				assert.bnClose(
					(await perpsMarket.approxLiquidationPriceAndFee(trader2)).price,
					toUnit(297.625),
					toUnit('0.001')
				);

				await perpsSettings.setMinKeeperFee(toUnit('100'), { from: owner });

				// liqMargin = max(100, 250 * 20 *0.0035) + 250 * 20*0.0025 = 100 + 12.5 = 112.5
				// liqPrice = 250 + (112.5 − (1000 - 15))÷(20) = 206.375
				assert.bnClose(
					(await perpsMarket.approxLiquidationPriceAndFee(trader)).price,
					toUnit(206.375),
					toUnit('0.001')
				);
				// liqPrice = 250 + (112.5 − (1000 - 15))÷(-20) = 293.625
				assert.bnClose(
					(await perpsMarket.approxLiquidationPriceAndFee(trader2)).price,
					toUnit(293.625),
					toUnit('0.001')
				);

				await perpsSettings.setLiquidationFeeRatio(toUnit('0.03'), { from: owner });
				// liqMargin = max(100, 250 * 20 *0.03) + 250 * 20*0.0025 = 150 + 12.5 = 162.5
				// liqPrice = 250 + (162.5 − (1000 - 15))÷(20) = 208.875
				assert.bnClose(
					(await perpsMarket.approxLiquidationPriceAndFee(trader)).price,
					toUnit(208.875),
					toUnit('0.001')
				);
				// liqPrice = 250 + (162.5 − (1000 - 15))÷(-20) = 291.125
				assert.bnClose(
					(await perpsMarket.approxLiquidationPriceAndFee(trader2)).price,
					toUnit(291.125),
					toUnit('0.001')
				);

				await perpsSettings.setLiquidationBufferRatio(toUnit('0.03'), { from: owner });
				// liqMargin = max(100, 250 * 20 *0.03) + 250 * 20*0.0025 = 150 + 150 = 300
				// liqPrice = 250 + (300 − (1000 - 15))÷(20) = 215.75
				assert.bnClose(
					(await perpsMarket.approxLiquidationPriceAndFee(trader)).price,
					toUnit(215.75),
					toUnit('0.001')
				);
				// liqPrice = 250 + (300 − (1000 - 15))÷(-20) = 284.25
				assert.bnClose(
					(await perpsMarket.approxLiquidationPriceAndFee(trader2)).price,
					toUnit(284.25),
					toUnit('0.001')
				);

				await perpsSettings.setMinKeeperFee(toUnit('0'), { from: owner });
				await perpsSettings.setLiquidationFeeRatio(toUnit('0'), { from: owner });
				await perpsSettings.setLiquidationBufferRatio(toUnit('0'), { from: owner });

				assert.bnClose(
					(await perpsMarket.approxLiquidationPriceAndFee(trader)).price,
					toUnit(200.75),
					toUnit('0.001')
				);
				assert.bnClose(
					(await perpsMarket.approxLiquidationPriceAndFee(trader2)).price,
					toUnit(299.25),
					toUnit('0.001')
				);
			});

			it('Liquidation price is accurate with funding', async () => {
				await perpsSettings.setSkewScaleUSD(marketKey, toUnit('10000'), { from: owner });

				await setPrice(baseAsset, toUnit('250'));
				// Submit orders that induce -0.05 funding rate
				await perpsMarket.transferMargin(toUnit('1500'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('30'), { from: trader });
				await perpsMarket.transferMargin(toUnit('500'), { from: trader2 });
				await perpsMarket.modifyPosition(toUnit('-10'), { from: trader2 });

				// One day of funding
				await fastForward(24 * 60 * 60);

				// liqMargin = max(20, 250 * 30 *0.0035) + 250 * 30*0.0025 = 45
				// trader 1 pays 30 * -0.05 = -1.5 base units of funding, and a $22.5 trading fee
				// liquidation price = pLast + (mLiq - m) / s + fPerUnit
				// liquidation price = 250 + (45 - (1500 - 22.5)) / 30 + 0.05 * 250 = 214.75
				let lPrice = await perpsMarket.approxLiquidationPriceAndFee(trader);
				assert.bnClose(lPrice[0], toUnit(214.75), toUnit(0.001));

				// liqMargin = max(20, 250 * 10 *0.0035) + 250 * 10*0.0025 = 26.25
				// trader2 receives -10 * -0.05 = 0.5 base units of funding, and a $7.5 trading fee
				// liquidation price = 250 + (26.25 - (500 - 7.5)) / (-10) + 0.05 * 250 = 309.125
				lPrice = await perpsMarket.approxLiquidationPriceAndFee(trader2);
				assert.bnClose(lPrice[0], toUnit(309.125), toUnit(0.001));
			});

			it('Liquidation price reports invalidity properly', async () => {
				await perpsSettings.setSkewScaleUSD(marketKey, toUnit('12500'), { from: owner });

				await setPrice(baseAsset, toUnit('250'));
				await perpsMarket.transferMargin(toUnit('1500'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('30'), { from: trader });
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsMarket.modifyPosition(toUnit('-20'), { from: trader2 });

				assert.isFalse((await perpsMarket.approxLiquidationPriceAndFee(trader)).invalid);

				await fastForward(60 * 60 * 24 * 7); // Stale the price
				let lPrice = await perpsMarket.approxLiquidationPriceAndFee(trader);
				assert.isTrue(lPrice.invalid);
				lPrice = await perpsMarket.approxLiquidationPriceAndFee(trader2);
				assert.isTrue(lPrice.invalid);
			});

			it.skip('Liquidation price is accurate with funding with intervening funding sequence updates', async () => {
				// TODO: confirm order -> a bunch of trades from other traders happen over a time period -> check the liquidation price given that most of the accrued funding is not unrecorded
				assert.isTrue(false);
			});

			it('No liquidation price on an empty position', async () => {
				assert.bnEqual(
					(await perpsMarket.approxLiquidationPriceAndFee(noBalance)).price,
					toUnit(0)
				);
			});
		});

		describe('canLiquidate', () => {
			it('Can liquidate an underwater position', async () => {
				let price = toUnit('250');
				await setPrice(baseAsset, price);
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('20'), { from: trader });

				price = (await perpsMarket.approxLiquidationPriceAndFee(trader)).price;
				await setPrice(baseAsset, price.sub(toUnit(1)));
				// The reason the price is imprecise is that the previously queried
				// liquidation price was calculated using:
				// 1. unrecorded funding assuming the previous price (depends on price)
				// 2. liquidation margin assuming the previous price (depends on price)
				// When price is changed artificially this results in a slightly different
				// undercorded funding, and slightly different liquidation margin which causes the actual
				// liquidation price to be slightly different.
				// A precise calculation would be a) incorrect and b) cubmbersome.
				// It would be incorrect because it would rely on other assumptions:
				// 	1) of unrecorded funding not being recorded until liquidation due to
				//	another tx in the market
				// 	2) time passing until liquidation being 0 seconds.
				// It would be cumbersome because it would need to account for the
				// non-linear relationship of liquidation margin and
				// price (due to using max() in it). It would also require breaking the interface of
				// of _liquidationMargin() because now _liquidationPrice() would need to know
				// exactly how margin is calculated in order to reverse the calculation
				// and solve for price.
				//
				// This is not too bad, because this imprecision only happens when
				// not used in transactions and when current price is far from the actual liquidation price.
				// In actual liquidation scenario and transaction the current price is also the
				// price which liquidationPrice() uses. So it's exactly correct.
				// So a keeper querrying canLiquidate() or simulating the liquidation
				// tx would have the correct liquidation price, and canLiquidate() result.
				assert.isTrue(await perpsMarket.canLiquidate(trader));
				await perpsMarket.liquidatePosition(trader);
			});

			it('Empty positions cannot be liquidated', async () => {
				assert.isFalse(await perpsMarket.canLiquidate(trader));
			});

			it('No liquidations while prices are invalid', async () => {
				await setPrice(baseAsset, toUnit('250'));
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('20'), { from: trader });

				await setPrice(baseAsset, toUnit('25'));
				assert.isTrue(await perpsMarket.canLiquidate(trader));
				await fastForward(60 * 60 * 24 * 7); // Stale the price
				assert.isFalse(await perpsMarket.canLiquidate(trader));
			});
		});

		describe('liquidatePosition', () => {
			beforeEach(async () => {
				await setPrice(baseAsset, toUnit('250'));
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader3 });
				await perpsMarket.modifyPosition(toUnit('40'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('20'), { from: trader2 });
				await perpsMarket.modifyPosition(toUnit('-20'), { from: trader3 });
				// Exchange fees total 60 * 250 * 0.003 + 20 * 250 * 0.003 = 60
			});

			it('Cannot liquidate nonexistent positions', async () => {
				await assert.revert(
					perpsMarket.liquidatePosition(noBalance),
					'Position cannot be liquidated'
				);
			});

			it('Liquidation properly affects the overall market parameters (long case)', async () => {
				await perpsSettings.setSkewScaleUSD(marketKey, toUnit('20000'), { from: owner });

				await fastForward(24 * 60 * 60); // wait one day to accrue a bit of funding

				const size = await perpsMarket.marketSize();
				const sizes = await perpsMarket.marketSizes();
				const skew = await perpsMarket.marketSkew();
				const positionSize = (await perpsMarket.positions(trader)).size;

				assert.isFalse(await perpsMarket.canLiquidate(trader));
				assert.isFalse(await perpsMarket.canLiquidate(trader2));

				await setPrice(baseAsset, toUnit('200'));

				assert.isTrue(await perpsMarket.canLiquidate(trader));
				assert.isTrue(await perpsMarket.canLiquidate(trader2));

				// Note at this point the true market debt should be $2000 ($1000 profit for the short trader, and two liquidated longs)
				// However, the long positions are actually underwater and the negative contribution is not removed until liquidation
				assert.bnClose((await perpsMarket.marketDebt())[0], toUnit('620'), toUnit('0.1'));
				assert.bnClose((await perpsMarket.unrecordedFunding())[0], toUnit('-8'), toUnit('0.01'));

				await perpsMarket.liquidatePosition(trader, { from: noBalance });

				assert.bnEqual(await perpsMarket.marketSize(), size.sub(positionSize.abs()));
				let newSizes = await perpsMarket.marketSizes();
				assert.bnEqual(newSizes[0], sizes[0].sub(positionSize.abs()));
				assert.bnEqual(newSizes[1], sizes[1]);
				assert.bnEqual(await perpsMarket.marketSkew(), skew.sub(positionSize.abs()));
				assert.bnClose(
					(await perpsMarket.marketDebt())[0],
					toUnit('1990').sub(toUnit('20')),
					toUnit('0.01')
				);

				// Funding has been recorded by the liquidation.
				assert.bnClose((await perpsMarket.unrecordedFunding())[0], toUnit(0), toUnit('0.01'));

				await perpsMarket.liquidatePosition(trader2, { from: noBalance });

				assert.bnEqual(await perpsMarket.marketSize(), toUnit('20'));
				newSizes = await perpsMarket.marketSizes();
				assert.bnEqual(newSizes[0], toUnit('0'));
				assert.bnEqual(newSizes[1], toUnit('20'));
				assert.bnEqual(await perpsMarket.marketSkew(), toUnit('-20'));
				// Market debt is now just the remaining position, plus the funding they've made.
				assert.bnClose((await perpsMarket.marketDebt())[0], toUnit('2145'), toUnit('0.01'));
			});

			it('Liquidation properly affects the overall market parameters (short case)', async () => {
				await perpsSettings.setSkewScaleUSD(marketKey, toUnit('20000'), { from: owner });

				await fastForward(24 * 60 * 60); // wait one day to accrue a bit of funding

				const size = await perpsMarket.marketSize();
				const sizes = await perpsMarket.marketSizes();
				const positionSize = (await perpsMarket.positions(trader3)).size;

				await setPrice(baseAsset, toUnit('350'));

				assert.bnClose((await perpsMarket.marketDebt())[0], toUnit('5960'), toUnit('0.1'));
				assert.bnClose((await perpsMarket.unrecordedFunding())[0], toUnit('-24.5'), toUnit('0.01'));

				await perpsMarket.liquidatePosition(trader3, { from: noBalance });

				assert.bnEqual(await perpsMarket.marketSize(), size.sub(positionSize.abs()));
				const newSizes = await perpsMarket.marketSizes();
				assert.bnEqual(newSizes[0], sizes[0]);
				assert.bnEqual(newSizes[1], toUnit(0));
				assert.bnEqual(await perpsMarket.marketSkew(), toUnit('60'));
				assert.bnClose((await perpsMarket.marketDebt())[0], toUnit('6485'), toUnit('0.1'));

				// Funding has been recorded by the liquidation.
				assert.bnClose((await perpsMarket.unrecordedFunding())[0], toUnit(0), toUnit('0.01'));
			});

			it('Can liquidate a position with less than the liquidation fee margin remaining (long case)', async () => {
				// liqMargin = max(20, 250 * 40 * 0.0035) + 250 * 40*0.0025 = 60
				// fee 40*250*0.003 = 30
				// Remaining margin = 250 + (60 - (1000 - 30)) / (40)= 227.25
				assert.isFalse(await perpsMarket.canLiquidate(trader));
				const liqPrice = (await perpsMarket.approxLiquidationPriceAndFee(trader)).price;
				assert.bnClose(liqPrice, toUnit('227.25'), toUnit('0.01'));

				const newPrice = liqPrice.sub(toUnit(1));
				await setPrice(baseAsset, newPrice);

				const { size: positionSize, id: positionId } = await perpsMarket.positions(trader);

				assert.isTrue(await perpsMarket.canLiquidate(trader));

				const remainingMargin = (await perpsMarket.remainingMargin(trader)).marginRemaining;
				const tx = await perpsMarket.liquidatePosition(trader, { from: noBalance });

				assert.isFalse(await perpsMarket.canLiquidate(trader));
				const position = await perpsMarket.positions(trader, { from: noBalance });
				assert.bnEqual(position.id, 1);
				assert.bnEqual(await perpsMarket.positionIdOwner(1), trader);
				assert.bnEqual(position.margin, toUnit(0));
				assert.bnEqual(position.size, toUnit(0));

				const liquidationFee = multiplyDecimal(
					multiplyDecimal(await perpsSettings.liquidationFeeRatio(), newPrice),
					toUnit(40) // position size
				);
				assert.bnClose(await sUSD.balanceOf(noBalance), liquidationFee, toUnit('0.001'));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsMarket] });

				assert.equal(decodedLogs.length, 4);

				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [noBalance, liquidationFee],
					log: decodedLogs[1],
					bnCloseVariance: toUnit('0.001'),
				});
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsMarket.address,
					args: [
						positionId,
						trader,
						toBN('0'),
						toBN('0'),
						toBN('0'),
						(await perpsMarket.assetPrice()).price,
						await perpsMarket.fundingSequenceLength(),
						toBN('0'),
					],
					log: decodedLogs[2],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: perpsMarket.address,
					args: [positionId, trader, noBalance, positionSize, newPrice, liquidationFee],
					log: decodedLogs[3],
					bnCloseVariance: toUnit('0.001'),
				});

				assert.bnLt(remainingMargin, liquidationFee);
			});

			it('liquidations of positive margin position pays to fee pool, long case', async () => {
				// liqMargin = max(20, 250 * 40 * 0.0035) + 250 * 40*0.0025 = 60
				// fee 40*250*0.003 = 30
				// Remaining margin = 250 + (60 - (1000 - 30)) / (40)= 227.25
				const liqPrice = (await perpsMarket.approxLiquidationPriceAndFee(trader)).price;
				assert.bnClose(liqPrice, toUnit('227.25'), toUnit('0.01'));

				const newPrice = liqPrice.sub(toUnit(0.5));
				await setPrice(baseAsset, newPrice);
				assert.isTrue(await perpsMarket.canLiquidate(trader));

				const remainingMargin = (await perpsMarket.remainingMargin(trader)).marginRemaining;
				const tx = await perpsMarket.liquidatePosition(trader, { from: noBalance });

				const liquidationFee = multiplyDecimal(
					multiplyDecimal(await perpsSettings.liquidationFeeRatio(), newPrice),
					toUnit(40) // position size
				);
				assert.bnClose(await sUSD.balanceOf(noBalance), liquidationFee, toUnit('0.001'));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsMarket] });

				assert.equal(decodedLogs.length, 5); // additional sUSD issue event

				const poolFee = remainingMargin.sub(liquidationFee);
				// the price needs to be set in a way that leaves positive margin after fee
				assert.isTrue(poolFee.gt(toBN(0)));

				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [await feePool.FEE_ADDRESS(), poolFee],
					log: decodedLogs[4],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Can liquidate a position with less than the liquidation fee margin remaining (short case)', async () => {
				// liqMargin = max(20, 250 * 20 * 0.0035) + 250 * 20*0.0025 = 32.5
				// fee 20*250*0.003 = 15
				// Remaining margin = 250 + (32.5 - (1000 - 15)) / (-20)= 297.625
				const liqPrice = (await perpsMarket.approxLiquidationPriceAndFee(trader3)).price;
				assert.bnClose(liqPrice, toUnit(297.625), toUnit('0.01'));

				const newPrice = liqPrice.add(toUnit(1));

				await setPrice(baseAsset, newPrice);

				const { size: positionSize, id: positionId } = await perpsMarket.positions(trader3);

				const remainingMargin = (await perpsMarket.remainingMargin(trader3)).marginRemaining;
				const tx = await perpsMarket.liquidatePosition(trader3, { from: noBalance });

				const position = await perpsMarket.positions(trader3, { from: noBalance });
				assert.bnEqual(position.id, 3);
				assert.bnEqual(await perpsMarket.positionIdOwner(3), trader3);
				assert.bnEqual(position.margin, toUnit(0));
				assert.bnEqual(position.size, toUnit(0));

				// in this case, proportional fee is smaller than minimum fee
				const liquidationFee = multiplyDecimal(
					multiplyDecimal(await perpsSettings.liquidationFeeRatio(), newPrice),
					toUnit(20) // position size
				);
				assert.bnClose(await sUSD.balanceOf(noBalance), liquidationFee, toUnit('0.001'));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsMarket] });

				assert.equal(decodedLogs.length, 4);
				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [noBalance, liquidationFee],
					log: decodedLogs[1],
				});
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsMarket.address,
					args: [
						positionId,
						trader3,
						toBN('0'),
						toBN('0'),
						toBN('0'),
						(await perpsMarket.assetPrice()).price,
						await perpsMarket.fundingSequenceLength(),
						toBN('0'),
					],
					log: decodedLogs[2],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: perpsMarket.address,
					args: [positionId, trader3, noBalance, positionSize, newPrice, liquidationFee],
					log: decodedLogs[3],
					bnCloseVariance: toUnit('0.001'),
				});

				assert.bnLt(remainingMargin, liquidationFee);
			});

			it('liquidations of positive margin position pays to fee pool, short case', async () => {
				// liqMargin = max(20, 250 * 20 * 0.0035) + 250 * 20*0.0025 = 32.5
				// fee 20*250*0.001 = 15
				// Remaining margin = 250 + (32.5 - (1000 - 15)) / (-20)= 297.625
				const liqPrice = (await perpsMarket.approxLiquidationPriceAndFee(trader3)).price;
				assert.bnClose(liqPrice, toUnit(297.625), toUnit('0.01'));

				const newPrice = liqPrice.add(toUnit(0.5));
				await setPrice(baseAsset, newPrice);
				assert.isTrue(await perpsMarket.canLiquidate(trader3));

				const remainingMargin = (await perpsMarket.remainingMargin(trader3)).marginRemaining;
				const tx = await perpsMarket.liquidatePosition(trader3, { from: noBalance });

				const liquidationFee = multiplyDecimal(
					multiplyDecimal(await perpsSettings.liquidationFeeRatio(), newPrice),
					toUnit(20) // position size
				);
				assert.bnClose(await sUSD.balanceOf(noBalance), liquidationFee, toUnit('0.001'));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsMarket] });

				assert.equal(decodedLogs.length, 5); // additional sUSD issue event

				const poolFee = remainingMargin.sub(liquidationFee);
				// the price needs to be set in a way that leaves positive margin after fee
				assert.isTrue(poolFee.gt(toBN(0)));

				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [await feePool.FEE_ADDRESS(), poolFee],
					log: decodedLogs[4],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Transfers an updated fee upon liquidation', async () => {
				const { size: positionSize, id: positionId } = await perpsMarket.positions(trader);
				// Move the price to a non-liquidating point
				let price = (await perpsMarket.approxLiquidationPriceAndFee(trader)).price;
				const newPrice = price.add(toUnit('1'));

				await setPrice(baseAsset, newPrice);

				assert.isFalse(await perpsMarket.canLiquidate(trader));

				// raise the liquidation fee
				await perpsSettings.setMinKeeperFee(toUnit('100'), { from: owner });

				assert.isTrue(await perpsMarket.canLiquidate(trader));
				price = (await perpsMarket.approxLiquidationPriceAndFee(trader)).price;

				// liquidate the position
				const tx = await perpsMarket.liquidatePosition(trader, { from: noBalance });

				// check that the liquidation price was correct.
				// liqMargin = max(100, 250 * 40 * 0.0035) + 250 * 40*0.0025 = 125
				// fee 40*250*0.003 = 30
				// Remaining margin = 250 + (125 - (1000 - 30)) / (40)= 228.875
				assert.bnClose(price, toUnit(228.875), toUnit(0.1));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsMarket] });
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsMarket.address,
					args: [
						positionId,
						trader,
						toBN('0'),
						toBN('0'),
						toBN('0'),
						(await perpsMarket.assetPrice()).price,
						await perpsMarket.fundingSequenceLength(),
						toBN('0'),
					],
					log: decodedLogs[2],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: perpsMarket.address,
					args: [positionId, trader, noBalance, positionSize, newPrice, toUnit('100')],
					log: decodedLogs[3],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Liquidating a position and opening one after should increment the position id', async () => {
				const { id: oldPositionId } = await perpsMarket.positions(trader);
				assert.bnEqual(oldPositionId, toBN('1'));

				await setPrice(baseAsset, toUnit('200'));
				assert.isTrue(await perpsMarket.canLiquidate(trader));
				await perpsMarket.liquidatePosition(trader, { from: noBalance });

				await transferMarginAndModifyPosition({
					market: perpsMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				const { id: newPositionId } = await perpsMarket.positions(trader);
				assert.bnGte(newPositionId, oldPositionId);
			});
		});

		describe('liquidation fee', () => {
			it('accurate with position size and parameters', async () => {
				await setPrice(baseAsset, toUnit('1000'));
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('2'), { from: trader });
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsMarket.modifyPosition(toUnit('-2'), { from: trader2 });
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader3 });

				// cannot be liquidated and so no fee
				assert.bnEqual((await perpsMarket.approxLiquidationPriceAndFee(trader3)).fee, 0);
				await perpsMarket.modifyPosition(toUnit('0.02'), { from: trader3 });
				// still cannot be liquidated and so no fee (because not leveraged)
				assert.bnEqual((await perpsMarket.approxLiquidationPriceAndFee(trader3)).fee, 0);

				// min keeper fee
				assert.bnEqual((await perpsMarket.approxLiquidationPriceAndFee(trader)).fee, toUnit(20));
				assert.bnEqual((await perpsMarket.approxLiquidationPriceAndFee(trader2)).fee, toUnit(20));

				// long
				await setPrice(baseAsset, toUnit('500'));
				// minimum liquidation fee < 20 , 0.0035 * 500 * 2 = 3.5
				assert.bnEqual((await perpsMarket.approxLiquidationPriceAndFee(trader)).fee, minKeeperFee);

				// reduce minimum
				await perpsSettings.setMinKeeperFee(toUnit(1), { from: owner });
				const res = await perpsMarket.approxLiquidationPriceAndFee(trader);
				assert.bnEqual(res.fee, multiplyDecimal(res.price, toUnit(2 * 0.0035)));

				// short
				await setPrice(baseAsset, toUnit('1500'));
				// minimum liquidation fee > 1, 0.0035 * 1500 * 2 = 10.5
				const res2 = await perpsMarket.approxLiquidationPriceAndFee(trader2);
				assert.bnEqual(res2.fee, multiplyDecimal(res2.price, toUnit(2 * 0.0035)));
				// increase minimum
				await perpsSettings.setMinKeeperFee(toUnit(30), { from: owner });
				assert.bnEqual((await perpsMarket.approxLiquidationPriceAndFee(trader2)).fee, toUnit(30));

				// increase BPs
				// minimum liquidation fee > 30, 0.02 * 1500 * 2 = 60
				await perpsSettings.setLiquidationFeeRatio(toUnit(0.02), { from: owner });
				const res3 = await perpsMarket.approxLiquidationPriceAndFee(trader2);
				assert.bnEqual(res3.fee, multiplyDecimal(res3.price, toUnit(2 * 0.02)));
			});
		});

		describe('liquidationMargin', () => {
			it('accurate with position size, price, and parameters', async () => {
				await setPrice(baseAsset, toUnit('1000'));
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('2'), { from: trader });
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsMarket.modifyPosition(toUnit('-2'), { from: trader2 });

				// reverts for 0 position
				await assert.revert(perpsMarket.liquidationMargin(trader3), '0 size position');

				// max(20, 2 * 1000 * 0.0035) + 2 * 1000 * 0.0025 = 25
				assert.bnEqual(await perpsMarket.liquidationMargin(trader), toUnit('25'));
				assert.bnEqual(await perpsMarket.liquidationMargin(trader2), toUnit('25'));

				// reduce minimum
				// max(1, 2 * 1000 * 0.0035) + 2 * 1000 * 0.0025 = 12
				await perpsSettings.setMinKeeperFee(toUnit(1), { from: owner });
				assert.bnEqual(await perpsMarket.liquidationMargin(trader), toUnit('12'));
				assert.bnEqual(await perpsMarket.liquidationMargin(trader2), toUnit('12'));

				// change price
				await setPrice(baseAsset, toUnit('1500'));
				// max(1, 2 * 1500 * 0.0035) + 2 * 1000 * 0.0025 = 18
				assert.bnEqual(await perpsMarket.liquidationMargin(trader), toUnit('18'));
				assert.bnEqual(await perpsMarket.liquidationMargin(trader2), toUnit('18'));

				// change fee BPs
				// max(1, 2 * 1500 * 0.02) + 2 * 1500 * 0.0025 = 67.5
				await perpsSettings.setLiquidationFeeRatio(toUnit(0.02), { from: owner });
				assert.bnEqual(await perpsMarket.liquidationMargin(trader), toUnit('67.5'));
				assert.bnEqual(await perpsMarket.liquidationMargin(trader2), toUnit('67.5'));

				// change buffer BPs
				// max(1, 2 * 1500 * 0.02) + 2 * 1500 * 0.03 = 150
				await perpsSettings.setLiquidationBufferRatio(toUnit(0.03), { from: owner });
				assert.bnEqual(await perpsMarket.liquidationMargin(trader), toUnit('150'));
				assert.bnEqual(await perpsMarket.liquidationMargin(trader2), toUnit('150'));
			});
		});
	});

	describe('Price deviation scenarios', () => {
		const everythingReverts = async () => {
			it('then settings parameter changes revert', async () => {
				await assert.revert(
					perpsSettings.setMaxFundingRate(marketKey, 0, { from: owner }),
					'Invalid price'
				);
				await assert.revert(
					perpsSettings.setSkewScaleUSD(marketKey, toUnit('100'), { from: owner }),
					'Invalid price'
				);
				await assert.revert(
					perpsSettings.setParameters(marketKey, 0, 0, 0, 0, 0, 0, 0, {
						from: owner,
					}),
					'Invalid price'
				);
			});

			it('then mutative market actions revert', async () => {
				await assert.revert(
					perpsMarket.transferMargin(toUnit('1000'), { from: trader }),
					'Invalid price'
				);
				await assert.revert(perpsMarket.withdrawAllMargin({ from: trader }), 'Invalid price');
				await assert.revert(
					perpsMarket.modifyPosition(toUnit('1'), { from: trader }),
					'Invalid price'
				);
				await assert.revert(perpsMarket.closePosition({ from: trader }), 'Invalid price');
				await assert.revert(
					perpsMarket.liquidatePosition(trader, { from: trader }),
					'Invalid price'
				);
			});
		};

		describe('when price spikes over the allowed threshold', () => {
			beforeEach(async () => {
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('1'), { from: trader });
				// base rate of sETH is 100 from shared setup above
				await setPrice(baseAsset, toUnit('300'), false);
			});

			everythingReverts();
		});

		describe('when price drops over the allowed threshold', () => {
			beforeEach(async () => {
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('1'), { from: trader });
				// base rate of sETH is 100 from shared setup above
				await setPrice(baseAsset, toUnit('30'), false);
			});

			everythingReverts();
		});

		describe('exchangeCircuitBreaker.lastExchangeRate is updated after transactions', () => {
			const newPrice = toUnit('110');

			beforeEach(async () => {
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('1'), { from: trader });
				// base rate of sETH is 100 from shared setup above
				await setPrice(baseAsset, newPrice, false);
			});

			it('after transferMargin', async () => {
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual(await circuitBreaker.lastValue(baseAssetAggregatorAddress), newPrice);
			});

			it('after withdrawAllMargin', async () => {
				await perpsMarket.withdrawAllMargin({ from: trader });
				assert.bnEqual(await circuitBreaker.lastValue(baseAssetAggregatorAddress), newPrice);
			});

			it('after modifyPosition', async () => {
				await perpsMarket.modifyPosition(toUnit('1'), { from: trader });
				assert.bnEqual(await circuitBreaker.lastValue(baseAssetAggregatorAddress), newPrice);
			});

			it('after closePosition', async () => {
				await perpsMarket.closePosition({ from: trader });
				assert.bnEqual(await circuitBreaker.lastValue(baseAssetAggregatorAddress), newPrice);
			});
		});
	});

	describe('Suspension scenarios', () => {
		function revertChecks(revertMessage) {
			it('then mutative market actions revert', async () => {
				await assert.revert(
					perpsMarket.transferMargin(toUnit('-100'), { from: trader }),
					revertMessage
				);
				await assert.revert(perpsMarket.withdrawAllMargin({ from: trader }), revertMessage);
				await assert.revert(
					perpsMarket.modifyPosition(toUnit('1'), { from: trader }),
					revertMessage
				);
				await assert.revert(perpsMarket.closePosition({ from: trader }), revertMessage);
				await assert.revert(perpsMarket.liquidatePosition(trader, { from: trader }), revertMessage);
			});

			it('then settings parameter changes do not revert', async () => {
				await perpsSettings.setMaxFundingRate(marketKey, 0, { from: owner });
				await perpsSettings.setSkewScaleUSD(marketKey, toUnit('100'), { from: owner });
				await perpsSettings.setParameters(marketKey, 0, 0, 0, 0, 0, 0, 1, {
					from: owner,
				});
			});

			it('settings parameter changes still revert if price is invalid', async () => {
				await setPrice(baseAsset, toUnit('1'), false); // circuit breaker will revert
				await assert.revert(
					perpsSettings.setParameters(marketKey, 0, 0, 0, 0, 0, 0, 1, {
						from: owner,
					}),
					'Invalid price'
				);
			});
		}

		describe('when markets are suspended', () => {
			beforeEach(async () => {
				// prepare a position
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('1'), { from: trader });
				// suspend
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
			});

			// check reverts are as expecte
			revertChecks('Futures markets are suspended');

			it('Transfer margin fails for adding as well', async () => {
				await assert.revert(
					perpsMarket.transferMargin(toUnit('100'), { from: trader }),
					'Futures markets are suspended'
				);
			});

			describe('when futures markets are resumed', () => {
				beforeEach(async () => {
					// suspend
					await systemStatus.resumeFutures({ from: owner });
				});

				it('then mutative market actions work', async () => {
					await perpsMarket.withdrawAllMargin({ from: trader });
					await perpsMarket.transferMargin(toUnit('100'), { from: trader });
					await perpsMarket.modifyPosition(toUnit('10'), { from: trader });
					await perpsMarket.closePosition({ from: trader });

					// set up for liquidation
					await perpsMarket.modifyPosition(toUnit('10'), { from: trader });
					await setPrice(baseAsset, toUnit('1'));
					await perpsMarket.liquidatePosition(trader, { from: trader2 });
				});
			});
		});

		describe('when specific market is suspended', () => {
			beforeEach(async () => {
				// prepare a position
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('1'), { from: trader });
				// suspend
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
			});

			// check reverts are as expecte
			revertChecks('Market suspended');

			it('can add margin, but cannot remove', async () => {
				await perpsMarket.transferMargin(toUnit('100'), { from: trader });
				await assert.revert(
					perpsMarket.transferMargin(toUnit('-100'), { from: trader }),
					'Market suspended'
				);
			});

			describe('when market is resumed', () => {
				beforeEach(async () => {
					// suspend
					await systemStatus.resumeFuturesMarket(marketKey, { from: owner });
				});

				it('then mutative market actions work', async () => {
					await perpsMarket.withdrawAllMargin({ from: trader });
					await perpsMarket.transferMargin(toUnit('100'), { from: trader });
					await perpsMarket.modifyPosition(toUnit('10'), { from: trader });
					await perpsMarket.closePosition({ from: trader });

					// set up for liquidation
					await perpsMarket.modifyPosition(toUnit('10'), { from: trader });
					await setPrice(baseAsset, toUnit('1'));
					await perpsMarket.liquidatePosition(trader, { from: trader2 });
				});
			});
		});

		describe('when another market is suspended', () => {
			beforeEach(async () => {
				// prepare a position
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('1'), { from: trader });
				// suspend
				await systemStatus.suspendFuturesMarket(toBytes32('sOTHER'), toUnit(0), { from: owner });
			});

			it('then mutative market actions work', async () => {
				await perpsMarket.withdrawAllMargin({ from: trader });
				await perpsMarket.transferMargin(toUnit('100'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('10'), { from: trader });
				await perpsMarket.closePosition({ from: trader });

				// set up for liquidation
				await perpsMarket.modifyPosition(toUnit('10'), { from: trader });
				await setPrice(baseAsset, toUnit('1'));
				await perpsMarket.liquidatePosition(trader, { from: trader2 });
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

		describe('when tooVolatile is true', () => {
			beforeEach(async () => {
				// set up a healthy position
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.modifyPosition(toUnit('1'), { from: trader });

				// set up a would be liqudatable position
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsMarket.modifyPosition(toUnit('-100'), { from: trader2 });

				// spike the price
				await setPrice(baseAsset, multiplyDecimal(initialPrice, toUnit(1.1)));
				// check is too volatile
				assert.ok(
					(await exchanger.dynamicFeeRateForExchange(toBytes32('sUSD'), baseAsset)).tooVolatile
				);
			});

			it('position modifying actions revert', async () => {
				const revertMessage = 'Price too volatile';

				await assert.revert(
					perpsMarket.modifyPosition(toUnit('1'), { from: trader }),
					revertMessage
				);
				await assert.revert(perpsMarket.closePosition({ from: trader }), revertMessage);
			});

			it('margin modifying actions do not revert', async () => {
				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.withdrawAllMargin({ from: trader });
			});

			it('liquidations do not revert', async () => {
				await perpsMarket.liquidatePosition(trader2, { from: trader });
			});

			it('settings parameter changes do not revert', async () => {
				await perpsSettings.setMaxFundingRate(marketKey, 0, { from: owner });
				await perpsSettings.setSkewScaleUSD(marketKey, toUnit('100'), { from: owner });
				await perpsSettings.setParameters(marketKey, 0, 0, 0, 0, 0, 0, 1, {
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
				await perpsMarket.transferMargin(margin, { from: trader });
				// spike the price
				await setPrice(baseAsset, spikedRate);
				// check is not too volatile
				const res = await exchanger.dynamicFeeRateForExchange(toBytes32('sUSD'), baseAsset);
				// check dynamic fee is as expected
				assert.bnClose(res.feeRate, expectedRate, toUnit('0.0000001'));
				assert.notOk(res.tooVolatile);
			});

			it('order fee is calculated and applied correctly', async () => {
				const orderSize = toUnit('1');

				// expected fee is dynamic fee + taker fee
				const expectedFee = multiplyDecimal(spikedRate, expectedRate.add(baseFee));

				// check view
				const res = await perpsMarket.orderFee(orderSize);
				assert.bnClose(res.fee, expectedFee, toUnit('0.0000001'));

				// check event from modifying a position
				const tx = await perpsMarket.modifyPosition(orderSize, { from: trader });

				// correct fee is properly recorded and deducted.
				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [perpsMarket] });

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsMarket.address,
					args: [
						toBN('1'),
						trader,
						margin.sub(expectedFee),
						orderSize,
						orderSize,
						spikedRate,
						toBN(3),
						expectedFee,
					],
					log: decodedLogs[2],
					bnCloseVariance: toUnit('0.0000001'),
				});
			});

			it('mutative actions do not revert', async () => {
				await perpsMarket.modifyPosition(toUnit('1'), { from: trader });
				await perpsMarket.closePosition({ from: trader });

				await perpsMarket.transferMargin(toUnit('1000'), { from: trader });
				await perpsMarket.withdrawAllMargin({ from: trader });
			});

			it('settings parameter changes do not revert', async () => {
				await perpsSettings.setMaxFundingRate(marketKey, 0, { from: owner });
				await perpsSettings.setSkewScaleUSD(marketKey, toUnit('100'), { from: owner });
				await perpsSettings.setParameters(marketKey, 0, 0, 0, 0, 0, 0, 1, {
					from: owner,
				});
			});
		});
	});
});
