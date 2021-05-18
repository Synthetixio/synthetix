const { contract, web3 } = require('hardhat');

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
const { getDecodedLogs, decodedEventEqual } = require('./helpers');

/*
async function logPosition(account) {
	const position = await futuresMarket.positions(account);
	const remainingMargin = (await futuresMarket.remainingMargin(account))[0];
	const currentLeverage = (await futuresMarket.currentLeverage(account))[0];
	const profitLoss = (await futuresMarket.profitLoss(account))[0];
	const funding = (await futuresMarket.accruedFunding(account))[0];
	const liquidationPrice = (await futuresMarket.liquidationPrice(account, true))[0];

	console.log(`Position: ${account}`);
	console.log(`Initial Margin: ${fromUnit(position.margin)}`);
	console.log(`Profit/Loss: ${fromUnit(profitLoss)}`);
	console.log(`Funding: ${fromUnit(funding)}`);
	console.log(`Remaining Margin: ${fromUnit(remainingMargin)}`);
	console.log(`Size: ${fromUnit(position.size)}`);
	console.log(`Current Leverage: ${fromUnit(currentLeverage)}`);
	console.log(`Liquidation Price: ${fromUnit(liquidationPrice)}`);
	console.log(`Last Price: ${fromUnit(position.lastPrice)}`);
	console.log(`Funding Index: ${position.fundingIndex}`);
	console.log();
}
 */

contract('FuturesMarket', accounts => {
	let systemSettings, proxyFuturesMarket, futuresMarket, exchangeRates, oracle, sUSD, feePool;

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
	const minInitialMargin = toUnit('100');
	const maxFundingRate = toUnit('0.1');
	const maxFundingRateSkew = toUnit('1');
	const maxFundingRateDelta = toUnit('0.0125');
	const initialPrice = toUnit('100');
	const liquidationFee = toUnit('20');

	async function setPrice(asset, price) {
		await exchangeRates.updateRates([asset], [price], await currentTime(), {
			from: oracle,
		});
	}

	async function confirmOrder({ market, account, fillPrice }) {
		await setPrice(await market.baseAsset(), fillPrice);
		await market.confirmOrder(account);
	}

	async function submitAndConfirmOrder({ market, account, fillPrice, leverage }) {
		await market.submitOrder(leverage, { from: account });
		await confirmOrder({
			market,
			account,
			fillPrice,
		});
	}

	async function modifyMarginSubmitAndConfirmOrder({
		market,
		account,
		fillPrice,
		marginDelta,
		leverage,
	}) {
		await market.modifyMarginAndSubmitOrder(marginDelta, leverage, { from: account });
		await confirmOrder({
			market,
			account,
			fillPrice,
		});
	}

	async function closePositionAndWithdrawMargin({ market, account, fillPrice }) {
		await market.closePosition({ from: account });
		await confirmOrder({
			market,
			account,
			fillPrice,
		});
		await market.withdrawAllMargin({ from: account });
	}

	before(async () => {
		({
			ProxyFuturesMarket: proxyFuturesMarket,
			FuturesMarket: futuresMarket,
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSD,
			FeePool: feePool,
			SystemSettings: systemSettings,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'FuturesMarketManager',
				'ProxyFuturesMarket',
				'FuturesMarket',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'SystemStatus',
				'SystemSettings',
				'Synthetix',
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

	// TODO: Check that onlyOwner functions are indeed onlyOwner using `onlyGivenAddressCanInvoke`

	describe('Basic parameters', () => {
		it.skip('Only expected functions are mutative', async () => {
			/*
			ensureOnlyExpectedMutativeFunctions({
				abi: market.abi,
				ignoreParents: ['Owned', 'MixinResolver'],
				expected: [
					'bid',
					'refund',
					'resolve',
					'claimOptions',
					'exerciseOptions',
					'expire',
					'cancel',
				],
			});
			*/
			assert.isTrue(false);
		});

		it('static parameters are set properly at construction', async () => {
			const parameters = await futuresMarket.parameters();
			assert.equal(await futuresMarket.baseAsset(), baseAsset);
			assert.bnEqual(parameters.takerFee, takerFee);
			assert.bnEqual(parameters.makerFee, makerFee);
			assert.bnEqual(parameters.maxLeverage, maxLeverage);
			assert.bnEqual(parameters.maxMarketValue, maxMarketValue);
			assert.bnEqual(parameters.minInitialMargin, minInitialMargin);
			assert.bnEqual(parameters.maxFundingRate, maxFundingRate);
			assert.bnEqual(parameters.maxFundingRateSkew, maxFundingRateSkew);
			assert.bnEqual(parameters.maxFundingRateDelta, maxFundingRateDelta);
		});

		it('prices are properly fetched', async () => {
			const roundId = await futuresMarket.currentRoundId();
			const price = toUnit(200);
			await setPrice(baseAsset, price);
			const result = await futuresMarket.assetPrice();

			assert.bnEqual(result.price, price);
			assert.isFalse(result.invalid);
			assert.bnEqual(await futuresMarket.currentRoundId(), toBN(roundId).add(toBN(1)));
		});

		it('Setters', async () => {
			const params = [
				['takerFee', '0.01', futuresMarket.setTakerFee],
				['makerFee', '0.01', futuresMarket.setMakerFee],
				['maxLeverage', '20', futuresMarket.setMaxLeverage],
				['maxMarketValue', '50000', futuresMarket.setMaxMarketValue],
				['minInitialMargin', '500', futuresMarket.setMinInitialMargin],
				['maxFundingRate', '0.5', futuresMarket.setMaxFundingRate],
				['maxFundingRateSkew', '0.5', futuresMarket.setMaxFundingRateSkew],
				['maxFundingRateDelta', '0.02', futuresMarket.setMaxFundingRateDelta],
			];

			for (const p of params) {
				const param = toBytes32(p[0]);
				const value = toUnit(p[1]);
				const setter = p[2];

				// Only settable by the owner
				await assert.revert(setter(value, { from: trader }), 'Owner only function');

				const tx = await setter(value, { from: owner });
				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [futuresMarket] });

				assert.equal(decodedLogs.length, 1);
				decodedEventEqual({
					event: 'ParameterUpdated',
					emittedFrom: proxyFuturesMarket.address,
					args: [param, value],
					log: decodedLogs[0],
				});

				// And the parameter was actually set properly
				assert.bnEqual((await futuresMarket.parameters())[p[0]], value);
			}
		});

		it('market size and skew', async () => {
			let sizes = await futuresMarket.marketSizes();
			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(await futuresMarket.marketSize(), toUnit('0'));
			assert.bnEqual(await futuresMarket.marketSkew(), toUnit('0'));
			assert.bnEqual(await futuresMarket.proportionalSkew(), toUnit('0'));

			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('100'),
				marginDelta: toUnit('1000'),
				leverage: toUnit('5'),
			});

			sizes = await futuresMarket.marketSizes();
			assert.bnEqual(sizes[0], toUnit('50'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(await futuresMarket.marketSize(), toUnit('50'));
			assert.bnEqual(await futuresMarket.marketSkew(), toUnit('50'));
			assert.bnEqual(await futuresMarket.proportionalSkew(), toUnit('1'));

			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader2,
				fillPrice: toUnit('120'),
				marginDelta: toUnit('600'),
				leverage: toUnit('-7'),
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

		for (const leverage of ['3.5', '-3.5'].map(toUnit)) {
			const side = parseInt(leverage.toString()) > 0 ? 'long' : 'short';

			describe(`${side}`, () => {
				it('Ensure that the order fee (both maker and taker) is correct when the order is actually submitted', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						leverage,
					});

					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage: leverage.neg(),
					});

					const notional = multiplyDecimalRound(margin, leverage.abs());
					const fee = multiplyDecimalRound(notional, takerFee.add(makerFee));
					assert.bnEqual(
						(await futuresMarket.orderFee(trader, margin.mul(toBN(3)), leverage.neg()))[0],
						fee
					);

					await futuresMarket.modifyMargin(margin.mul(toBN(2)), { from: trader });
					const preBalance = await sUSD.balanceOf(trader);
					const tx = await futuresMarket.submitOrder(leverage.neg(), { from: trader });

					// Fee is properly recorded and deducted.
					assert.bnClose(await sUSD.balanceOf(trader), preBalance.sub(fee), toUnit('0.001'));
					const decodedLogs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [sUSD, futuresMarket],
					});
					decodedEventEqual({
						event: 'OrderSubmitted',
						emittedFrom: proxyFuturesMarket.address,
						args: [toBN(3), trader, leverage.neg(), fee, await futuresMarket.currentRoundId()],
						log: decodedLogs[1],
						bnCloseVariance: toUnit('0.001'),
					});
				});

				it('Submit a fresh order when there is no skew', async () => {
					const notional = multiplyDecimalRound(margin, leverage.abs());
					const fee = multiplyDecimalRound(notional, takerFee);
					assert.bnEqual((await futuresMarket.orderFee(trader, margin, leverage))[0], fee);
				});

				it('Submit a fresh order on the same side as the skew', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage,
					});

					const notional = multiplyDecimalRound(margin, leverage.abs());
					const fee = multiplyDecimalRound(notional, takerFee);
					assert.bnEqual((await futuresMarket.orderFee(trader, margin, leverage))[0], fee);
				});

				it(`Submit a fresh order on the opposite side to the skew smaller than the skew`, async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage: leverage.neg(),
					});

					const notional = multiplyDecimalRound(margin.div(toBN(2)), leverage.abs());
					const fee = multiplyDecimalRound(notional, makerFee);

					assert.bnEqual(
						(await futuresMarket.orderFee(trader, margin.div(toBN(2)), leverage))[0],
						fee
					);
				});

				it('Submit a fresh order on the opposite side to the skew larger than the skew', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.div(toBN(2)),
						leverage: leverage.neg(),
					});

					const notional = multiplyDecimalRound(margin, leverage.abs());
					const fee = multiplyDecimalRound(notional, takerFee.add(makerFee)).div(toBN(2));
					assert.bnEqual((await futuresMarket.orderFee(trader, margin, leverage))[0], fee);
				});

				it('Increase an existing position on the side of the skew', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage,
					});

					const notional = multiplyDecimalRound(margin.div(toBN(2)), leverage.abs());
					const fee = multiplyDecimalRound(notional, takerFee);
					assert.bnEqual(
						(await futuresMarket.orderFee(trader, margin.add(margin.div(toBN(2))), leverage))[0],
						fee
					);
				});

				it('Increase an existing position opposite to the skew smaller than the skew', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						leverage,
					});

					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage: leverage.neg(),
					});

					const notional = multiplyDecimalRound(margin.div(toBN(2)), leverage.abs());
					const fee = multiplyDecimalRound(notional, makerFee);

					assert.bnEqual(
						(
							await futuresMarket.orderFee(trader, margin.add(margin.div(toBN(2))), leverage.neg())
						)[0],
						fee
					);
				});

				it('Increase an existing position opposite to the skew larger than the skew', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						leverage,
					});

					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage: leverage.neg(),
					});

					const notional = multiplyDecimalRound(margin, leverage.abs());
					const fee = multiplyDecimalRound(notional, takerFee.add(makerFee));
					assert.bnEqual(
						(await futuresMarket.orderFee(trader, margin.mul(toBN(3)), leverage.neg()))[0],
						fee
					);
				});

				it('reduce an existing position on the side of the skew', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage,
					});

					assert.bnEqual(
						(await futuresMarket.orderFee(trader, margin.div(toBN(2)), leverage))[0],
						toBN(0)
					);
				});

				it('reduce an existing position opposite to the skew', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						leverage,
					});

					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage: leverage.neg(),
					});

					assert.bnEqual(
						(await futuresMarket.orderFee(trader, margin.div(toBN(2)), leverage.neg()))[0],
						toBN(0)
					);
				});

				it('close an existing position on the side of the skew', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage,
					});

					assert.bnEqual((await futuresMarket.orderFee(trader, toBN(0), leverage))[0], toBN(0));
					assert.bnEqual((await futuresMarket.orderFee(trader, margin, toBN(0)))[0], toBN(0));
					assert.bnEqual((await futuresMarket.orderFee(trader, toBN(0), toBN(0)))[0], toBN(0));
				});

				it('close an existing position opposite to the skew', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						leverage,
					});

					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage: leverage.neg(),
					});

					assert.bnEqual(
						(await futuresMarket.orderFee(trader, toBN(0), leverage.neg()))[0],
						toBN(0)
					);
					assert.bnEqual((await futuresMarket.orderFee(trader, margin, toBN(0)))[0], toBN(0));
					assert.bnEqual((await futuresMarket.orderFee(trader, toBN(0), toBN(0)))[0], toBN(0));
				});

				it('Updated order, on the same side as the skew, on the opposite side of an existing position', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						leverage,
					});

					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage: leverage.neg(),
					});

					const notional = multiplyDecimalRound(margin, leverage.abs());
					const fee = multiplyDecimalRound(notional, takerFee);
					assert.bnEqual((await futuresMarket.orderFee(trader, margin, leverage))[0], fee);
				});

				it('Updated order, opposite and smaller than the skew, on opposite side of an existing position', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						leverage,
					});

					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage,
					});

					const fee = multiplyDecimalRound(
						multiplyDecimalRound(margin, leverage.abs()).div(toBN(2)),
						makerFee
					);

					assert.bnEqual(
						(await futuresMarket.orderFee(trader, margin.div(toBN(2)), leverage.neg()))[0],
						fee
					);
				});

				it('Updated order, opposite and larger than the skew, on the opposite side of an existing position', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage,
					});

					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage,
					});

					const notional = multiplyDecimalRound(margin, leverage.abs());
					const fee = multiplyDecimalRound(notional, takerFee.add(makerFee));
					assert.bnEqual(
						(await futuresMarket.orderFee(trader, margin.mul(toBN(2)), leverage.neg()))[0],
						fee
					);
				});

				it('Updated order, opposite and larger than the skew, except that an existing opposite-side order increases the skew when closed', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage,
					});

					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage: leverage.neg(),
					});

					const notional = multiplyDecimalRound(margin.div(toBN(2)), leverage.abs());
					const fee = multiplyDecimalRound(notional, takerFee);
					assert.bnEqual(
						(await futuresMarket.orderFee(trader, margin.div(toBN(2)), leverage))[0],
						fee
					);
				});

				it('Updated order, opposite and larger than the skew, on the opposite side of an existing position (2)', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						leverage,
					});

					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader3,
						fillPrice: toUnit('100'),
						marginDelta: margin.div(toBN(2)),
						leverage: leverage.neg(),
					});

					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin.div(toBN(2)),
						leverage,
					});

					const makerPart = multiplyDecimalRound(
						multiplyDecimalRound(margin.div(toBN(2)), leverage.abs()),
						makerFee
					);
					const takerPart = multiplyDecimalRound(
						multiplyDecimalRound(margin, leverage.abs()),
						takerFee
					);
					const fee = makerPart.add(takerPart);
					assert.bnEqual(
						(
							await futuresMarket.orderFee(trader, margin.add(margin.div(toBN(2))), leverage.neg())
						)[0],
						fee
					);
				});
			});
		}
	});

	describe('Modifying margin', () => {
		it.skip('Modifying margin updates margin, last price, funding index, but not size', async () => {
			assert.isTrue(false);
		});

		describe('sUSD balance', () => {
			it('Positive delta -> burn sUSD', async () => {
				const preBalance = await sUSD.balanceOf(trader);
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(toUnit('1000')));
			});

			it('Negative delta -> mint sUSD', async () => {
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				const preBalance = await sUSD.balanceOf(trader);
				await futuresMarket.modifyMargin(toUnit('-500'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.add(toUnit('500')));
			});

			it('Zero delta -> NOP', async () => {
				const preBalance = await sUSD.balanceOf(trader);
				await futuresMarket.modifyMargin(toUnit('0'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(toUnit('0')));
			});
		});

		describe('No position', async () => {
			it('New margin', async () => {
				assert.bnEqual((await futuresMarket.positions(trader)).margin, toBN(0));
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				assert.bnEqual((await futuresMarket.positions(trader)).margin, toUnit('1000'));
			});

			it('Increase margin', async () => {
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				assert.bnEqual((await futuresMarket.positions(trader)).margin, toUnit('2000'));
			});

			it('Decrease margin', async () => {
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				await futuresMarket.modifyMargin(toUnit('-500'), { from: trader });
				assert.bnEqual((await futuresMarket.positions(trader)).margin, toUnit('500'));
			});

			it('Abolish margin', async () => {
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				await futuresMarket.modifyMargin(toUnit('-1000'), { from: trader });
				assert.bnEqual((await futuresMarket.positions(trader)).margin, toUnit('0'));
			});

			it('Cannot decrease margin past zero.', async () => {
				await assert.revert(
					futuresMarket.modifyMargin(toUnit('-1'), { from: trader }),
					'Withdrawing more than margin'
				);
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				await assert.revert(
					futuresMarket.modifyMargin(toUnit('-2000'), { from: trader }),
					'Withdrawing more than margin'
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

			it.skip('Modifying margin realises profit and funding', async () => {
				assert.isTrue(false);
			});
		});
	});

	describe('Submitting orders', () => {
		it('can successfully submit an order', async () => {
			const margin = toUnit('1000');
			await futuresMarket.modifyMargin(margin, { from: trader });

			const leverage = toUnit('10');
			const fee = (await futuresMarket.orderFee(trader, margin, leverage))[0];
			const preBalance = await sUSD.balanceOf(trader);

			const tx = await futuresMarket.submitOrder(leverage, { from: trader });

			const id = toBN(1);
			const roundId = await futuresMarket.currentRoundId();
			const order = await futuresMarket.orders(trader);
			assert.isTrue(await futuresMarket.orderPending(trader));
			assert.bnEqual(order.id, id);
			assert.bnEqual(order.leverage, leverage);
			assert.bnEqual(order.fee, fee);
			assert.bnEqual(order.roundId, roundId);

			assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(fee));

			// And it properly emits the relevant events.
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'Burned',
				emittedFrom: sUSD.address,
				args: [trader, fee],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'OrderSubmitted',
				emittedFrom: proxyFuturesMarket.address,
				args: [id, trader, leverage, fee, roundId],
				log: decodedLogs[1],
			});
		});

		it('submitting orders increments the order id', async () => {
			const margin = toUnit('200');
			await futuresMarket.modifyMargin(margin, { from: trader });
			await futuresMarket.modifyMargin(margin, { from: trader2 });

			const leverage = toUnit('5');

			await futuresMarket.submitOrder(leverage, { from: trader });
			const id = (await futuresMarket.orders(trader)).id;
			await futuresMarket.submitOrder(leverage, { from: trader });
			assert.bnEqual((await futuresMarket.orders(trader)).id, id.add(toBN(1)));
			await futuresMarket.submitOrder(leverage, { from: trader2 });
			assert.bnEqual((await futuresMarket.orders(trader2)).id, id.add(toBN(2)));
		});

		it('submitting a second order cancels the first one.', async () => {
			const margin = toUnit('1000');
			await futuresMarket.modifyMargin(margin, { from: trader });

			const leverage = toUnit('10');
			const fee = (await futuresMarket.orderFee(trader, margin, leverage))[0];

			const preBalance = await sUSD.balanceOf(trader);

			await futuresMarket.submitOrder(leverage, { from: trader });

			const id1 = toBN(1);
			const roundId1 = await futuresMarket.currentRoundId();
			const order1 = await futuresMarket.orders(trader);
			assert.isTrue(await futuresMarket.orderPending(trader));
			assert.bnEqual(order1.id, id1);
			assert.bnEqual(order1.leverage, leverage);
			assert.bnEqual(order1.fee, fee);
			assert.bnEqual(order1.roundId, roundId1);

			assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(fee));

			await fastForward(24 * 60 * 60);
			const price = toUnit('100');
			await setPrice(baseAsset, price);

			const margin2 = toUnit('500');
			await futuresMarket.modifyMargin(margin2.sub(margin), { from: trader });
			const leverage2 = toUnit('5');
			const fee2 = (await futuresMarket.orderFee(trader, margin2, leverage2))[0];

			const tx = await futuresMarket.submitOrder(leverage2, { from: trader });

			const id2 = toBN(2);
			const roundId2 = await futuresMarket.currentRoundId();
			const order2 = await futuresMarket.orders(trader);
			assert.bnGt(roundId2, roundId1);
			assert.isTrue(await futuresMarket.orderPending(trader));
			assert.bnEqual(order2.id, id2);
			assert.bnEqual(order2.leverage, leverage2);
			assert.bnEqual(order2.fee, fee2);
			assert.bnEqual(order2.roundId, roundId2);

			assert.bnEqual(await sUSD.balanceOf(trader), preBalance.add(margin2).sub(fee2));

			// And it properly emits the relevant events.
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
			assert.equal(decodedLogs.length, 4);
			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSD.address,
				args: [trader, fee],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'OrderCancelled',
				emittedFrom: proxyFuturesMarket.address,
				args: [id1, trader],
				log: decodedLogs[1],
			});
			decodedEventEqual({
				event: 'Burned',
				emittedFrom: sUSD.address,
				args: [trader, fee2],
				log: decodedLogs[2],
			});
			decodedEventEqual({
				event: 'OrderSubmitted',
				emittedFrom: proxyFuturesMarket.address,
				args: [id2, trader, leverage2, fee2, roundId2],
				log: decodedLogs[3],
			});
		});

		it('max leverage cannot be exceeded', async () => {
			await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
			await assert.revert(
				futuresMarket.submitOrder(toUnit('10.1'), { from: trader }),
				'Max leverage exceeded'
			);

			await assert.revert(
				futuresMarket.submitOrder(toUnit('-10.1'), { from: trader }),
				'Max leverage exceeded'
			);
		});

		it('min margin must be provided', async () => {
			await futuresMarket.modifyMargin(toUnit('99'), { from: trader });
			await assert.revert(
				futuresMarket.submitOrder(toUnit('10'), { from: trader }),
				'Insufficient margin'
			);
		});

		it('trader must have sufficient balance', async () => {
			await futuresMarket.modifyMargin(await sUSD.balanceOf(trader), { from: trader });
			await assert.revert(
				futuresMarket.submitOrder(toUnit('10'), { from: trader }),
				'Insufficient balance'
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
				await modifyMarginSubmitAndConfirmOrder({
					market: futuresMarket,
					account: trader,
					fillPrice: newPrice,
					marginDelta: toUnit('10000'),
					leverage: toUnit('6'),
				});

				maxOrderSizes = await futuresMarket.maxOrderSizes();
				assert.bnEqual(
					maxOrderSizes.long,
					divideDecimalRound(maxMarketValue, newPrice).sub(toUnit('400'))
				);
				assert.bnEqual(maxOrderSizes.short, divideDecimalRound(maxMarketValue, newPrice));

				// Submit order on the other side, removing all available supply.
				await modifyMarginSubmitAndConfirmOrder({
					market: futuresMarket,
					account: trader2,
					fillPrice: newPrice,
					marginDelta: toUnit('10001'),
					leverage: toUnit('-10'),
				});

				maxOrderSizes = await futuresMarket.maxOrderSizes();
				assert.bnEqual(
					maxOrderSizes.long,
					divideDecimalRound(maxMarketValue, newPrice).sub(toUnit('400'))
				); // Long side is unaffected
				assert.bnEqual(maxOrderSizes.short, toUnit('0'));

				// An additional few units on the long side by another trader
				await modifyMarginSubmitAndConfirmOrder({
					market: futuresMarket,
					account: trader3,
					fillPrice: newPrice,
					marginDelta: toUnit('10000'),
					leverage: toUnit('3'),
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
					it.skip('Orders are blocked if they exceed market size', async () => {
						assert.isTrue(false);
					});

					it.skip('Orders are allowed a touch of extra size to account for price motion', async () => {
						assert.isTrue(false);
					});

					it.skip('Orders collectively slightly above the limit can confirm, but substantially above it cannot be', async () => {
						assert.isTrue(false);
					});

					it.skip('Orders are allowed to reduce in size (or close) even if the result is still over the max', async () => {
						assert.isTrue(false);
					});

					it.skip('Max size constraint is still observed if switching market sides', async () => {
						assert.isTrue(false);
					});
				});
			}
		});

		it('Cannot submit an order if an existing position needs to be liquidated', async () => {
			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('100'),
				marginDelta: toUnit('1000'),
				leverage: toUnit('10'),
			});

			await setPrice(baseAsset, toUnit('50'));
			assert.isTrue(await futuresMarket.canLiquidate(trader));
			await assert.revert(
				futuresMarket.submitOrder(toUnit('5'), { from: trader }),
				'Position can be liquidated'
			);
		});
	});

	describe('Cancelling orders', () => {
		it('can successfully cancel an order', async () => {
			const margin = toUnit('1000');
			await futuresMarket.modifyMargin(margin, { from: trader });
			const preBalance = await sUSD.balanceOf(trader);

			const leverage = toUnit('10');
			const fee = (await futuresMarket.orderFee(trader, margin, leverage))[0];
			await futuresMarket.submitOrder(leverage, { from: trader });

			const tx = await futuresMarket.cancelOrder({ from: trader });

			const id = toBN(1);
			const order = await futuresMarket.orders(trader);
			assert.isFalse(await futuresMarket.orderPending(trader));
			assert.bnEqual(order.id, toUnit(0));
			assert.bnEqual(order.leverage, toUnit(0));
			assert.bnEqual(order.fee, toUnit(0));
			assert.bnEqual(order.roundId, toUnit(0));
			assert.bnEqual(await sUSD.balanceOf(trader), preBalance);

			// And the relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSD.address,
				args: [trader, fee],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'OrderCancelled',
				emittedFrom: proxyFuturesMarket.address,
				args: [id, trader],
				log: decodedLogs[1],
			});
		});

		it('cannot cancel an order if no pending order exists', async () => {
			await assert.revert(futuresMarket.cancelOrder({ from: trader }), 'No pending order');
		});

		it('Can still cancel an order, even if an existing position needs to be liquidated', async () => {
			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('100'),
				marginDelta: toUnit('1000'),
				leverage: toUnit('10'),
			});

			await futuresMarket.submitOrder(toUnit('5'), { from: trader });
			await setPrice(baseAsset, toUnit('50'));
			assert.isTrue(await futuresMarket.canLiquidate(trader));

			assert.isTrue(await futuresMarket.orderPending(trader));
			await futuresMarket.cancelOrder({ from: trader });
			assert.isFalse(await futuresMarket.orderPending(trader));
		});
	});

	describe('Confirming orders', () => {
		it('can confirm a pending order once a new price arrives', async () => {
			const margin = toUnit('1000');
			await futuresMarket.modifyMargin(margin, { from: trader });
			const leverage = toUnit('10');
			const fee = (await futuresMarket.orderFee(trader, margin, leverage))[0];
			await futuresMarket.submitOrder(leverage, { from: trader });

			const price = toUnit('200');
			await setPrice(baseAsset, price);

			const tx = await futuresMarket.confirmOrder(trader);

			const size = toUnit('50');

			const position = await futuresMarket.positions(trader);

			assert.bnEqual(position.margin, margin);
			assert.bnEqual(position.size, size);
			assert.bnEqual(position.lastPrice, price);
			assert.bnEqual(position.fundingIndex, toBN(3)); // margin deposit, submission, and confirmation

			// Skew, size, entry notional sum, pending order value are updated.
			assert.bnEqual(await futuresMarket.marketSkew(), size);
			assert.bnEqual(await futuresMarket.marketSize(), size);
			assert.bnEqual(
				await futuresMarket.entryDebtCorrection(),
				margin.sub(multiplyDecimalRound(size, price))
			);

			// Order values are deleted
			const order = await futuresMarket.orders(trader);
			assert.isFalse(await futuresMarket.orderPending(trader));
			assert.bnEqual(order.leverage, toUnit(0));
			assert.bnEqual(order.fee, toUnit(0));
			assert.bnEqual(order.roundId, toUnit(0));

			// And the relevant events are properly emitted
			const id = toBN(1);
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSD.address,
				args: [await feePool.FEE_ADDRESS(), fee],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'OrderConfirmed',
				emittedFrom: proxyFuturesMarket.address,
				args: [id, trader, margin, size, price, toBN(2)],
				log: decodedLogs[1],
			});
		});

		it('cannot confirm a pending order before a price has arrived', async () => {
			const margin = toUnit('1000');
			await futuresMarket.modifyMargin(margin, { from: trader });
			const leverage = toUnit('10');
			await futuresMarket.submitOrder(leverage, { from: trader });

			await assert.revert(futuresMarket.confirmOrder(trader), 'Awaiting next price');
		});

		it('cannot confirm an order if none is pending', async () => {
			await assert.revert(futuresMarket.confirmOrder(trader), 'No pending order');
		});

		it('Cannot confirm an order if the price is invalid', async () => {
			const margin = toUnit('1000');
			await futuresMarket.modifyMargin(margin, { from: trader });
			const leverage = toUnit('10');
			await futuresMarket.submitOrder(leverage, { from: trader });

			const price = toUnit('200');
			await setPrice(baseAsset, price);

			await fastForward(4 * 7 * 24 * 60 * 60);

			await assert.revert(futuresMarket.confirmOrder(trader), 'Price is invalid');
		});

		it.skip('Can confirm a set of multiple orders on both sides of the market', async () => {
			assert.isTrue(false);
		});
	});

	describe('Closing positions', () => {
		it('can close an open position once a new price arrives', async () => {
			const margin = toUnit('1000');
			await futuresMarket.modifyMargin(margin, { from: trader });
			const leverage = toUnit('10');
			await futuresMarket.submitOrder(leverage, { from: trader });

			await setPrice(baseAsset, toUnit('200'));
			await futuresMarket.confirmOrder(trader);

			await futuresMarket.closePosition({ from: trader });

			await setPrice(baseAsset, toUnit('199'));
			await futuresMarket.confirmOrder(trader);

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

			// Order values are deleted
			const order = await futuresMarket.orders(trader);
			assert.isFalse(await futuresMarket.orderPending(trader));
			assert.bnEqual(order.leverage, toUnit(0));
			assert.bnEqual(order.fee, toUnit(0));
			assert.bnEqual(order.roundId, toUnit(0));
		});

		it('closing positions fails if a new price has not been set.', async () => {
			const margin = toUnit('1000');
			await futuresMarket.modifyMargin(margin, { from: trader });

			const leverage = toUnit('10');
			await futuresMarket.submitOrder(leverage, { from: trader });

			await setPrice(baseAsset, toUnit('200'));

			await futuresMarket.confirmOrder(trader);
			await futuresMarket.closePosition({ from: trader });

			await assert.revert(futuresMarket.confirmOrder(trader), 'Awaiting next price');
		});

		it('closing a position cancels any open orders.', async () => {
			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('100'),
				marginDelta: toUnit('2000'),
				leverage: toUnit('2'),
			});

			await futuresMarket.submitOrder(toUnit('3'), { from: trader });

			assert.isTrue(await futuresMarket.orderPending(trader));
			let order = await futuresMarket.orders(trader);
			assert.bnNotEqual(order.id, toBN(0));
			assert.bnEqual(order.leverage, toUnit('3'));
			assert.bnNotEqual(order.fee, toBN(0));
			assert.bnNotEqual(order.roundId, toBN(0));

			const tx = await futuresMarket.closePosition({ from: trader });
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
			assert.equal(decodedLogs.length, 3);
			decodedEventEqual({
				event: 'OrderCancelled',
				emittedFrom: proxyFuturesMarket.address,
				args: [order.id, trader],
				log: decodedLogs[1],
			});
			decodedEventEqual({
				event: 'OrderSubmitted',
				emittedFrom: proxyFuturesMarket.address,
				args: [order.id.add(toBN(1)), trader, toBN(0), toBN(0), order.roundId],
				log: decodedLogs[2],
			});

			assert.isTrue(await futuresMarket.orderPending(trader));
			order = await futuresMarket.orders(trader);
			assert.bnNotEqual(order.id, toBN(0));
			assert.bnEqual(order.leverage, toBN(0));
			assert.bnEqual(order.fee, toBN(0));
			assert.bnNotEqual(order.roundId, toBN(0));
		});
	});

	describe('Profit & Loss, margin, leverage', () => {
		describe('PnL', () => {
			beforeEach(async () => {
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				await futuresMarket.submitOrder(toUnit('5'), { from: trader });
				await futuresMarket.modifyMargin(toUnit('4000'), { from: trader2 });
				await futuresMarket.submitOrder(toUnit('-1'), { from: trader2 });

				await setPrice(baseAsset, toUnit('100'));

				await futuresMarket.confirmOrder(trader);
				await futuresMarket.confirmOrder(trader2);
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
			beforeEach(async () => {
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				await futuresMarket.submitOrder(toUnit('5'), { from: trader });
				await futuresMarket.modifyMargin(toUnit('5000'), { from: trader2 });
				await futuresMarket.submitOrder(toUnit('-1'), { from: trader2 });

				await setPrice(baseAsset, toUnit('100'));

				await futuresMarket.confirmOrder(trader);
				await futuresMarket.confirmOrder(trader2);
			});

			it('Remaining margin unchanged with no funding or profit', async () => {
				await fastForward(24 * 60 * 60);
				// Note that the first guy paid a bit of funding as there was a delay between confirming
				// the first and second orders
				assert.bnClose(
					(await futuresMarket.remainingMargin(trader))[0],
					toUnit('1000'),
					toUnit('0.01')
				);
				assert.bnEqual((await futuresMarket.remainingMargin(trader2))[0], toUnit('5000'));
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

				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				await futuresMarket.submitOrder(toUnit('5'), { from: trader });
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader2 });
				await futuresMarket.submitOrder(toUnit('-10'), { from: trader2 });

				await setPrice(baseAsset, price);

				await futuresMarket.confirmOrder(trader);
				await futuresMarket.confirmOrder(trader2);

				// With no price motion and no funding rate, leverage should be unchanged.
				assert.bnClose((await futuresMarket.currentLeverage(trader))[0], toUnit(5), toUnit(0.001));
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader2))[0],
					toUnit(-10),
					toUnit(0.001)
				);

				price = toUnit(105);
				await setPrice(baseAsset, price);

				// Price moves to 105:
				// long notional value 5000 -> 5250; long remaining margin 1000 -> 1250; leverage 5 -> 4.2
				// short notional value -10000 -> 10500; short remaining margin -1000 -> -500; leverage 10 -> 21;
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader))[0],
					toUnit(4.2),
					toUnit(0.001)
				);
				assert.bnClose(
					(await futuresMarket.currentLeverage(trader2))[0],
					toUnit(-21),
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
			for (const leverageTrader of [
				['10', trader],
				['-10', trader2],
			]) {
				await modifyMarginSubmitAndConfirmOrder({
					market: futuresMarket,
					account: leverageTrader[1],
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					leverage: toUnit(leverageTrader[0]),
				});
			}
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));
		});

		it('A balanced market (with differing leverage) induces zero funding rate', async () => {
			for (const marginLeverageTrader of [
				['1000', '5', trader],
				['2000', '-2.5', trader2],
			]) {
				await modifyMarginSubmitAndConfirmOrder({
					market: futuresMarket,
					account: marginLeverageTrader[2],
					fillPrice: toUnit('100'),
					marginDelta: toUnit(marginLeverageTrader[0]),
					leverage: toUnit(marginLeverageTrader[1]),
				});
			}
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));
		});

		it('Various skew rates', async () => {
			// Market is balanced
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));

			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				leverage: toUnit('3'),
			});

			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader2,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				leverage: toUnit('-3'),
			});

			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));

			// Market is 50% skewed
			await submitAndConfirmOrder({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('250'),
				leverage: toUnit('9'),
			});

			assert.bnClose(await futuresMarket.currentFundingRate(), toUnit('-0.05'), toUnit('0.01'));

			await submitAndConfirmOrder({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('250'),
				leverage: toUnit('1'),
			});

			assert.bnClose(await futuresMarket.currentFundingRate(), toUnit('0.05'), toUnit('0.01'));

			// Market is 100% skewed
			await submitAndConfirmOrder({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('250'),
				leverage: toUnit('0'),
			});

			assert.bnClose(await futuresMarket.currentFundingRate(), toUnit('0.1'), toUnit('0.01'));

			await submitAndConfirmOrder({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('250'),
				leverage: toUnit('1'),
			});

			await submitAndConfirmOrder({
				market: futuresMarket,
				account: trader2,
				fillPrice: toUnit('250'),
				leverage: toUnit('0'),
			});

			assert.bnClose(await futuresMarket.currentFundingRate(), toUnit('-0.1'), toUnit('0.01'));
		});

		it('Altering the max funding has a proportional effect', async () => {
			// 0, +-50%, +-100%
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit(0));

			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				leverage: toUnit('3'),
			});

			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader2,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				leverage: toUnit('-1'),
			});

			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit('-0.05'));

			await futuresMarket.setMaxFundingRate(toUnit('0.2'), { from: owner });
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit('-0.1'));
			await futuresMarket.setMaxFundingRate(toUnit('0'), { from: owner });
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit('0'));
		});

		it('Altering the max funding rate skew has a proportional effect', async () => {
			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				leverage: toUnit('-3'),
			});

			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader2,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				leverage: toUnit('1'),
			});

			await futuresMarket.setMaxFundingRateSkew(toUnit('0.5'), { from: owner });
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit('0.1'));

			await futuresMarket.setMaxFundingRateSkew(toUnit('0.75'), { from: owner });
			assert.bnClose(await futuresMarket.currentFundingRate(), toUnit('0.2').div(toBN(3)));

			await futuresMarket.setMaxFundingRateSkew(toUnit('0.25'), { from: owner });
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit('0.1'));

			await futuresMarket.setMaxFundingRateSkew(toUnit('0'), { from: owner });
			assert.bnEqual(await futuresMarket.currentFundingRate(), toUnit('0.1'));
		});

		for (const leverage of ['1', '-1'].map(toUnit)) {
			const side = parseInt(leverage.toString()) > 0 ? 'long' : 'short';

			describe(`${side}`, () => {
				it('100% skew induces maximum funding rate', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: toUnit('1000'),
						leverage,
					});

					const expected = side === 'long' ? -maxFundingRate : maxFundingRate;

					assert.bnEqual(await futuresMarket.currentFundingRate(), expected);
				});

				it('Different skew rates induce proportional funding levels', async () => {
					await modifyMarginSubmitAndConfirmOrder({
						market: futuresMarket,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: toUnit('1000'),
						leverage,
					});
					await futuresMarket.modifyMargin(toUnit('1000'), { from: trader2 });

					const points = 5;

					for (const maxFRSkew of ['1', '0.5', '0.3'].map(toUnit)) {
						await futuresMarket.setMaxFundingRateSkew(maxFRSkew, { from: owner });
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

						for (const maxFR of ['0.1', '0.2', '0.05'].map(toUnit)) {
							await futuresMarket.setMaxFundingRate(maxFR, { from: owner });

							const lowLev = leverage.mul(k).div(toUnit(1));

							for (let i = points; i >= 0; i--) {
								// now lerp from leverage*k to leverage
								const frac = leverage
									.sub(lowLev)
									.mul(toBN(i))
									.div(toBN(points));
								const oppLev = lowLev.add(frac).neg();

								await submitAndConfirmOrder({
									market: futuresMarket,
									account: trader2,
									fillPrice: toUnit('100'),
									leverage: oppLev,
								});

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

								assert.bnClose(await futuresMarket.currentFundingRate(), expected, toUnit('0.001'));
							}
						}
					}
				});
			});
		}

		describe.skip('Funding sequence', () => {
			it('Funding sequence is recomputed by order submission', async () => {
				assert.isTrue(false);
			});

			it('Funding sequence is recomputed by order confirmation', async () => {
				assert.isTrue(false);
			});

			it('Funding sequence is recomputed by order cancellation', async () => {
				assert.isTrue(false);
			});

			it('Funding sequence is recomputed by position closure', async () => {
				assert.isTrue(false);
			});

			it('Funding sequence is recomputed by liquidation', async () => {
				assert.isTrue(false);
			});

			it('Funding sequence is recomputed by margin modification', async () => {
				assert.isTrue(false);
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

			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('100'),
				marginDelta: toUnit('1000'),
				leverage: toUnit('5'),
			});

			assert.bnEqual(await futuresMarket.entryDebtCorrection(), toUnit('-4000'));
			assert.bnEqual((await futuresMarket.marketDebt())[0], toUnit('1000'));

			await modifyMarginSubmitAndConfirmOrder({
				market: futuresMarket,
				account: trader2,
				fillPrice: toUnit('120'),
				marginDelta: toUnit('600'),
				leverage: toUnit('-7'),
			});

			assert.bnClose(await futuresMarket.entryDebtCorrection(), toUnit('800'), toUnit('0.1'));
			assert.bnClose((await futuresMarket.marketDebt())[0], toUnit('2600'), toUnit('0.1'));

			await closePositionAndWithdrawMargin({
				market: futuresMarket,
				account: trader,
				fillPrice: toUnit('110'),
			});

			assert.bnClose(await futuresMarket.entryDebtCorrection(), toUnit('4800'), toUnit('0.1'));
			assert.bnClose((await futuresMarket.marketDebt())[0], toUnit('950'), toUnit('0.1'));

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

		it.skip('Liquidations accurately update market debt', async () => {
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
	});

	describe('Liquidations', () => {
		describe('Liquidation price', () => {
			it('Liquidation price is accurate with no funding', async () => {
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				await futuresMarket.submitOrder(toUnit('10'), { from: trader });
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader2 });
				await futuresMarket.submitOrder(toUnit('-10'), { from: trader2 });

				await setPrice(baseAsset, toUnit('100'));

				await futuresMarket.confirmOrder(trader);
				await futuresMarket.confirmOrder(trader2);

				let liquidationPrice = await futuresMarket.liquidationPrice(trader, true);
				let liquidationPriceNoFunding = await futuresMarket.liquidationPrice(trader, false);

				assert.bnEqual(liquidationPriceNoFunding.price, toUnit('90.2'));
				assert.bnClose(liquidationPrice.price, toUnit('90.2'), toUnit('0.001'));
				assert.isFalse(liquidationPrice.invalid);
				assert.isFalse(liquidationPriceNoFunding.invalid);

				liquidationPrice = await futuresMarket.liquidationPrice(trader2, true);
				liquidationPriceNoFunding = await futuresMarket.liquidationPrice(trader2, false);

				assert.bnEqual(liquidationPrice.price, liquidationPriceNoFunding.price);
				assert.bnEqual(liquidationPrice.price, toUnit('109.8'));
				assert.isFalse(liquidationPrice.invalid);
				assert.isFalse(liquidationPriceNoFunding.invalid);
			});

			it('Liquidation price is accurate if the liquidation fee changes', async () => {
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				await futuresMarket.submitOrder(toUnit('5'), { from: trader });
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader2 });
				await futuresMarket.submitOrder(toUnit('-5'), { from: trader2 });

				await setPrice(baseAsset, toUnit('250'));

				await futuresMarket.confirmOrder(trader);
				await futuresMarket.confirmOrder(trader2);

				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader, true)).price,
					toUnit(201),
					toUnit('0.001')
				);
				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader2, true)).price,
					toUnit(299),
					toUnit('0.001')
				);

				await systemSettings.setFuturesLiquidationFee(toUnit('100'), { from: owner });

				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader, true)).price,
					toUnit(205),
					toUnit('0.001')
				);
				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader2, true)).price,
					toUnit(295),
					toUnit('0.001')
				);

				await systemSettings.setFuturesLiquidationFee(toUnit('0'), { from: owner });

				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader, true)).price,
					toUnit(200),
					toUnit('0.001')
				);
				assert.bnClose(
					(await futuresMarket.liquidationPrice(trader2, true)).price,
					toUnit(300),
					toUnit('0.001')
				);
			});

			it('Liquidation price is accurate with funding', async () => {
				// Submit orders that induce -0.05 funding rate
				await futuresMarket.modifyMargin(toUnit('1500'), { from: trader });
				await futuresMarket.submitOrder(toUnit('5'), { from: trader });
				await futuresMarket.modifyMargin(toUnit('500'), { from: trader2 });
				await futuresMarket.submitOrder(toUnit('-5'), { from: trader2 });

				await setPrice(baseAsset, toUnit('250'));

				await futuresMarket.confirmOrder(trader); // 30 units
				await futuresMarket.confirmOrder(trader2); // -10 units

				const preLPrice1 = (await futuresMarket.liquidationPrice(trader, true))[0];
				const preLPrice2 = (await futuresMarket.liquidationPrice(trader2, true))[0];

				// One day of funding
				await fastForward(24 * 60 * 60);

				// trader 1 pays 30 * -0.05 = -1.5 base units of funding
				// liquidation price = (20 - 1500 + 30 * 250) / (30 - 1.5) = 211.228...
				let lPrice = await futuresMarket.liquidationPrice(trader, true);
				assert.bnClose(lPrice[0], toUnit(211.228), toUnit(0.001));
				lPrice = await futuresMarket.liquidationPrice(trader, false);
				assert.bnClose(lPrice[0], preLPrice1, toUnit(0.001));

				// trader2 receives -10 * -0.05 = 0.5 base units of funding
				// liquidation price = (20 - 500 - 10 * 250) / (-10 + 0.5) = 313.684...
				lPrice = await futuresMarket.liquidationPrice(trader2, true);
				assert.bnClose(lPrice[0], toUnit(313.684), toUnit(0.001));
				lPrice = await futuresMarket.liquidationPrice(trader2, false);
				assert.bnClose(lPrice[0], preLPrice2, toUnit(0.001));
			});

			it('Liquidation price reports invalidity properly', async () => {
				await futuresMarket.modifyMargin(toUnit('1500'), { from: trader });
				await futuresMarket.submitOrder(toUnit('5'), { from: trader });
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader2 });
				await futuresMarket.submitOrder(toUnit('-5'), { from: trader2 });

				await setPrice(baseAsset, toUnit('250'));

				await futuresMarket.confirmOrder(trader); // 30 units
				await futuresMarket.confirmOrder(trader2); // -20 units

				assert.isFalse((await futuresMarket.liquidationPrice(trader, true))[1]);

				await fastForward(60 * 60 * 24 * 7); // Stale the price

				// funding rate = -10/50 * 0.1 = -0.02
				// trader 1 pays 30 * 7 * -0.02 = -4.2 units of funding
				// Remaining margin = (20 - 1500 + 30 * 250) / (30 - 4.2) = 233.333...
				let lPrice = await futuresMarket.liquidationPrice(trader, true);
				assert.bnClose(lPrice[0], toUnit(233.333), toUnit(0.001));
				assert.isTrue(lPrice[1]);

				// trader 2 receives -20 * 7 * -0.02 = 2.8 units of funding
				// Remaining margin = (20 - 1000 - 20 * 250) / (-20 + 2.8) = 347.674...
				lPrice = await futuresMarket.liquidationPrice(trader2, true);
				assert.bnClose(lPrice[0], toUnit(347.674), toUnit(0.001));
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
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				await futuresMarket.submitOrder(toUnit('5'), { from: trader });
				let price = toUnit('250');
				await setPrice(baseAsset, price);

				await futuresMarket.confirmOrder(trader);
				price = (await futuresMarket.liquidationPrice(trader, true)).price;
				await setPrice(baseAsset, price);

				assert.isTrue(await futuresMarket.canLiquidate(trader));
			});

			it('Empty positions cannot be liquidated', async () => {
				assert.isFalse(await futuresMarket.canLiquidate(trader));
			});

			it('No liquidations while prices are invalid', async () => {
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				await futuresMarket.submitOrder(toUnit('5'), { from: trader });

				await setPrice(baseAsset, toUnit('250'));
				await futuresMarket.confirmOrder(trader);
				await setPrice(baseAsset, toUnit('25'));

				assert.isTrue(await futuresMarket.canLiquidate(trader));
				await fastForward(60 * 60 * 24 * 7); // Stale the price
				assert.isFalse(await futuresMarket.canLiquidate(trader));
			});
		});

		describe('liquidatePosition', () => {
			beforeEach(async () => {
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader });
				await futuresMarket.submitOrder(toUnit('10'), { from: trader });
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader2 });
				await futuresMarket.submitOrder(toUnit('5'), { from: trader2 });
				await futuresMarket.modifyMargin(toUnit('1000'), { from: trader3 });
				await futuresMarket.submitOrder(toUnit('-5'), { from: trader3 });

				await setPrice(baseAsset, toUnit('250'));

				await futuresMarket.confirmOrder(trader);
				await futuresMarket.confirmOrder(trader2);
				await futuresMarket.confirmOrder(trader3);
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
				assert.bnClose((await futuresMarket.marketDebt())[0], toUnit('600'), toUnit('0.1'));
				assert.bnClose((await futuresMarket.unrecordedFunding())[0], toUnit('-10'), toUnit('0.01'));

				await futuresMarket.liquidatePosition(trader, { from: noBalance });

				assert.bnEqual(await futuresMarket.marketSize(), size.sub(positionSize.abs()));
				let newSizes = await futuresMarket.marketSizes();
				assert.bnEqual(newSizes[0], sizes[0].sub(positionSize.abs()));
				assert.bnEqual(newSizes[1], sizes[1]);
				assert.bnEqual(await futuresMarket.marketSkew(), skew.sub(positionSize.abs()));
				assert.bnClose((await futuresMarket.marketDebt())[0], toUnit('2000'), toUnit('0.01'));

				// Funding has been recorded by the liquidation.
				assert.bnClose((await futuresMarket.unrecordedFunding())[0], toUnit(0), toUnit('0.01'));

				await futuresMarket.liquidatePosition(trader2, { from: noBalance });

				assert.bnEqual(await futuresMarket.marketSize(), toUnit('20'));
				newSizes = await futuresMarket.marketSizes();
				assert.bnEqual(newSizes[0], toUnit('0'));
				assert.bnEqual(newSizes[1], toUnit('20'));
				assert.bnEqual(await futuresMarket.marketSkew(), toUnit('-20'));
				// Market debt is now just the remaining position, plus the funding they've made.
				assert.bnClose((await futuresMarket.marketDebt())[0], toUnit('2200'), toUnit('0.01'));
			});

			it('Liquidation properly affects the overall market parameters (short case)', async () => {
				await fastForward(24 * 60 * 60); // wait one day to accrue a bit of funding

				const size = await futuresMarket.marketSize();
				const sizes = await futuresMarket.marketSizes();
				const positionSize = (await futuresMarket.positions(trader3)).size;

				await setPrice(baseAsset, toUnit('350'));

				assert.bnClose((await futuresMarket.marketDebt())[0], toUnit('6300'), toUnit('0.1'));
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
				assert.bnClose((await futuresMarket.marketDebt())[0], toUnit('6950'), toUnit('0.1'));

				// Funding has been recorded by the liquidation.
				assert.bnClose((await futuresMarket.unrecordedFunding())[0], toUnit(0), toUnit('0.01'));
			});

			it('Can liquidate a position with less than the liquidation fee margin remaining (long case)', async () => {
				assert.isFalse(await futuresMarket.canLiquidate(trader));
				const price = (await futuresMarket.liquidationPrice(trader, true)).price;
				assert.bnClose(price, toUnit('225.50'), toUnit('0.01'));
				await setPrice(baseAsset, price);

				const positionSize = (await futuresMarket.positions(trader)).size;

				assert.isTrue(await futuresMarket.canLiquidate(trader));

				const tx = await futuresMarket.liquidatePosition(trader, { from: noBalance });

				assert.isFalse(await futuresMarket.canLiquidate(trader));
				const position = await futuresMarket.positions(trader, { from: noBalance });
				assert.bnEqual(position.margin, toUnit(0));
				assert.bnEqual(position.size, toUnit(0));
				assert.bnEqual(position.lastPrice, toUnit(0));
				assert.bnEqual(position.fundingIndex, 0);

				assert.bnEqual(await sUSD.balanceOf(noBalance), liquidationFee);

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });

				assert.equal(decodedLogs.length, 2);
				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [noBalance, liquidationFee],
					log: decodedLogs[0],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: proxyFuturesMarket.address,
					args: [trader, noBalance, positionSize, price],
					log: decodedLogs[1],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Can liquidate a position with less than the liquidation fee margin remaining (short case)', async () => {
				const price = (await futuresMarket.liquidationPrice(trader3, true)).price;
				assert.bnClose(price, toUnit('299'), toUnit('0.01'));

				await setPrice(baseAsset, price.add(toUnit('0.01')));

				const positionSize = (await futuresMarket.positions(trader3)).size;

				const tx = await futuresMarket.liquidatePosition(trader3, { from: noBalance });

				const position = await futuresMarket.positions(trader3, { from: noBalance });
				assert.bnEqual(position.margin, toUnit(0));
				assert.bnEqual(position.size, toUnit(0));
				assert.bnEqual(position.lastPrice, toUnit(0));
				assert.bnEqual(position.fundingIndex, 0);

				assert.bnEqual(await sUSD.balanceOf(noBalance), liquidationFee);

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });

				assert.equal(decodedLogs.length, 2);
				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [noBalance, liquidationFee],
					log: decodedLogs[0],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: proxyFuturesMarket.address,
					args: [trader3, noBalance, positionSize, price],
					log: decodedLogs[1],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Transfers an updated fee upon liquidation', async () => {
				const positionSize = (await futuresMarket.positions(trader)).size;
				// Move the price to a non-liquidating point
				let price = (await futuresMarket.liquidationPrice(trader, true)).price;

				await setPrice(baseAsset, price.add(toUnit('1')));

				assert.isFalse(await futuresMarket.canLiquidate(trader));

				// raise the liquidation fee
				await systemSettings.setFuturesLiquidationFee(toUnit('100'), { from: owner });

				assert.isTrue(await futuresMarket.canLiquidate(trader));
				price = (await futuresMarket.liquidationPrice(trader, true)).price;

				// liquidate the position
				const tx = await futuresMarket.liquidatePosition(trader, { from: noBalance });

				// check that the liquidation price was correct.
				assert.bnClose(price, toUnit(227.5), toUnit(0.1));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: proxyFuturesMarket.address,
					args: [trader, noBalance, positionSize, price],
					log: decodedLogs[1],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Liquidation cancels any outstanding orders', async () => {
				await futuresMarket.submitOrder(toUnit('8'), { from: trader });

				assert.isTrue(await futuresMarket.orderPending(trader));
				const order = await futuresMarket.orders(trader);

				const price = (await futuresMarket.liquidationPrice(trader, true)).price;
				await setPrice(baseAsset, price);

				const tx = await futuresMarket.liquidatePosition(trader, { from: noBalance });

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, futuresMarket] });
				decodedEventEqual({
					event: 'OrderCancelled',
					emittedFrom: proxyFuturesMarket.address,
					args: [order.id, trader],
					log: decodedLogs[0],
					bnCloseVariance: toUnit('0.001'),
				});

				assert.isFalse(await futuresMarket.orderPending(trader));
			});
		});
	});
});
