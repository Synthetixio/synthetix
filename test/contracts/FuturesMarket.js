const { artifacts, contract, web3 } = require('hardhat');
const { toBytes32 } = require('../..');
const {
	currentTime,
	fastForward,
	toUnit,
	multiplyDecimalRound,
	divideDecimalRound,
} = require('../utils')();
const { toBN } = web3.utils;

const { setupAllContracts } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const {
	getDecodedLogs,
	decodedEventEqual,
	ensureOnlyExpectedMutativeFunctions,
} = require('./helpers');

const MockExchanger = artifacts.require('MockExchanger');

contract('FuturesMarket', accounts => {
	let proxyFuturesMarket,
		futuresMarketSettings,
		futuresMarketManager,
		futuresMarket,
		exchangeRates,
		addressResolver,
		oracle,
		sUSD,
		synthetix,
		feePool,
		debtCache;

	const owner = accounts[1];
	const trader = accounts[2];
	const trader2 = accounts[3];
	const trader3 = accounts[4];
	const noBalance = accounts[5];
	const traderInitialBalance = toUnit(1000000);

	const baseAsset = toBytes32('sBTC');
	const takerFee = toUnit('0.003');
	const makerFee = toUnit('0.001');
	const maxLeverage = toUnit('10');
	const maxMarketValue = toUnit('100000');
	const maxFundingRate = toUnit('0.1');
	const maxFundingRateSkew = toUnit('1');
	const maxFundingRateDelta = toUnit('0.0125');
	const initialPrice = toUnit('100');
	const liquidationFee = toUnit('20');

	const initialFundingIndex = toBN(4);

	async function setPrice(asset, price) {
		await exchangeRates.updateRates([asset], [price], await currentTime(), {
			from: oracle,
		});
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
			ProxyFuturesMarketBTC: proxyFuturesMarket,
			FuturesMarketSettings: futuresMarketSettings,
			FuturesMarketManager: futuresMarketManager,
			FuturesMarketBTC: futuresMarket,
			ExchangeRates: exchangeRates,
			AddressResolver: addressResolver,
			SynthsUSD: sUSD,
			Synthetix: synthetix,
			FeePool: feePool,
			DebtCache: debtCache,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'FuturesMarketManager',
				'FuturesMarketSettings',
				'ProxyFuturesMarketBTC',
				'ProxyFuturesMarketETH',
				'FuturesMarketBTC',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
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

	describe('Basic parameters', () => {
		it('Only expected functions are mutative', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: futuresMarket.abi,
				ignoreParents: ['Owned', 'Proxyable', 'MixinFuturesMarketSettings'],
				expected: [
					'transferMargin',
					'withdrawAllMargin',
					'modifyPosition',
					'modifyPositionWithPriceBounds',
					'closePosition',
					'closePositionWithPriceBounds',
					'liquidatePosition',
					'recomputeFunding',
				],
			});
		});

		it('static parameters are set properly at construction', async () => {
			const parameters = await futuresMarket.parameters();
			assert.equal(await futuresMarket.baseAsset(), baseAsset);
			assert.bnEqual(parameters.takerFee, takerFee);
			assert.bnEqual(parameters.makerFee, makerFee);
			assert.bnEqual(parameters.maxLeverage, maxLeverage);
			assert.bnEqual(parameters.maxMarketValue, maxMarketValue);
			assert.bnEqual(parameters.maxFundingRate, maxFundingRate);
			assert.bnEqual(parameters.maxFundingRateSkew, maxFundingRateSkew);
			assert.bnEqual(parameters.maxFundingRateDelta, maxFundingRateDelta);
		});

		it('prices are properly fetched', async () => {
			const price = toUnit(200);
			await setPrice(baseAsset, price);
			const result = await futuresMarket.assetPrice();

			assert.bnEqual(result.price, price);
			assert.isFalse(result.invalid);
		});

		it('market size and skew', async () => {
			let sizes = await futuresMarket.marketSizes();
			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(await futuresMarket.marketSize(), toUnit('0'));
			assert.bnEqual(await futuresMarket.marketSkew(), toUnit('0'));
			assert.bnEqual(await futuresMarket.proportionalSkew(), toUnit('0'));

			await transferMarginAndModifyPosition({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('100'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});

			sizes = await futuresMarket.marketSizes();
			assert.bnEqual(sizes[0], toUnit('50'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(await futuresMarket.marketSize(), toUnit('50'));
			assert.bnEqual(await futuresMarket.marketSkew(), toUnit('50'));
			assert.bnEqual(await futuresMarket.proportionalSkew(), toUnit('1'));

			await transferMarginAndModifyPosition({
				market: futuresMarket,
				account: trader2,
				fillPrice: toUnit('120'),
				marginDelta: toUnit('600'),
				sizeDelta: toUnit('-35'),
			});

			sizes = await futuresMarket.marketSizes();
			assert.bnEqual(sizes[0], toUnit('50'));
			assert.bnEqual(sizes[1], toUnit('35'));
			assert.bnEqual(await futuresMarket.marketSize(), toUnit('85'));
			assert.bnEqual(await futuresMarket.marketSkew(), toUnit('15'));
			assert.bnClose(await futuresMarket.proportionalSkew(), toUnit(15 / 85), toUnit('0.0001'));

			await closePositionAndWithdrawMargin({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('110'),
			});

			sizes = await futuresMarket.marketSizes();
			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('35'));
			assert.bnEqual(await futuresMarket.marketSize(), toUnit('35'));
			assert.bnEqual(await futuresMarket.marketSkew(), toUnit('-35'));
			assert.bnClose(await futuresMarket.proportionalSkew(), toUnit('-1'));

			await closePositionAndWithdrawMargin({
				market: futuresMarket,
				account: trader2,
				fillPrice: toUnit('100'),
			});

			sizes = await futuresMarket.marketSizes();
			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(await futuresMarket.marketSize(), toUnit('0'));
			assert.bnEqual(await futuresMarket.marketSkew(), toUnit('0'));
			assert.bnEqual(await futuresMarket.proportionalSkew(), toUnit('0'));
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
			const sideVar = leverage.div(leverage.abs());

			describe(`${side}`, () => {
				it('Ensure that the order fee (both maker and taker) is correct when the order is actually submitted', async () => {
					const t2size = toUnit('70');
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: t2size,
					});

					const t1size = toUnit('-35');
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: t1size,
					});

					const fee = toUnit('14');
					await futuresMarket.transferMargin(margin.mul(toBN(2)), { from: trader });
					assert.bnEqual((await futuresMarket.orderFee(trader, t1size.mul(toBN(2))))[0], fee);
					const tx = await futuresMarket.modifyPosition(t1size.mul(toBN(2)), { from: trader });

					// Fee is properly recorded and deducted.
					const decodedLogs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [futuresMarket],
					});

					decodedEventEqual({
						event: 'PositionModified',
						emittedFrom: proxyFuturesMarket.address,
						args: [
							toBN('1'),
							trader,
							margin.mul(toBN(3)).sub(toUnit('17.5')),
							t1size.mul(toBN(3)),
							toUnit('100'),
							toBN(3),
							fee,
						],
						log: decodedLogs[2],
						bnCloseVariance: toUnit('0.01'),
					});
				});

				it('Submit a fresh order when there is no skew', async () => {
					await setPrice(baseAsset, toUnit('100'));
					await futuresMarket.transferMargin(margin, { from: trader });
					const notional = multiplyDecimalRound(margin, leverage.abs());
					const fee = multiplyDecimalRound(notional, takerFee);
					assert.bnEqual((await futuresMarket.orderFee(trader, notional.div(toBN(100))))[0], fee);
				});

				it('Submit a fresh order on the same side as the skew', async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: multiplyDecimalRound(leverage, margin).div(toBN('100')),
					});

					const notional = multiplyDecimalRound(margin, leverage);
					const fee = multiplyDecimalRound(notional, takerFee).abs();
					await futuresMarket.transferMargin(margin, { from: trader });
					assert.bnEqual((await futuresMarket.orderFee(trader, notional.div(toBN(100))))[0], fee);
				});

				it(`Submit a fresh order on the opposite side to the skew smaller than the skew`, async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: multiplyDecimalRound(leverage.neg(), margin).div(toBN('100')),
					});

					const notional = multiplyDecimalRound(margin.div(toBN(2)), leverage);
					const fee = multiplyDecimalRound(notional, makerFee).abs();
					await futuresMarket.transferMargin(margin.div(toBN(2)), { from: trader });
					assert.bnEqual((await futuresMarket.orderFee(trader, notional.div(toBN(100))))[0], fee);
				});

				it('Submit a fresh order on the opposite side to the skew larger than the skew', async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.div(toBN(2)),
						sizeDelta: multiplyDecimalRound(leverage.neg(), margin.div(toBN(2))).div(toBN('100')),
					});

					const notional = multiplyDecimalRound(margin, leverage);
					const fee = multiplyDecimalRound(notional, takerFee.add(makerFee))
						.div(toBN(2))
						.abs();
					await futuresMarket.transferMargin(margin, { from: trader });
					assert.bnEqual((await futuresMarket.orderFee(trader, notional.div(toBN('100'))))[0], fee);
				});

				it('Increase an existing position on the side of the skew', async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: multiplyDecimalRound(leverage, margin).div(toBN('100')),
					});

					const fee = toUnit('5.25');
					assert.bnEqual(
						(
							await futuresMarket.orderFee(
								trader,
								multiplyDecimalRound(margin.div(toBN(2)), leverage).div(toBN('100'))
							)
						)[0],
						fee
					);
				});

				it('Increase an existing position opposite to the skew smaller than the skew', async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: multiplyDecimalRound(leverage, margin.mul(toBN(2))).div(toBN(100)),
					});

					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: multiplyDecimalRound(leverage.neg(), margin).div(toBN(100)),
					});

					assert.bnEqual(
						(
							await futuresMarket.orderFee(
								trader,
								multiplyDecimalRound(leverage.neg(), margin).div(toBN(200))
							)
						)[0],
						toUnit('1.75')
					);
				});

				it('Increase an existing position opposite to the skew larger than the skew', async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: multiplyDecimalRound(leverage, margin.mul(toBN(2))).div(toBN(100)),
					});

					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: multiplyDecimalRound(leverage.neg(), margin).div(toBN(100)),
					});

					assert.bnEqual(
						(
							await futuresMarket.orderFee(
								trader,
								multiplyDecimalRound(leverage.neg(), margin.mul(toBN(2))).div(toBN(100))
							)
						)[0],
						toUnit('14')
					);
				});

				it('reduce an existing position on the side of the skew', async () => {
					const sizeDelta = multiplyDecimalRound(leverage, margin).div(toBN(100));
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta,
					});

					assert.bnEqual(
						(await futuresMarket.orderFee(trader, sizeDelta.neg().div(toBN(2))))[0],
						toBN(0)
					);
				});

				it('reduce an existing position opposite to the skew', async () => {
					const sizeDelta1 = multiplyDecimalRound(leverage, margin.mul(toBN(2))).div(toBN(100));
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: sizeDelta1,
					});

					const sizeDelta2 = multiplyDecimalRound(leverage.neg(), margin).div(toBN(100));
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: sizeDelta2,
					});

					assert.bnEqual(
						(await futuresMarket.orderFee(trader, sizeDelta2.neg().div(toBN(2))))[0],
						toBN(0)
					);
				});

				it('close an existing position on the side of the skew', async () => {
					const sizeDelta = multiplyDecimalRound(leverage, margin).div(toBN(100));
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta,
					});

					assert.bnEqual((await futuresMarket.orderFee(trader, sizeDelta.neg()))[0], toBN(0));
				});

				it('close an existing position opposite to the skew', async () => {
					const sizeDelta1 = multiplyDecimalRound(leverage, margin.mul(toBN(2))).div(toBN(100));
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: sizeDelta1,
					});

					const sizeDelta2 = multiplyDecimalRound(leverage.neg(), margin).div(toBN(100));
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: sizeDelta2,
					});

					assert.bnEqual((await futuresMarket.orderFee(trader, sizeDelta2.neg()))[0], toBN(0));
				});

				it('Updated order, on the same side as the skew, on the opposite side of an existing position', async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: toUnit('70').mul(sideVar),
					});

					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: toUnit('-35').mul(sideVar),
					});

					assert.bnEqual(
						(await futuresMarket.orderFee(trader, toUnit('70').mul(sideVar)))[0],
						toUnit('10.5')
					);
				});

				it('Updated order, opposite and smaller than the skew, on opposite side of an existing position', async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: toUnit('70').mul(sideVar),
					});

					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: toUnit('-35').mul(sideVar),
					});

					assert.bnEqual(
						(await futuresMarket.orderFee(trader, toUnit('-17.5').mul(sideVar)))[0],
						toUnit('1.75')
					);
				});

				it('Updated order, opposite and larger than the skew, on the opposite side of an existing position', async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: toUnit('35').mul(sideVar),
					});

					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: toUnit('35').mul(sideVar),
					});

					assert.bnEqual(
						(await futuresMarket.orderFee(trader, toUnit('-70').mul(sideVar)))[0],
						toUnit('3.5')
					);
				});

				it('Updated order, opposite and larger than the skew, except that an existing opposite-side order increases the skew when closed', async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: toUnit('35').mul(sideVar),
					});

					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: toUnit('-35').mul(sideVar),
					});

					assert.bnEqual(
						(await futuresMarket.orderFee(trader, toUnit('52.5').mul(sideVar)))[0],
						toUnit('5.25')
					);
				});

				it('Updated order, opposite and larger than the skew, on the opposite side of an existing position (2)', async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: toUnit('35').mul(sideVar),
					});

					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader3,
						fillPrice: toUnit('100'),
						marginDelta: margin.div(toBN(2)),
						sizeDelta: toUnit('-17.5').mul(sideVar),
					});

					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin.div(toBN(2)),
						sizeDelta: toUnit('17.5').mul(sideVar),
					});

					assert.bnEqual(
						(await futuresMarket.orderFee(trader, toUnit('-70').mul(sideVar)))[0],
						toUnit('12.25')
					);
				});

				describe('...with non-zero closure fee', () => {
					const fee = toUnit('0.001'); // 10 bp fee
					beforeEach(async () => {
						await futuresMarketSettings.setClosureFee(await futuresMarket.baseAsset(), fee, {
							from: owner,
						});
					});

					it('reduce an existing position on the side of the skew', async () => {
						await transferMarginAndModifyPosition({
							market: futuresMarket,
							account: trader,
							fillPrice: toUnit('100'),
							marginDelta: margin,
							sizeDelta: multiplyDecimalRound(margin, leverage).div(toBN(100)),
						});

						const expectedFee = multiplyDecimalRound(leverage, margin)
							.div(toBN(2))
							.div(toBN(1000))
							.abs();

						assert.bnClose(
							(
								await futuresMarket.orderFee(
									trader,
									multiplyDecimalRound(margin, leverage)
										.div(toBN(200))
										.neg()
								)
							)[0],
							expectedFee,
							toUnit('0.1')
						);
					});

					it('reduce an existing position opposite to the skew', async () => {
						await transferMarginAndModifyPosition({
							market: futuresMarket,
							account: trader2,
							fillPrice: toUnit('100'),
							marginDelta: margin.mul(toBN(2)),
							sizeDelta: multiplyDecimalRound(margin, leverage).div(toBN(100)),
						});

						await transferMarginAndModifyPosition({
							market: futuresMarket,
							account: trader,
							fillPrice: toUnit('100'),
							marginDelta: margin,
							sizeDelta: multiplyDecimalRound(margin, leverage.neg()).div(toBN(100)),
						});

						const expectedFee = multiplyDecimalRound(leverage, margin)
							.div(toBN(2))
							.div(toBN(1000))
							.abs();

						assert.bnClose(
							(
								await futuresMarket.orderFee(
									trader,
									multiplyDecimalRound(margin, leverage).div(toBN(200))
								)
							)[0],
							expectedFee,
							toUnit('0.1')
						);
					});

					it('close an existing position on the side of the skew', async () => {
						await transferMarginAndModifyPosition({
							market: futuresMarket,
							account: trader,
							fillPrice: toUnit('100'),
							marginDelta: margin,
							sizeDelta: multiplyDecimalRound(margin, leverage).div(toBN(100)),
						});

						const expectedFee = multiplyDecimalRound(leverage, margin)
							.div(toBN(1000))
							.abs();

						assert.bnClose(
							(
								await futuresMarket.orderFee(
									trader,
									multiplyDecimalRound(margin, leverage).div(toBN(100).neg())
								)
							)[0],
							expectedFee,
							toUnit('0.1')
						);
					});

					it('close an existing position opposite to the skew', async () => {
						await transferMarginAndModifyPosition({
							market: futuresMarket,
							account: trader2,
							fillPrice: toUnit('100'),
							marginDelta: margin.mul(toBN(2)),
							sizeDelta: multiplyDecimalRound(margin.mul(toBN(2)), leverage).div(toBN(100)),
						});

						await transferMarginAndModifyPosition({
							market: futuresMarket,
							account: trader,
							fillPrice: toUnit('100'),
							marginDelta: margin,
							sizeDelta: multiplyDecimalRound(margin, leverage.neg()).div(toBN(100)),
						});

						const expectedFee = multiplyDecimalRound(leverage, margin)
							.div(toBN(1000))
							.abs();

						assert.bnEqual(
							(
								await futuresMarket.orderFee(
									trader,
									multiplyDecimalRound(margin, leverage.neg())
										.div(toBN(100))
										.neg()
								)
							)[0],
							expectedFee
						);
					});
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
					futuresMarket.transferMargin(preBalance.add(toUnit('1')), { from: trader }),
					'subtraction overflow'
				);
			});

			it(`Can't withdraw more sUSD than is in the margin`, async () => {
				await futuresMarket.transferMargin(toUnit('100'), { from: trader });
				await assert.revert(
					futuresMarket.transferMargin(toUnit('-101'), { from: trader }),
					'Insufficient margin'
				);
			});

			it('Positive delta -> burn sUSD', async () => {
				const preBalance = await sUSD.balanceOf(trader);
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(toUnit('1000')));
			});

			it('Negative delta -> mint sUSD', async () => {
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				const preBalance = await sUSD.balanceOf(trader);
				await futuresMarket.transferMargin(toUnit('-500'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.add(toUnit('500')));
			});

			it('Zero delta -> NOP', async () => {
				const preBalance = await sUSD.balanceOf(trader);
				await futuresMarket.transferMargin(toUnit('0'), { from: trader });
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
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });

				// Now set a reclamation event
				await mockExchanger.setReclaim(toUnit('10'));
				await mockExchanger.setNumEntries('1');

				// Issuance works fine
				await futuresMarket.transferMargin(toUnit('-900'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(toUnit('100')));
				assert.bnEqual((await futuresMarket.remainingMargin(trader))[0], toUnit('100'));

				// But burning properly deducts the reclamation amount
				await futuresMarket.transferMargin(preBalance.sub(toUnit('100')), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(owner), toUnit('0'));
				assert.bnEqual(
					(await futuresMarket.remainingMargin(trader))[0],
					preBalance.sub(toUnit('10'))
				);
			});

			it('events are emitted properly upon margin transfers', async () => {
				// Deposit some balance
				let tx = await futuresMarket.transferMargin(toUnit('1000'), { from: trader3 });
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, futuresMarket],
				});

				decodedEventEqual({
					event: 'Burned',
					emittedFrom: sUSD.address,
					args: [trader3, toUnit('1000')],
					log: decodedLogs[2],
				});

				decodedEventEqual({
					event: 'MarginTransferred',
					emittedFrom: proxyFuturesMarket.address,
					args: [trader3, toUnit('1000')],
					log: decodedLogs[3],
				});

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: proxyFuturesMarket.address,
					args: [toBN('1'), trader3, toUnit('1000'), toBN('0'), toBN('0'), toBN('0'), toBN('0')],
					log: decodedLogs[4],
				});

				// Zero delta means no MarginTransferred or sUSD events
				tx = await futuresMarket.transferMargin(toUnit('0'), { from: trader3 });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, futuresMarket],
				});

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: proxyFuturesMarket.address,
					args: [toBN('1'), trader3, toUnit('1000'), toBN('0'), toBN('0'), toBN('0'), toBN('0')],
					log: decodedLogs[1],
				});

				// Now withdraw the margin back out
				tx = await futuresMarket.transferMargin(toUnit('-1000'), { from: trader3 });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, futuresMarket],
				});

				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [trader3, toUnit('1000')],
					log: decodedLogs[1],
				});

				decodedEventEqual({
					event: 'MarginTransferred',
					emittedFrom: proxyFuturesMarket.address,
					args: [trader3, toUnit('-1000')],
					log: decodedLogs[2],
				});

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: proxyFuturesMarket.address,
					args: [toBN('1'), trader3, toUnit('0'), toBN('0'), toBN('0'), toBN('0'), toBN('0')],
					log: decodedLogs[3],
				});
			});
		});

		describe('No position', async () => {
			it('New margin', async () => {
				assert.bnEqual((await futuresMarket.positions(trader)).margin, toBN(0));
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual((await futuresMarket.positions(trader)).margin, toUnit('1000'));
			});

			it('Increase margin', async () => {
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual((await futuresMarket.positions(trader)).margin, toUnit('2000'));
			});

			it('Decrease margin', async () => {
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				await futuresMarket.transferMargin(toUnit('-500'), { from: trader });
				assert.bnEqual((await futuresMarket.positions(trader)).margin, toUnit('500'));
			});

			it('Abolish margin', async () => {
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				await futuresMarket.transferMargin(toUnit('-1000'), { from: trader });
				assert.bnEqual((await futuresMarket.positions(trader)).margin, toUnit('0'));
			});

			it('Cannot decrease margin past zero.', async () => {
				await assert.revert(
					futuresMarket.transferMargin(toUnit('-1'), { from: trader }),
					'Insufficient margin'
				);
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				await assert.revert(
					futuresMarket.transferMargin(toUnit('-2000'), { from: trader }),
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
			await futuresMarket.transferMargin(margin, { from: trader });
			const size = toUnit('50');
			const price = toUnit('200');
			await setPrice(baseAsset, price);
			const fee = (await futuresMarket.orderFee(trader, size))[0];
			const tx = await futuresMarket.modifyPosition(size, { from: trader });

			const position = await futuresMarket.positions(trader);
			assert.bnEqual(position.margin, margin.sub(fee));
			assert.bnEqual(position.size, size);
			assert.bnEqual(position.lastPrice, price);
			assert.bnEqual(position.fundingIndex, initialFundingIndex.add(toBN(2))); // margin transfer and position modification

			// Skew, size, entry notional sum, pending order value are updated.
			assert.bnEqual(await futuresMarket.marketSkew(), size);
			assert.bnEqual(await futuresMarket.marketSize(), size);
			assert.bnEqual(
				await futuresMarket.entryDebtCorrection(),
				margin.sub(fee).sub(multiplyDecimalRound(size, price))
			);

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
			assert.equal(decodedLogs.length, 3);
			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSD.address,
				args: [await feePool.FEE_ADDRESS(), fee],
				log: decodedLogs[1],
			});
			decodedEventEqual({
				event: 'PositionModified',
				emittedFrom: proxyFuturesMarket.address,
				args: [toBN('1'), trader, margin.sub(fee), size, price, toBN(2), fee],
				log: decodedLogs[2],
			});
		});

		it('Cannot modify a position if the price is invalid', async () => {
			const margin = toUnit('1000');
			await futuresMarket.transferMargin(margin, { from: trader });
			const size = toUnit('10');
			await futuresMarket.modifyPosition(size, { from: trader });

			await setPrice(baseAsset, toUnit('200'));

			await fastForward(4 * 7 * 24 * 60 * 60);

			await assert.revert(futuresMarket.modifyPosition(size, { from: trader }), 'Invalid price');
		});

		it('Cannot modify a position if the price has slipped too far', async () => {
			const startPrice = toUnit('200');
			await setPrice(baseAsset, startPrice);

			const margin = toUnit('1000');
			const minPrice = multiplyDecimalRound(startPrice, toUnit(1).sub(toUnit('0.01')));
			const maxPrice = multiplyDecimalRound(startPrice, toUnit(1).add(toUnit('0.01')));

			await futuresMarket.transferMargin(margin, { from: trader });
			await futuresMarket.modifyPositionWithPriceBounds(toUnit('1'), minPrice, maxPrice, {
				from: trader,
			});

			// Slips +1%.
			await setPrice(baseAsset, maxPrice.add(toBN(1)));
			await assert.revert(
				futuresMarket.modifyPositionWithPriceBounds(toUnit('-1'), minPrice, maxPrice, {
					from: trader,
				}),
				'Price out of acceptable range'
			);
			await assert.revert(
				futuresMarket.closePositionWithPriceBounds(minPrice, maxPrice, {
					from: trader,
				}),
				'Price out of acceptable range'
			);

			// Slips -1%.
			await setPrice(baseAsset, minPrice.sub(toBN(1)));
			await assert.revert(
				futuresMarket.modifyPositionWithPriceBounds(toUnit('1'), minPrice, maxPrice, {
					from: trader,
				}),
				'Price out of acceptable range'
			);
			await assert.revert(
				futuresMarket.closePositionWithPriceBounds(minPrice, maxPrice, {
					from: trader,
				}),
				'Price out of acceptable range'
			);

			await setPrice(baseAsset, startPrice);
			await futuresMarket.closePositionWithPriceBounds(minPrice, maxPrice, {
				from: trader,
			});
		});

		it('Cannot modify a position if it is liquidating', async () => {
			await transferMarginAndModifyPosition({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});

			await setPrice(baseAsset, toUnit('100'));
			// User realises the price has crashed and tries to outrun their liquidation, but it fails
			await assert.revert(
				futuresMarket.modifyPosition(toUnit('-50'), { from: trader }),
				'Position can be liquidated'
			);
		});

		it('Order modification properly records the exchange fee with the fee pool', async () => {
			const FEE_ADDRESS = await feePool.FEE_ADDRESS();
			const preBalance = await sUSD.balanceOf(FEE_ADDRESS);
			const preDistribution = (await feePool.recentFeePeriods(0))[3];
			await setPrice(baseAsset, toUnit('200'));
			const fee = (await futuresMarket.orderFee(trader, toUnit('50')))[0];
			await transferMarginAndModifyPosition({
				market: futuresMarket,
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
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});
			const { id: oldPositionId } = await futuresMarket.positions(trader);

			await transferMarginAndModifyPosition({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-25'),
			});
			const { id: newPositionId } = await futuresMarket.positions(trader);
			assert.bnEqual(oldPositionId, newPositionId);
		});

		it('max leverage cannot be exceeded', async () => {
			await setPrice(baseAsset, toUnit('100'));
			await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
			await futuresMarket.transferMargin(toUnit('1000'), { from: trader2 });
			await assert.revert(
				futuresMarket.modifyPosition(toUnit('101'), { from: trader }),
				'Max leverage exceeded'
			);

			await assert.revert(
				futuresMarket.modifyPosition(toUnit('-101'), { from: trader2 }),
				'Max leverage exceeded'
			);

			// But we actually allow up to 10.01x leverage to account for rounding issues.
			await futuresMarket.modifyPosition(toUnit('100.09'), { from: trader });
			await futuresMarket.modifyPosition(toUnit('-100.09'), { from: trader2 });
		});

		it('min margin must be provided', async () => {
			await setPrice(baseAsset, toUnit('10'));
			await futuresMarket.transferMargin(toUnit('99'), { from: trader });
			await assert.revert(
				futuresMarket.modifyPosition(toUnit('10'), { from: trader }),
				'Insufficient margin'
			);
		});

		describe('Max market size constraints', () => {
			it('properly reports the max order size on each side', async () => {
				let maxOrderSizes = await futuresMarket.maxOrderSizes();

				assert.bnEqual(maxOrderSizes.long, divideDecimalRound(maxMarketValue, initialPrice));
				assert.bnEqual(maxOrderSizes.short, divideDecimalRound(maxMarketValue, initialPrice));

				let newPrice = toUnit('193');
				await setPrice(baseAsset, newPrice);

				maxOrderSizes = await futuresMarket.maxOrderSizes();

				assert.bnEqual(maxOrderSizes.long, divideDecimalRound(maxMarketValue, newPrice));
				assert.bnEqual(maxOrderSizes.short, divideDecimalRound(maxMarketValue, newPrice));

				// Submit order on one side, leaving part of what's left.

				// 400 units submitted, out of 666.66.. available
				newPrice = toUnit('150');
				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: trader,
					fillPrice: newPrice,
					marginDelta: toUnit('10000'),
					sizeDelta: toUnit('400'),
				});

				maxOrderSizes = await futuresMarket.maxOrderSizes();
				assert.bnEqual(
					maxOrderSizes.long,
					divideDecimalRound(maxMarketValue, newPrice).sub(toUnit('400'))
				);
				assert.bnEqual(maxOrderSizes.short, divideDecimalRound(maxMarketValue, newPrice));

				// Submit order on the other side, removing all available supply.
				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: trader2,
					fillPrice: newPrice,
					marginDelta: toUnit('10001'),
					sizeDelta: toUnit('-666.733'),
				});

				maxOrderSizes = await futuresMarket.maxOrderSizes();
				assert.bnEqual(
					maxOrderSizes.long,
					divideDecimalRound(maxMarketValue, newPrice).sub(toUnit('400'))
				); // Long side is unaffected
				assert.bnEqual(maxOrderSizes.short, toUnit('0'));

				// An additional few units on the long side by another trader
				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: trader3,
					fillPrice: newPrice,
					marginDelta: toUnit('10000'),
					sizeDelta: toUnit('200'),
				});

				maxOrderSizes = await futuresMarket.maxOrderSizes();
				assert.bnEqual(
					maxOrderSizes.long,
					divideDecimalRound(maxMarketValue, newPrice).sub(toUnit('600'))
				);
				assert.bnEqual(maxOrderSizes.short, toUnit('0'));

				// Price increases - no more supply allowed.
				await setPrice(baseAsset, newPrice.mul(toBN(2)));
				maxOrderSizes = await futuresMarket.maxOrderSizes();
				assert.bnEqual(maxOrderSizes.long, toUnit('0')); // Long side is unaffected
				assert.bnEqual(maxOrderSizes.short, toUnit('0'));

				// Price decreases - more supply allowed again.
				newPrice = newPrice.div(toBN(4));
				await setPrice(baseAsset, newPrice);
				maxOrderSizes = await futuresMarket.maxOrderSizes();
				assert.bnEqual(
					maxOrderSizes.long,
					divideDecimalRound(maxMarketValue, newPrice).sub(toUnit('600'))
				);
				assert.bnClose(
					maxOrderSizes.short,
					divideDecimalRound(maxMarketValue, newPrice).sub(toUnit('666.73333')),
					toUnit('0.001')
				);
			});

			for (const side of ['long', 'short']) {
				describe(`${side}`, () => {
					let maxSize, maxMargin, orderSize;
					const leverage = side === 'long' ? toUnit('10') : toUnit('-10');

					beforeEach(async () => {
						await futuresMarketSettings.setMaxMarketValue(baseAsset, toUnit('10000'), {
							from: owner,
						});
						await setPrice(baseAsset, toUnit('1'));

						const maxOrderSizes = await futuresMarket.maxOrderSizes();
						maxSize = maxOrderSizes[side];
						maxMargin = maxSize;
						orderSize = side === 'long' ? maxSize : maxSize.neg();
					});

					it('Orders are blocked if they exceed max market size', async () => {
						await futuresMarket.transferMargin(maxMargin.add(toUnit('11')), { from: trader });
						const tooBig = orderSize.div(toBN('10')).mul(toBN('11'));
						await assert.revert(
							futuresMarket.modifyPosition(tooBig, {
								from: trader,
							}),
							'Max market size exceeded'
						);

						// orders are allowed a bit over the formal limit to account for rounding etc.
						await futuresMarket.modifyPosition(orderSize.add(toBN('1')), { from: trader });
					});

					it('Max order size is caught when an account has a position open already', async () => {
						const unitLeverage = divideDecimalRound(leverage, leverage.abs());

						// Confirm a big order
						await futuresMarket.transferMargin(maxMargin, {
							from: trader,
						});
						await futuresMarket.modifyPosition(
							orderSize
								.mul(unitLeverage)
								.div(toBN('10'))
								.mul(toBN('8')),
							{
								from: trader,
							}
						);

						// Try to submit an order that's too big for the market
						await assert.revert(
							futuresMarket.modifyPosition(
								orderSize
									.mul(unitLeverage)
									.div(toBN('10'))
									.mul(toBN('3')),
								{
									from: trader,
								}
							),
							'Max market size exceeded'
						);

						// Submit an order that's not too big, then the price will spike
						await futuresMarket.modifyPosition(
							orderSize
								.mul(unitLeverage)
								.div(toBN('10'))
								.mul(toBN('2'))
								.neg(),
							{
								from: trader,
							}
						);
						let spike = toUnit('2');
						if (leverage.lt(toBN('0'))) {
							spike = toUnit('0.5');
						}
						await setPrice(baseAsset, spike);

						await assert.revert(
							futuresMarket.modifyPosition(
								orderSize
									.mul(unitLeverage)
									.div(toBN('10'))
									.mul(toBN('2'))
									.neg(),
								{
									from: trader,
								}
							),
							'Max market size exceeded'
						);
					});

					it('Orders are allowed a touch of extra size to account for price motion on confirmation', async () => {
						// Ensure there's some existing order size for prices to shunt around.
						await futuresMarket.transferMargin(maxMargin.div(toBN(10)).mul(toBN(7)), {
							from: trader2,
						});
						await futuresMarket.modifyPosition(leverage, { from: trader2 });

						await futuresMarket.transferMargin(maxMargin.div(toBN(10)).mul(toBN(3)), {
							from: trader,
						});

						// The price moves, so the value of the already-confirmed order, shunts out the pending one.
						await setPrice(baseAsset, toUnit('1.08'));
						await assert.revert(
							futuresMarket.modifyPosition(leverage, { from: trader }),
							'Max market size exceeded'
						);

						// Price moves back partially and allows the order to confirm
						await setPrice(baseAsset, toUnit('1.04'));
						await futuresMarket.modifyPosition(leverage, { from: trader });
					});

					it('Orders are allowed to reduce in size (or close) even if the result is still over the max', async () => {
						const unitLeverage = divideDecimalRound(leverage, leverage.abs());
						const initialMargin = maxMargin.mul(toBN('8'));

						await futuresMarket.transferMargin(initialMargin, {
							from: trader,
						});
						await futuresMarket.modifyPosition(unitLeverage, { from: trader });

						// Now exceed max size (but price isn't so high that shorts would be liquidated)
						await setPrice(baseAsset, toUnit('1.9'));

						const sizes = await futuresMarket.maxOrderSizes();
						assert.bnEqual(sizes[leverage.gt(toBN('0')) ? 0 : 1], toBN('0'));

						// Reduce the order size, even though we are above the maximum
						await futuresMarket.transferMargin(initialMargin.sub(toUnit('0.01')), {
							from: trader,
						});
						await futuresMarket.modifyPosition((await futuresMarket.currentLeverage(trader))[0], {
							from: trader,
						});
					});
				});
			}
		});

		describe('Closing positions', () => {
			it('can close an open position', async () => {
				const margin = toUnit('1000');
				await futuresMarket.transferMargin(margin, { from: trader });
				await setPrice(baseAsset, toUnit('200'));
				await futuresMarket.modifyPosition(toUnit('50'), { from: trader });

				await setPrice(baseAsset, toUnit('199'));
				await futuresMarket.closePosition({ from: trader });
				const position = await futuresMarket.positions(trader);
				const remaining = (await futuresMarket.remainingMargin(trader))[0];

				assert.bnEqual(position.margin, remaining);
				assert.bnEqual(position.size, toUnit(0));
				assert.bnEqual(position.lastPrice, toUnit(0));
				assert.bnEqual(position.fundingIndex, toBN(0));

				// Skew, size, entry notional sum, debt are updated.
				assert.bnEqual(await futuresMarket.marketSkew(), toUnit(0));
				assert.bnEqual(await futuresMarket.marketSize(), toUnit(0));
				assert.bnEqual((await futuresMarket.marketDebt())[0], remaining);
				assert.bnEqual(await futuresMarket.entryDebtCorrection(), remaining);
			});

			it('Cannot close a position if it is liquidating', async () => {
				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: trader,
					fillPrice: toUnit('200'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('50'),
				});

				await setPrice(baseAsset, toUnit('100'));

				await assert.revert(
					futuresMarket.closePosition({ from: trader }),
					'Position can be liquidated'
				);
			});

			it('Cannot close an already-closed position', async () => {
				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: trader,
					fillPrice: toUnit('200'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('50'),
				});

				await futuresMarket.closePosition({ from: trader });
				const { size } = await futuresMarket.positions(trader);
				assert.bnEqual(size, toUnit(0));

				await assert.revert(futuresMarket.closePosition({ from: trader }), 'No position open');
			});

			it('confirming a position closure emits the appropriate event', async () => {
				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				await setPrice(baseAsset, toUnit('200'));
				const tx = await futuresMarket.closePosition({ from: trader });

				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, futuresMarket],
				});

				// No fee => no fee minting log
				assert.equal(decodedLogs.length, 2);
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: proxyFuturesMarket.address,
					args: [toBN('1'), trader, toUnit('2000'), toBN('0'), toBN('0'), toBN('0'), toBN('0')],
					log: decodedLogs[1],
					bnCloseVariance: toUnit('5'),
				});
			});

			it('closing a position and opening one after should increment the position id', async () => {
				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				const { id: oldPositionId } = await futuresMarket.positions(trader);
				assert.bnEqual(oldPositionId, toBN('1'));

				await setPrice(baseAsset, toUnit('200'));
				await futuresMarket.closePosition({ from: trader });

				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				const { id: newPositionId } = await futuresMarket.positions(trader);
				assert.bnEqual(newPositionId, toBN('2'));
			});
		});
	});

	describe('Profit & Loss, margin, leverage', () => {
		describe('PnL', () => {
			beforeEach(async () => {
				await setPrice(baseAsset, toUnit('100'));
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				await futuresMarket.modifyPosition(toUnit('50'), { from: trader });
				await futuresMarket.transferMargin(toUnit('4000'), { from: trader2 });
				await futuresMarket.modifyPosition(toUnit('-40'), { from: trader2 });
			});

			it('steady price', async () => {
				assert.bnEqual((await futuresMarket.profitLoss(trader))[0], toBN(0));
				assert.bnEqual((await futuresMarket.profitLoss(trader2))[0], toBN(0));
			});

			it('price increase', async () => {
				await setPrice(baseAsset, toUnit('150'));
				assert.bnEqual((await futuresMarket.profitLoss(trader))[0], toUnit('2500'));
				assert.bnEqual((await futuresMarket.profitLoss(trader2))[0], toUnit('-2000'));
			});

			it('price decrease', async () => {
				await setPrice(baseAsset, toUnit('90'));

				assert.bnEqual((await futuresMarket.profitLoss(trader))[0], toUnit('-500'));
				assert.bnEqual((await futuresMarket.profitLoss(trader2))[0], toUnit('400'));
			});

			it('Reports invalid prices properly', async () => {
				assert.isFalse((await futuresMarket.profitLoss(trader))[1]);
				await fastForward(7 * 24 * 60 * 60); // Stale the prices
				assert.isTrue((await futuresMarket.profitLoss(trader))[1]);
			});

			it.skip('Zero profit on a zero-size position', async () => {
				assert.isTrue(false);
			});
		});

		describe('Remaining margin', async () => {
			let fee, fee2;

			beforeEach(async () => {
				await setPrice(baseAsset, toUnit('100'));
				fee = (await futuresMarket.orderFee(trader, toUnit('50')))[0];
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				await futuresMarket.modifyPosition(toUnit('50'), { from: trader });
				fee2 = (await futuresMarket.orderFee(trader2, toUnit('-50')))[0];
				await futuresMarket.transferMargin(toUnit('5000'), { from: trader2 });
				await futuresMarket.modifyPosition(toUnit('-50'), { from: trader2 });
			});

			it('Remaining margin unchanged with no funding or profit', async () => {
				await fastForward(24 * 60 * 60);
				// Note that the first guy paid a bit of funding as there was a delay between confirming
				// the first and second orders
				assert.bnClose(
					(await futuresMarket.remainingMargin(trader))[0],
					toUnit('1000').sub(fee),
					toUnit('0.1')
				);
				assert.bnEqual((await futuresMarket.remainingMargin(trader2))[0], toUnit('5000').sub(fee2));
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
				assert.isFalse((await futuresMarket.remainingMargin(trader))[1]);
				await fastForward(7 * 24 * 60 * 60); // Stale the prices
				assert.isTrue((await futuresMarket.remainingMargin(trader))[1]);
			});
		});

		describe('Leverage', async () => {
			it('current leverage', async () => {
				let price = toUnit(100);

				await setPrice(baseAsset, price);
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				await futuresMarket.modifyPosition(toUnit('50'), { from: trader }); // 5x
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await futuresMarket.modifyPosition(toUnit('-100'), { from: trader2 }); // -10x

				const fee1 = multiplyDecimalRound(toUnit('5000'), makerFee);
				const fee2 = multiplyDecimalRound(toUnit('5000'), takerFee.add(makerFee));

				const lev = (notional, margin, fee) => divideDecimalRound(notional, margin.sub(fee));

				// With no price motion and no funding rate, leverage should be unchanged.
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader))[0],
					lev(toUnit('5000'), toUnit('1000'), fee1),
					toUnit(0.1)
				);
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader2))[0],
					lev(toUnit('-10000'), toUnit('1000'), fee2),
					toUnit(0.1)
				);

				price = toUnit(105);
				await setPrice(baseAsset, price);

				// Price moves to 105:
				// long notional value 5000 -> 5250; long remaining margin 1000 -> 1250; leverage 5 -> 4.2
				// short notional value -10000 -> -10500; short remaining margin 1000 -> 500; leverage 10 -> 21;
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader))[0],
					lev(toUnit('5250'), toUnit('1250'), fee1),
					toUnit(0.1)
				);
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader2))[0],
					lev(toUnit('-10500'), toUnit('500'), fee2),
					toUnit(0.1)
				);
			});

			it('current leverage can be less than 1', async () => {
				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('5'),
				});

				assert.bnEqual((await futuresMarket.positions(trader)).size, toUnit('5'));
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader))[0],
					toUnit(0.5),
					toUnit(0.001)
				);

				// The response of leverage to price with leverage < 1 is opposite to leverage > 1
				// When leverage is fractional, increasing the price increases leverage
				await setPrice(baseAsset, toUnit('300'));
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader))[0],
					toUnit(0.75),
					toUnit(0.001)
				);
				// ...while decreasing the price deleverages the position.
				await setPrice(baseAsset, toUnit('100').div(toBN(3)));
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader))[0],
					toUnit(0.25),
					toUnit(0.001)
				);
			});

			it('current leverage: no position', async () => {
				const currentLeverage = await futuresMarket.currentLeverage(trader);
				assert.bnEqual(currentLeverage[0], toBN('0'));
			});

			it('current leverage properly reports invalid prices', async () => {
				assert.isFalse((await futuresMarket.currentLeverage(trader))[1]);
				await fastForward(7 * 24 * 60 * 60);
				assert.isTrue((await futuresMarket.currentLeverage(trader))[1]);
			});
		});
	});

	describe('Funding', () => {
		it('An empty market induces zero funding rate', async () => {
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));
		});

		it('A balanced market induces zero funding rate', async () => {
			for (const traderDetails of [
				['100', trader],
				['-100', trader2],
			]) {
				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: traderDetails[1],
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit(traderDetails[0]),
				});
			}
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));
		});

		it('A balanced market (with differing leverage) induces zero funding rate', async () => {
			for (const traderDetails of [
				['1000', '50', trader],
				['2000', '-50', trader2],
			]) {
				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: traderDetails[2],
					fillPrice: toUnit('100'),
					marginDelta: toUnit(traderDetails[0]),
					sizeDelta: toUnit(traderDetails[1]),
				});
			}
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));
		});

		it('Various skew rates', async () => {
			// Market is balanced
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));

			await transferMarginAndModifyPosition({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('12'),
			});

			await transferMarginAndModifyPosition({
				market: futuresMarket,
				account: trader2,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-12'),
			});

			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));

			// Market is 50% skewed
			await futuresMarket.modifyPosition(toUnit('24'), { from: trader });
			assert.bnClose(await futuresMarket.currentFundingRate(), toUnit('-0.05'), toUnit('0.01'));

			// 50% the other way
			await futuresMarket.modifyPosition(toUnit('-32'), { from: trader });
			assert.bnClose(await futuresMarket.currentFundingRate(), toUnit('0.05'), toUnit('0.01'));

			// Market is 100% skewed
			await futuresMarket.closePosition({ from: trader });
			assert.bnClose(await futuresMarket.currentFundingRate(), toUnit('0.1'), toUnit('0.01'));

			// 100% the other way
			await futuresMarket.modifyPosition(toUnit('4'), { from: trader });
			await futuresMarket.closePosition({ from: trader2 });
			assert.bnClose(await futuresMarket.currentFundingRate(), toUnit('-0.1'), toUnit('0.01'));
		});

		it('Altering the max funding has a proportional effect', async () => {
			// 0, +-50%, +-100%
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));

			await transferMarginAndModifyPosition({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('12'),
			});

			await transferMarginAndModifyPosition({
				market: futuresMarket,
				account: trader2,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-4'),
			});

			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit('-0.05'));

			await futuresMarketSettings.setMaxFundingRate(baseAsset, toUnit('0.2'), { from: owner });
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit('-0.1'));
			await futuresMarketSettings.setMaxFundingRate(baseAsset, toUnit('0'), { from: owner });
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit('0'));
		});

		it('Altering the max funding rate skew has a proportional effect', async () => {
			await transferMarginAndModifyPosition({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-12'),
			});

			await transferMarginAndModifyPosition({
				market: futuresMarket,
				account: trader2,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('4'),
			});

			await futuresMarketSettings.setMaxFundingRateSkew(baseAsset, toUnit('0.5'), { from: owner });
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit('0.1'));

			await futuresMarketSettings.setMaxFundingRateSkew(baseAsset, toUnit('0.75'), { from: owner });
			assert.bnClose(await futuresMarket.currentFundingRate(), toUnit('0.2').div(toBN(3)));

			await futuresMarketSettings.setMaxFundingRateSkew(baseAsset, toUnit('0.25'), { from: owner });
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit('0.1'));

			await futuresMarketSettings.setMaxFundingRateSkew(baseAsset, toUnit('0'), { from: owner });
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit('0.1'));
		});

		for (const leverage of ['1', '-1'].map(toUnit)) {
			const side = parseInt(leverage.toString()) > 0 ? 'long' : 'short';

			describe(`${side}`, () => {
				it('100% skew induces maximum funding rate', async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: toUnit('1000'),
						sizeDelta: divideDecimalRound(
							multiplyDecimalRound(leverage, toUnit('1000')),
							toUnit('100')
						),
					});

					const expected = side === 'long' ? -maxFundingRate : maxFundingRate;

					assert.bnEqual(await futuresMarket.currentFundingRate(), expected);
				});

				it('Different skew rates induce proportional funding levels', async () => {
					await transferMarginAndModifyPosition({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: toUnit('1000'),
						sizeDelta: leverage.mul(toBN('10')),
					});
					await futuresMarket.transferMargin(toUnit('1000'), { from: trader2 });

					const points = 5;

					for (const maxFRSkew of ['1', '0.5', '0.3'].map(toUnit)) {
						await futuresMarketSettings.setMaxFundingRateSkew(baseAsset, maxFRSkew, {
							from: owner,
						});
						// We will sample points linearly from proportionalSkew = 0 down to proportionalSkew = maxFRSkew,
						// So that the funding rate will go from 0 to maxFR.
						// 0 skew is achieved when oppLev = -leverage.
						// But when does proportionalSkew = maxFRSkew?
						// Choose oppLev = k*lev,
						// maxFRSkew is achieved when
						//    (lev - k*lev)/(lev + k*lev) = maxFRSkew
						// => k = (1-maxFRSkew)/(1+maxFRSkew)
						// E.g. if maxFRSkew = 0.5, then k = 0.5/1.5 = 1/3
						//      So we sample oppLev from leverage to 1/3*leverage

						const k = toUnit(1)
							.sub(maxFRSkew)
							.mul(toUnit(1))
							.div(toUnit(1).add(maxFRSkew));

						setPrice(baseAsset, toUnit('100'));

						for (const maxFR of ['0.1', '0.2', '0.05'].map(toUnit)) {
							await futuresMarketSettings.setMaxFundingRate(baseAsset, maxFR, { from: owner });

							const lowLev = leverage.mul(k).div(toUnit(1));

							for (let i = points; i >= 0; i--) {
								// now lerp from leverage*k to leverage
								const frac = leverage
									.sub(lowLev)
									.mul(toBN(i))
									.div(toBN(points));
								const oppLev = lowLev.add(frac).neg();
								const size = oppLev.mul(toBN('10'));
								if (size.gt(toBN('0'))) {
									await futuresMarket.modifyPosition(size, { from: trader2 });
								}

								// oppLev = lev*k + lev*(1 - k)*i/points
								// The skew is (lev - lev*k - lev*(1-k)*i/points)/(lev + lev*k + lev*(1-k)*i/points)
								//           = (1 - k - (1-k)*i/points)/(1 + k + (1-k)*i/points)
								//           = (1 - i/points)/(1 + i/points + 2k/(1-k))
								//           = (points - i)/(points + i + points*(1/maxFRSkew - 1))

								const maxFRSkewCorrection = toUnit(1)
									.mul(toUnit(1))
									.div(maxFRSkew)
									.sub(toUnit(1))
									.mul(toBN(points));
								let expected = maxFR
									.mul(toUnit(1))
									.div(maxFRSkew)
									.mul(toUnit(points - i))
									.div(toUnit(points + i).add(maxFRSkewCorrection))
									.mul(leverage.div(leverage.abs()))
									.neg();

								if (expected.gt(maxFR)) {
									expected = maxFR;
								}

								assert.bnClose(await futuresMarket.currentFundingRate(), expected, toUnit('0.01'));

								await futuresMarket.closePosition({ from: trader2 });
							}
						}
					}
				});
			});
		}

		describe('Funding sequence', () => {
			const price = toUnit('100');
			beforeEach(async () => {
				// Set up some market skew so that funding is being incurred.
				// Proportional Skew = 0.5, so funding rate is 0.05 per day.
				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: trader,
					fillPrice: price,
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('90'),
				});

				await transferMarginAndModifyPosition({
					market: futuresMarket,
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
				assert.bnEqual(
					await futuresMarket.fundingSequenceLength(),
					initialFundingIndex.add(toBN(5))
				);
				await fastForward(24 * 60 * 60);
				await setPrice(baseAsset, toUnit('100'));
				assert.bnClose((await futuresMarket.unrecordedFunding())[0], toUnit('-5'), toUnit('0.01'));

				await futuresMarketSettings.setMaxFundingRate(baseAsset, toUnit('0.2'), { from: owner });
				let time = await currentTime();

				assert.bnEqual(
					await futuresMarket.fundingSequenceLength(),
					initialFundingIndex.add(toBN(6))
				);
				assert.bnEqual(await futuresMarket.fundingLastRecomputed(), time);
				assert.bnClose(
					await futuresMarket.fundingSequence(initialFundingIndex.add(toBN(5))),
					toUnit('-5'),
					toUnit('0.01')
				);
				assert.bnClose((await futuresMarket.unrecordedFunding())[0], toUnit('0'), toUnit('0.01'));

				await fastForward(24 * 60 * 60);
				await setPrice(baseAsset, toUnit('200'));
				assert.bnClose(
					(await futuresMarket.unrecordedFunding())[0],
					toUnit('-20'),
					toUnit('0.001')
				);

				await futuresMarketSettings.setMaxFundingRateSkew(baseAsset, toUnit('0.5'), {
					from: owner,
				});
				time = await currentTime();

				assert.bnEqual(
					await futuresMarket.fundingSequenceLength(),
					initialFundingIndex.add(toBN(7))
				);
				assert.bnEqual(await futuresMarket.fundingLastRecomputed(), time);
				assert.bnClose(
					await futuresMarket.fundingSequence(initialFundingIndex.add(toBN(6))),
					toUnit('-25'),
					toUnit('0.01')
				);

				await fastForward(24 * 60 * 60);
				await setPrice(baseAsset, toUnit('300'));
				assert.bnClose((await futuresMarket.unrecordedFunding())[0], toUnit('-60'), toUnit('0.01'));

				await futuresMarketSettings.setMaxFundingRateDelta(baseAsset, toUnit('0.05'), {
					from: owner,
				});
				time = await currentTime();

				assert.bnEqual(
					await futuresMarket.fundingSequenceLength(),
					initialFundingIndex.add(toBN(8))
				);
				assert.bnEqual(await futuresMarket.fundingLastRecomputed(), time);
				assert.bnClose(
					await futuresMarket.fundingSequence(initialFundingIndex.add(toBN(7))),
					toUnit('-85'),
					toUnit('0.01')
				);
			});
		});

		it.skip('A zero-size position accrues no funding', async () => {
			assert.isTrue(false);
		});
	});

	describe('Market Debt', () => {
		it('Basic debt movements', async () => {
			assert.bnEqual(await futuresMarket.entryDebtCorrection(), toUnit('0'));
			assert.bnEqual((await futuresMarket.marketDebt())[0], toUnit('0'));

			await setPrice(baseAsset, toUnit('100'));
			await futuresMarket.transferMargin(toUnit('1000'), { from: trader }); // Debt correction: +1000
			const fee1 = (await futuresMarket.orderFee(trader, toUnit('50')))[0];
			await futuresMarket.modifyPosition(toUnit('50'), { from: trader }); // Debt correction: -5000 - fee1

			assert.bnEqual(await futuresMarket.entryDebtCorrection(), toUnit('-4000').sub(fee1));
			assert.bnEqual((await futuresMarket.marketDebt())[0], toUnit('1000').sub(fee1));

			await setPrice(baseAsset, toUnit('120'));
			await futuresMarket.transferMargin(toUnit('600'), { from: trader2 }); // Debt correction: +600
			const fee2 = (await futuresMarket.orderFee(trader2, toUnit('-35')))[0];
			await futuresMarket.modifyPosition(toUnit('-35'), { from: trader2 }); // Debt correction: +4200 - fee2

			assert.bnClose(
				await futuresMarket.entryDebtCorrection(),
				toUnit('800')
					.sub(fee1)
					.sub(fee2),
				toUnit('0.1')
			);

			// 1600 margin, plus 1000 profit by trader1
			assert.bnClose(
				(await futuresMarket.marketDebt())[0],
				toUnit('2600')
					.sub(fee1)
					.sub(fee2),
				toUnit('0.1')
			);

			await closePositionAndWithdrawMargin({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('110'),
			});

			assert.bnClose(await futuresMarket.entryDebtCorrection(), toUnit('4800'), toUnit('10'));
			assert.bnClose((await futuresMarket.marketDebt())[0], toUnit('950'), toUnit('10'));

			await closePositionAndWithdrawMargin({
				market: futuresMarket,
				account: trader2,
				fillPrice: toUnit('100'),
			});

			assert.bnEqual(await futuresMarket.entryDebtCorrection(), toUnit('0'));
			assert.bnEqual((await futuresMarket.marketDebt())[0], toUnit('0'));
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
			assert.isFalse((await futuresMarket.marketDebt())[1]);
			await fastForward(7 * 24 * 60 * 60);
			assert.isTrue((await futuresMarket.marketDebt())[1]);
		});

		describe('Market debt is accurately reflected in total system debt', () => {
			it('Margin transfers do not alter total system debt', async () => {
				const debt = (await debtCache.currentDebt())[0];
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual((await debtCache.currentDebt())[0], debt);
				await futuresMarket.transferMargin(toUnit('-500'), { from: trader });
				assert.bnEqual((await debtCache.currentDebt())[0], debt);
			});

			it('Prices altering market debt are reflected in total system debt', async () => {
				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('100'),
				});

				await transferMarginAndModifyPosition({
					market: futuresMarket,
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
			it('Liquidation price is accurate with no funding', async () => {
				await setPrice(baseAsset, toUnit('100'));
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				await futuresMarket.modifyPosition(toUnit('100'), { from: trader });
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await futuresMarket.modifyPosition(toUnit('-100'), { from: trader2 });

				let liquidationPrice = await futuresMarket.liquidationPrice(trader, true);
				let liquidationPriceNoFunding = await futuresMarket.liquidationPrice(trader, false);

				assert.bnEqual(liquidationPriceNoFunding.price, toUnit('90.5'));
				assert.bnClose(liquidationPrice.price, toUnit('90.5'), toUnit('0.001'));
				assert.isFalse(liquidationPrice.invalid);
				assert.isFalse(liquidationPriceNoFunding.invalid);

				liquidationPrice = await futuresMarket.liquidationPrice(trader2, true);
				liquidationPriceNoFunding = await futuresMarket.liquidationPrice(trader2, false);

				assert.bnEqual(liquidationPrice.price, liquidationPriceNoFunding.price);
				assert.bnEqual(liquidationPrice.price, toUnit('109.7'));
				assert.isFalse(liquidationPrice.invalid);
				assert.isFalse(liquidationPriceNoFunding.invalid);
			});

			it('Liquidation price is accurate if the liquidation fee changes', async () => {
				await setPrice(baseAsset, toUnit('250'));
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				await futuresMarket.modifyPosition(toUnit('20'), { from: trader });
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await futuresMarket.modifyPosition(toUnit('-20'), { from: trader2 });

				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader, true)).price,
					toUnit(201.75),
					toUnit('0.001')
				);
				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader2, true)).price,
					toUnit(298.75),
					toUnit('0.001')
				);

				await futuresMarketSettings.setLiquidationFee(toUnit('100'), { from: owner });

				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader, true)).price,
					toUnit(205.75),
					toUnit('0.001')
				);
				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader2, true)).price,
					toUnit(294.75),
					toUnit('0.001')
				);

				await futuresMarketSettings.setLiquidationFee(toUnit('0'), { from: owner });

				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader, true)).price,
					toUnit(200.75),
					toUnit('0.001')
				);
				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader2, true)).price,
					toUnit(299.75),
					toUnit('0.001')
				);
			});

			it('Liquidation price is accurate with funding', async () => {
				await setPrice(baseAsset, toUnit('250'));
				// Submit orders that induce -0.05 funding rate
				await futuresMarket.transferMargin(toUnit('1500'), { from: trader });
				await futuresMarket.modifyPosition(toUnit('30'), { from: trader });
				await futuresMarket.transferMargin(toUnit('500'), { from: trader2 });
				await futuresMarket.modifyPosition(toUnit('-10'), { from: trader2 });

				const preLPrice1 = (await futuresMarket.liquidationPrice(trader, true))[0];
				const preLPrice2 = (await futuresMarket.liquidationPrice(trader2, true))[0];

				// One day of funding
				await fastForward(24 * 60 * 60);

				// trader 1 pays 30 * -0.05 = -1.5 base units of funding, and a $22.5 trading fee
				// liquidation price = (20 - (1500 - 22.5) + 30 * 250) / (30 - 1.5) = 212.018...
				let lPrice = await futuresMarket.liquidationPrice(trader, true);
				assert.bnClose(lPrice[0], toUnit(212.018), toUnit(0.001));
				lPrice = await futuresMarket.liquidationPrice(trader, false);
				assert.bnClose(lPrice[0], preLPrice1, toUnit(0.001));

				// trader2 receives -10 * -0.05 = 0.5 base units of funding, and a $2.5 trading fee
				// liquidation price = (20 - (500 - 2.5) - 10 * 250) / (-10 + 0.5) = 312.894...
				lPrice = await futuresMarket.liquidationPrice(trader2, true);
				assert.bnClose(lPrice[0], toUnit(313.421), toUnit(0.001));
				lPrice = await futuresMarket.liquidationPrice(trader2, false);
				assert.bnClose(lPrice[0], preLPrice2, toUnit(0.001));
			});

			it('Liquidation price reports invalidity properly', async () => {
				await setPrice(baseAsset, toUnit('250'));
				await futuresMarket.transferMargin(toUnit('1500'), { from: trader });
				await futuresMarket.modifyPosition(toUnit('30'), { from: trader });
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await futuresMarket.modifyPosition(toUnit('-20'), { from: trader2 });

				assert.isFalse((await futuresMarket.liquidationPrice(trader, true))[1]);

				await fastForward(60 * 60 * 24 * 7); // Stale the price

				// Check the prices are accurate while we're here

				// funding rate = -10/50 * 0.1 = -0.02
				// trader 1 pays 30 * 7 * -0.02 = -4.2 units of funding, pays $22.5 exchange fee
				// Remaining margin = (20 - (1500 - 22.5) + 30 * 250) / (30 - 4.2) = 234.205...
				let lPrice = await futuresMarket.liquidationPrice(trader, true);
				assert.bnClose(lPrice[0], toUnit(234.205), toUnit(0.01));
				assert.isTrue(lPrice[1]);

				// trader 2 receives -20 * 7 * -0.02 = 2.8 units of funding, pays $5 exchange fee
				// Remaining margin = (20 - (1000 - 5) - 20 * 250) / (-20 + 2.8) = 346.802...
				lPrice = await futuresMarket.liquidationPrice(trader2, true);
				assert.bnClose(lPrice[0], toUnit(347.383), toUnit(0.01));
				assert.isTrue(lPrice[1]);
			});

			it.skip('Liquidation price is accurate with funding with intervening funding sequence updates', async () => {
				// TODO: confirm order -> a bunch of trades from other traders happen over a time period -> check the liquidation price given that most of the accrued funding is not unrecorded
				assert.isTrue(false);
			});

			it('No liquidation price on an empty position', async () => {
				assert.bnEqual((await futuresMarket.liquidationPrice(noBalance, true))[0], toUnit(0));
			});

			it.skip('Liquidation price is sensitive to liquidation fee changes', async () => {
				assert.isTrue(false);
			});
		});

		describe('canLiquidate', () => {
			it('Can liquidate an underwater position', async () => {
				let price = toUnit('250');
				await setPrice(baseAsset, price);
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				await futuresMarket.modifyPosition(toUnit('20'), { from: trader });

				price = (await futuresMarket.liquidationPrice(trader, true)).price;
				await setPrice(baseAsset, price);

				assert.isTrue(await futuresMarket.canLiquidate(trader));
			});

			it('Empty positions cannot be liquidated', async () => {
				assert.isFalse(await futuresMarket.canLiquidate(trader));
			});

			it('No liquidations while prices are invalid', async () => {
				await setPrice(baseAsset, toUnit('250'));
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				await futuresMarket.modifyPosition(toUnit('20'), { from: trader });

				await setPrice(baseAsset, toUnit('25'));
				assert.isTrue(await futuresMarket.canLiquidate(trader));
				await fastForward(60 * 60 * 24 * 7); // Stale the price
				assert.isFalse(await futuresMarket.canLiquidate(trader));
			});
		});

		describe('liquidatePosition', () => {
			beforeEach(async () => {
				await setPrice(baseAsset, toUnit('250'));
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader });
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader2 });
				await futuresMarket.transferMargin(toUnit('1000'), { from: trader3 });
				await futuresMarket.modifyPosition(toUnit('40'), { from: trader });
				await futuresMarket.modifyPosition(toUnit('20'), { from: trader2 });
				await futuresMarket.modifyPosition(toUnit('-20'), { from: trader3 });
				// Exchange fees total 60 * 250 * 0.003 + 20 * 250 * 0.001 = 50
			});

			it('Cannot liquidate nonexistent positions', async () => {
				await assert.revert(
					futuresMarket.liquidatePosition(noBalance),
					'Position cannot be liquidated'
				);
			});

			it('Liquidation properly affects the overall market parameters (long case)', async () => {
				await fastForward(24 * 60 * 60); // wait one day to accrue a bit of funding

				const size = await futuresMarket.marketSize();
				const sizes = await futuresMarket.marketSizes();
				const skew = await futuresMarket.marketSkew();
				const positionSize = (await futuresMarket.positions(trader)).size;

				assert.isFalse(await futuresMarket.canLiquidate(trader));
				assert.isFalse(await futuresMarket.canLiquidate(trader2));

				await setPrice(baseAsset, toUnit('200'));

				assert.isTrue(await futuresMarket.canLiquidate(trader));
				assert.isTrue(await futuresMarket.canLiquidate(trader2));

				// Note at this point the true market debt should be $2000 ($1000 profit for the short trader, and two liquidated longs)
				// However, the long positions are actually underwater and the negative contribution is not removed until liquidation
				assert.bnClose(
					(await futuresMarket.marketDebt())[0],
					toUnit('600').sub(toUnit('50')),
					toUnit('0.1')
				);
				assert.bnClose((await futuresMarket.unrecordedFunding())[0], toUnit('-10'), toUnit('0.01'));

				await futuresMarket.liquidatePosition(trader, { from: noBalance });

				assert.bnEqual(await futuresMarket.marketSize(), size.sub(positionSize.abs()));
				let newSizes = await futuresMarket.marketSizes();
				assert.bnEqual(newSizes[0], sizes[0].sub(positionSize.abs()));
				assert.bnEqual(newSizes[1], sizes[1]);
				assert.bnEqual(await futuresMarket.marketSkew(), skew.sub(positionSize.abs()));
				assert.bnClose(
					(await futuresMarket.marketDebt())[0],
					toUnit('2000').sub(toUnit('20')),
					toUnit('0.01')
				);

				// Funding has been recorded by the liquidation.
				assert.bnClose((await futuresMarket.unrecordedFunding())[0], toUnit(0), toUnit('0.01'));

				await futuresMarket.liquidatePosition(trader2, { from: noBalance });

				assert.bnEqual(await futuresMarket.marketSize(), toUnit('20'));
				newSizes = await futuresMarket.marketSizes();
				assert.bnEqual(newSizes[0], toUnit('0'));
				assert.bnEqual(newSizes[1], toUnit('20'));
				assert.bnEqual(await futuresMarket.marketSkew(), toUnit('-20'));
				// Market debt is now just the remaining position, plus the funding they've made.
				assert.bnClose(
					(await futuresMarket.marketDebt())[0],
					toUnit('2200').sub(toUnit('5')),
					toUnit('0.01')
				);
			});

			it('Liquidation properly affects the overall market parameters (short case)', async () => {
				await fastForward(24 * 60 * 60); // wait one day to accrue a bit of funding

				const size = await futuresMarket.marketSize();
				const sizes = await futuresMarket.marketSizes();
				const positionSize = (await futuresMarket.positions(trader3)).size;

				await setPrice(baseAsset, toUnit('350'));

				assert.bnClose(
					(await futuresMarket.marketDebt())[0],
					toUnit('6300').sub(toUnit('50')),
					toUnit('0.1')
				);
				assert.bnClose(
					(await futuresMarket.unrecordedFunding())[0],
					toUnit('-17.5'),
					toUnit('0.01')
				);

				await futuresMarket.liquidatePosition(trader3, { from: noBalance });

				assert.bnEqual(await futuresMarket.marketSize(), size.sub(positionSize.abs()));
				const newSizes = await futuresMarket.marketSizes();
				assert.bnEqual(newSizes[0], sizes[0]);
				assert.bnEqual(newSizes[1], toUnit(0));
				assert.bnEqual(await futuresMarket.marketSkew(), toUnit('60'));
				assert.bnClose(
					(await futuresMarket.marketDebt())[0],
					toUnit('6950').sub(toUnit('45')),
					toUnit('0.1')
				);

				// Funding has been recorded by the liquidation.
				assert.bnClose((await futuresMarket.unrecordedFunding())[0], toUnit(0), toUnit('0.01'));
			});

			it('Can liquidate a position with less than the liquidation fee margin remaining (long case)', async () => {
				assert.isFalse(await futuresMarket.canLiquidate(trader));
				const price = (await futuresMarket.liquidationPrice(trader, true)).price;
				assert.bnClose(price, toUnit('226.25'), toUnit('0.01'));
				await setPrice(baseAsset, price);

				const { size: positionSize, id: positionId } = await futuresMarket.positions(trader);

				assert.isTrue(await futuresMarket.canLiquidate(trader));

				const tx = await futuresMarket.liquidatePosition(trader, { from: noBalance });

				assert.isFalse(await futuresMarket.canLiquidate(trader));
				const position = await futuresMarket.positions(trader, { from: noBalance });
				assert.bnEqual(position.margin, toUnit(0));
				assert.bnEqual(position.size, toUnit(0));
				assert.bnEqual(position.lastPrice, toUnit(0));
				assert.bnEqual(position.fundingIndex, toBN(0));

				assert.bnEqual(await sUSD.balanceOf(noBalance), liquidationFee);

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });

				assert.equal(decodedLogs.length, 4);
				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [noBalance, liquidationFee],
					log: decodedLogs[1],
				});
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: proxyFuturesMarket.address,
					args: [positionId, trader, toBN('0'), toBN('0'), toBN('0'), toBN('0'), toBN('0')],
					log: decodedLogs[2],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: proxyFuturesMarket.address,
					args: [positionId, trader, noBalance, positionSize, price, liquidationFee],
					log: decodedLogs[3],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Can liquidate a position with less than the liquidation fee margin remaining (short case)', async () => {
				const price = (await futuresMarket.liquidationPrice(trader3, true)).price;
				assert.bnClose(price, toUnit('298.75'), toUnit('0.01'));

				await setPrice(baseAsset, price.add(toUnit('0.01')));

				const { size: positionSize, id: positionId } = await futuresMarket.positions(trader3);

				const tx = await futuresMarket.liquidatePosition(trader3, { from: noBalance });

				const position = await futuresMarket.positions(trader3, { from: noBalance });
				assert.bnEqual(position.margin, toUnit(0));
				assert.bnEqual(position.size, toUnit(0));
				assert.bnEqual(position.lastPrice, toUnit(0));
				assert.bnEqual(position.fundingIndex, toBN(0));

				assert.bnEqual(await sUSD.balanceOf(noBalance), liquidationFee);

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });

				assert.equal(decodedLogs.length, 4);
				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [noBalance, liquidationFee],
					log: decodedLogs[1],
				});
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: proxyFuturesMarket.address,
					args: [positionId, trader3, toBN('0'), toBN('0'), toBN('0'), toBN('0'), toBN('0')],
					log: decodedLogs[2],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: proxyFuturesMarket.address,
					args: [positionId, trader3, noBalance, positionSize, price, liquidationFee],
					log: decodedLogs[3],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Transfers an updated fee upon liquidation', async () => {
				const { size: positionSize, id: positionId } = await futuresMarket.positions(trader);
				// Move the price to a non-liquidating point
				let price = (await futuresMarket.liquidationPrice(trader, true)).price;

				await setPrice(baseAsset, price.add(toUnit('1')));

				assert.isFalse(await futuresMarket.canLiquidate(trader));

				// raise the liquidation fee
				await futuresMarketSettings.setLiquidationFee(toUnit('100'), { from: owner });

				assert.isTrue(await futuresMarket.canLiquidate(trader));
				price = (await futuresMarket.liquidationPrice(trader, true)).price;

				// liquidate the position
				const tx = await futuresMarket.liquidatePosition(trader, { from: noBalance });

				// check that the liquidation price was correct.
				assert.bnClose(price, toUnit(228.25), toUnit(0.1));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: proxyFuturesMarket.address,
					args: [positionId, trader, toBN('0'), toBN('0'), toBN('0'), toBN('0'), toBN('0')],
					log: decodedLogs[2],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: proxyFuturesMarket.address,
					args: [positionId, trader, noBalance, positionSize, price, toUnit('100')],
					log: decodedLogs[3],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Liquidating a position and opening one after should increment the position id', async () => {
				const { id: oldPositionId } = await futuresMarket.positions(trader);
				assert.bnEqual(oldPositionId, toBN('1'));

				await setPrice(baseAsset, toUnit('200'));
				assert.isTrue(await futuresMarket.canLiquidate(trader));
				await futuresMarket.liquidatePosition(trader, { from: noBalance });

				await transferMarginAndModifyPosition({
					market: futuresMarket,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				const { id: newPositionId } = await futuresMarket.positions(trader);
				assert.bnGte(newPositionId, oldPositionId);
			});
		});
	});
});
