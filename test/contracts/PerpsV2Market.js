const { artifacts, contract, web3 } = require('hardhat');
const { toBytes32 } = require('../..');
const { toBN } = web3.utils;
const BN = require('bn.js');
const { currentTime, fastForward, toUnit, multiplyDecimal, divideDecimal } = require('../utils')();

const PerpsV2Market = artifacts.require('TestablePerpsV2Market');

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
	onlyGivenAddressCanInvoke,
} = require('./helpers');

const MockExchanger = artifacts.require('MockExchanger');

const Status = {
	Ok: 0,
	InvalidPrice: 1,
	InvalidOrderType: 2,
	PriceOutOfBounds: 3,
	CanLiquidate: 4,
	CannotLiquidate: 5,
	MaxMarketSizeExceeded: 6,
	MaxLeverageExceeded: 7,
	InsufficientMargin: 8,
	NotPermitted: 9,
	NilOrder: 10,
	NoPositionOpen: 11,
	PriceTooVolatile: 12,
};

contract('PerpsV2Market PerpsV2MarketAtomic', accounts => {
	let perpsV2MarketSettings,
		futuresMarketManager,
		perpsV2MarketProxy,
		perpsV2Market,
		perpsV2MarketImpl,
		perpsV2MarketViewsImpl,
		perpsV2MarketDelayedOrderImpl,
		perpsV2MarketOffchainDelayedOrderImpl,
		perpsV2MarketState,
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

	const owner = accounts[1];
	const trader = accounts[2];
	const trader2 = accounts[3];
	const trader3 = accounts[4];
	const noBalance = accounts[5];
	const traderInitialBalance = toUnit(1000000);

	const marketKeySuffix = '-perp';

	const marketKey = toBytes32('sBTC' + marketKeySuffix);
	const baseAsset = toBytes32('sBTC');
	const takerFee = toUnit('0.003');
	const makerFee = toUnit('0.001');
	const takerFeeDelayedOrder = toUnit('0.0005');
	const makerFeeDelayedOrder = toUnit('0.0001');
	const takerFeeOffchainDelayedOrder = toUnit('0.00005');
	const makerFeeOffchainDelayedOrder = toUnit('0.00001');
	const maxLeverage = toUnit('10');
	const maxMarketValue = toUnit('1000');
	const maxFundingVelocity = toUnit('0.1');
	const skewScale = toUnit('100000');
	const initialPrice = toUnit('100');
	const minKeeperFee = toUnit('20');
	const maxKeeperFee = toUnit('1000');
	const minInitialMargin = toUnit('100');
	const minDelayTimeDelta = 60;
	const maxDelayTimeDelta = 120;
	const offchainMinAge = 15;
	const offchainMaxAge = 60;
	const priceImpactDelta = toUnit('0.5'); // 500bps (high bps to avoid affecting unrelated tests)
	const orderType = 0; // 0-Atomic, 1-Delayed, 2-Offchain

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
		const tx = await market.modifyPosition(sizeDelta, priceImpactDelta, { from: account });
		return tx;
	}

	async function closePositionAndWithdrawMargin({ market, account, fillPrice }) {
		await setPrice(await market.baseAsset(), fillPrice);
		await market.closePosition(priceImpactDelta, { from: account });
		await market.withdrawAllMargin({ from: account });
	}

	before(async () => {
		({
			PerpsV2MarketSettings: perpsV2MarketSettings,
			FuturesMarketManager: futuresMarketManager,
			PerpsV2MarketStateBTC: perpsV2MarketState,
			PerpsV2MarketBTC: perpsV2MarketImpl,
			PerpsV2MarketViewsBTC: perpsV2MarketViewsImpl,
			PerpsV2DelayedOrderBTC: perpsV2MarketDelayedOrderImpl,
			PerpsV2OffchainOrderBTC: perpsV2MarketOffchainDelayedOrderImpl,
			ProxyPerpsV2MarketBTC: perpsV2MarketProxy,
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
			synths: ['sUSD', 'sBTC', 'sETH'],
			contracts: [
				'FuturesMarketManager',
				{ contract: 'PerpsV2MarketStateBTC', properties: { perpSuffix: marketKeySuffix } },
				'PerpsV2MarketViewsBTC',
				'PerpsV2MarketBTC',
				'PerpsV2MarketSettings',
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
		await perpsV2MarketSettings.setMinInitialMargin(minInitialMargin, { from: owner });

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

		// use implementation ABI on the proxy address to simplify calling
		perpsV2Market = await PerpsV2Market.at(perpsV2MarketProxy.address);
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('Basic parameters', () => {
		it('Only expected functions are mutative PerpsV2MarketDelayedOrders', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: perpsV2MarketDelayedOrderImpl.abi,
				ignoreParents: ['MixinPerpsV2MarketSettings', 'Owned', 'Proxyable'],
				expected: [
					'cancelDelayedOrder',
					'executeDelayedOrder',
					'submitDelayedOrder',
					'submitDelayedOrderWithTracking',
				],
			});
		});

		it('Only expected functions are mutative PerpsV2MarketDelayedOrdersOffchain', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: perpsV2MarketOffchainDelayedOrderImpl.abi,
				ignoreParents: ['MixinPerpsV2MarketSettings', 'Owned', 'Proxyable'],
				expected: [
					'cancelOffchainDelayedOrder',
					'executeOffchainDelayedOrder',
					'submitOffchainDelayedOrder',
					'submitOffchainDelayedOrderWithTracking',
				],
			});
		});

		it('Only expected functions are mutative PerpsV2MarketViews', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: perpsV2MarketViewsImpl.abi,
				ignoreParents: ['MixinPerpsV2MarketSettings', 'Owned'],
				expected: [],
			});
		});

		it('Only expected functions are mutative PerpsV2MarketState', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: perpsV2MarketState.abi,
				ignoreParents: ['Owned', 'StateShared'],
				expected: [
					'setBaseAsset',
					'setMarketKey',
					'setMarketSize',
					'setMarketSkew',
					'setEntryDebtCorrection',
					'setNextPositionId',
					'setFundingLastRecomputed',
					'setFundingRateLastRecomputed',
					'pushFundingSequence',
					'updateDelayedOrder',
					'updatePosition',
					'deleteDelayedOrder',
					'deletePosition',
				],
			});
		});

		it('static parameters are set properly at construction', async () => {
			assert.equal(await perpsV2Market.baseAsset(), baseAsset);
			assert.equal(await perpsV2Market.marketKey(), marketKey);
			assert.equal(await perpsV2Market.marketState(), perpsV2MarketState.address);
			const parameters = await perpsV2MarketSettings.parameters(marketKey);
			assert.bnEqual(parameters.takerFee, takerFee);
			assert.bnEqual(parameters.makerFee, makerFee);
			assert.bnEqual(parameters.takerFeeDelayedOrder, takerFeeDelayedOrder);
			assert.bnEqual(parameters.makerFeeDelayedOrder, makerFeeDelayedOrder);
			assert.bnEqual(parameters.takerFeeOffchainDelayedOrder, takerFeeOffchainDelayedOrder);
			assert.bnEqual(parameters.makerFeeOffchainDelayedOrder, makerFeeOffchainDelayedOrder);
			assert.bnEqual(parameters.maxLeverage, maxLeverage);
			assert.bnEqual(parameters.maxMarketValue, maxMarketValue);
			assert.bnEqual(parameters.maxFundingVelocity, maxFundingVelocity);
			assert.bnEqual(parameters.skewScale, skewScale);
			assert.bnEqual(parameters.minDelayTimeDelta, minDelayTimeDelta);
			assert.bnEqual(parameters.maxDelayTimeDelta, maxDelayTimeDelta);
			assert.bnEqual(parameters.offchainDelayedOrderMinAge, offchainMinAge);
			assert.bnEqual(parameters.offchainDelayedOrderMaxAge, offchainMaxAge);
		});

		it('prices are properly fetched', async () => {
			const price = toUnit(200);
			await setPrice(baseAsset, price);
			const result = await perpsV2Market.assetPrice();

			assert.bnEqual(result.price, price);
			assert.isFalse(result.invalid);
		});

		it('market size and skew', async () => {
			const minScale = (await perpsV2MarketSettings.parameters(marketKey)).skewScale;
			const price = 100;
			let sizes = await perpsV2Market.marketSizes();

			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(await perpsV2Market.marketSize(), toUnit('0'));
			assert.bnEqual(await perpsV2Market.marketSkew(), toUnit('0'));
			assert.bnEqual(await perpsV2Market.proportionalSkew(), toUnit('0'));

			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice: toUnit(price),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});

			sizes = await perpsV2Market.marketSizes();
			let marketSkew = await perpsV2Market.marketSkew();

			assert.bnEqual(sizes[0], toUnit('50'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(await perpsV2Market.marketSize(), toUnit('50'));
			assert.bnEqual(await perpsV2Market.marketSkew(), toUnit('50'));
			assert.bnEqual(await perpsV2Market.proportionalSkew(), divideDecimal(marketSkew, minScale));

			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader2,
				fillPrice: toUnit(price * 1.2),
				marginDelta: toUnit('600'),
				sizeDelta: toUnit('-35'),
			});

			sizes = await perpsV2Market.marketSizes();
			marketSkew = await perpsV2Market.marketSkew();
			assert.bnEqual(sizes[0], toUnit('50'));
			assert.bnEqual(sizes[1], toUnit('35'));
			assert.bnEqual(await perpsV2Market.marketSize(), toUnit('85'));
			assert.bnEqual(await perpsV2Market.marketSkew(), toUnit('15'));
			assert.bnClose(await perpsV2Market.proportionalSkew(), divideDecimal(marketSkew, minScale));

			await closePositionAndWithdrawMargin({
				market: perpsV2Market,
				account: trader,
				fillPrice: toUnit(price * 1.1),
			});

			sizes = await perpsV2Market.marketSizes();
			marketSkew = await perpsV2Market.marketSkew();
			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('35'));
			assert.bnEqual(await perpsV2Market.marketSize(), toUnit('35'));
			assert.bnEqual(await perpsV2Market.marketSkew(), toUnit('-35'));
			assert.bnClose(await perpsV2Market.proportionalSkew(), divideDecimal(marketSkew, minScale));

			await closePositionAndWithdrawMargin({
				market: perpsV2Market,
				account: trader2,
				fillPrice: toUnit(price),
			});

			sizes = await perpsV2Market.marketSizes();
			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(await perpsV2Market.marketSize(), toUnit('0'));
			assert.bnEqual(await perpsV2Market.marketSkew(), toUnit('0'));
			assert.bnEqual(await perpsV2Market.proportionalSkew(), toUnit('0'));
		});
	});

	describe('Market Subcontracts access', () => {
		describe('PerpsV2Market', () => {
			it('Only settings() functions only work for settings contract', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketImpl.recomputeFunding,
					args: [],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Not permitted by this address',
					skipPassCheck: true,
				});
			});

			it('Only proxy functions only work for proxy', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketImpl.transferMargin,
					args: [1],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketImpl.withdrawAllMargin,
					args: [],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketImpl.modifyPosition,
					args: [1, priceImpactDelta],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketImpl.modifyPositionWithTracking,
					args: [1, priceImpactDelta, toBytes32('code')],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketImpl.closePosition,
					args: [priceImpactDelta],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketImpl.closePositionWithTracking,
					args: [priceImpactDelta, toBytes32('code')],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketImpl.liquidatePosition,
					args: [noBalance],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});
			});
		});

		describe('PerpsV2MarketDelayedOrders', () => {
			it('Only proxy functions only work for proxy', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketDelayedOrderImpl.submitDelayedOrder,
					args: [1, priceImpactDelta, 60],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketDelayedOrderImpl.submitDelayedOrderWithTracking,
					args: [1, priceImpactDelta, 60, toBytes32('code')],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketDelayedOrderImpl.cancelDelayedOrder,
					args: [noBalance],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketDelayedOrderImpl.executeDelayedOrder,
					args: [noBalance],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});
			});
		});

		describe('PerpsV2MarketDelayedOrdersOffchain', () => {
			it('Only proxy functions only work for proxy', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketOffchainDelayedOrderImpl.submitOffchainDelayedOrder,
					args: [1, priceImpactDelta],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketOffchainDelayedOrderImpl.submitOffchainDelayedOrderWithTracking,
					args: [1, priceImpactDelta, toBytes32('code')],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketOffchainDelayedOrderImpl.cancelOffchainDelayedOrder,
					args: [noBalance],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketOffchainDelayedOrderImpl.executeOffchainDelayedOrder,
					args: [noBalance, [toBytes32('code')]],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only the proxy can call',
					skipPassCheck: true,
				});
			});
		});

		describe('PerpsV2MarketState', () => {
			it('Only associate functions only work for associate contracts - PerpsV2MarketState', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketState.setMarketKey,
					args: [toBytes32('marketKey')],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only an associated contract can perform this action',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketState.setBaseAsset,
					args: [toBytes32('marketKey')],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only an associated contract can perform this action',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketState.setMarketSize,
					args: [1],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only an associated contract can perform this action',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketState.setEntryDebtCorrection,
					args: [1],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only an associated contract can perform this action',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketState.setNextPositionId,
					args: [1],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only an associated contract can perform this action',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketState.setMarketSkew,
					args: [1],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only an associated contract can perform this action',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketState.setFundingLastRecomputed,
					args: [1],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only an associated contract can perform this action',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketState.pushFundingSequence,
					args: [1],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only an associated contract can perform this action',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketState.updatePosition,
					args: [noBalance, 1, 1, 1, 1, 1],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only an associated contract can perform this action',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketState.updateDelayedOrder,
					args: [noBalance, false, 1, 1, 1, 1, 1, 1, 1, toBytes32('code')],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only an associated contract can perform this action',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketState.deletePosition,
					args: [noBalance],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only an associated contract can perform this action',
					skipPassCheck: true,
				});

				await onlyGivenAddressCanInvoke({
					fnc: perpsV2MarketState.deleteDelayedOrder,
					args: [noBalance],
					accounts: [owner, trader, trader2, trader3],
					reason: 'Only an associated contract can perform this action',
					skipPassCheck: true,
				});
			});
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
					const price = toUnit('100');

					const t2size = toUnit('70');
					const t2Margin = margin.mul(toBN(2));
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader2,
						fillPrice: price,
						marginDelta: t2Margin,
						sizeDelta: t2size,
					});

					const t1size = toUnit('-35');
					const t1Margin = margin;
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader,
						fillPrice: price,
						marginDelta: t1Margin,
						sizeDelta: t1size,
					});

					// size = 105
					// skew = 35 (long)

					const fee = toUnit('14');
					await perpsV2Market.transferMargin(t1Margin.mul(toBN(2)), { from: trader });
					assert.bnEqual((await perpsV2Market.orderFee(t1size.mul(toBN(2)), orderType)).fee, fee);

					const currentMargin = toBN((await perpsV2Market.positions(trader)).margin);

					// trader1 adds more margin.
					const tx = await perpsV2Market.modifyPosition(t1size.mul(toBN(2)), priceImpactDelta, {
						from: trader,
					});

					// Fee is properly recorded and deducted.
					const decodedLogs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [perpsV2Market],
					});

					const expectedMargin = currentMargin.sub(fee);

					decodedEventEqual({
						event: 'PositionModified',
						emittedFrom: perpsV2Market.address,
						args: [
							toBN('1'),
							trader,
							expectedMargin,
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
					const price = toUnit('100');
					await setPrice(baseAsset, price);

					await perpsV2Market.transferMargin(margin, { from: trader });
					const notional = multiplyDecimal(margin, leverage.abs());
					const size = divideDecimal(notional, price);
					const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size, 0))[0];

					// notional = margin * leverage
					// size     = notional / price
					//
					// expectedFee = size * price * tradingFee (maker/taker) + baseFee
					//             = 35 * 100.0175 * takerFee + baseFee
					//             = 35 * 100.0175 * 0.003 + 0
					//             = 10.5018375
					//             = ~10.5
					//
					// note: baseFee is the dynamicFee (which is disabled).
					const expectedFee = multiplyDecimal(multiplyDecimal(size, fillPrice), takerFee);
					assert.bnEqual((await perpsV2Market.orderFee(size, orderType))[0], expectedFee);
				});

				it('Submit a fresh order on the same side as the skew', async () => {
					const price = toUnit('100');
					await setPrice(baseAsset, price);

					const size = multiplyDecimal(leverage, margin).div(price);
					const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size, 0))[0];

					// skew pushed to one direction. there's size that already exists.
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader2,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta: size,
					});

					await perpsV2Market.transferMargin(margin, { from: trader });
					const expectedFee = multiplyDecimal(multiplyDecimal(size, fillPrice), takerFee).abs();

					assert.bnEqual((await perpsV2Market.orderFee(size, orderType))[0], expectedFee);
				});

				it(`Submit a fresh order on the opposite side to the skew smaller than the skew`, async () => {
					const price = toUnit('100');
					await setPrice(baseAsset, price);

					// note: invert the leverage because we want to go in the opposite direction.
					//
					// we don't particularly care about the internals for this size's trade. it's the next we care.
					const size = divideDecimal(multiplyDecimal(leverage.neg(), margin), price);

					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader2,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta: size,
					});

					// next trade to have half the size but in the opposite direction (no .neg() on leverage).
					const margin2 = margin.div(toBN(2));
					const size2 = divideDecimal(multiplyDecimal(margin2, leverage), price);
					const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size2, 0))[0];

					// expectedFee = size * price * tradingFee (maker/taker) + baseFee
					//
					// note: we use makerFee because the skew is contracted in this next trade with `size2`.
					const expectedFee = multiplyDecimal(multiplyDecimal(size2, fillPrice), makerFee).abs();
					await perpsV2Market.transferMargin(margin2, { from: trader });

					assert.bnEqual((await perpsV2Market.orderFee(size2, orderType))[0], expectedFee);
				});

				it('Submit a fresh order on the opposite side to the skew larger than the skew', async () => {
					const price = toUnit('100');
					await setPrice(baseAsset, price);

					// first position pushes the skew to one side (depending on if leverage is neg or pos).
					//
					// - leverage is either 3.5 or -3.5
					// - margin is 1000
					//
					// size = ((leverage * -1) * (margin / 2)) / 100
					//
					//      = (3.5 * -1 * (1000 / 2)) / 100
					//      = -17.5
					//
					//      = (-3.5 * -1 * (1000 / 2)) / 100
					//      = 17.5
					const margin1 = divideDecimal(margin, toUnit('2'));
					const size1 = divideDecimal(multiplyDecimal(margin1, leverage.neg()), price);

					// note: we don't care about this trade. it's just here to push the skew in the opposite direction
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader2,
						fillPrice: price,
						marginDelta: margin1,
						sizeDelta: size1,
					});

					// note: the lack of `margin.div(2)`, we're pushing this to 0 and then another 0.5 size further. also
					// see that there's no `.neg` on leverage so we're going in the opposite direction.

					const size2 = divideDecimal(multiplyDecimal(margin, leverage), price);
					await perpsV2Market.transferMargin(margin, { from: trader });

					// if the next `size` pushes the skew into the opposite direction:
					//
					// notional = margin * leverage
					//          = 1000 * 3.5
					//          = 3500
					//          = (or neg) 1000 * -3.5
					//          = -3500
					//
					// sizeDelta = notional / 100
					//           = 3500 / 100
					//           = 35
					//           = (or neg) -3500 / 100
					//           = -35
					//
					// given the skew above at -17.5 or 17.5, a 35 or -35 sizeDelta will push the skew in the opposite
					// direction.
					//
					// (+/-)17.5 -> 0 will be charged at a makerFee
					// 0 -> (+/-)17.5 will be charged with takerFee
					//
					// - maker fee is 0.003
					// - taker fee is 0.001
					// - price is 100 sUSD
					//
					// fee = 17.5 * fillPrice * 0.001 + 17.5 * fillPrice * 0.003
					//     = 1.75 + 5.25
					//     = 7
					//
					// note: price is actually fillPrice (however in the case fillPrice = price = 100)
					const expectedFee = toUnit('7');
					assert.bnEqual((await perpsV2Market.orderFee(size2, orderType))[0], expectedFee);
				});

				it('Increase an existing position on the side of the skew', async () => {
					const price = toUnit('100');
					await setPrice(baseAsset, price);

					const size = multiplyDecimal(leverage, margin).div(price);
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta: size,
					});

					const margin2 = divideDecimal(margin, toUnit('2'));
					const size2 = multiplyDecimal(margin2, leverage).div(price);
					const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size2, 0))[0];

					// skew is growing. charge the takerFee.
					const expectedFee = multiplyDecimal(multiplyDecimal(size2, fillPrice), takerFee).abs();

					assert.bnEqual((await perpsV2Market.orderFee(size2, orderType))[0], expectedFee);
				});

				it('Increase an existing position opposite to the skew smaller than the skew', async () => {
					const price = toUnit('100');
					await setPrice(baseAsset, price);

					// assuming leverage is 3.5 (long)
					//
					// margin = 1000 / 2 = 500
					// size = 500 * 3.5 / 100 = 17.5
					const margin1 = multiplyDecimal(margin, toUnit('2'));
					const size1 = multiplyDecimal(margin1, leverage).div(price);
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader2,
						fillPrice: price,
						marginDelta: margin1,
						sizeDelta: size1,
					});

					// note: the .neg on leverage and the lack of .mul(2) on margin
					//
					// this is a different trader going in the opposite direction.
					//
					// size = -3.5 * 1000 / 100 = -35
					//
					// skew after this trade is -17.5
					const size2 = multiplyDecimal(leverage.neg(), margin).div(price);
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta: size2,
					});

					// size = -3.5 * 1000 / 200 = 17.5
					//
					// this size pushes the skew back to 0. the size trade is only charged the makerFee.
					const size3 = multiplyDecimal(leverage.neg(), margin).div(toUnit('200'));
					const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size3, 0))[0];
					const expectedFee = multiplyDecimal(multiplyDecimal(size3, fillPrice), makerFee).abs();

					assert.bnEqual((await perpsV2Market.orderFee(size3, orderType))[0], expectedFee);
				});

				it('Increase an existing position opposite to the skew larger than the skew', async () => {
					// push the skew to one side (taker fee)
					//
					// sizeDelta = (leverage * (margin * 2)) / 100
					//           = (3.5 * (1000 * 2)) / 100
					//           = (3.5 * 2000) / 100
					//           = 7000 / 100
					//           = 70
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader2,
						fillPrice: toUnit('100'),
						marginDelta: margin.mul(toBN(2)),
						sizeDelta: multiplyDecimal(leverage, margin.mul(toBN(2))).div(toBN(100)),
					});

					// push the skew to the other side (maker then taker fee)
					//
					// sizeDelta = (-leverage * margin) / 100
					//           = (-3.5 * 1000) / 100
					//           = -3500 / 100
					//           = -35
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: margin,
						sizeDelta: multiplyDecimal(leverage.neg(), margin).div(toBN(100)),
					});

					// sizeDelta = (-leverage * (margin * 2)) / 100
					//           = -3.5 * 2000 / 100
					//           = -7000 / 100
					//           = -70
					//
					// marketSkew at this stage is 35, -70 will incur 35 in makerFee and 35 in takerFee
					//
					// makerFee = 0.001, takerFee = 0.003, price = 100
					//
					// fee = 35 * makerFee * price + 35 * takerFee * price
					//     = 35 * 0.001 * 100 + 35 * 0.003 * 100
					//     = 3.5 + 10.5
					//     = 14
					const fee = toUnit('14');
					assert.bnEqual(
						(
							await perpsV2Market.orderFee(
								multiplyDecimal(leverage.neg(), margin.mul(toBN(2))).div(toBN(100)),
								orderType
							)
						)[0],
						fee
					);
				});

				it('Reduce an existing position on the side of the skew', async () => {
					const price = toUnit(100);
					const sizeDelta = multiplyDecimal(leverage, margin).div(price);
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta,
					});

					const adjustSize = sizeDelta.div(toBN(2)).neg();
					const expectedFee = multiplyDecimal(multiplyDecimal(adjustSize.abs(), price), makerFee);

					assert.bnEqual((await perpsV2Market.orderFee(adjustSize, orderType)).fee, expectedFee);
				});

				it('Reduce an existing position opposite to the skew', async () => {
					const price = toUnit('100');
					await setPrice(baseAsset, price);

					const margin1 = multiplyDecimal(margin, toUnit('2'));
					const size1 = multiplyDecimal(leverage, margin1).div(price);
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader2,
						fillPrice: price,
						marginDelta: margin1,
						sizeDelta: size1,
					});

					const size2 = multiplyDecimal(leverage.neg(), margin).div(price);
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta: size2,
					});

					const size3 = divideDecimal(size2.neg(), toUnit('2'));
					const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size3, 0))[0];
					const fee = multiplyDecimal(multiplyDecimal(size3, fillPrice), takerFee).abs();
					assert.bnEqual((await perpsV2Market.orderFee(size3, orderType)).fee, fee);
				});

				it('Close an existing position on the side of the skew', async () => {
					const price = toUnit('100');
					await setPrice(baseAsset, price);

					const size1 = divideDecimal(multiplyDecimal(leverage, margin), price);
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta: size1,
					});

					const size2 = size1.neg();
					const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size2, 0))[0];
					const fee = multiplyDecimal(multiplyDecimal(size2, fillPrice), makerFee).abs();
					assert.bnEqual((await perpsV2Market.orderFee(size2, orderType)).fee, fee);
				});

				it('Close an existing position opposite to the skew', async () => {
					const price = toUnit('100');
					await setPrice(baseAsset, price);

					const margin1 = multiplyDecimal(margin, toUnit('2'));
					const size1 = multiplyDecimal(leverage, margin1).div(price);

					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader2,
						fillPrice: price,
						marginDelta: margin1,
						sizeDelta: size1,
					});

					const size2 = multiplyDecimal(leverage.neg(), margin).div(price);
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta: size2,
					});

					const size3 = size2.neg();
					const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size3, 0))[0];
					const fee = multiplyDecimal(multiplyDecimal(size3, fillPrice), takerFee).abs();
					assert.bnEqual((await perpsV2Market.orderFee(size3, orderType)).fee, fee);
				});

				it('Updated order, opposite and smaller than the skew, on opposite side of an existing position', async () => {
					const price = toUnit('100');
					await setPrice(baseAsset, price);

					const margin1 = multiplyDecimal(margin, toUnit('2'));
					const size1 = toUnit('70').mul(sideVar);
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader2,
						fillPrice: price,
						marginDelta: margin1,
						sizeDelta: size1,
					});

					const size2 = multiplyDecimal(toUnit('-35'), sideVar);
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader,
						fillPrice: price,
						marginDelta: margin,
						sizeDelta: size2,
					});

					const size3 = multiplyDecimal(toUnit('-17.5'), sideVar);
					const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size3, 0))[0];

					// makerFee because we're in the opposite direction (hence reducing skew).
					const fee = multiplyDecimal(multiplyDecimal(size3, fillPrice), makerFee).abs();
					assert.bnEqual((await perpsV2Market.orderFee(size3, orderType))[0], fee);
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
					perpsV2Market.transferMargin(preBalance.add(toUnit('1')), { from: trader }),
					'subtraction overflow'
				);
			});

			it(`Can't withdraw more sUSD than is in the margin`, async () => {
				await perpsV2Market.transferMargin(toUnit('100'), { from: trader });
				await assert.revert(
					perpsV2Market.transferMargin(toUnit('-101'), { from: trader }),
					'Insufficient margin'
				);
			});

			it('Positive delta -> burn sUSD', async () => {
				const preBalance = await sUSD.balanceOf(trader);
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(toUnit('1000')));
			});

			it('Negative delta -> mint sUSD', async () => {
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				const preBalance = await sUSD.balanceOf(trader);
				await perpsV2Market.transferMargin(toUnit('-500'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.add(toUnit('500')));
			});

			it('Zero delta -> NOP', async () => {
				const preBalance = await sUSD.balanceOf(trader);
				await perpsV2Market.transferMargin(toUnit('0'), { from: trader });
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
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });

				// Now set a reclamation event
				await mockExchanger.setReclaim(toUnit('10'));
				await mockExchanger.setNumEntries('1');

				// Issuance works fine
				await perpsV2Market.transferMargin(toUnit('-900'), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(toUnit('100')));
				assert.bnEqual((await perpsV2Market.remainingMargin(trader))[0], toUnit('100'));

				// But burning properly deducts the reclamation amount
				await perpsV2Market.transferMargin(preBalance.sub(toUnit('100')), { from: trader });
				assert.bnEqual(await sUSD.balanceOf(owner), toUnit('0'));
				assert.bnEqual(
					(await perpsV2Market.remainingMargin(trader))[0],
					preBalance.sub(toUnit('10'))
				);
			});

			it('events are emitted properly upon margin transfers', async () => {
				// Deposit some balance
				let tx = await perpsV2Market.transferMargin(toUnit('1000'), { from: trader3 });
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, perpsV2Market],
				});

				decodedEventEqual({
					event: 'Burned',
					emittedFrom: sUSD.address,
					args: [trader3, toUnit('1000')],
					log: decodedLogs[1],
				});

				decodedEventEqual({
					event: 'MarginTransferred',
					emittedFrom: perpsV2Market.address,
					args: [trader3, toUnit('1000')],
					log: decodedLogs[2],
				});

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsV2Market.address,
					args: [
						toBN('1'),
						trader3,
						toUnit('1000'),
						toBN('0'),
						toBN('0'),
						(await perpsV2Market.assetPrice()).price,
						await perpsV2Market.fundingSequenceLength(),
						toBN('0'),
					],
					log: decodedLogs[3],
				});

				// Zero delta means no PositionModified, MarginTransferred, or sUSD events
				tx = await perpsV2Market.transferMargin(toUnit('0'), { from: trader3 });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, perpsV2Market],
				});
				assert.deepEqual(
					decodedLogs.map(({ name }) => name),
					['FundingRecomputed']
				);
				assert.equal(decodedLogs.length, 1);
				assert.equal(decodedLogs[0].name, 'FundingRecomputed');

				// Now withdraw the margin back out
				tx = await perpsV2Market.transferMargin(toUnit('-1000'), { from: trader3 });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, perpsV2Market],
				});

				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [trader3, toUnit('1000')],
					log: decodedLogs[1],
				});

				decodedEventEqual({
					event: 'MarginTransferred',
					emittedFrom: perpsV2Market.address,
					args: [trader3, toUnit('-1000')],
					log: decodedLogs[2],
				});

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsV2Market.address,
					args: [
						toBN('1'),
						trader3,
						toUnit('0'),
						toBN('0'),
						toBN('0'),
						(await perpsV2Market.assetPrice()).price,
						await perpsV2Market.fundingSequenceLength(),
						toBN('0'),
					],
					log: decodedLogs[3],
				});
			});
		});

		it('Reverts if the price is invalid', async () => {
			await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
			await fastForward(7 * 24 * 60 * 60);
			await assert.revert(
				perpsV2Market.transferMargin(toUnit('-1000'), { from: trader }),
				'Invalid price'
			);
		});

		it('Reverts if the system is suspended', async () => {
			await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });

			// suspend
			await systemStatus.suspendSystem('3', { from: owner });
			// should revert
			await assert.revert(
				perpsV2Market.transferMargin(toUnit('-1000'), { from: trader }),
				'Synthetix is suspended'
			);

			// resume
			await systemStatus.resumeSystem({ from: owner });
			// should work now
			await perpsV2Market.transferMargin(toUnit('-1000'), { from: trader });
			assert.bnClose((await perpsV2Market.accessibleMargin(trader))[0], toBN('0'), toUnit('0.1'));
		});

		it('Reverts if the synth is suspended', async () => {
			await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });

			// suspend
			await systemStatus.suspendSynth(baseAsset, 65, { from: owner });
			// should revert
			await assert.revert(
				perpsV2Market.transferMargin(toUnit('-1000'), { from: trader }),
				'Synth is suspended'
			);

			// resume
			await systemStatus.resumeSynth(baseAsset, { from: owner });
			// should work now
			await perpsV2Market.transferMargin(toUnit('-1000'), { from: trader });
			assert.bnClose((await perpsV2Market.accessibleMargin(trader))[0], toBN('0'), toUnit('0.1'));
		});

		describe('No position', () => {
			it('New margin', async () => {
				assert.bnEqual((await perpsV2Market.positions(trader)).margin, toBN(0));
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual((await perpsV2Market.positions(trader)).margin, toUnit('1000'));
			});

			it('Increase margin', async () => {
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual((await perpsV2Market.positions(trader)).margin, toUnit('2000'));
			});

			it('Decrease margin', async () => {
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.transferMargin(toUnit('-500'), { from: trader });
				assert.bnEqual((await perpsV2Market.positions(trader)).margin, toUnit('500'));
			});

			it('Abolish margin', async () => {
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.transferMargin(toUnit('-1000'), { from: trader });
				assert.bnEqual((await perpsV2Market.positions(trader)).margin, toUnit('0'));
			});

			it('Cannot decrease margin past zero.', async () => {
				await assert.revert(
					perpsV2Market.transferMargin(toUnit('-1'), { from: trader }),
					'Insufficient margin'
				);
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await assert.revert(
					perpsV2Market.transferMargin(toUnit('-2000'), { from: trader }),
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
		describe('Price impact', () => {
			it('should succeed with a reasonable price impact (long)', async () => {
				const margin = toUnit('1000');
				await perpsV2Market.transferMargin(margin, { from: trader });
				const size = toUnit('10'); // 2x long
				const price = toUnit('200');
				await setPrice(baseAsset, price);

				// Price impact:
				//
				// 0.5% (50bps)
				// priceImpactLimit = 200 * (1 + 0.005)
				//                  = 201
				const reasonablePriceImpact = toUnit('0.005'); // 0.5% (50bps)

				const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size, 0))[0]; // 200.01
				const fee = (await perpsV2Market.orderFee(size, orderType))[0];

				const tx = await perpsV2Market.modifyPosition(size, reasonablePriceImpact, {
					from: trader,
				});
				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsV2Market] });
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsV2Market.address,
					args: [toBN('1'), trader, margin.sub(fee), size, size, fillPrice, toBN(2), fee],
					log: decodedLogs[2],
				});
			});

			it('should fail when the fillPrice exceeds the max price impact tolerance (long)', async () => {
				const margin = toUnit('10000');
				await perpsV2Market.transferMargin(margin, { from: trader });
				const price = toUnit('200');
				await setPrice(baseAsset, price);

				// Price impact:
				//
				// 0.1% (5bps)
				// priceImpactLimit = 200 * (1 + 0.0005)
				//                  = 200.1
				const reasonablePriceImpact = toUnit('0.0005'); // 0.1% (5bps)

				// 8x long, fillPrice = 200.4
				await assert.revert(
					perpsV2Market.modifyPosition(toUnit('400'), reasonablePriceImpact, {
						from: trader,
					}),
					'Price impact exceeded'
				);
			});

			it('should succeed with a reasonable price impact (short)', async () => {
				const margin = toUnit('1000');
				await perpsV2Market.transferMargin(margin, { from: trader });
				const size = toUnit('-30'); // 6x short
				const price = toUnit('200');
				await setPrice(baseAsset, price);

				// Price impact:
				//
				// 0.5% (50bps)
				// priceImpactLimit = 200 * (1 - 0.005)
				//                  = 199
				const reasonablePriceImpact = toUnit('0.005'); // 0.5% (50bps)

				// 6x short, fillPrice = 199.97
				const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size, 0))[0];

				const fee = (await perpsV2Market.orderFee(size, orderType))[0];

				const tx = await perpsV2Market.modifyPosition(size, reasonablePriceImpact, {
					from: trader,
				});
				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsV2Market] });
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsV2Market.address,
					args: [toBN('1'), trader, margin.sub(fee), size, size, fillPrice, toBN(2), fee],
					log: decodedLogs[2],
				});
			});

			it('should succeed with a reasonable price impact (short with discount)', async () => {
				const margin = toUnit('1000');
				await perpsV2Market.transferMargin(margin, { from: trader });
				await perpsV2Market.transferMargin(margin, { from: trader2 });
				const price = toUnit('200');
				await setPrice(baseAsset, price);

				// trader1 has a position (100bps price impact & 6x long).
				await perpsV2Market.modifyPosition(toUnit('30'), toUnit('0.01'), {
					from: trader,
				});

				// Price impact:
				//
				// priceImpactLimit = 200 * (1 - 0.005)
				//                  = 199
				const reasonablePriceImpact = toUnit('0.005'); // 0.5% (50bps)

				// 4x short, fillPrice = 200.04
				const size = toUnit('-20');
				const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size, 0))[0];

				const fee = (await perpsV2Market.orderFee(size, orderType))[0];

				const tx = await perpsV2Market.modifyPosition(size, reasonablePriceImpact, {
					from: trader2,
				});
				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsV2Market] });
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsV2Market.address,
					args: [toBN('1'), trader2, margin.sub(fee), size, size, fillPrice, toBN(2), fee],
					log: decodedLogs[2],
				});
			});

			it('should fail when the fillPrice exceeds the max price impact tolerance (short)');

			it(
				'should fail when no priceImpactDelta is provided and fillPrice exceeds default tolerance'
			);
		});

		it('can modify a position', async () => {
			const margin = toUnit('1000');
			await perpsV2Market.transferMargin(margin, { from: trader });
			const size = toUnit('50'); // 10x leverage
			const price = toUnit('200');
			await setPrice(baseAsset, price);
			const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size, 0))[0]; // $205 fillPrice
			const fee = (await perpsV2Market.orderFee(size, orderType))[0];
			const tx = await perpsV2Market.modifyPosition(size, priceImpactDelta, { from: trader });

			const position = await perpsV2Market.positions(trader);
			assert.bnEqual(position.margin, margin.sub(fee));
			assert.bnEqual(position.size, size);
			assert.bnEqual(position.lastPrice, fillPrice);
			assert.bnEqual(position.lastFundingIndex, initialFundingIndex.add(toBN(2))); // margin transfer and position modification

			// Skew, size, entry notional sum, pending order value are updated.
			assert.bnEqual(await perpsV2Market.marketSkew(), size);
			assert.bnEqual(await perpsV2Market.marketSize(), size);
			assert.bnEqual(
				await perpsV2Market.entryDebtCorrection(),
				margin.sub(fee).sub(multiplyDecimal(size, fillPrice))
			);

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsV2Market] });
			assert.deepEqual(
				decodedLogs.map(({ name }) => name),
				['FundingRecomputed', 'Issued', 'PositionModified']
			);
			assert.equal(decodedLogs.length, 3);
			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSD.address,
				args: [await feePool.FEE_ADDRESS(), fee],
				log: decodedLogs[1],
			});
			decodedEventEqual({
				event: 'PositionModified',
				emittedFrom: perpsV2Market.address,
				args: [toBN('1'), trader, margin.sub(fee), size, size, fillPrice, toBN(2), fee],
				log: decodedLogs[2],
			});
		});

		it('modifyPositionWithTracking emits expected event', async () => {
			const margin = toUnit('1000');
			await perpsV2Market.transferMargin(margin, { from: trader });
			const size = toUnit('50');
			const price = toUnit('200');
			await setPrice(baseAsset, price);
			const fee = (await perpsV2Market.orderFee(size, orderType))[0];
			const trackingCode = toBytes32('code');
			const tx = await perpsV2Market.modifyPositionWithTracking(
				size,
				priceImpactDelta,
				trackingCode,
				{ from: trader }
			);

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsV2Market] });
			assert.deepEqual(
				decodedLogs.map(({ name }) => name),
				['FundingRecomputed', 'Issued', 'PerpsTracking', 'PositionModified']
			);
			assert.equal(decodedLogs.length, 4);
			decodedEventEqual({
				event: 'PerpsTracking',
				emittedFrom: perpsV2Market.address,
				args: [trackingCode, baseAsset, marketKey, size, fee],
				log: decodedLogs[2],
			});
		});

		it('Cannot modify a position if the price is invalid', async () => {
			const margin = toUnit('1000');
			await perpsV2Market.transferMargin(margin, { from: trader });
			const size = toUnit('10');
			await perpsV2Market.modifyPosition(size, priceImpactDelta, { from: trader });

			await setPrice(baseAsset, toUnit('200'));

			await fastForward(4 * 7 * 24 * 60 * 60);

			const postDetails = await perpsV2Market.postTradeDetails(
				size,
				toUnit('0'),
				orderType,
				trader
			);
			assert.equal(postDetails.status, Status.InvalidPrice);

			await assert.revert(
				perpsV2Market.modifyPosition(size, priceImpactDelta, { from: trader }),
				'Invalid price'
			);
		});

		it('Cannot modify a position if the system is suspended', async () => {
			const margin = toUnit('1000');
			await perpsV2Market.transferMargin(margin, { from: trader });
			const size = toUnit('10');
			const price = toUnit('200');
			await setPrice(baseAsset, price);
			const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size, 0))[0];

			// suspend
			await systemStatus.suspendSystem('3', { from: owner });
			// should revert modifying position
			await assert.revert(
				perpsV2Market.modifyPosition(size, priceImpactDelta, { from: trader }),
				'Synthetix is suspended'
			);

			// resume
			await systemStatus.resumeSystem({ from: owner });
			// should work now
			await perpsV2Market.modifyPosition(size, priceImpactDelta, { from: trader });
			const position = await perpsV2Market.positions(trader);
			assert.bnEqual(position.size, size);
			assert.bnEqual(position.lastPrice, fillPrice);
		});

		it('Cannot modify a position if the synth is suspended', async () => {
			const margin = toUnit('1000');
			await perpsV2Market.transferMargin(margin, { from: trader });
			const size = toUnit('10');
			const price = toUnit('200');
			await setPrice(baseAsset, price);
			const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size, 0))[0];

			// suspend
			await systemStatus.suspendSynth(baseAsset, 65, { from: owner });
			// should revert modifying position
			await assert.revert(
				perpsV2Market.modifyPosition(size, priceImpactDelta, { from: trader }),
				'Synth is suspended'
			);

			// resume
			await systemStatus.resumeSynth(baseAsset, { from: owner });
			// should work now
			await perpsV2Market.modifyPosition(size, priceImpactDelta, { from: trader });
			const position = await perpsV2Market.positions(trader);
			assert.bnEqual(position.size, size);
			assert.bnEqual(position.lastPrice, fillPrice);
		});

		it('Empty orders fail', async () => {
			const margin = toUnit('1000');
			await perpsV2Market.transferMargin(margin, { from: trader });
			await assert.revert(
				perpsV2Market.modifyPosition(toBN('0'), priceImpactDelta, { from: trader }),
				'Cannot submit empty order'
			);
			const postDetails = await perpsV2Market.postTradeDetails(
				toBN('0'),
				toUnit('0'),
				orderType,
				trader
			);
			assert.equal(postDetails.status, Status.NilOrder);
		});

		it('Cannot modify a position if it is liquidating', async () => {
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});

			await setPrice(baseAsset, toUnit('100'));
			// User realises the price has crashed and tries to outrun their liquidation, but it fails

			const sizeDelta = toUnit('-50');
			const postDetails = await perpsV2Market.postTradeDetails(
				sizeDelta,
				toUnit('0'),
				orderType,
				trader
			);
			assert.equal(postDetails.status, Status.CanLiquidate);

			await assert.revert(
				perpsV2Market.modifyPosition(sizeDelta, priceImpactDelta, { from: trader }),
				'Position can be liquidated'
			);
		});

		it('Order modification properly records the exchange fee with the fee pool', async () => {
			const FEE_ADDRESS = await feePool.FEE_ADDRESS();
			const preBalance = await sUSD.balanceOf(FEE_ADDRESS);
			const preDistribution = (await feePool.recentFeePeriods(0))[3];
			const price = toUnit('200');
			await setPrice(baseAsset, price);
			const fee = (await perpsV2Market.orderFee(toUnit('50'), orderType))[0];
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice: price,
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});

			assert.bnEqual(await sUSD.balanceOf(FEE_ADDRESS), preBalance.add(fee));
			assert.bnEqual((await feePool.recentFeePeriods(0))[3], preDistribution.add(fee));
		});

		it('Modifying a position without closing it should not change its id', async () => {
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});
			const { id: oldPositionId } = await perpsV2Market.positions(trader);

			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-25'),
			});
			const { id: newPositionId } = await perpsV2Market.positions(trader);
			assert.bnEqual(oldPositionId, newPositionId);
		});

		it('max leverage cannot be exceeded', async () => {
			await setPrice(baseAsset, toUnit('100'));
			await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
			await perpsV2Market.transferMargin(toUnit('1000'), { from: trader2 });
			await assert.revert(
				perpsV2Market.modifyPosition(toUnit('101'), priceImpactDelta, { from: trader }),
				'Max leverage exceeded'
			);
			let postDetails = await perpsV2Market.postTradeDetails(
				toUnit('101'),
				toUnit('0'),
				orderType,
				trader
			);
			assert.equal(postDetails.status, Status.MaxLeverageExceeded);

			await assert.revert(
				perpsV2Market.modifyPosition(toUnit('-101'), priceImpactDelta, { from: trader2 }),
				'Max leverage exceeded'
			);
			postDetails = await perpsV2Market.postTradeDetails(
				toUnit('-101'),
				toUnit('0'),
				orderType,
				trader2
			);
			assert.equal(postDetails.status, Status.MaxLeverageExceeded);
		});

		it('min margin must be provided', async () => {
			const price = toUnit('10');
			const size = toUnit('10');

			await setPrice(baseAsset, price);
			const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size, 0))[0];

			await perpsV2Market.transferMargin(minInitialMargin.sub(toUnit('1')), { from: trader });
			await assert.revert(
				perpsV2Market.modifyPosition(size, priceImpactDelta, { from: trader }),
				'Insufficient margin'
			);

			let postDetails = await perpsV2Market.postTradeDetails(price, toUnit('0'), orderType, trader);
			assert.equal(postDetails.status, Status.InsufficientMargin);

			// But it works after transferring the remaining $1
			await perpsV2Market.transferMargin(toUnit('1'), { from: trader });

			const fee = (await perpsV2Market.orderFee(size, orderType))[0];
			postDetails = await perpsV2Market.postTradeDetails(size, toUnit('0'), orderType, trader);
			assert.bnEqual(postDetails.margin, minInitialMargin.sub(fee));
			assert.bnEqual(postDetails.size, size);
			assert.bnEqual(postDetails.price, fillPrice);
			assert.bnEqual(postDetails.liqPrice, toUnit('2.0565028'));
			assert.bnEqual(postDetails.fee, fee);
			assert.equal(postDetails.status, Status.Ok);

			await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, { from: trader });
		});

		describe('Max market size constraints', () => {
			it('properly reports the max order size on each side', async () => {
				let maxOrderSizes = await perpsV2Market.maxOrderSizes();

				assert.bnEqual(maxOrderSizes.long, maxMarketValue);
				assert.bnEqual(maxOrderSizes.short, maxMarketValue);

				// maxMarketValue does _not_ depend on price (value refers to number of base units).
				const newPrice = toUnit('200');
				await setPrice(baseAsset, newPrice);

				maxOrderSizes = await perpsV2Market.maxOrderSizes();

				assert.bnEqual(maxOrderSizes.long, maxMarketValue);
				assert.bnEqual(maxOrderSizes.short, maxMarketValue);

				// Submit order on one side, leaving part of what's left.
				//
				// 1000 maxMarketValue
				// 400 sizeDelta
				// 600 remaining (long)
				// 1000 remaining (short - no change)
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: newPrice,
					marginDelta: toUnit('10000'),
					sizeDelta: toUnit('400'),
				});

				maxOrderSizes = await perpsV2Market.maxOrderSizes();
				assert.bnEqual(maxOrderSizes.long, maxMarketValue.sub(toUnit('400')));
				assert.bnEqual(maxOrderSizes.short, maxMarketValue);

				// Submit order on the other side, removing all available supply.
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader2,
					fillPrice: newPrice,
					marginDelta: toUnit('100001'),
					sizeDelta: toUnit('-1000'),
				});

				maxOrderSizes = await perpsV2Market.maxOrderSizes();
				assert.bnEqual(maxOrderSizes.long, maxMarketValue.sub(toUnit('400'))); // Long side is unaffected
				assert.bnEqual(maxOrderSizes.short, toUnit('0'));

				// An additional few units on the long side by another trader
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader3,
					fillPrice: newPrice,
					marginDelta: toUnit('10000'),
					sizeDelta: toUnit('200'),
				});

				maxOrderSizes = await perpsV2Market.maxOrderSizes();
				assert.bnEqual(maxOrderSizes.long, maxMarketValue.sub(toUnit('600')));
				assert.bnEqual(maxOrderSizes.short, toUnit('0'));
			});

			for (const side of ['long', 'short']) {
				describe(`${side}`, () => {
					let maxSize, maxMargin, orderSize;
					const leverage = side === 'long' ? toUnit('10') : toUnit('-10');

					beforeEach(async () => {
						await perpsV2MarketSettings.setMaxMarketValue(marketKey, toUnit('100'), {
							from: owner,
						});
						await setPrice(baseAsset, toUnit('1'));

						const maxOrderSizes = await perpsV2Market.maxOrderSizes();
						maxSize = maxOrderSizes[side];
						maxMargin = maxSize;
						orderSize = side === 'long' ? maxSize : maxSize.neg();
					});

					it('Orders are blocked if they exceed max market size', async () => {
						await perpsV2Market.transferMargin(maxMargin.add(toUnit('11')), { from: trader });
						const tooBig = orderSize.div(toBN('10')).mul(toBN('11'));

						const postDetails = await perpsV2Market.postTradeDetails(
							tooBig,
							toUnit('0'),
							orderType,
							trader
						);
						assert.equal(postDetails.status, Status.MaxMarketSizeExceeded);

						await assert.revert(
							perpsV2Market.modifyPosition(tooBig, priceImpactDelta, {
								from: trader,
							}),
							'Max market size exceeded'
						);
					});

					it('Price motion does not impact the max market size', async () => {
						// Ensure there's some existing order size
						await perpsV2Market.transferMargin(maxMargin, {
							from: trader2,
						});

						// 100 / 10 * 7 = 70
						await perpsV2Market.modifyPosition(
							orderSize.div(toBN(10)).mul(toBN(7)),
							priceImpactDelta,
							{
								from: trader2,
							}
						);

						await perpsV2Market.transferMargin(maxMargin, {
							from: trader,
						});

						// prices do not affect market size despite doing a 2x
						await setPrice(baseAsset, toUnit('2'));

						// 100 / 100 * 25 = 25
						//
						// 70 + 25 = 95
						const sizeDelta = orderSize.div(toBN(100)).mul(toBN(25));
						const postDetails = await perpsV2Market.postTradeDetails(
							sizeDelta,
							toUnit('0'),
							orderType,
							trader
						);
						assert.equal(postDetails.status, Status.Ok);
						await perpsV2Market.modifyPosition(sizeDelta, priceImpactDelta, {
							from: trader,
						});
						const sizes = await perpsV2Market.maxOrderSizes();

						// remaining size = 5 available.
						assert.bnEqual(sizes[leverage.gt(toBN('0')) ? 0 : 1].abs(), toUnit('5'));
					});
				});
			}
		});

		describe('Closing positions', () => {
			it('can close an open position', async () => {
				const margin = toUnit('1000');
				await perpsV2Market.transferMargin(margin, { from: trader });
				await setPrice(baseAsset, toUnit('200'));
				await perpsV2Market.modifyPosition(toUnit('50'), priceImpactDelta, { from: trader });

				await setPrice(baseAsset, toUnit('199'));
				await perpsV2Market.closePosition(priceImpactDelta, { from: trader });
				const position = await perpsV2Market.positions(trader);
				const remaining = (await perpsV2Market.remainingMargin(trader))[0];

				assert.bnEqual(position.margin, remaining);
				assert.bnEqual(position.size, toUnit(0));
				assert.bnEqual(position.lastPrice, toUnit(0));
				assert.bnEqual(position.lastFundingIndex, toBN(0));

				// Skew, size, entry notional sum, debt are updated.
				assert.bnEqual(await perpsV2Market.marketSkew(), toUnit(0));
				assert.bnEqual(await perpsV2Market.marketSize(), toUnit(0));
				assert.bnEqual((await perpsV2Market.marketDebt())[0], remaining);
				assert.bnEqual(await perpsV2Market.entryDebtCorrection(), remaining);
			});

			it('Cannot close a position if it is liquidating', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: toUnit('200'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('50'),
				});

				await setPrice(baseAsset, toUnit('100'));

				await assert.revert(
					perpsV2Market.closePosition(priceImpactDelta, { from: trader }),
					'Position can be liquidated'
				);
			});

			it('Cannot close an already-closed position', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: toUnit('200'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('50'),
				});

				await perpsV2Market.closePosition(priceImpactDelta, { from: trader });
				const { size } = await perpsV2Market.positions(trader);
				assert.bnEqual(size, toUnit(0));

				await assert.revert(
					perpsV2Market.closePosition(priceImpactDelta, { from: trader }),
					'No position open'
				);
			});

			it('position closure emits the appropriate event', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				await setPrice(baseAsset, toUnit('200'));
				const tx = await perpsV2Market.closePosition(priceImpactDelta, { from: trader });

				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, perpsV2Market],
				});
				assert.deepEqual(
					decodedLogs.map(({ name }) => name),
					['FundingRecomputed', 'Issued', 'PositionModified']
				);
				assert.equal(decodedLogs.length, 3);
				const fee = multiplyDecimal(toUnit(1000), takerFee).add(
					multiplyDecimal(toUnit(2000), makerFee)
				);

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsV2Market.address,
					args: [
						toBN('1'),
						trader,
						toUnit('2000').sub(fee),
						toBN('0'),
						toUnit('-10'),
						(await perpsV2Market.assetPrice()).price,
						await perpsV2Market.fundingSequenceLength(),
						multiplyDecimal(toUnit(2000), makerFee),
					],
					log: decodedLogs[2],
					bnCloseVariance: toUnit('0.1'),
				});
			});

			it('closePositionWithTracking emits expected event', async () => {
				const size = toUnit('10');
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: toUnit('200'),
					marginDelta: toUnit('1000'),
					sizeDelta: size,
				});

				const trackingCode = toBytes32('code');
				const tx = await perpsV2Market.closePositionWithTracking(priceImpactDelta, trackingCode, {
					from: trader,
				});

				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [futuresMarketManager, sUSD, perpsV2Market],
				});
				assert.deepEqual(
					decodedLogs.map(({ name }) => name),
					['FundingRecomputed', 'Issued', 'PerpsTracking', 'PositionModified']
				);
				assert.equal(decodedLogs.length, 4);
				const fee = multiplyDecimal(toUnit(2000), makerFee);

				decodedEventEqual({
					event: 'PerpsTracking',
					emittedFrom: perpsV2Market.address,
					args: [trackingCode, baseAsset, marketKey, size.neg(), fee],
					log: decodedLogs[2],
					bnCloseVariance: toUnit('0.1'),
				});
			});

			it('opening a new position gets a new id', async () => {
				await setPrice(baseAsset, toUnit('100'));

				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader2 });

				// No position ids at first.
				let { id: positionId } = await perpsV2Market.positions(trader);
				assert.bnEqual(positionId, toBN('0'));
				positionId = (await perpsV2Market.positions(trader2)).id;
				assert.bnEqual(positionId, toBN('0'));

				// Trader 1 gets position id 1.
				let tx = await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, {
					from: trader,
				});
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2Market],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('1'));

				// trader2 gets the subsequent id
				tx = await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, { from: trader2 });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2Market],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('2'));

				// And the ids have been modified
				positionId = (await perpsV2Market.positions(trader)).id;
				assert.bnEqual(positionId, toBN('1'));
				positionId = (await perpsV2Market.positions(trader2)).id;
				assert.bnEqual(positionId, toBN('2'));
			});

			it('modifying a position retains the same id', async () => {
				await setPrice(baseAsset, toUnit('100'));
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });

				// Trader gets position id 1.
				let tx = await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, {
					from: trader,
				});
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2Market],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('1'));

				let positionId = (await perpsV2Market.positions(trader)).id;
				assert.bnEqual(positionId, toBN('1'));

				// Modification (but not closure) does not alter the id
				tx = await perpsV2Market.modifyPosition(toUnit('-5'), priceImpactDelta, { from: trader });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2Market],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('1'));

				// And the ids have been modified
				positionId = (await perpsV2Market.positions(trader)).id;
				assert.bnEqual(positionId, toBN('1'));
			});

			it('closing a position deletes the id but emits it in the event', async () => {
				await setPrice(baseAsset, toUnit('100'));
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader2 });

				// Close by closePosition
				let tx = await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, {
					from: trader,
				});
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2Market],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('1'));

				let positionId = (await perpsV2Market.positions(trader)).id;
				assert.bnEqual(positionId, toBN('1'));

				tx = await perpsV2Market.closePosition(priceImpactDelta, { from: trader });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2Market],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('1'));

				positionId = (await perpsV2Market.positions(trader)).id;
				assert.bnEqual(positionId, toBN('0'));

				// Close by modifyPosition
				tx = await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, { from: trader2 });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2Market],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('2'));

				positionId = (await perpsV2Market.positions(trader2)).id;
				assert.bnEqual(positionId, toBN('2'));

				tx = await perpsV2Market.modifyPosition(toUnit('-10'), priceImpactDelta, { from: trader2 });
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2Market],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('2'));

				positionId = (await perpsV2Market.positions(trader)).id;
				assert.bnEqual(positionId, toBN('0'));
			});

			it('closing a position and opening one after should increment the position id', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				const { id: oldPositionId } = await perpsV2Market.positions(trader);
				assert.bnEqual(oldPositionId, toBN('1'));

				await setPrice(baseAsset, toUnit('200'));
				let tx = await perpsV2Market.closePosition(priceImpactDelta, { from: trader });

				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2Market],
				});

				// No fee => no fee minting log, so decodedLogs index == 1
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('1'));

				tx = await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, { from: trader });

				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2Market],
				});

				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[0].name, 'id');
				assert.bnEqual(decodedLogs[2].events[0].value, toBN('2'));

				const { id: newPositionId } = await perpsV2Market.positions(trader);
				assert.bnEqual(newPositionId, toBN('2'));
			});
		});

		describe('post-trade position details', async () => {
			const sizeDelta = toUnit('10');

			const getPositionDetails = async ({ account }) => {
				const newPosition = await perpsV2Market.positions(account);
				const { price: liquidationPrice } = await perpsV2Market.liquidationPrice(account);
				return {
					...newPosition,
					liquidationPrice,
				};
			};

			it('can get position details for new position', async () => {
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await setPrice(await perpsV2Market.baseAsset(), toUnit('240'));
				const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(sizeDelta, 0))[0];

				const postTradeDetails = await perpsV2Market.postTradeDetails(
					sizeDelta,
					toUnit('0'),
					orderType,
					trader
				);

				// Now execute the trade.
				await perpsV2Market.modifyPosition(sizeDelta, priceImpactDelta, { from: trader });

				const details = await getPositionDetails({ account: trader });

				assert.bnClose(postTradeDetails.margin, details.margin, toUnit(0.01)); // one block of funding rate has accrued
				assert.bnEqual(postTradeDetails.size, details.size);
				assert.bnEqual(postTradeDetails.price, fillPrice); // fillPrice can only be derived before the trade
				assert.bnClose(postTradeDetails.liqPrice, details.liquidationPrice, toUnit(0.01));
				assert.bnEqual(postTradeDetails.fee, toUnit('7.20036'));
				assert.bnEqual(postTradeDetails.status, Status.Ok);
			});

			it('uses the margin of an existing position', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: toUnit('240'),
					marginDelta: toUnit('1000'),
					sizeDelta,
				});

				const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(sizeDelta, 0))[0];
				const postTradeDetails = await perpsV2Market.postTradeDetails(
					sizeDelta,
					toUnit('0'),
					orderType,
					trader
				);

				// Now execute the trade.
				await perpsV2Market.modifyPosition(sizeDelta, priceImpactDelta, { from: trader });

				const details = await getPositionDetails({ account: trader });

				assert.bnClose(postTradeDetails.margin, details.margin, toUnit(0.01)); // one block of funding rate has accrued
				assert.bnEqual(postTradeDetails.size, details.size);
				assert.bnEqual(postTradeDetails.price, fillPrice); // fillPrice can only be derived before the trade
				assert.bnClose(postTradeDetails.positionLiquidationPrice, details.liqPrice, toUnit(0.01));
				assert.bnEqual(postTradeDetails.fee, toUnit('7.20108')); // higher fee due to higher skew
				assert.bnEqual(postTradeDetails.status, Status.Ok);
			});
		});
	});

	describe('Profit & Loss, margin, leverage', () => {
		// PnL is affected by not just the price but the skew. p/d is applied to the trade's fillPrice
		// upon execution depending on the expansion/contraction of skew.
		//
		// However, you can easily calculate this by figuring out the fillPrice before the `modifyPosition` of each
		// trade then (priceNow - fillPrice) * size.
		describe('PnL', () => {
			let price, fillPrice1, fillPrice2, size1, size2;

			beforeEach(async () => {
				price = toUnit('100');

				await setPrice(baseAsset, price);

				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				size1 = toUnit('50');
				fillPrice1 = (await perpsV2Market.fillPriceWithBasePrice(size1, 0))[0];
				await perpsV2Market.modifyPosition(size1, priceImpactDelta, { from: trader });

				await perpsV2Market.transferMargin(toUnit('4000'), { from: trader2 });
				size2 = toUnit('-40');
				fillPrice2 = (await perpsV2Market.fillPriceWithBasePrice(size2, 0))[0];
				await perpsV2Market.modifyPosition(size2, priceImpactDelta, { from: trader2 });
			});

			it('steady price', async () => {
				// A steady price does indeed impact PnL (because a premium is applied). So although the
				// price does not change a premium is added and hence affects their PnL
				const expectedPnL1 = multiplyDecimal(price.sub(fillPrice1), size1);
				const expectedPnL2 = multiplyDecimal(price.sub(fillPrice2), size2);

				assert.bnEqual((await perpsV2Market.profitLoss(trader))[0], expectedPnL1);
				assert.bnEqual((await perpsV2Market.profitLoss(trader2))[0], expectedPnL2);
			});

			it('price increase to fillPrice', async () => {
				// This is a special scenario where the price is increased to the fillPrice of the 1st trader. In this
				// scenario there is no PnL, so we should expect 0. The premium fee is covered by the price increase.
				await setPrice(baseAsset, fillPrice1);
				assert.bnEqual((await perpsV2Market.profitLoss(trader))[0], 0);

				await setPrice(baseAsset, fillPrice2);
				assert.bnEqual((await perpsV2Market.profitLoss(trader2))[0], 0);
			});

			it('price increase', async () => {
				const newPrice = toUnit('150');
				await setPrice(baseAsset, newPrice);

				const expectedPnL1 = multiplyDecimal(newPrice.sub(fillPrice1), size1);
				const expectedPnL2 = multiplyDecimal(newPrice.sub(fillPrice2), size2);

				assert.bnEqual((await perpsV2Market.profitLoss(trader))[0], expectedPnL1);
				assert.bnEqual((await perpsV2Market.profitLoss(trader2))[0], expectedPnL2);
			});

			it('price decrease', async () => {
				const newPrice = toUnit('90');
				await setPrice(baseAsset, newPrice);

				const expectedPnL1 = multiplyDecimal(newPrice.sub(fillPrice1), size1);
				const expectedPnL2 = multiplyDecimal(newPrice.sub(fillPrice2), size2);

				assert.bnEqual((await perpsV2Market.profitLoss(trader))[0], expectedPnL1);
				assert.bnEqual((await perpsV2Market.profitLoss(trader2))[0], expectedPnL2);
			});

			it('reports invalid prices properly', async () => {
				assert.isFalse((await perpsV2Market.profitLoss(trader))[1]);
				await fastForward(7 * 24 * 60 * 60); // Stale the prices
				assert.isTrue((await perpsV2Market.profitLoss(trader))[1]);
			});

			it.skip('Zero profit on a zero-size position', async () => {
				assert.isTrue(false);
			});
		});

		describe('Remaining margin', () => {
			beforeEach(async () => {
				await setPrice(baseAsset, toUnit('100'));
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('50'), priceImpactDelta, { from: trader });
				await perpsV2Market.transferMargin(toUnit('5000'), { from: trader2 });
				await perpsV2Market.modifyPosition(toUnit('-50'), priceImpactDelta, { from: trader2 });
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
				assert.isFalse((await perpsV2Market.remainingMargin(trader))[1]);
				await fastForward(7 * 24 * 60 * 60); // Stale the prices
				assert.isTrue((await perpsV2Market.remainingMargin(trader))[1]);
			});
		});

		describe('Accessible margin', async () => {
			const withdrawAccessibleAndValidate = async account => {
				let accessible = (await perpsV2Market.accessibleMargin(account))[0];
				await perpsV2Market.transferMargin(accessible.neg(), { from: account });
				accessible = (await perpsV2Market.accessibleMargin(account))[0];
				assert.bnClose(accessible, toBN('0'), toUnit('1'));

				// withdraw large enough margin to trigger leverage > maxLeverage.
				await assert.revert(
					perpsV2Market.transferMargin(toUnit('-1.5'), { from: account }),
					'Insufficient margin'
				);
			};

			it('With no position, entire margin is accessible.', async () => {
				const margin = toUnit('1234.56789');
				await perpsV2Market.transferMargin(margin, { from: trader3 });
				assert.bnEqual((await perpsV2Market.accessibleMargin(trader3))[0], margin);
				await withdrawAccessibleAndValidate(trader3);
			});

			it('With a tiny position, minimum margin requirement is enforced.', async () => {
				const margin = toUnit('1234.56789');
				const size = margin.div(toBN(10000));
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: margin,
					sizeDelta: size,
				});
				assert.bnClose(
					(await perpsV2Market.accessibleMargin(trader3))[0],
					margin.sub(minInitialMargin),
					toUnit('0.1')
				);
				await withdrawAccessibleAndValidate(trader3);

				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: margin,
					sizeDelta: size.neg(),
				});
				assert.bnClose(
					(await perpsV2Market.accessibleMargin(trader2))[0],
					margin.sub(minInitialMargin),
					toUnit('0.1')
				);
				await withdrawAccessibleAndValidate(trader2);
			});

			it('At max leverage, no margin is accessible.', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('123.4'),
				});
				assert.bnEqual((await perpsV2Market.accessibleMargin(trader3))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader3);

				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('-123.4'),
				});
				assert.bnEqual((await perpsV2Market.accessibleMargin(trader2))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader2);
			});

			it('At above max leverage, no margin is accessible.', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('12.34').mul(toBN('8')),
				});

				await setPrice(baseAsset, toUnit('90'));

				assert.bnGt((await perpsV2Market.currentLeverage(trader3))[0], maxLeverage);
				assert.bnEqual((await perpsV2Market.accessibleMargin(trader3))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader3);

				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('-12.34').mul(toBN('8')),
					leverage: toUnit('-8'),
				});

				await setPrice(baseAsset, toUnit('110'));

				assert.bnGt((await perpsV2Market.currentLeverage(trader2))[0].neg(), maxLeverage);
				assert.bnEqual((await perpsV2Market.accessibleMargin(trader2))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader2);
			});

			it('If a position is subject to liquidation, no margin is accessible.', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('12.34').mul(toBN('8')),
				});

				await setPrice(baseAsset, toUnit('80'));
				assert.isTrue(await perpsV2Market.canLiquidate(trader3));
				assert.bnEqual((await perpsV2Market.accessibleMargin(trader3))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader3);

				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('12.34').mul(toBN('-8')),
				});

				await setPrice(baseAsset, toUnit('120'));
				assert.isTrue(await perpsV2Market.canLiquidate(trader2));
				assert.bnEqual((await perpsV2Market.accessibleMargin(trader2))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader2);
			});

			it('If remaining margin is below minimum initial margin, no margin is accessible.', async () => {
				const size = toUnit('10.5');
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('105'),
					sizeDelta: size,
				});

				// The price moves down, eating into the margin, but the leverage is reduced to acceptable levels
				let price = toUnit('95');
				await setPrice(baseAsset, price);
				let remaining = (await perpsV2Market.remainingMargin(trader3))[0];
				const sizeFor9x = divideDecimal(remaining.mul(toBN('9')), price);
				await perpsV2Market.modifyPosition(sizeFor9x.sub(size), priceImpactDelta, {
					from: trader3,
				});

				assert.bnEqual((await perpsV2Market.accessibleMargin(trader3))[0], toUnit('0'));

				price = toUnit('100');
				await setPrice(baseAsset, price);
				remaining = (await perpsV2Market.remainingMargin(trader3))[0];
				const sizeForNeg10x = divideDecimal(remaining.mul(toBN('-10')), price);

				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('105'),
					sizeDelta: sizeForNeg10x.sub(sizeFor9x),
				});

				// The price moves up, eating into the margin, but the leverage is reduced to acceptable levels
				price = toUnit('111');
				await setPrice(baseAsset, price);
				remaining = (await perpsV2Market.remainingMargin(trader3))[0];
				const sizeForNeg9x = divideDecimal(remaining.mul(toBN('-9')), price);
				await perpsV2Market.modifyPosition(sizeForNeg10x.sub(sizeForNeg9x), priceImpactDelta, {
					from: trader3,
				});

				assert.bnEqual((await perpsV2Market.accessibleMargin(trader3))[0], toUnit('0'));
				await withdrawAccessibleAndValidate(trader3);
			});

			it('With a fraction of max leverage position, a complementary fraction of margin is accessible', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('50'),
				});
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-20'),
				});

				// Give fairly wide bands to account for fees
				assert.bnClose(
					(await perpsV2Market.accessibleMargin(trader))[0],
					toUnit('500'),
					toUnit('20')
				);
				await withdrawAccessibleAndValidate(trader);
				assert.bnClose(
					(await perpsV2Market.accessibleMargin(trader2))[0],
					toUnit('800'),
					toUnit('5')
				);
				await withdrawAccessibleAndValidate(trader2);
			});

			it('After some profit, more margin becomes accessible', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('100'),
				});
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-50'),
				});

				// No margin is accessible at max leverage
				assert.bnEqual((await perpsV2Market.accessibleMargin(trader))[0], toUnit('0'));

				// The more conservative trader has about half margin accessible
				assert.bnClose(
					(await perpsV2Market.accessibleMargin(trader2))[0],
					toUnit('500'),
					toUnit('10')
				);

				// Price goes up 10%
				await setPrice(baseAsset, toUnit('110'));

				// At 10x, the trader makes 100% on their margin
				assert.bnClose(
					(await perpsV2Market.accessibleMargin(trader))[0],
					toUnit('1000').sub(minInitialMargin),
					toUnit('40')
				);
				await withdrawAccessibleAndValidate(trader);

				// Price goes down 10% relative to the original price
				await setPrice(baseAsset, toUnit('90'));

				// The 5x short trader makes 50% on their margin
				assert.bnClose(
					(await perpsV2Market.accessibleMargin(trader2))[0],
					toUnit('1000'), // no deduction of min initial margin because the trader would still be above the min at max leverage
					toUnit('50')
				);
				await withdrawAccessibleAndValidate(trader2);
			});

			it('After a loss, less margin is accessible', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('20'),
				});
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-50'),
				});

				// The more conservative trader has about 80% margin accessible
				assert.bnClose(
					(await perpsV2Market.accessibleMargin(trader))[0],
					toUnit('800'),
					toUnit('10')
				);

				// The other, about 50% margin accessible
				assert.bnClose(
					(await perpsV2Market.accessibleMargin(trader2))[0],
					toUnit('500'),
					toUnit('15')
				);

				// Price goes falls 10%
				await setPrice(baseAsset, toUnit('90'));

				// At 2x, the trader loses 20% of their margin
				assert.bnClose(
					(await perpsV2Market.accessibleMargin(trader))[0],
					toUnit('600'),
					toUnit('40')
				);
				await withdrawAccessibleAndValidate(trader);

				// Price goes up 5% relative to the original price
				await setPrice(baseAsset, toUnit('105'));

				// The 5x short trader loses 25% of their margin
				assert.bnClose(
					(await perpsV2Market.accessibleMargin(trader2))[0],
					toUnit('250'),
					toUnit('50')
				);
				await withdrawAccessibleAndValidate(trader2);
			});

			// TODO: ADD THIS BACK AFTER PERPSV2 MERGE!
			it.skip('Larger position', async () => {
				const price = toUnit('100');
				await setPrice(baseAsset, price);

				const size1 = toUnit('1000');
				const fillPrice1 = (await perpsV2Market.fillPriceWithBasePrice(size1, 0))[0]; // e.g. 100.5
				const marginDelta1 = multiplyDecimal(fillPrice1, size1);

				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: price,
					marginDelta: marginDelta1,
					sizeDelta: size1,
				});

				// const p = await perpsV2Market.positions(trader);
				// console.log(p.margin.toString());
				// console.log(p.size.toString());

				// No margin is accessible at max leverage
				//
				// note: accessibleMargin uses the current oracle price (not fillPrice with size).
				assert.bnEqual((await perpsV2Market.accessibleMargin(trader))[0], toUnit('0'));

				// Price goes up 10%
				await setPrice(baseAsset, toUnit('110'));

				// At 10x, the trader makes 100% on their margin
				assert.bnClose(
					(await perpsV2Market.accessibleMargin(trader))[0],
					toUnit('10000')
						.sub(minInitialMargin)
						.sub(toUnit('1200')),
					toUnit('10')
				);
				await withdrawAccessibleAndValidate(trader);
			});

			it('Accessible margin function properly reports invalid price', async () => {
				assert.isFalse((await perpsV2Market.accessibleMargin(trader))[1]);
				await fastForward(7 * 24 * 60 * 60);
				assert.isTrue((await perpsV2Market.accessibleMargin(trader))[1]);
			});

			describe('withdrawAllMargin', () => {
				it('Reverts if the price is invalid', async () => {
					await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
					await fastForward(7 * 24 * 60 * 60);
					await assert.revert(perpsV2Market.withdrawAllMargin({ from: trader }), 'Invalid price');
				});

				it('Reverts if the system is suspended', async () => {
					await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });

					// suspend
					await systemStatus.suspendSystem('3', { from: owner });
					// should revert
					await assert.revert(
						perpsV2Market.withdrawAllMargin({ from: trader }),
						'Synthetix is suspended'
					);

					// resume
					await systemStatus.resumeSystem({ from: owner });
					// should work now
					await perpsV2Market.withdrawAllMargin({ from: trader });
					assert.bnClose(
						(await perpsV2Market.accessibleMargin(trader))[0],
						toBN('0'),
						toUnit('0.1')
					);
				});

				it('Reverts if the synth is suspended', async () => {
					await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });

					// suspend
					await systemStatus.suspendSynth(baseAsset, 65, { from: owner });
					// should revert
					await assert.revert(
						perpsV2Market.withdrawAllMargin({ from: trader }),
						'Synth is suspended'
					);

					// resume
					await systemStatus.resumeSynth(baseAsset, { from: owner });
					// should work now
					await perpsV2Market.withdrawAllMargin({ from: trader });
					assert.bnClose(
						(await perpsV2Market.accessibleMargin(trader))[0],
						toBN('0'),
						toUnit('0.1')
					);
				});

				it('allows users to withdraw all their margin', async () => {
					await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
					await perpsV2Market.transferMargin(toUnit('3000'), { from: trader2 });
					await perpsV2Market.transferMargin(toUnit('10000'), { from: trader3 });

					await setPrice(baseAsset, toUnit('10'));

					await perpsV2Market.modifyPosition(toUnit('50'), priceImpactDelta, { from: trader });
					await perpsV2Market.modifyPosition(toUnit('-110'), priceImpactDelta, { from: trader2 });
					await perpsV2Market.modifyPosition(toUnit('900'), priceImpactDelta, { from: trader3 });

					assert.bnGt((await perpsV2Market.accessibleMargin(trader))[0], toBN('0'));
					assert.bnGt((await perpsV2Market.accessibleMargin(trader2))[0], toBN('0'));
					assert.bnGt((await perpsV2Market.accessibleMargin(trader3))[0], toBN('0'));

					await perpsV2Market.withdrawAllMargin({ from: trader });

					await setPrice(baseAsset, toUnit('11.4847'));

					await perpsV2Market.withdrawAllMargin({ from: trader });
					await perpsV2Market.withdrawAllMargin({ from: trader2 });
					await perpsV2Market.withdrawAllMargin({ from: trader3 });

					assert.bnClose(
						(await perpsV2Market.accessibleMargin(trader))[0],
						toBN('0'),
						toUnit('0.1')
					);
					assert.bnClose(
						(await perpsV2Market.accessibleMargin(trader2))[0],
						toBN('0'),
						toUnit('0.1')
					);
					assert.bnClose(
						(await perpsV2Market.accessibleMargin(trader3))[0],
						toBN('0'),
						toUnit('0.1')
					);
				});

				it('Does nothing with an empty margin', async () => {
					let margin = await perpsV2Market.remainingMargin(trader);
					assert.bnEqual(margin[0], toBN('0'));
					await perpsV2Market.withdrawAllMargin({ from: trader });
					margin = await perpsV2Market.remainingMargin(trader);
					assert.bnEqual(margin[0], toBN('0'));
				});

				it('Withdraws everything with no position', async () => {
					await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });

					let margin = await perpsV2Market.remainingMargin(trader);
					assert.bnEqual(margin[0], toUnit('1000'));

					await perpsV2Market.withdrawAllMargin({ from: trader });
					margin = await perpsV2Market.remainingMargin(trader);
					assert.bnEqual(margin[0], toBN('0'));
				});

				it('Profit allows more to be withdrawn', async () => {
					await perpsV2Market.transferMargin(toUnit('1239.2487'), { from: trader });

					await setPrice(baseAsset, toUnit('15.53'));
					await perpsV2Market.modifyPosition(toUnit('-322'), priceImpactDelta, { from: trader });

					await perpsV2Market.withdrawAllMargin({ from: trader });
					assert.bnClose(
						(await perpsV2Market.accessibleMargin(trader))[0],
						toBN('0'),
						toUnit('0.1')
					);
					await setPrice(baseAsset, toUnit('1.777'));
					assert.bnGt((await perpsV2Market.accessibleMargin(trader))[0], toBN('0'));

					await perpsV2Market.withdrawAllMargin({ from: trader });
					assert.bnClose(
						(await perpsV2Market.accessibleMargin(trader))[0],
						toBN('0'),
						toUnit('0.1')
					);
				});
			});
		});

		describe('Leverage', () => {
			it('current leverage', async () => {
				let price = toUnit(100);

				await setPrice(baseAsset, price);
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });

				const fee1 = (await perpsV2Market.orderFee(toUnit('50'), orderType))[0];
				await perpsV2Market.modifyPosition(toUnit('50'), priceImpactDelta, { from: trader }); // 5x
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader2 });

				const fee2 = (await perpsV2Market.orderFee(toUnit('-100'), orderType))[0];
				await perpsV2Market.modifyPosition(toUnit('-100'), priceImpactDelta, { from: trader2 }); // -10x

				const lev = (notional, margin, fee) => divideDecimal(notional, margin.sub(fee));

				// With no price motion and no funding rate, leverage should be unchanged.
				assert.bnClose(
					(await perpsV2Market.currentLeverage(trader))[0],
					lev(toUnit('5000'), toUnit('1000'), fee1),
					toUnit(0.1)
				);
				assert.bnClose(
					(await perpsV2Market.currentLeverage(trader2))[0],
					lev(toUnit('-10000'), toUnit('1000'), fee2),
					toUnit(0.1)
				);

				price = toUnit(105);
				await setPrice(baseAsset, price);

				// Price moves to 105:
				// long notional value 5000 -> 5250; long remaining margin 1000 -> 1250; leverage 5 -> 4.2
				// short notional value -10000 -> -10500; short remaining margin 1000 -> 500; leverage 10 -> 21;
				assert.bnClose(
					(await perpsV2Market.currentLeverage(trader))[0],
					lev(toUnit('5250'), toUnit('1250'), fee1),
					toUnit(0.1)
				);
				assert.bnClose(
					(await perpsV2Market.currentLeverage(trader2))[0],
					lev(toUnit('-10500'), toUnit('500'), fee2),
					toUnit(0.1)
				);
			});

			it('current leverage can be less than 1', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('5'),
				});

				assert.bnEqual((await perpsV2Market.positions(trader)).size, toUnit('5'));
				assert.bnClose(
					(await perpsV2Market.currentLeverage(trader))[0],
					toUnit(0.5),
					toUnit(0.001)
				);

				// The response of leverage to price with leverage < 1 is opposite to leverage > 1
				// When leverage is fractional, increasing the price increases leverage
				await setPrice(baseAsset, toUnit('300'));
				assert.bnClose(
					(await perpsV2Market.currentLeverage(trader))[0],
					toUnit(0.75),
					toUnit(0.001)
				);
				// ...while decreasing the price deleverages the position.
				await setPrice(baseAsset, toUnit('100').div(toBN(3)));
				assert.bnClose(
					(await perpsV2Market.currentLeverage(trader))[0],
					toUnit(0.25),
					toUnit(0.001)
				);
			});

			it('current leverage: no position', async () => {
				const currentLeverage = await perpsV2Market.currentLeverage(trader);
				assert.bnEqual(currentLeverage[0], toBN('0'));
			});

			it('current leverage properly reports invalid prices', async () => {
				assert.isFalse((await perpsV2Market.currentLeverage(trader))[1]);
				await fastForward(7 * 24 * 60 * 60);
				assert.isTrue((await perpsV2Market.currentLeverage(trader))[1]);
			});
		});
	});

	describe('Premium/Discount adjusted pricing', () => {
		it('A complete premium/discount price adjusted sample scenario', async () => {
			const price = toUnit('100');

			await setPrice(baseAsset, price);
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('10000'), {
				from: owner,
			});

			let fillPrice = (await perpsV2Market.fillPriceWithBasePrice(toUnit('100'), 0))[0];
			assert.bnEqual(fillPrice, toUnit('100.5'));
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice: price,
				marginDelta: toUnit('100000'),
				sizeDelta: toUnit('100'),
			});

			fillPrice = (await perpsV2Market.fillPriceWithBasePrice(toUnit('100'), 0))[0];
			assert.bnEqual(fillPrice, toUnit('101.5'));
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader2,
				fillPrice: price,
				marginDelta: toUnit('100000'),
				sizeDelta: toUnit('100'),
			});

			fillPrice = (await perpsV2Market.fillPriceWithBasePrice(toUnit('-200'), 0))[0];
			assert.bnEqual(fillPrice, toUnit('101'));
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader2,
				fillPrice: price,
				marginDelta: toUnit('100000'),
				sizeDelta: toUnit('-200'),
			});
		});

		it('Should result in a higher fillPrice when expanding skew (premium)', async () => {
			const price = toUnit('1200');

			await setPrice(baseAsset, price);
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('100000'), {
				from: owner,
			});

			// markets are empty. let's trade with 100 eth (1200*100 = 120k).
			//
			// we should expect:
			//
			// pdAfter = (skew + size) / scale
			//         = (0 + 100) / 100000
			//         = 0.001
			//
			// fillPrice = ((1200 * (1 + 0)) + (1200 * (1 + 0.001))) / 2
			//           = 1200.6
			const size = toUnit('100');
			const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size, 0))[0];
			assert.bnEqual(fillPrice, toUnit('1200.6'));
		});

		it('Should result in a lower fillPrice when contracting skew (discount - short)', async () => {
			const price = toUnit('1200');

			await setPrice(baseAsset, price);
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('100000'), {
				from: owner,
			});

			// push the skew negative.
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice: price,
				marginDelta: toUnit('100000'),
				sizeDelta: toUnit('-50'),
			});

			// int priceBefore = int(price).add(int(price).multiplyDecimal(pdBefore));
			// int priceAfter = int(price).add(int(price).multiplyDecimal(pdAfter));

			// we trade the opposite direction. we should get a discount.
			//
			// pdBefore = skew / scale
			//          = -50 / 100000
			//          = -0.0005
			// pdAfter  = (skew + size) / scale
			//          = (-50 + 40) / 100000
			//          = -0.0001
			//
			// fillPrice = ((1200 * (1 + -0.0005)) + (1200 * (1 + -0.0001))) / 2
			//           = 1199.64
			const size = toUnit('40');
			const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(size, 0))[0];
			assert.bnEqual(fillPrice, toUnit('1199.64'));
		});
	});

	describe('Funding', () => {
		const fastForwardAndOpenPosition = async (
			fastForwardBy,
			account,
			fillPrice,
			marginDelta,
			sizeDelta
		) => {
			await fastForward(fastForwardBy);
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account,
				fillPrice,
				marginDelta,
				sizeDelta,
			});
		};

		it('A specific concrete floating rate with velocity example', async () => {
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('1000'), {
				from: owner,
			});

			const fillPrice = toUnit('100');
			await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, toUnit('0.25'), {
				from: owner,
			});

			const trades = [
				// skew = long
				{
					size: toUnit('100'),
					account: trader,
					fastForwardBy: 1000,
					expectedRate: toUnit('0'),
					expectedFunding: toUnit('0'),
				},
				// skew = even more long
				{
					size: toUnit('200'),
					account: trader2,
					fastForwardBy: 29000,
					expectedRate: toUnit('0.00839120'),
					expectedFunding: toUnit('-0.14086'), // neg because longs pay short
				},
				// skew = balanced but funding rate sticks.
				{
					size: toUnit('-300'),
					account: trader3,
					fastForwardBy: 20000,
					expectedRate: toUnit('0.02575231'),
					expectedFunding: toUnit('-0.53620'), // neg because longs pay short
				},
			];
			const marginDelta = toUnit('1000000');

			for (const trade of trades) {
				const { size, account, fastForwardBy, expectedRate, expectedFunding } = trade;
				await fastForwardAndOpenPosition(fastForwardBy, account, fillPrice, marginDelta, size);

				const fundingRate = await perpsV2Market.currentFundingRate();
				assert.bnClose(fundingRate, expectedRate, toUnit('0.001'));

				const fundingSequenceLength = await perpsV2Market.fundingSequenceLength();
				const funding = await perpsV2Market.fundingSequence(fundingSequenceLength - 1);
				assert.bnClose(funding, expectedFunding, toUnit('0.001'));
			}

			// No change in skew, funding rate should remain the same.
			await fastForward(60 * 60 * 24); // 1 day
			const fundingRate = await perpsV2Market.currentFundingRate();
			assert.bnClose(fundingRate, trades[trades.length - 1].expectedRate, toUnit('0.001'));
		});

		it('A balanced market may not always have zero funding', async () => {
			const marginDelta = toUnit('1000000');
			const fillPrice = toUnit('100');
			await setPrice(baseAsset, fillPrice);
			await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, toUnit('0.25'), {
				from: owner,
			});

			// first trade occurs and causes a skew
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice,
				marginDelta,
				sizeDelta: toUnit('100'),
			});
			// pushes skew even further
			await fastForwardAndOpenPosition(5000, trader2, fillPrice, marginDelta, toUnit('200'));
			// balances skew
			await fastForwardAndOpenPosition(5000, trader3, fillPrice, marginDelta, toUnit('-300'));
			// more time passes
			await fastForward(5000);

			// funding rate should not be 0.
			assert.bnNotEqual(await perpsV2Market.currentFundingRate(), toUnit('0'));
		});

		it('Should accrue funding as time passes and no price changes occurs (long)', async () => {
			const price = toUnit('100');
			await setPrice(baseAsset, price);
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice: price,
				marginDelta: toUnit('10000'),
				sizeDelta: toUnit('10'), // long
			});
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader2,
				fillPrice: price,
				marginDelta: toUnit('10000'),
				sizeDelta: toUnit('-5'), // short
			});

			// market is long skewed, which means funding accrue for shorts.
			//
			// t1 = long  (must pay  -> accruedFunding should be negative)
			// t2 = short (gets paid -> accruedFunding should be positive)

			// t=0: no time has passed. technically some time has passed for the first trade but 2nd trade is new.
			assert.bnLt((await perpsV2Market.accruedFunding(trader))[0], toUnit('0'));
			assert.bnClose((await perpsV2Market.accruedFunding(trader2))[0], toUnit('0', '0.1'));

			await fastForward(60 * 60 * 24); // 1d
			await setPrice(baseAsset, price);

			// t=1d: 1 day of funding has accrued. t1 should be in profit and t2 at loss.
			assert.bnLt((await perpsV2Market.accruedFunding(trader))[0], toUnit('0'));
			assert.bnGt((await perpsV2Market.accruedFunding(trader2))[0], toUnit('0'));

			await fastForward(60 * 60 * 24); // 1d
			await setPrice(baseAsset, price);

			// t=2d: 2 days of funding has accrued. funding should continue to accrue in the same direction
			assert.bnLt((await perpsV2Market.accruedFunding(trader))[0], toUnit('0'));
			assert.bnGt((await perpsV2Market.accruedFunding(trader2))[0], toUnit('0'));
		});

		it('Should have zero funding when market is new and empty', async () => {
			assert.bnEqual(await perpsV2Market.currentFundingRate(), toUnit(0));
		});

		it('Should continue to increase rate so long as the market is skewed', async () => {
			const marginDelta = toUnit('1000000');
			const fillPrice = toUnit('100');
			await setPrice(baseAsset, fillPrice);
			await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, toUnit('0.25'), {
				from: owner,
			});

			// first trade occurs and causes a skew
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice,
				marginDelta: toUnit('1000000'),
				sizeDelta: toUnit('100'),
			});

			// time passes
			await fastForward(5000);
			const fundingRate1 = await perpsV2Market.currentFundingRate();

			// a new trader appears and further adds to the skew.
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader2,
				fillPrice,
				marginDelta,
				sizeDelta: toUnit('200'),
			});

			// time passes
			await fastForward(5000);

			// funding rate should continue to increase
			assert.bnGt(await perpsV2Market.currentFundingRate(), fundingRate1);

			// a new trader appears, reduces skew but not balanced
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader3,
				fillPrice,
				marginDelta,
				sizeDelta: toUnit('-100'),
			});

			// time passes
			await fastForward(5000);

			// funding rate should continue to increase
			assert.bnGt(await perpsV2Market.currentFundingRate(), fundingRate1);
		});

		it('Should stop increasing and stay elevated when market is balanced', async () => {
			const marginDelta = toUnit('1000000');
			const fillPrice = toUnit('100');
			await setPrice(baseAsset, fillPrice);
			await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, toUnit('0.25'), {
				from: owner,
			});

			// first trade occurs and causes a skew
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice,
				marginDelta,
				sizeDelta: toUnit('-100'),
			});

			// pushes skew further
			await fastForwardAndOpenPosition(5000, trader2, fillPrice, marginDelta, toUnit('-200'));
			const fundingRate1 = await perpsV2Market.currentFundingRate();

			// time passes
			await fastForward(5000);

			// funding rate should continue to increase (but on the short side)
			assert.bnLt(await perpsV2Market.currentFundingRate(), fundingRate1);

			// a new trader appears, balances the skew. funding rate at this point should stop changing.
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader3,
				fillPrice,
				marginDelta,
				sizeDelta: toUnit('300'),
			});
			const fairMarketFundingRate = await perpsV2Market.currentFundingRate();

			// even more time passes
			await fastForward(10000);

			// expecting no change in funding rate
			assert.bnEqual(await perpsV2Market.currentFundingRate(), fairMarketFundingRate);
		});

		it('Should increase rate in opposite direction when skew flips', async () => {
			const marginDelta = toUnit('1000000');
			const fillPrice = toUnit('100');
			await setPrice(baseAsset, fillPrice);
			await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, toUnit('0.25'), {
				from: owner,
			});

			// first trade occurs and causes a skew
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice,
				marginDelta,
				sizeDelta: toUnit('-100'),
			});

			// time passes
			await fastForward(5000);
			const fundingRate1 = await perpsV2Market.currentFundingRate();

			// a new trader appears and further adds to the skew.
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader2,
				fillPrice,
				marginDelta,
				sizeDelta: toUnit('-200'),
			});

			// time passes
			await fastForward(5000);

			// funding rate should continue to increase (but on the short side)
			assert.bnLt(await perpsV2Market.currentFundingRate(), fundingRate1);

			// a new trader appears, flips the skew in the opposite direction.
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader3,
				fillPrice,
				marginDelta,
				sizeDelta: toUnit('500'),
			});
			const fundingRate2 = await perpsV2Market.currentFundingRate(); // post skew flip

			// time passes
			await fastForward(10000);

			// expecting no change in funding rate
			assert.bnGte(await perpsV2Market.currentFundingRate(), fundingRate2);
		});

		it('Should cap the proportional max funding velocity', async () => {
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('400'), {
				from: owner,
			});
			const price = 250;

			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice: toUnit(price),
				marginDelta: toUnit('2000'),
				sizeDelta: toUnit('12'),
			});

			// we manipulate the skew_scale value to reach a proportional skew of > 1 or < -1. long/shorts
			// have a total of 6 permutations to test for:
			//
			//  - max_funding_velocity = 0.1
			//  - +/-12 skew
			//  - price = 250
			//
			// case 1: -1 < pSkew < 1 (long & between)
			// case 2: pSkew > 1      (long and exceeds 1)
			// case 3: pSkew = 1      (long and exactly cap)
			// case 4: -1 < pSkew < 1 (short & between)
			// case 5: pSkew < -1     (short and extends -1)
			// case 6: pSkew = -1     (short and exactly cap)

			// case (1)
			//
			// velocity = skew / skew_scale * max_funding_velocity
			//          = 12 / 400 * 0.1
			//          = 0.003
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('0.003'));

			// case (2)
			//
			// velocity = min(skew / skew_scale, 1) * max_funding_velocity
			//          = min(12 / 11, 1) * 0.1
			//          = min(1.09090909, 1) * 0.1
			//          = 0.1
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit(11), {
				from: owner,
			});
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('0.1'));

			// case (3)
			//
			// velocity = min(skew / skew_scale, 1) * max_funding_velocity
			//          = min(12 / 12, 1) * 0.1
			//          = min(1, 1) * 0.1
			//          = 0.1
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit(12), {
				from: owner,
			});
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('0.1'));

			// Flip the skew to short
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice: toUnit(price),
				marginDelta: toUnit('2000'), // 3x leverage (at $250)
				sizeDelta: toUnit('-24'),
			});

			// case (4)
			//
			// velocity = skew / skew_scale * max_funding_velocity
			//          = -12 / 400 * 0.1
			//          = -0.003
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit(400), {
				from: owner,
			});
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('-0.003'));

			// case (5)
			//
			// velocity = max(skew / skew_scale, -1) * max_funding_velocity
			//          = max(-12 / 11, -1) * 0.1
			//          = max(-1.09090909, -1) * 0.1
			//          = -1 * 0.1
			//          = -0.1
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit(11), {
				from: owner,
			});
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('-0.1'));

			// case (6)
			//
			// velocity = max(skew / skew_scale, -1) * max_funding_velocity
			//          = max(-12 / 12, -1) * 0.1
			//          = max(-1, -1) * 0.1
			//          = -1 * 0.1
			//          = -0.1
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit(12), {
				from: owner,
			});
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('-0.1'));
		});

		it('Should accrue no funding when position is zero-sized', async () => {
			const fillPrice = toUnit('100');
			await setPrice(baseAsset, fillPrice);
			await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, toUnit('0.25'), {
				from: owner,
			});

			// first trade occurs and causes a skew
			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice,
				marginDelta: toUnit('1000000'),
				sizeDelta: toUnit('-100'),
			});

			// time passes
			await fastForward(10000);

			// a trader without a size is a position tha does not exist.
			const res = await perpsV2Market.accruedFunding(trader2);
			assert.bnEqual(res[0], toUnit('0'));
		});

		it('Altering the max funding velocity has a proportional effect', async () => {
			const fillPrice = toUnit('250');
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('400'), {
				from: owner,
			});

			// 0, +-50%, +-100%
			assert.bnEqual(await perpsV2Market.currentFundingRate(), toUnit(0));

			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice,
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('12'),
			});

			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader2,
				fillPrice,
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-4'),
			});

			// velocity = skew / skew_scale * max_funding_velocity
			//          = 8 / 400 * 0.1
			//          = 0.002
			const expectedVelocity = toUnit('0.002');
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), expectedVelocity);

			// velocity = skew / skew_scale * max_funding_velocity
			//          = 8 / 400 * 0.2
			//          = 0.004
			//          ~2x because max_funding_velocity doubled.
			await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, toUnit('0.2'), { from: owner });
			assert.bnEqual(
				await perpsV2Market.currentFundingVelocity(),
				multiplyDecimal(expectedVelocity, toUnit(2))
			);

			// zero because `* 0`
			await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, toUnit('0'), { from: owner });
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('0'));
		});

		it('Altering the skewScale has a proportional effect', async () => {
			const fillPrice = toUnit('250');
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('400'), {
				from: owner,
			});

			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice,
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-12'),
			});

			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader2,
				fillPrice,
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('4'),
			});

			// why?
			//
			// velocity = skew / skew_scale * max_funding_velocity
			//          = -8 / 400 * 0.1
			//          = -0.002
			//
			// Note that we're negative here because we're skewed on the short side. Shorts pay the longs. A negative
			// velocity pushes the funding rate at the rate of 0.002 in short direction.
			const expectedVelocity = toUnit('-0.002');
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), expectedVelocity);

			// skew scale now halved from 400 -> 200
			// 	= -8 / 200 * 0.1
			// 	= -0.004
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit(200), {
				from: owner,
			});
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('-0.004'));

			// skew scale now halved from 200 -> 100
			// 	= -8 / 100 * 0.1
			// 	= -0.008
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit(100), {
				from: owner,
			});
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('-0.008'));

			// skew scale (double from original) from 100 -> 800
			// 	= -8 / 800 * 0.1
			// 	= -0.001
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit(800), {
				from: owner,
			});
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('-0.001'));

			// skewScale is twice as small as the market size
			//  = max(-8 / 4), -1) * 0.1
			//  = max(-2, -1) * 0.1
			//  = -1 * 0.1
			//  = -0.1
			//
			// note: min/max is applied to all velocity changes but since is skewScale never below size then we
			// ignore that for simplicity.
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit(4), { from: owner });
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('-0.1'));
		});

		for (const leverage of ['1', '-1'].map(toUnit)) {
			const side = parseInt(leverage.toString()) > 0 ? 'long' : 'short';

			describe(`${side}`, () => {
				beforeEach(async () => {
					await perpsV2MarketSettings.setMaxMarketValue(marketKey, toUnit('1000'), {
						from: owner,
					});
				});

				it('100% skew induces maximum funding velocity', async () => {
					// maxMarketValue = 1000 (size)
					// sizeDelta = 10000 / 10
					//           = 1000
					//
					// sizeDelta = maxMarketValue (for both long and short (1, -1).
					const sizeDelta = divideDecimal(multiplyDecimal(leverage, toUnit('10000')), toUnit('10'));

					// set skewScale such that size/skewScale = 1 so we get 100% at max velocity.
					await perpsV2MarketSettings.setSkewScale(marketKey, sizeDelta.abs(), { from: owner });

					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader,
						fillPrice: toUnit('1'),
						marginDelta: toUnit('1000000'),
						sizeDelta,
					});
					const expected = side === 'long' ? maxFundingVelocity : -maxFundingVelocity;

					assert.bnEqual(await perpsV2Market.currentFundingVelocity(), expected);
				});

				it('Different skew rates induce proportional funding velocity levels', async () => {
					const price = toUnit('100');
					await setPrice(baseAsset, price);

					const skewScale = toUnit('100');
					await perpsV2MarketSettings.setSkewScale(marketKey, skewScale, { from: owner });

					// assuming leverage is positive (1) then...
					//
					// size = 1 * 10
					//      = 10
					//
					// t1_position = price * size
					//             = 100 * 10
					//             = 1000 (margin also at 1000)
					//             = 1x leverage long
					//
					// at this stage, given the market only has one position we are at 100% skewed long (size=10)
					const traderPos = leverage.mul(toBN('10'));
					await transferMarginAndModifyPosition({
						market: perpsV2Market,
						account: trader,
						fillPrice: price,
						marginDelta: toUnit('1000'),
						sizeDelta: traderPos,
					});

					// t2_position = empty (just transferred 1k USD margin)
					await perpsV2Market.transferMargin(toUnit('1000'), { from: trader2 });

					const points = 5;

					// no price movement, just refresh prices.
					await setPrice(baseAsset, toUnit('100'));

					// we're about to create a position (t2) in the opposite direction to the skew.
					for (const maxFundingVelocity of ['0.1', '0.2', '0.05'].map(toUnit)) {
						await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, maxFundingVelocity, {
							from: owner,
						});

						for (let i = points; i >= 0; i--) {
							// calculations:
							// frac              = leverage * point / points
							// opposite_leverage = frac * -1
							// size              = opposite_leverage * 10
							//
							// let's continue to assume we're skewed long but at iteration (2). iteration 1 is
							// boring. a 100% skew offset will just result in a 0 funding velocity. 0.8 is a
							// more interesting example.
							//
							// define:
							// 	- points = 5
							// 	- i = 4
							// 	- leverage = 1
							// 	- max_funding_velocity = 0.1
							//
							// frac = leverage * point / points
							//      = 1 * 4 / 5
							//      = 0.8
							//
							// opp_lev = -frac
							//         = -0.8
							//
							// size = -0.8 * 10
							//      = -8
							const frac = leverage.mul(toBN(i)).div(toBN(points));
							const oppLev = frac.neg();
							const size = oppLev.mul(toBN('10'));

							// update the t2's size in the opposite direction. pushing the skew back.
							//
							// following the same example, a -8 size gives a skew of now 2 (still long)
							if (size.abs().gt(toBN('0'))) {
								await perpsV2Market.modifyPosition(size, priceImpactDelta, { from: trader2 });
							}

							// so what is the skew then?
							//
							// skew_usd = t1.size + size
							//          = 10 + -8
							//          = 2
							const skew = traderPos.add(size);

							// derive the expected funding velocity
							//
							// expected = skew / skew_scale * max_funding_velocity
							//          = 2 / 100 * 0.1
							//          = 0.002
							const expected = multiplyDecimal(divideDecimal(skew, skewScale), maxFundingVelocity);

							assert.bnEqual(await perpsV2Market.currentFundingVelocity(), expected);

							// clear the position as to avoid affecting the next proportional skew update.
							if (size.abs().gt(toBN(0))) {
								await perpsV2Market.closePosition(priceImpactDelta, { from: trader2 });
							}
						}
					}
				});
			});
		}

		it('Velocity can be paused when market is paused', async () => {
			assert.bnEqual(await perpsV2Market.currentFundingRate(), toUnit(0));

			const price = toUnit('250');
			await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('400'), {
				from: owner,
			});

			await transferMarginAndModifyPosition({
				market: perpsV2Market,
				account: trader,
				fillPrice: price,
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('12'),
			});

			const SECS_IN_DAY = 60 * 60 * 24;

			// 12hrs
			await fastForward(SECS_IN_DAY / 2);

			// velocity     = skew / skew_scale * max_funding_velocity
			// funding_rate = prev_funding_rate + (velocity * (time_delta / seconds_in_day))

			// velocity = 12 / 400 * 0.1
			//          = 0.003
			//
			// funding_rate = 0 + (0.003 * (43200 / 86400)) + <very_small_buffer>
			//              = 0 + (0.003 * 0.5) + <very_small_buffer>
			//              = ~0.0015
			const fundingRate = toUnit('0.0015');
			assert.bnClose(await perpsV2Market.currentFundingRate(), fundingRate, toUnit('0.001'));

			// Why 0.003?
			//
			// velocity = skew / skew_scale * max_funding_velocity
			//          = 12 / 400 * 0.1
			//          = 0.003
			const fundingVelocity = await perpsV2Market.currentFundingVelocity();
			assert.bnEqual(fundingVelocity, toUnit('0.003'));

			// 2 days
			await fastForward(SECS_IN_DAY * 2);
			await setPrice(baseAsset, price);

			// pause the market
			await systemStatus.suspendFuturesMarket(marketKey, '0', { from: owner });

			// no changed maxFundingVelocity, only a pause in the market. this allows for velocity to continue to go.
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('0.003'));

			// set maxFundingVelocity=0 - this will stop velocity from increasing and hence funding rate to move
			await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, toUnit('0'), { from: owner });

			// velocity should now be 0.
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('0'));

			// accrued funding right after the pause.
			const accrued = (await perpsV2Market.accruedFunding(trader))[0];

			// 2 days of pause
			await fastForward(SECS_IN_DAY * 2);
			await setPrice(baseAsset, price);

			// funding accrual is expected to continue.
			assert.bnGt((await perpsV2Market.accruedFunding(trader))[0].abs(), accrued.abs());

			// we also expect velocity to remain at 0
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('0'));

			// set max funding velocity to 0.1 again
			await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, toUnit('0.1'), { from: owner });

			// resume
			await systemStatus.resumeFuturesMarket(marketKey, { from: owner });

			// 1 day
			await fastForward(SECS_IN_DAY);
			await setPrice(baseAsset, price);

			// check more funding accrued
			assert.bnGt((await perpsV2Market.accruedFunding(trader))[0].abs(), accrued.abs());

			// and velocity is back to non-zero
			assert.bnEqual(await perpsV2Market.currentFundingVelocity(), toUnit('0.003'));
		});

		describe('Funding sequence', () => {
			const price = toUnit('100');

			beforeEach(async () => {
				// Set up some market skew so that funding is being incurred.
				// Proportional Skew = 0.5, so funding rate is 0.05 per day.
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: price,
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('90'),
				});

				await transferMarginAndModifyPosition({
					market: perpsV2Market,
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
				await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('100'), { from: owner });

				// Initial sequence.
				assert.bnEqual(
					await perpsV2Market.fundingSequenceLength(),
					initialFundingIndex.add(toBN(6))
				);

				// 1d passed
				await fastForward(24 * 60 * 60);

				// ~1 day has passed ~86400 seconds (+2 second buffer)
				//
				// unrecordedFunding = -(prevFundingRate + currentFundingRate) / 2 * (elapsed / 86400) * price
				//                   = -(4.861111109e-09 + 0.06000069930555555) / 2 * (86400 / 86400) * 100
				//                   = -(4.86111111109e-07 + 0.06000048611111111) / 2 * 1 * 100
				//                   = -0.06000070416666666 / 2 * 1 * 100
				//                   = -0.03000035 * 1 * 100
				//                   = -3.000035
				//
				// note: we invert the avgFundingRate here because accrual is paid in the opposite direction.
				// note: it's slightly under -3.000352 because elapsed isn't exactly 1 during tests (~1.000011574074074)
				assert.bnClose(
					(await perpsV2Market.unrecordedFunding())[0],
					toUnit('-3.0000486'),
					toUnit('0.001')
				);

				// updating velocity should also trigger an update to recorded funding
				await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, toUnit('0.2'), {
					from: owner,
				});
				const time = await currentTime();

				// Ensure funding is recomputed when maxFundingVelocity is updated.
				//
				// no additional time has passed. funding seq remains the same (but there should be an additional entry)
				assert.bnEqual(
					await perpsV2Market.fundingSequenceLength(),
					initialFundingIndex.add(toBN(7))
				);
				assert.bnEqual(await perpsV2Market.fundingLastRecomputed(), time);
				assert.bnClose(
					await perpsV2Market.fundingSequence(initialFundingIndex.add(toBN(6))),
					toUnit('-3.0000486'),
					toUnit('0.001')
				);

				assert.bnClose((await perpsV2Market.unrecordedFunding())[0], toUnit('0'), toUnit('0.01'));

				// Another day has passed.
				//
				// unrecordedFunding = -(prevFundingRate + currentFundingRate) / 2 * (elapsed / 86400) * price
				//                   = -(0.060001180555555554 + 0.18000118055555556) / 2 * (86400 / 86400) * 100
				//                   = -0.24000236 / 2 * 1 * 100
				//                   = -12.000118
				//
				// no change in funding rates. skew has not moved.
				await fastForward(24 * 60 * 60);
				assert.bnClose(
					(await perpsV2Market.unrecordedFunding())[0],
					toUnit('-12.0000699'),
					toUnit('0.0001')
				);
				assert.bnEqual(
					await perpsV2Market.fundingSequenceLength(),
					initialFundingIndex.add(toBN(7))
				);

				// Another day has passed (note we haven't updated the funding sequence).
				//
				// unrecordedFunding = -(prevFundingRate + currentFundingRate) / 2 * (elapsed / 86400) * price
				//                   = -(0.060001180555555554 + 0.3000011805555556) / 2 * ((86400 * 2) / 86400) * 100
				//                   = -0.36000236 / 2 * 2 * 100
				//                   = -36.000236
				//
				// additional note: since funding was not updated, fundingLastRecomputed is also unchanged. this means
				// elapsed is actually 2 days, not 1.
				await fastForward(24 * 60 * 60);
				assert.bnClose(
					(await perpsV2Market.unrecordedFunding())[0],
					toUnit('-36.00014'),
					toUnit('0.0001')
				);
				// no change in the funding sequence
				assert.bnEqual(
					await perpsV2Market.fundingSequenceLength(),
					initialFundingIndex.add(toBN(7))
				);
			});
		});
	});

	describe('Market Debt', () => {
		it('Basic debt movements', async () => {
			assert.bnEqual(await perpsV2Market.entryDebtCorrection(), toUnit('0'));
			assert.bnEqual((await perpsV2Market.marketDebt())[0], toUnit('0'));

			const price1 = toUnit('100');
			await setPrice(baseAsset, price1);
			const size1 = toUnit('50');
			const margin1 = toUnit('1000');
			const fillPrice1 = (await perpsV2Market.fillPriceWithBasePrice(size1, 0))[0];

			// debtCorrection (so far) = 1000
			await perpsV2Market.transferMargin(margin1, { from: trader });
			const fee1 = (await perpsV2Market.orderFee(size1, orderType))[0];

			// debtCorrection = debtCorrection - (50 * fillPrice) - fee1
			await perpsV2Market.modifyPosition(size1, priceImpactDelta, { from: trader });

			const expectedDebtCorrection1 = margin1.sub(multiplyDecimal(fillPrice1, size1)).sub(fee1);

			// marketDebt = skew * priceWithFunding + debtCorrection
			//            = 50 * 100 + expectedDebtCorrection
			//            = 5000 - expectedDebtCorrection
			//
			// note: not fillPrice, but price.
			const expectedDebt1 = multiplyDecimal(size1, price1).add(expectedDebtCorrection1);

			assert.bnEqual(await perpsV2Market.entryDebtCorrection(), expectedDebtCorrection1);
			assert.bnEqual((await perpsV2Market.marketDebt())[0], expectedDebt1);

			const price2 = toUnit('120');
			await setPrice(baseAsset, price2);
			const size2 = toUnit('-35');
			const margin2 = toUnit('600');
			const fillPrice2 = (await perpsV2Market.fillPriceWithBasePrice(size2, 0))[0];

			// debtCorrection (so far) = expectedDebtConnection1 + 600
			await perpsV2Market.transferMargin(margin2, { from: trader2 });
			const fee2 = (await perpsV2Market.orderFee(size2, orderType))[0];
			await perpsV2Market.modifyPosition(size2, priceImpactDelta, { from: trader2 });

			const expectedDebtCorrection2 = expectedDebtCorrection1.add(
				margin2.sub(multiplyDecimal(fillPrice2, size2)).sub(fee2)
			);

			// marketDebt = skew * priceWithFunding + debtCorrection
			//            = (50 + -35) * 120 + smallAmountOfFunding + expectedDebtCorrection
			//            = 15 * 120 + smallAmountOfFunding + expectedDebtCorrection
			//            = 1800 + smallAmountOfFunding - expectedDebtCorrection
			//
			// note: not fillPrice, but price.
			const expectedDebt2 = multiplyDecimal(size1.add(size2), price2).add(expectedDebtCorrection2);

			// bnClose here because of funding.
			assert.bnClose(
				await perpsV2Market.entryDebtCorrection(),
				expectedDebtCorrection2,
				toUnit('0.1')
			);
			assert.bnClose((await perpsV2Market.marketDebt())[0], expectedDebt2, toUnit('0.1'));

			// closing the position and removing remaining margin is the same as modify -size and transfer -margin. we
			// will apply the same logic.
			const price3 = toUnit('110');

			// note: call here so we give ourselves a chance to get fillPrice before manipulating the position.
			await setPrice(baseAsset, price3);

			// get the position's margin/size before we close and withdraw. we .neg here because we're closing.
			// const position = await perpsV2Market.positions(trader);
			// const size3 = toBN(position.size).neg();
			// const margin3 = toBN(position.margin);
			// const fee3 = (await perpsV2Market.orderFee(size3))[0];
			// const fillPrice3 = (await perpsV2Market.fillPriceWithBasePrice(size3, 0))[0];

			await closePositionAndWithdrawMargin({
				market: perpsV2Market,
				account: trader,
				fillPrice: price3,
			});

			// TODO: Understand the math behind debtCorrections when closing a position.
			//
			// calculation is the same except also consider what the debt correction looks like when we also withdraw
			// the margin.
			//
			// during the withdrawal we calc the delta with and without margin. since it was closed the size would be 0.
			//
			// positionDebtCorrectionBefore = margin - (size * (lastPrice + funding))
			//                              = margin3 - (0 * (...))
			//                              = margin3
			// const expectedDebtCorrection3 = expectedDebtCorrection2.add(
			// 	margin3.sub(multiplyDecimal(fillPrice3, size3)).sub(fee3)
			// );

			// assert.bnClose(
			// 	await perpsV2Market.entryDebtCorrection(),
			// 	expectedDebtCorrection3,
			// 	toUnit('10')
			// );
			// assert.bnClose((await perpsV2Market.marketDebt())[0], toUnit('950'), toUnit('10'));

			await closePositionAndWithdrawMargin({
				market: perpsV2Market,
				account: trader2,
				fillPrice: toUnit('100'),
			});

			assert.bnEqual(await perpsV2Market.entryDebtCorrection(), toUnit('0'));
			assert.bnEqual((await perpsV2Market.marketDebt())[0], toUnit('0'));
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
			assert.isFalse((await perpsV2Market.marketDebt())[1]);
			await fastForward(7 * 24 * 60 * 60);
			assert.isTrue((await perpsV2Market.marketDebt())[1]);
		});

		describe('Market debt is accurately reflected in total system debt', () => {
			it('Margin transfers do not alter total system debt', async () => {
				const debt = (await debtCache.currentDebt())[0];
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				assert.bnEqual((await debtCache.currentDebt())[0], debt);
				await perpsV2Market.transferMargin(toUnit('-500'), { from: trader });
				assert.bnEqual((await debtCache.currentDebt())[0], debt);
			});

			it('Prices altering market debt are reflected in total system debt', async () => {
				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('100'),
				});

				await transferMarginAndModifyPosition({
					market: perpsV2Market,
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
			const getExpectedLiquidationPrice = async ({
				skewScale,
				margin,
				size,
				fillPrice,
				price,
				fee,
				account,
				minFee,
				feeRatio,
				bufferRatio,
				liquidationPremiumMultiplier,
			}) => {
				const defaultLiquidationBufferRatio = toUnit('0.0025');
				const defaultLiquidationFeeRatio = toUnit('0.0035');
				const defaultLiquidationMinFee = toUnit('20'); // 20 sUSD
				const defaultLiquidationPremiumMultiplier = toUnit('1'); // *1

				const liqMinFee = minFee || defaultLiquidationMinFee;
				const liqFeeRatio = feeRatio || defaultLiquidationFeeRatio;
				const liqBufferRatio = bufferRatio || defaultLiquidationBufferRatio;
				const liqPremiumMultiplier =
					liquidationPremiumMultiplier || defaultLiquidationPremiumMultiplier;

				// How is the liquidation price calculated?
				//
				// liqFee    = max(abs(size) * price * liquidationFeeRatio, minFee)
				// liqMargin = abs(pos.size) * price * liquidationBufferRatio + liqFee
				// liqPrice  = pos.lastPrice + (liqMargin - (pos.margin - fees - premium)) / pos.size - fundingPerUnit

				const expectedNetFundingPerUnit = await perpsV2Market.netFundingPerUnit(account);
				const expectedLiquidationFee = BN.max(
					multiplyDecimal(multiplyDecimal(size.abs(), price), liqFeeRatio),
					liqMinFee
				);
				const expectedLiquidationMargin = multiplyDecimal(
					multiplyDecimal(size.abs(), price),
					liqBufferRatio
				).add(expectedLiquidationFee);

				const premium = multiplyDecimal(
					multiplyDecimal(divideDecimal(size.abs(), skewScale), multiplyDecimal(size.abs(), price)),
					liqPremiumMultiplier
				);

				//  moving around: price = lastPrice + (liquidationMargin - margin - liqPremium) / positionSize - netFundingPerUnit
				// note: we use fillPrice here because this the same as position.lastPrice
				return fillPrice
					.add(divideDecimal(expectedLiquidationMargin.sub(margin.sub(fee).sub(premium)), size))
					.sub(expectedNetFundingPerUnit);
			};

			it('Liquidation price is accurate with funding', async () => {
				const price = toUnit('100');
				await setPrice(baseAsset, price);

				const margin1 = toUnit('1000');
				const size1 = toUnit('100');
				const fee1 = (await perpsV2Market.orderFee(size1, orderType))[0];
				const fillPrice1 = (await perpsV2Market.fillPriceWithBasePrice(size1, 0))[0];
				await perpsV2Market.transferMargin(margin1, { from: trader });
				await perpsV2Market.modifyPosition(size1, priceImpactDelta, { from: trader });

				const margin2 = toUnit('1000');
				const size2 = toUnit('-100');
				const fee2 = (await perpsV2Market.orderFee(size2, orderType))[0];
				const fillPrice2 = (await perpsV2Market.fillPriceWithBasePrice(size2, 0))[0];
				await perpsV2Market.transferMargin(margin2, { from: trader2 });
				await perpsV2Market.modifyPosition(size2, priceImpactDelta, { from: trader2 });

				const expectedLiquidationPrice1 = await getExpectedLiquidationPrice({
					skewScale,
					margin: margin1,
					size: size1,
					fillPrice: fillPrice1,
					fee: fee1,
					price,
					account: trader,
				});

				const liquidationPrice1 = await perpsV2Market.liquidationPrice(trader);

				assert.bnEqual(liquidationPrice1.price, expectedLiquidationPrice1);
				assert.isFalse(liquidationPrice1.invalid);

				const expectedLiquidationPrice2 = await getExpectedLiquidationPrice({
					skewScale,
					margin: margin2,
					size: size2,
					fillPrice: fillPrice2,
					fee: fee2,
					price,
					account: trader2,
				});

				const liquidationPrice2 = await perpsV2Market.liquidationPrice(trader2);

				assert.bnEqual(liquidationPrice2.price, expectedLiquidationPrice2);
				assert.isFalse(liquidationPrice2.invalid);
			});

			it('Liquidation price is accurate if the liquidation margin changes', async () => {
				const price = toUnit('250');
				await setPrice(baseAsset, price);

				const margin1 = toUnit('1000');
				const size1 = toUnit('20');
				const fee1 = (await perpsV2Market.orderFee(size1, orderType))[0];
				const fillPrice1 = (await perpsV2Market.fillPriceWithBasePrice(size1, 0))[0];
				await perpsV2Market.transferMargin(margin1, { from: trader });
				await perpsV2Market.modifyPosition(size1, priceImpactDelta, { from: trader });

				const margin2 = toUnit('1000');
				const size2 = toUnit('-20');
				const fee2 = (await perpsV2Market.orderFee(size2, orderType))[0];
				const fillPrice2 = (await perpsV2Market.fillPriceWithBasePrice(size2, 0))[0];
				await perpsV2Market.transferMargin(margin2, { from: trader2 });
				await perpsV2Market.modifyPosition(size2, priceImpactDelta, { from: trader2 });

				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin1,
						size: size1,
						fillPrice: fillPrice1,
						fee: fee1,
						price,
						account: trader,
					})
				);
				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader2)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin2,
						size: size2,
						fillPrice: fillPrice2,
						fee: fee2,
						price,
						account: trader2,
					})
				);

				// change the minimum liquidation fee
				const minFee = toUnit('100');
				await perpsV2MarketSettings.setMinKeeperFee(minFee, { from: owner });

				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin1,
						size: size1,
						fillPrice: fillPrice1,
						fee: fee1,
						price,
						account: trader,
						minFee,
					})
				);
				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader2)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin2,
						size: size2,
						fillPrice: fillPrice2,
						fee: fee2,
						price,
						account: trader2,
						minFee,
					})
				);

				// change the fee ratio
				//
				// note: we include `minFee` because it was updated globally previously
				const feeRatio = toUnit('0.03');
				await perpsV2MarketSettings.setLiquidationFeeRatio(feeRatio, { from: owner });
				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin1,
						size: size1,
						fillPrice: fillPrice1,
						fee: fee1,
						price,
						account: trader,
						feeRatio,
						minFee,
					})
				);
				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader2)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin2,
						size: size2,
						fillPrice: fillPrice2,
						fee: fee2,
						price,
						account: trader2,
						feeRatio,
						minFee,
					})
				);

				// change the buffer ratio
				//
				// note: we include the `feeRatio` for the same reason as `minFee`
				const bufferRatio = toUnit('0.03');
				await perpsV2MarketSettings.setLiquidationBufferRatio(bufferRatio, { from: owner });
				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin1,
						size: size1,
						fillPrice: fillPrice1,
						fee: fee1,
						price,
						account: trader,
						feeRatio,
						minFee,
						bufferRatio,
					})
				);
				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader2)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin2,
						size: size2,
						fillPrice: fillPrice2,
						fee: fee2,
						price,
						account: trader2,
						feeRatio,
						minFee,
						bufferRatio,
					})
				);

				// reset all config vars to zero.
				const zero = toUnit('0');
				await perpsV2MarketSettings.setMinKeeperFee(zero, { from: owner });
				await perpsV2MarketSettings.setLiquidationFeeRatio(zero, { from: owner });
				await perpsV2MarketSettings.setLiquidationBufferRatio(zero, { from: owner });

				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin1,
						size: size1,
						fillPrice: fillPrice1,
						fee: fee1,
						price,
						account: trader,
						feeRatio: zero,
						minFee: zero,
						bufferRatio: zero,
					})
				);
				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader2)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin2,
						size: size2,
						fillPrice: fillPrice2,
						fee: fee2,
						price,
						account: trader2,
						feeRatio: zero,
						minFee: zero,
						bufferRatio: zero,
					})
				);
			});

			it('Liquidation price is accurate with funding (ff 1 day)', async () => {
				const skewScale = toUnit('1000');
				await perpsV2MarketSettings.setSkewScale(marketKey, skewScale, { from: owner });

				const price = toUnit('250');
				await setPrice(baseAsset, price);

				// submit orders that induces an initial 0.05 funding rate. the market is currently long by 20 size
				const margin1 = toUnit('1500');
				const size1 = toUnit('30');
				const fee1 = (await perpsV2Market.orderFee(size1, orderType))[0];
				const fillPrice1 = (await perpsV2Market.fillPriceWithBasePrice(size1, 0))[0];
				await perpsV2Market.transferMargin(margin1, { from: trader });
				await perpsV2Market.modifyPosition(size1, priceImpactDelta, { from: trader });

				const margin2 = toUnit('1500');
				const size2 = toUnit('-10');
				const fee2 = (await perpsV2Market.orderFee(size2, orderType))[0];
				const fillPrice2 = (await perpsV2Market.fillPriceWithBasePrice(size2, 0))[0];
				await perpsV2Market.transferMargin(margin2, { from: trader2 });
				await perpsV2Market.modifyPosition(size2, priceImpactDelta, { from: trader2 });

				// note: the funding rate as grown by a small amount between the first modify and 2nd transfer.
				// to be specific, in this example funding grew by `0.00000173611111111` (proportional to the 30 size
				// for roughly 3 - 4 seconds).
				//
				// this means the induced funding rate is actually 0.05 + <small_funding_rate>. for clarity, fundingPerUnit
				// is derived by the funding rate.

				// 1 day of funding
				await fastForward(24 * 60 * 60);

				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin1,
						size: size1,
						fillPrice: fillPrice1,
						fee: fee1,
						price,
						account: trader,
					})
				);
				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader2)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin2,
						size: size2,
						fillPrice: fillPrice2,
						fee: fee2,
						price,
						account: trader2,
					})
				);
			});

			it('Liquidation price reports invalidity properly', async () => {
				const skewScale = toUnit('1000');
				await perpsV2MarketSettings.setSkewScale(marketKey, skewScale, { from: owner });

				await setPrice(baseAsset, toUnit('250'));
				await perpsV2Market.transferMargin(toUnit('1500'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('30'), priceImpactDelta, { from: trader });
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsV2Market.modifyPosition(toUnit('-20'), priceImpactDelta, { from: trader2 });

				assert.isFalse((await perpsV2Market.liquidationPrice(trader))[1]);

				await fastForward(60 * 60 * 24 * 7); // Stale the price

				const lPriceT1 = await perpsV2Market.liquidationPrice(trader);
				assert.isTrue(lPriceT1[1]);
				const lPriceT2 = await perpsV2Market.liquidationPrice(trader2);
				assert.isTrue(lPriceT2[1]);
			});

			it.skip('Liquidation price is accurate with funding with intervening funding sequence updates', async () => {
				// TODO: confirm order -> a bunch of trades from other traders happen over a time period -> check the liquidation price given that most of the accrued funding is not unrecorded
				assert.isTrue(false);
			});

			it('Liquidation price is accurate if the liquidation premium multiplier changes', async () => {
				await perpsV2MarketSettings.setLiquidationPremiumMultiplier(marketKey, toUnit('1'), {
					from: owner,
				});

				const price = toUnit('250');
				await setPrice(baseAsset, price);

				const margin1 = toUnit('1000');
				const size1 = toUnit('20');
				const fee1 = (await perpsV2Market.orderFee(size1, orderType))[0];
				const fillPrice1 = (await perpsV2Market.fillPriceWithBasePrice(size1, 0))[0];
				await perpsV2Market.transferMargin(margin1, { from: trader });
				await perpsV2Market.modifyPosition(size1, priceImpactDelta, { from: trader });

				const margin2 = toUnit('1000');
				const size2 = toUnit('-20');
				const fee2 = (await perpsV2Market.orderFee(size2, orderType))[0];
				const fillPrice2 = (await perpsV2Market.fillPriceWithBasePrice(size2, 0))[0];
				await perpsV2Market.transferMargin(margin2, { from: trader2 });
				await perpsV2Market.modifyPosition(size2, priceImpactDelta, { from: trader2 });

				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin1,
						size: size1,
						fillPrice: fillPrice1,
						fee: fee1,
						price,
						account: trader,
					})
				);
				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader2)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin2,
						size: size2,
						fillPrice: fillPrice2,
						fee: fee2,
						price,
						account: trader2,
					})
				);

				// change the minimum liquidation fee
				const liquidationPremiumMultiplier = toUnit('5');
				await perpsV2MarketSettings.setLiquidationPremiumMultiplier(
					marketKey,
					liquidationPremiumMultiplier,
					{
						from: owner,
					}
				);

				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin1,
						size: size1,
						fillPrice: fillPrice1,
						fee: fee1,
						price,
						account: trader,
						liquidationPremiumMultiplier,
					})
				);
				assert.bnEqual(
					(await perpsV2Market.liquidationPrice(trader2)).price,
					await getExpectedLiquidationPrice({
						skewScale,
						margin: margin2,
						size: size2,
						fillPrice: fillPrice2,
						fee: fee2,
						price,
						account: trader2,
						liquidationPremiumMultiplier,
					})
				);
			});

			it('No liquidation price on an empty position', async () => {
				assert.bnEqual((await perpsV2Market.liquidationPrice(noBalance))[0], toUnit(0));
			});
		});

		describe('canLiquidate', () => {
			it('Can liquidate an underwater position', async () => {
				let price = toUnit('250');
				await setPrice(baseAsset, price);
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('20'), priceImpactDelta, { from: trader });

				price = (await perpsV2Market.liquidationPrice(trader)).price;
				await setPrice(baseAsset, price.sub(toUnit(1)));
				// The reason the price is imprecise is that the previously queried
				// liquidation price was calculated using:
				// 1. unrecorded funding assuming the previous price (depends on price)
				// 2. liquidation margin assuming the previous price (depends on price)
				// When price is changed artificially this results in a slightly different
				// undercorded funding, and slightly different liquidation margin which causes the actual
				// liquidation price to be slightly different.
				// A precise calculation would be a) incorrect and b) cumbersome.
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
				// So a keeper querying canLiquidate() or simulating the liquidation
				// tx would have the correct liquidation price, and canLiquidate() result.
				assert.isTrue(await perpsV2Market.canLiquidate(trader));
				await perpsV2Market.liquidatePosition(trader);
			});

			it('Empty positions cannot be liquidated', async () => {
				assert.isFalse(await perpsV2Market.canLiquidate(trader));
			});

			it('No liquidations while prices are invalid', async () => {
				await setPrice(baseAsset, toUnit('250'));
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('20'), priceImpactDelta, { from: trader });

				await setPrice(baseAsset, toUnit('25'));
				assert.isTrue(await perpsV2Market.canLiquidate(trader));
				await fastForward(60 * 60 * 24 * 7); // Stale the price
				assert.isFalse(await perpsV2Market.canLiquidate(trader));
			});

			it('No liquidations while the system is suspended', async () => {
				await setPrice(baseAsset, toUnit('250'));
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('20'), priceImpactDelta, { from: trader });
				await setPrice(baseAsset, toUnit('25'));
				assert.isTrue(await perpsV2Market.canLiquidate(trader));

				// suspend
				await systemStatus.suspendSystem('3', { from: owner });
				assert.isFalse(await perpsV2Market.canLiquidate(trader));

				// resume
				await systemStatus.resumeSystem({ from: owner });
				// should work now
				assert.isTrue(await perpsV2Market.canLiquidate(trader));
			});

			it('No liquidations while the synth is suspended', async () => {
				await setPrice(baseAsset, toUnit('250'));
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('20'), priceImpactDelta, { from: trader });
				await setPrice(baseAsset, toUnit('25'));
				assert.isTrue(await perpsV2Market.canLiquidate(trader));

				// suspend
				await systemStatus.suspendSynth(baseAsset, 65, { from: owner });
				assert.isFalse(await perpsV2Market.canLiquidate(trader));

				// resume
				await systemStatus.resumeSynth(baseAsset, { from: owner });
				// should work now
				assert.isTrue(await perpsV2Market.canLiquidate(trader));
			});
		});

		describe('liquidatePosition', () => {
			beforeEach(async () => {
				await setPrice(baseAsset, toUnit('250'));
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader3 });
				await perpsV2Market.modifyPosition(toUnit('40'), priceImpactDelta, { from: trader });
				await perpsV2Market.modifyPosition(toUnit('20'), priceImpactDelta, { from: trader2 });
				await perpsV2Market.modifyPosition(toUnit('-20'), priceImpactDelta, { from: trader3 });
				// Exchange fees total 60 * 250 * 0.003 + 20 * 250 * 0.001 = 50
			});

			it('Cannot liquidate nonexistent positions', async () => {
				await assert.revert(
					perpsV2Market.liquidatePosition(noBalance),
					'Position cannot be liquidated'
				);
			});

			it('Liquidation properly affects the overall market parameters (long case)', async () => {
				const skewScale = toUnit('1000');
				await perpsV2MarketSettings.setSkewScale(marketKey, skewScale, { from: owner });

				await fastForward(24 * 60 * 60); // wait one day to accrue a bit of funding

				const size = await perpsV2Market.marketSize();
				const sizes = await perpsV2Market.marketSizes();
				const skew = await perpsV2Market.marketSkew();
				const positionSize = toBN((await perpsV2Market.positions(trader)).size);

				assert.isFalse(await perpsV2Market.canLiquidate(trader));
				assert.isFalse(await perpsV2Market.canLiquidate(trader2));

				const price = toUnit('200');
				await setPrice(baseAsset, price);

				assert.isTrue(await perpsV2Market.canLiquidate(trader));
				assert.isTrue(await perpsV2Market.canLiquidate(trader2));

				// Note at this point the true market debt should be $2000 ($1000 profit for the short trader, and two
				// liquidated longs). However, the long positions are actually underwater and the negative
				// contribution is not removed until liquidation
				//
				// marketDebt is impacted by funding (priceWithFunding) and debtCorrection, which affects marketDebt,
				// is also affected by p/d as lastPrice stored on the position is the fillPrice (impacted by sizeDelta).
				//
				// nextFundingEntry = lastFundingEntry + unrecordedFunding
				// priceWithFunding = price + nextFundingEntry
				//
				// skew = 40 + 20 - 20
				//      = 40 (skewed long = funding positive and negative funding entry
				//
				// marketDebt = skew * priceWithFunding + debtCorrection
				assert.bnClose((await perpsV2Market.marketDebt())[0], toUnit('931.98'), toUnit('0.1'));
				assert.bnClose(
					(await perpsV2Market.unrecordedFunding())[0],
					toUnit('-0.4000188'),
					toUnit('0.0001')
				);

				await perpsV2Market.liquidatePosition(trader, { from: noBalance });

				assert.bnEqual(await perpsV2Market.marketSize(), size.sub(positionSize.abs()));
				let newSizes = await perpsV2Market.marketSizes();
				assert.bnEqual(newSizes[0], sizes[0].sub(positionSize.abs()));
				assert.bnEqual(newSizes[1], sizes[1]);
				assert.bnEqual(await perpsV2Market.marketSkew(), skew.sub(positionSize.abs()));
				assert.bnClose((await perpsV2Market.marketDebt())[0], toUnit('1979.98'), toUnit('0.01'));

				// Funding has been recorded by the liquidation.
				assert.bnClose((await perpsV2Market.unrecordedFunding())[0], toUnit(0), toUnit('0.01'));

				await perpsV2Market.liquidatePosition(trader2, { from: noBalance });

				assert.bnEqual(await perpsV2Market.marketSize(), toUnit('20'));
				newSizes = await perpsV2Market.marketSizes();
				assert.bnEqual(newSizes[0], toUnit('0'));
				assert.bnEqual(newSizes[1], toUnit('20'));
				assert.bnEqual(await perpsV2Market.marketSkew(), toUnit('-20'));

				// Market debt is now just the remaining position, plus the funding they've made.
				assert.bnClose((await perpsV2Market.marketDebt())[0], toUnit('2005.498'), toUnit('0.001'));
			});

			it('Liquidation properly affects the overall market parameters (short case)', async () => {
				await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('57.14285714'), { from: owner });

				await fastForward(24 * 60 * 60); // wait one day to accrue a bit of funding

				const size = await perpsV2Market.marketSize();
				const sizes = await perpsV2Market.marketSizes();
				const positionSize = toBN((await perpsV2Market.positions(trader3)).size);

				await setPrice(baseAsset, toUnit('350'));

				// marketDebt is impacted by funding. specifically,
				//
				// nextFundingEntry = lastFundingEntry + unrecordedFunding
				// priceWithFunding = price + nextFundingEntry
				//
				// skew = 40 + 20 - 20
				//      = 40 (skewed long = funding positive and negative funding entry
				assert.bnClose((await perpsV2Market.marketDebt())[0], toUnit('6457.96'), toUnit('0.1'));
				assert.bnClose(
					(await perpsV2Market.unrecordedFunding())[0],
					toUnit('-12.2505677'),
					toUnit('0.0001')
				);

				await perpsV2Market.liquidatePosition(trader3, { from: noBalance });

				assert.bnEqual(await perpsV2Market.marketSize(), size.sub(positionSize.abs()));
				const newSizes = await perpsV2Market.marketSizes();
				assert.bnEqual(newSizes[0], sizes[0]);
				assert.bnEqual(newSizes[1], toUnit(0));
				assert.bnEqual(await perpsV2Market.marketSkew(), toUnit('60'));

				// trader3 has a -20 size and when removed bumps skew up to 60 and debtCorrection is reflected
				assert.bnClose((await perpsV2Market.marketDebt())[0], toUnit('7215.435'), toUnit('0.001'));

				// Funding has been recorded by the liquidation.
				assert.bnEqual((await perpsV2Market.unrecordedFunding())[0], toUnit(0));
			});

			it('Can liquidate a position with less than the liquidation fee margin remaining (long case)', async () => {
				// see: getExpectedLiquidationPrice for liqPrice calculation.
				assert.isFalse(await perpsV2Market.canLiquidate(trader));
				const liqPrice = (await perpsV2Market.liquidationPrice(trader)).price;
				assert.bnEqual(liqPrice, toUnit('227.400150000003014'));

				const newPrice = liqPrice.sub(toUnit(1));
				await setPrice(baseAsset, newPrice);

				const { size: positionSize, id: positionId } = await perpsV2Market.positions(trader);

				assert.isTrue(await perpsV2Market.canLiquidate(trader));

				const remainingMargin = (await perpsV2Market.remainingMargin(trader)).marginRemaining;
				const tx = await perpsV2Market.liquidatePosition(trader, { from: noBalance });

				assert.isFalse(await perpsV2Market.canLiquidate(trader));
				const position = await perpsV2Market.positions(trader, { from: noBalance });
				assert.bnEqual(position.margin, toUnit(0));
				assert.bnEqual(position.size, toUnit(0));
				assert.bnEqual(position.lastPrice, toUnit(0));
				assert.bnEqual(position.lastFundingIndex, toBN(0));

				const liquidationFee = multiplyDecimal(
					multiplyDecimal(await perpsV2MarketSettings.liquidationFeeRatio(), newPrice),
					toUnit(40) // position size
				);
				assert.bnClose(await sUSD.balanceOf(noBalance), liquidationFee, toUnit('0.001'));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsV2Market] });
				assert.deepEqual(
					decodedLogs.map(({ name }) => name),
					['FundingRecomputed', 'Issued', 'PositionModified', 'PositionLiquidated']
				);
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
					emittedFrom: perpsV2Market.address,
					args: [
						positionId,
						trader,
						toBN('0'),
						toBN('0'),
						toBN('0'),
						(await perpsV2Market.assetPrice()).price,
						await perpsV2Market.fundingSequenceLength(),
						toBN('0'),
					],
					log: decodedLogs[2],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: perpsV2Market.address,
					args: [positionId, trader, noBalance, positionSize, newPrice, liquidationFee],
					log: decodedLogs[3],
					bnCloseVariance: toUnit('0.001'),
				});

				assert.bnLt(remainingMargin, liquidationFee);
			});

			it('Can liquidate a position with less than the liquidation fee margin remaining (short case)', async () => {
				// see: getExpectedLiquidationPrice for liqPrice calculation.
				const liqPrice = (await perpsV2Market.liquidationPrice(trader3)).price;
				assert.bnEqual(liqPrice, toUnit('298.199875'));

				const newPrice = liqPrice.add(toUnit(1));

				await setPrice(baseAsset, newPrice);

				const { size: positionSize, id: positionId } = await perpsV2Market.positions(trader3);

				const remainingMargin = (await perpsV2Market.remainingMargin(trader3)).marginRemaining;
				const tx = await perpsV2Market.liquidatePosition(trader3, { from: noBalance });

				const position = await perpsV2Market.positions(trader3, { from: noBalance });
				assert.bnEqual(position.margin, toUnit(0));
				assert.bnEqual(position.size, toUnit(0));
				assert.bnEqual(position.lastPrice, toUnit(0));
				assert.bnEqual(position.lastFundingIndex, toBN(0));

				// in this case, proportional fee is smaller than minimum fee
				const liquidationFee = multiplyDecimal(
					multiplyDecimal(await perpsV2MarketSettings.liquidationFeeRatio(), newPrice),
					toUnit(20) // position size
				);
				assert.bnClose(await sUSD.balanceOf(noBalance), liquidationFee, toUnit('0.001'));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsV2Market] });
				assert.deepEqual(
					decodedLogs.map(({ name }) => name),
					['FundingRecomputed', 'Issued', 'PositionModified', 'PositionLiquidated']
				);
				assert.equal(decodedLogs.length, 4);
				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [noBalance, liquidationFee],
					log: decodedLogs[1],
				});
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsV2Market.address,
					args: [
						positionId,
						trader3,
						toBN('0'),
						toBN('0'),
						toBN('0'),
						(await perpsV2Market.assetPrice()).price,
						await perpsV2Market.fundingSequenceLength(),
						toBN('0'),
					],
					log: decodedLogs[2],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: perpsV2Market.address,
					args: [positionId, trader3, noBalance, positionSize, newPrice, liquidationFee],
					log: decodedLogs[3],
					bnCloseVariance: toUnit('0.001'),
				});

				assert.bnLt(remainingMargin, liquidationFee);
			});

			it('liquidations of positive margin position pays to fee pool, long case', async () => {
				// see: getExpectedLiquidationPrice for liqPrice calculation.
				const liqPrice = (await perpsV2Market.liquidationPrice(trader)).price;
				assert.bnEqual(liqPrice, toUnit('227.400150000003014'));

				const newPrice = liqPrice.sub(toUnit(0.5));
				await setPrice(baseAsset, newPrice);
				assert.isTrue(await perpsV2Market.canLiquidate(trader));

				const remainingMargin = (await perpsV2Market.remainingMargin(trader)).marginRemaining;
				const tx = await perpsV2Market.liquidatePosition(trader, { from: noBalance });

				const liquidationFee = multiplyDecimal(
					multiplyDecimal(await perpsV2MarketSettings.liquidationFeeRatio(), newPrice),
					toUnit(40) // position size
				);
				assert.bnClose(await sUSD.balanceOf(noBalance), liquidationFee, toUnit('0.001'));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsV2Market] });
				assert.deepEqual(
					decodedLogs.map(({ name }) => name),
					['FundingRecomputed', 'Issued', 'PositionModified', 'PositionLiquidated', 'Issued']
				);
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

			it('liquidations of positive margin position pays to fee pool, short case', async () => {
				// see: getExpectedLiquidationPrice for liqPrice calculation.
				const liqPrice = (await perpsV2Market.liquidationPrice(trader3)).price;
				assert.bnEqual(liqPrice, toUnit('298.199875'));

				const newPrice = liqPrice.add(toUnit(0.5));
				await setPrice(baseAsset, newPrice);
				assert.isTrue(await perpsV2Market.canLiquidate(trader3));

				const remainingMargin = (await perpsV2Market.remainingMargin(trader3)).marginRemaining;
				const tx = await perpsV2Market.liquidatePosition(trader3, { from: noBalance });

				const liquidationFee = multiplyDecimal(
					multiplyDecimal(await perpsV2MarketSettings.liquidationFeeRatio(), newPrice),
					toUnit(20) // position size
				);
				assert.bnClose(await sUSD.balanceOf(noBalance), liquidationFee, toUnit('0.001'));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsV2Market] });
				assert.deepEqual(
					decodedLogs.map(({ name }) => name),
					['FundingRecomputed', 'Issued', 'PositionModified', 'PositionLiquidated', 'Issued']
				);
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
				const { size: positionSize, id: positionId } = await perpsV2Market.positions(trader);
				// Move the price to a non-liquidating point
				let price = (await perpsV2Market.liquidationPrice(trader)).price;
				const newPrice = price.add(toUnit('1'));

				await setPrice(baseAsset, newPrice);

				assert.isFalse(await perpsV2Market.canLiquidate(trader));

				// raise the liquidation fee
				await perpsV2MarketSettings.setMinKeeperFee(toUnit('100'), { from: owner });

				assert.isTrue(await perpsV2Market.canLiquidate(trader));
				price = (await perpsV2Market.liquidationPrice(trader)).price;

				// liquidate the position
				const tx = await perpsV2Market.liquidatePosition(trader, { from: noBalance });

				// check that the liquidation price was correct.
				// liqMargin = max(100, 250 * 40 * 0.0035) + 250 * 40*0.0025 = 125
				// fee 40*250*0.003 = 30
				// Remaining margin = 250 + (125 - (1000 - 30)) / (40)= 228.875
				assert.bnClose(price, toUnit(228.875), toUnit(0.1));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, perpsV2Market] });
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsV2Market.address,
					args: [
						positionId,
						trader,
						toBN('0'),
						toBN('0'),
						toBN('0'),
						(await perpsV2Market.assetPrice()).price,
						await perpsV2Market.fundingSequenceLength(),
						toBN('0'),
					],
					log: decodedLogs[2],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: perpsV2Market.address,
					args: [positionId, trader, noBalance, positionSize, newPrice, toUnit('100')],
					log: decodedLogs[3],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Liquidating a position and opening one after should increment the position id', async () => {
				const { id: oldPositionId } = await perpsV2Market.positions(trader);
				assert.bnEqual(oldPositionId, toBN('1'));

				await setPrice(baseAsset, toUnit('200'));
				assert.isTrue(await perpsV2Market.canLiquidate(trader));
				await perpsV2Market.liquidatePosition(trader, { from: noBalance });

				await transferMarginAndModifyPosition({
					market: perpsV2Market,
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				const { id: newPositionId } = await perpsV2Market.positions(trader);
				assert.bnGte(toBN(newPositionId), toBN(oldPositionId));
			});
		});

		describe('liquidationFee', () => {
			it('accurate with position size and parameters', async () => {
				await setPrice(baseAsset, toUnit('1000'));
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('2'), priceImpactDelta, { from: trader });
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsV2Market.modifyPosition(toUnit('-2'), priceImpactDelta, { from: trader2 });

				// cannot liquidate
				assert.bnEqual(await perpsV2Market.liquidationFee(trader), toBN(0));
				assert.bnEqual(await perpsV2Market.liquidationFee(trader2), toBN(0));

				// long
				await setPrice(baseAsset, toUnit('500'));
				// minimum liquidation fee < 20 , 0.0035 * 500 * 2 = 3.5
				assert.bnEqual(await perpsV2Market.liquidationFee(trader), minKeeperFee);

				// reduce minimum
				await perpsV2MarketSettings.setMinKeeperFee(toUnit(1), { from: owner });
				assert.bnEqual(await perpsV2Market.liquidationFee(trader), toUnit('3.5'));

				// short
				await setPrice(baseAsset, toUnit('1500'));
				// minimum liquidation fee > 1, 0.0035 * 1500 * 2 = 10.5
				assert.bnEqual(await perpsV2Market.liquidationFee(trader2), toUnit('10.5'));
				// increase minimum
				await perpsV2MarketSettings.setMinKeeperFee(toUnit(30), { from: owner });
				assert.bnEqual(await perpsV2Market.liquidationFee(trader2), toUnit(30));

				// increase BPs
				// minimum liquidation fee > 30, 0.02 * 1500 * 2 = 60
				await perpsV2MarketSettings.setLiquidationFeeRatio(toUnit(0.02), { from: owner });
				assert.bnEqual(await perpsV2Market.liquidationFee(trader2), toUnit(60));
			});
		});

		describe('max liquidationFee', () => {
			it('only send the max liquidation fee to the liquidator', async () => {
				await perpsV2MarketSettings.setMaxKeeperFee(maxKeeperFee, { from: owner });

				await setPrice(baseAsset, toUnit('1000'));
				await perpsV2Market.transferMargin(toUnit('100000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('200'), priceImpactDelta, { from: trader });
				await perpsV2Market.transferMargin(toUnit('100000'), { from: trader2 });
				await perpsV2Market.modifyPosition(toUnit('-200'), priceImpactDelta, { from: trader2 });

				// cannot liquidate
				assert.bnEqual(await perpsV2Market.liquidationFee(trader), toBN(0));
				assert.bnEqual(await perpsV2Market.liquidationFee(trader2), toBN(0));

				// long
				await setPrice(baseAsset, toUnit('500'));

				// max liquidation fee = 1000
				// proportional fee: 0.0035 * price * 200 = 350
				// min (1000,350) = 350
				assert.bnEqual(await perpsV2Market.liquidationFee(trader), toUnit('350'));

				// reduce maximum
				// min (100,350) = 100
				await perpsV2MarketSettings.setMaxKeeperFee(toUnit(100), { from: owner });
				assert.bnEqual(await perpsV2Market.liquidationFee(trader), toUnit('100'));

				// short
				await setPrice(baseAsset, toUnit('1500'));
				// proportional fee: 0.0035 * 1500 * 200 = 1050
				// min (100,1050) = 100
				assert.bnEqual(await perpsV2Market.liquidationFee(trader2), toUnit('100'));
				// increase maximum
				// min (2000,1050) = 1050
				await perpsV2MarketSettings.setMaxKeeperFee(toUnit(2000), { from: owner });
				assert.bnEqual(await perpsV2Market.liquidationFee(trader2), toUnit('1050'));
			});

			it('send the remaining to the fee pool when max is exceeded - long', async () => {
				await setPrice(baseAsset, toUnit('1000'));
				// increase margin so that we can play with it
				await perpsV2MarketSettings.setLiquidationBufferRatio(toUnit('0.1'), { from: owner });

				await perpsV2Market.transferMargin(toUnit('100000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('200'), priceImpactDelta, { from: trader });
				await perpsV2Market.transferMargin(toUnit('100000'), { from: trader2 });
				await perpsV2Market.modifyPosition(toUnit('-200'), priceImpactDelta, { from: trader2 });

				// cannot liquidate
				assert.isFalse(await perpsV2Market.canLiquidate(trader));

				// long
				const liqPrice = (await perpsV2Market.liquidationPrice(trader)).price;

				// move the price so that is liquidatable but there's still margin to use
				const newPrice = liqPrice.sub(toUnit(100));
				await setPrice(baseAsset, newPrice);

				// confirm is liquidatable
				assert.isTrue(await perpsV2Market.canLiquidate(trader));

				// reduce maximum fee
				await perpsV2MarketSettings.setMinKeeperFee(toUnit(1), { from: owner });
				await perpsV2MarketSettings.setMaxKeeperFee(toUnit(10), { from: owner });

				const liquidationFee = await perpsV2Market.liquidationFee(trader);
				const expectedLiquidationFee = toUnit('10'); // max keeper fee
				assert.bnEqual(liquidationFee, expectedLiquidationFee);

				const remainingMargin = (await perpsV2Market.remainingMargin(trader)).marginRemaining;
				const poolFee = remainingMargin.sub(expectedLiquidationFee);

				// the price needs to be set in a way that leaves positive margin after fee
				assert.isTrue(poolFee.gt(toBN(0)));

				const feeAddress = await feePool.FEE_ADDRESS();
				const preFeePoolBalance = await sUSD.balanceOf(feeAddress);
				const preLiquidatorBalance = await sUSD.balanceOf(noBalance);

				await perpsV2Market.liquidatePosition(trader, { from: noBalance });

				assert.bnEqual(
					await sUSD.balanceOf(noBalance),
					preLiquidatorBalance.add(expectedLiquidationFee)
				);

				const postFeePoolBalance = await sUSD.balanceOf(feeAddress);
				assert.bnGt(postFeePoolBalance, preFeePoolBalance.add(toUnit(1))); // we are exceeding the 'close' margin below
				assert.bnClose(postFeePoolBalance, preFeePoolBalance.add(poolFee), toUnit('0.0000001'));
			});

			it('send the remaining to the fee pool when max is exceeded - short', async () => {
				await setPrice(baseAsset, toUnit('1000'));
				// increase margin so that we can play with it
				await perpsV2MarketSettings.setLiquidationBufferRatio(toUnit('0.1'), { from: owner });

				await perpsV2Market.transferMargin(toUnit('100000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('200'), priceImpactDelta, { from: trader });
				await perpsV2Market.transferMargin(toUnit('100000'), { from: trader2 });
				await perpsV2Market.modifyPosition(toUnit('-200'), priceImpactDelta, { from: trader2 });

				// cannot liquidate
				assert.isFalse(await perpsV2Market.canLiquidate(trader2));

				// long
				const liqPrice = (await perpsV2Market.liquidationPrice(trader2)).price;

				// move the price so that is liquidatable but there's still margin to use
				const newPrice = liqPrice.add(toUnit(100));
				await setPrice(baseAsset, newPrice);

				// confirm is liquidatable
				assert.isTrue(await perpsV2Market.canLiquidate(trader2));

				// reduce maximum fee
				await perpsV2MarketSettings.setMinKeeperFee(toUnit(1), { from: owner });
				await perpsV2MarketSettings.setMaxKeeperFee(toUnit(10), { from: owner });

				const liquidationFee = await perpsV2Market.liquidationFee(trader2);
				const expectedLiquidationFee = toUnit('10'); // max keeper fee
				assert.bnEqual(liquidationFee, expectedLiquidationFee);

				const remainingMargin = (await perpsV2Market.remainingMargin(trader2)).marginRemaining;
				const poolFee = remainingMargin.sub(expectedLiquidationFee);

				// the price needs to be set in a way that leaves positive margin after fee
				assert.isTrue(poolFee.gt(toBN(0)));

				const feeAddress = await feePool.FEE_ADDRESS();
				const preFeePoolBalance = await sUSD.balanceOf(feeAddress);
				const preLiquidatorBalance = await sUSD.balanceOf(noBalance);

				await perpsV2Market.liquidatePosition(trader2, { from: noBalance });

				assert.bnEqual(
					await sUSD.balanceOf(noBalance),
					preLiquidatorBalance.add(expectedLiquidationFee)
				);

				const postFeePoolBalance = await sUSD.balanceOf(feeAddress);
				assert.bnGt(postFeePoolBalance, preFeePoolBalance.add(toUnit(1))); // we are exceeding the 'close' margin below
				assert.bnClose(postFeePoolBalance, preFeePoolBalance.add(poolFee), toUnit('0.0000001'));
			});
		});

		describe('liquidationMargin', () => {
			it('accurate with position size, price, and parameters', async () => {
				await setPrice(baseAsset, toUnit('1000'));
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('2'), priceImpactDelta, { from: trader });
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsV2Market.modifyPosition(toUnit('-2'), priceImpactDelta, { from: trader2 });

				// reverts for 0 position
				await assert.revert(perpsV2Market.liquidationMargin(trader3), '0 size position');

				// max(20, 2 * 1000 * 0.0035) + 2 * 1000 * 0.0025 = 25
				assert.bnEqual(await perpsV2Market.liquidationMargin(trader), toUnit('25'));
				assert.bnEqual(await perpsV2Market.liquidationMargin(trader2), toUnit('25'));

				// reduce minimum
				// max(1, 2 * 1000 * 0.0035) + 2 * 1000 * 0.0025 = 12
				await perpsV2MarketSettings.setMinKeeperFee(toUnit(1), { from: owner });
				assert.bnEqual(await perpsV2Market.liquidationMargin(trader), toUnit('12'));
				assert.bnEqual(await perpsV2Market.liquidationMargin(trader2), toUnit('12'));

				// change price
				await setPrice(baseAsset, toUnit('1500'));
				// max(1, 2 * 1500 * 0.0035) + 2 * 1000 * 0.0025 = 18
				assert.bnEqual(await perpsV2Market.liquidationMargin(trader), toUnit('18'));
				assert.bnEqual(await perpsV2Market.liquidationMargin(trader2), toUnit('18'));

				// change fee BPs
				// max(1, 2 * 1500 * 0.02) + 2 * 1500 * 0.0025 = 67.5
				await perpsV2MarketSettings.setLiquidationFeeRatio(toUnit(0.02), { from: owner });
				assert.bnEqual(await perpsV2Market.liquidationMargin(trader), toUnit('67.5'));
				assert.bnEqual(await perpsV2Market.liquidationMargin(trader2), toUnit('67.5'));

				// change buffer BPs
				// max(1, 2 * 1500 * 0.02) + 2 * 1500 * 0.03 = 150
				await perpsV2MarketSettings.setLiquidationBufferRatio(toUnit(0.03), { from: owner });
				assert.bnEqual(await perpsV2Market.liquidationMargin(trader), toUnit('150'));
				assert.bnEqual(await perpsV2Market.liquidationMargin(trader2), toUnit('150'));
			});
		});
	});

	describe('Price deviation scenarios', () => {
		const everythingReverts = async () => {
			it('then perpsV2MarketSettings parameter changes revert', async () => {
				await assert.revert(
					perpsV2MarketSettings.setMaxFundingVelocity(marketKey, 0, { from: owner }),
					'Invalid price'
				);
				await assert.revert(
					perpsV2MarketSettings.setSkewScale(marketKey, toUnit('100'), { from: owner }),
					'Invalid price'
				);
				await assert.revert(
					perpsV2MarketSettings.setParameters(
						marketKey,
						[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, toBytes32(''), 0, 1],
						{
							from: owner,
						}
					),
					'Invalid price'
				);
			});

			it('then mutative market actions revert', async () => {
				await assert.revert(
					perpsV2Market.transferMargin(toUnit('1000'), { from: trader }),
					'Invalid price'
				);
				await assert.revert(perpsV2Market.withdrawAllMargin({ from: trader }), 'Invalid price');
				await assert.revert(
					perpsV2Market.modifyPosition(toUnit('1'), priceImpactDelta, { from: trader }),
					'Invalid price'
				);
				await assert.revert(
					perpsV2Market.closePosition(priceImpactDelta, { from: trader }),
					'Invalid price'
				);
				await assert.revert(
					perpsV2Market.liquidatePosition(trader, { from: trader }),
					'Invalid price'
				);
			});
		};

		describe('when price spikes over the allowed threshold', () => {
			beforeEach(async () => {
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('1'), priceImpactDelta, { from: trader });
				// base rate of sETH is 100 from shared setup above
				await setPrice(baseAsset, toUnit('300'), false);
			});

			everythingReverts();
		});

		describe('when price drops over the allowed threshold', () => {
			beforeEach(async () => {
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('1'), priceImpactDelta, { from: trader });
				// base rate of sETH is 100 from shared setup above
				await setPrice(baseAsset, toUnit('30'), false);
			});

			everythingReverts();
		});
	});

	describe('Perps suspension scenarios', () => {
		function revertChecks(revertMessage) {
			it('then mutative market actions revert', async () => {
				await assert.revert(
					perpsV2Market.transferMargin(toUnit('1000'), { from: trader }),
					revertMessage
				);
				await assert.revert(perpsV2Market.withdrawAllMargin({ from: trader }), revertMessage);
				await assert.revert(
					perpsV2Market.modifyPosition(toUnit('1'), priceImpactDelta, { from: trader }),
					revertMessage
				);
				await assert.revert(
					perpsV2Market.closePosition(priceImpactDelta, { from: trader }),
					revertMessage
				);
				await assert.revert(
					perpsV2Market.liquidatePosition(trader, { from: trader }),
					revertMessage
				);
			});

			it('then perpsV2MarketSettings parameter changes do not revert', async () => {
				await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, 0, { from: owner });
				await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('100'), { from: owner });
				await perpsV2MarketSettings.setParameters(
					marketKey,
					[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, toBytes32(''), 0, 1],
					{
						from: owner,
					}
				);
			});

			it('perpsV2MarketSettings parameter changes still revert if price is invalid', async () => {
				await setPrice(baseAsset, toUnit('1'), false); // circuit breaker will revert
				await assert.revert(
					perpsV2MarketSettings.setParameters(
						marketKey,
						[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, toBytes32(''), 0, 1],
						{
							from: owner,
						}
					),
					'Invalid price'
				);
			});
		}

		describe('when perps markets are suspended', () => {
			beforeEach(async () => {
				// prepare a position
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('1'), priceImpactDelta, { from: trader });
				// suspend
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
			});

			// check reverts are as expected
			revertChecks('Futures markets are suspended');

			describe('when perps markets are resumed', () => {
				beforeEach(async () => {
					// suspend
					await systemStatus.resumeFutures({ from: owner });
				});

				it('then mutative market actions work', async () => {
					await perpsV2Market.withdrawAllMargin({ from: trader });
					await perpsV2Market.transferMargin(toUnit('100'), { from: trader });
					await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, { from: trader });
					await perpsV2Market.closePosition(priceImpactDelta, { from: trader });

					// set up for liquidation
					await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, { from: trader });
					await setPrice(baseAsset, toUnit('1'));
					await perpsV2Market.liquidatePosition(trader, { from: trader2 });
				});
			});
		});

		describe('when specific market is suspended', () => {
			beforeEach(async () => {
				// prepare a position
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('1'), priceImpactDelta, { from: trader });
				// suspend
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
			});

			// check reverts are as expecte
			revertChecks('Market suspended');

			describe('when market is resumed', () => {
				beforeEach(async () => {
					// suspend
					await systemStatus.resumeFuturesMarket(marketKey, { from: owner });
				});

				it('then mutative market actions work', async () => {
					await perpsV2Market.withdrawAllMargin({ from: trader });
					await perpsV2Market.transferMargin(toUnit('100'), { from: trader });
					await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, { from: trader });
					await perpsV2Market.closePosition(priceImpactDelta, { from: trader });

					// set up for liquidation
					await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, { from: trader });
					await setPrice(baseAsset, toUnit('1'));
					await perpsV2Market.liquidatePosition(trader, { from: trader2 });
				});
			});
		});

		describe('when another market is suspended', () => {
			beforeEach(async () => {
				// prepare a position
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('1'), priceImpactDelta, { from: trader });
				// suspend
				await systemStatus.suspendFuturesMarket(toBytes32('sOTHER'), toUnit(0), { from: owner });
			});

			it('then mutative market actions work', async () => {
				await perpsV2Market.withdrawAllMargin({ from: trader });
				await perpsV2Market.transferMargin(toUnit('100'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, { from: trader });
				await perpsV2Market.closePosition(priceImpactDelta, { from: trader });

				// set up for liquidation
				await perpsV2Market.modifyPosition(toUnit('10'), priceImpactDelta, { from: trader });
				await setPrice(baseAsset, toUnit('1'));
				await perpsV2Market.liquidatePosition(trader, { from: trader2 });
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
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.modifyPosition(toUnit('1'), priceImpactDelta, { from: trader });

				// set up a would be liqudatable position
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader2 });
				await perpsV2Market.modifyPosition(toUnit('-100'), priceImpactDelta, { from: trader2 });

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
					perpsV2Market.modifyPosition(toUnit('1'), priceImpactDelta, { from: trader }),
					revertMessage
				);
				await assert.revert(
					perpsV2Market.closePosition(priceImpactDelta, { from: trader }),
					revertMessage
				);
			});

			it('margin modifying actions do not revert', async () => {
				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.withdrawAllMargin({ from: trader });
			});

			it('liquidations do not revert', async () => {
				await perpsV2Market.liquidatePosition(trader2, { from: trader });
			});

			it('perpsV2MarketSettings parameter changes do not revert', async () => {
				await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, 0, { from: owner });
				await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('100'), { from: owner });
				await perpsV2MarketSettings.setParameters(
					marketKey,
					[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, toBytes32(''), 0, 1],
					{
						from: owner,
					}
				);
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
				await perpsV2Market.transferMargin(margin, { from: trader });
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

				// expected fee is dynamic fee + taker fee (both fees are impacted by the fillPrice).
				const fillPrice = (await perpsV2Market.fillPriceWithBasePrice(orderSize, 0))[0];
				const expectedFee = multiplyDecimal(fillPrice, expectedRate.add(takerFee));

				// check view
				const res = await perpsV2Market.orderFee(orderSize, orderType);
				assert.bnClose(res.fee, expectedFee, toUnit('0.0000001'));

				// check event from modifying a position
				const tx = await perpsV2Market.modifyPosition(orderSize, priceImpactDelta, {
					from: trader,
				});

				// correct fee is properly recorded and deducted.
				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [perpsV2Market] });

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: perpsV2Market.address,
					args: [
						toBN('1'),
						trader,
						margin.sub(expectedFee),
						orderSize,
						orderSize,
						fillPrice,
						toBN(3),
						expectedFee,
					],
					log: decodedLogs[2],
					bnCloseVariance: toUnit('0.0000001'),
				});
			});

			it('mutative actions do not revert', async () => {
				await perpsV2Market.modifyPosition(toUnit('1'), priceImpactDelta, { from: trader });
				await perpsV2Market.closePosition(priceImpactDelta, { from: trader });

				await perpsV2Market.transferMargin(toUnit('1000'), { from: trader });
				await perpsV2Market.withdrawAllMargin({ from: trader });
			});

			it('perpsV2MarketSettings parameter changes do not revert', async () => {
				await perpsV2MarketSettings.setMaxFundingVelocity(marketKey, 0, { from: owner });
				await perpsV2MarketSettings.setSkewScale(marketKey, toUnit('100'), { from: owner });
				await perpsV2MarketSettings.setParameters(
					marketKey,
					[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, toBytes32(''), 0, 1],
					{
						from: owner,
					}
				);
			});
		});
	});
});
