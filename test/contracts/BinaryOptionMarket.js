'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { currentTime, fastForward, toUnit } = require('../utils')();
const { toBytes32 } = require('../..');
const { setupAllContracts, setupContract, mockGenericContractFnc } = require('./setup');
const {
	setStatus,
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
} = require('./helpers');

const TestableBinaryOptionMarket = artifacts.require('TestableBinaryOptionMarket');
const BinaryOptionMarket = artifacts.require('BinaryOptionMarket');
const BinaryOption = artifacts.require('BinaryOption');
const SafeDecimalMath = artifacts.require('SafeDecimalMath');

contract('BinaryOptionMarket', accounts => {
	const [initialBidder, newBidder, pauper] = accounts;

	const sUSDQty = toUnit(10000);

	const minimumInitialLiquidity = toUnit(2);
	const oneDay = 60 * 60 * 24;
	const maturityWindow = 61 * 60;
	const exerciseDuration = 7 * 24 * 60 * 60;
	const creatorDestructionDuration = 7 * 24 * 60 * 60;
	const biddingTime = oneDay;
	const timeToMaturity = oneDay * 7;
	const initialLongBid = toUnit(10);
	const initialShortBid = toUnit(5);
	const initialTargetPrice = toUnit(100);
	const initialPoolFee = toUnit(0.008);
	const initialCreatorFee = toUnit(0.002);
	const initialRefundFee = toUnit(0.02);
	const totalInitialFee = initialPoolFee.add(initialCreatorFee);
	const sAUDKey = toBytes32('sAUD');

	let creationTime;

	let systemStatus,
		factory,
		market,
		exchangeRates,
		addressResolver,
		feePool,
		sUSDSynth,
		oracle,
		long,
		short;

	const Phase = {
		Bidding: toBN(0),
		Trading: toBN(1),
		Maturity: toBN(2),
		Destruction: toBN(3),
	};

	const Side = {
		Long: toBN(0),
		Short: toBN(1),
	};

	const deployMarket = async ({
		resolver,
		endOfBidding,
		maturity,
		oracleKey,
		targetPrice,
		longBid,
		shortBid,
		poolFee,
		creatorFee,
		refundFee,
		creator,
	}) => {
		return setupContract({
			accounts,
			contract: 'TestableBinaryOptionMarket',
			args: [
				resolver,
				endOfBidding,
				maturity,
				maturity + exerciseDuration,
				oracleKey,
				targetPrice,
				maturityWindow,
				minimumInitialLiquidity,
				creator,
				longBid,
				shortBid,
				poolFee,
				creatorFee,
				refundFee,
			],
		});
	};

	const setupNewMarket = async () => {
		({
			SystemStatus: systemStatus,
			BinaryOptionMarketFactory: factory,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			FeePool: feePool,
			SynthsUSD: sUSDSynth,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'BinaryOptionMarketFactory',
				'AddressResolver',
				'ExchangeRates',
				'FeePool',
				'Synthetix',
			],
		}));

		oracle = await exchangeRates.oracle();

		await sUSDSynth.issue(initialBidder, sUSDQty);
		await sUSDSynth.approve(factory.address, sUSDQty, { from: initialBidder });
		await sUSDSynth.issue(newBidder, sUSDQty);
		await sUSDSynth.approve(factory.address, sUSDQty, { from: newBidder });

		creationTime = await currentTime();
		const tx = await factory.createMarket(
			creationTime + biddingTime,
			creationTime + timeToMaturity,
			sAUDKey,
			initialTargetPrice,
			initialLongBid,
			initialShortBid,
			{ from: initialBidder }
		);

		market = await BinaryOptionMarket.at(tx.logs[1].args.market);
		long = await BinaryOption.at(await market.longOption());
		short = await BinaryOption.at(await market.shortOption());

		await sUSDSynth.approve(market.address, sUSDQty, { from: initialBidder });
		await sUSDSynth.approve(market.address, sUSDQty, { from: newBidder });
	};

	before(async () => {
		TestableBinaryOptionMarket.link(await SafeDecimalMath.new());
		await setupNewMarket();
	});

	addSnapshotBeforeRestoreAfterEach();

	const mulDecRound = (x, y) => {
		let result = x.mul(y).div(toUnit(0.1));
		if (result.mod(toBN(10)).gte(toBN(5))) {
			result = result.add(toBN(10));
		}
		return result.div(toBN(10));
	};

	const divDecRound = (x, y) => {
		let result = x.mul(toUnit(10)).div(y);
		if (result.mod(toBN(10)).gte(toBN(5))) {
			result = result.add(toBN(10));
		}
		return result.div(toBN(10));
	};

	// All inputs should be BNs.
	const computePrices = (longs, shorts, debt, fee) => {
		const totalOptions = mulDecRound(debt, toUnit(1).sub(fee));
		return { long: divDecRound(longs, totalOptions), short: divDecRound(shorts, totalOptions) };
	};

	describe('Basic parameters', () => {
		it('static parameters are set properly', async () => {
			assert.bnEqual(await market.endOfBidding(), toBN(creationTime + biddingTime));
			assert.bnEqual(await market.maturity(), toBN(creationTime + timeToMaturity));
			assert.bnEqual(
				await market.destruction(),
				toBN(creationTime + timeToMaturity + exerciseDuration)
			);
			assert.bnEqual(await market.targetOraclePrice(), initialTargetPrice);
			assert.bnEqual(await market.oracleMaturityWindow(), toBN(maturityWindow));
			assert.bnEqual(await market.poolFee(), initialPoolFee);
			assert.bnEqual(await market.creatorFee(), initialCreatorFee);
			assert.bnEqual(await market.refundFee(), initialRefundFee);
			assert.bnEqual(await market.creatorFeesCollected(), toBN(0));
			assert.bnEqual(await market.poolFeesCollected(), toBN(0));
			assert.bnEqual(await market.deposited(), initialLongBid.add(initialShortBid));
			assert.equal(await market.owner(), factory.address);
			assert.equal(await market.creator(), initialBidder);
		});

		it('BinaryOption instances are set up properly.', async () => {
			const prices = computePrices(
				initialLongBid,
				initialShortBid,
				initialLongBid.add(initialShortBid),
				totalInitialFee
			);
			assert.bnEqual(await long.totalBids(), initialLongBid);
			assert.bnEqual(await short.totalBids(), initialShortBid);
			assert.bnEqual(await long.bidOf(initialBidder), initialLongBid);
			assert.bnEqual(await short.bidOf(initialBidder), initialShortBid);
			assert.bnEqual(await market.longPrice(), prices.long);
			assert.bnEqual(await market.shortPrice(), prices.short);
		});

		it('Bad constructor parameters revert.', async () => {
			// end of bidding in the past
			let localCreationTime = await currentTime();
			await assert.revert(
				deployMarket({
					resolver: addressResolver.address,
					endOfBidding: localCreationTime - 1,
					maturity: localCreationTime + 200,
					oracleKey: sAUDKey,
					targetPrice: initialTargetPrice,
					longBid: initialLongBid,
					shortBid: initialShortBid,
					poolFee: initialPoolFee,
					creatorFee: initialCreatorFee,
					refundFee: initialRefundFee,
					creator: initialBidder,
				}),
				'End of bidding must be in the future.'
			);

			// end of maturity before end of bidding.
			localCreationTime = await currentTime();
			await assert.revert(
				deployMarket({
					resolver: addressResolver.address,
					endOfBidding: localCreationTime + 100,
					maturity: localCreationTime + 99,
					oracleKey: sAUDKey,
					targetPrice: initialTargetPrice,
					longBid: initialLongBid,
					shortBid: initialShortBid,
					poolFee: initialPoolFee,
					creatorFee: initialCreatorFee,
					refundFee: initialRefundFee,
					creator: initialBidder,
				}),
				'Maturity must be after the end of bidding.'
			);

			// total fee more than 100%
			localCreationTime = await currentTime();
			await assert.revert(
				deployMarket({
					resolver: addressResolver.address,
					endOfBidding: localCreationTime + 100,
					maturity: localCreationTime + 200,
					oracleKey: sAUDKey,
					targetPrice: initialTargetPrice,
					longBid: initialLongBid,
					shortBid: initialShortBid,
					poolFee: toUnit(0.5),
					creatorFee: toUnit(0.5),
					refundFee: initialRefundFee,
					creator: initialBidder,
				}),
				'Fee must be less than 100%.'
			);

			// Refund fee more than 100%
			localCreationTime = await currentTime();
			await assert.revert(
				deployMarket({
					resolver: addressResolver.address,
					endOfBidding: localCreationTime + 100,
					maturity: localCreationTime + 200,
					oracleKey: sAUDKey,
					targetPrice: initialTargetPrice,
					longBid: initialLongBid,
					shortBid: initialShortBid,
					poolFee: initialPoolFee,
					creatorFee: initialCreatorFee,
					refundFee: toUnit(1.01),
					creator: initialBidder,
				}),
				'Refund fee must be no greater than 100%.'
			);

			// zero initial price on either side
			localCreationTime = await currentTime();
			await assert.revert(
				deployMarket({
					resolver: addressResolver.address,
					endOfBidding: localCreationTime + 100,
					maturity: localCreationTime + 200,
					oracleKey: sAUDKey,
					targetPrice: initialTargetPrice,
					longBid: toUnit(0),
					shortBid: initialShortBid,
					poolFee: initialPoolFee,
					creatorFee: initialCreatorFee,
					refundFee: initialRefundFee,
					creator: initialBidder,
				}),
				'Option prices must be nonzero.'
			);

			localCreationTime = await currentTime();
			await assert.revert(
				deployMarket({
					resolver: addressResolver.address,
					endOfBidding: localCreationTime + 100,
					maturity: localCreationTime + 200,
					oracleKey: sAUDKey,
					targetPrice: initialTargetPrice,
					longBid: initialLongBid,
					shortBid: toUnit(0),
					poolFee: initialPoolFee,
					creatorFee: initialCreatorFee,
					refundFee: initialRefundFee,
					creator: initialBidder,
				}),
				'Option prices must be nonzero.'
			);

			// Insufficient initial capital.
			localCreationTime = await currentTime();
			await assert.revert(
				deployMarket({
					resolver: addressResolver.address,
					endOfBidding: localCreationTime + 100,
					maturity: localCreationTime + 200,
					oracleKey: sAUDKey,
					targetPrice: initialTargetPrice,
					longBid: toUnit(0.5),
					shortBid: toUnit(0.5),
					poolFee: initialPoolFee,
					creatorFee: initialCreatorFee,
					refundFee: initialRefundFee,
					creator: initialBidder,
				}),
				'Insufficient initial capital provided.'
			);
		});

		it('Only expected functions are mutative', async () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: market.abi,
				ignoreParents: ['Owned', 'MixinResolver'],
				expected: [
					'bidLong',
					'bidShort',
					'refundLong',
					'refundShort',
					'resolve',
					'claimOptions',
					'exerciseOptions',
					'selfDestruct',
				],
			});
		});
	});

	describe('Prices', () => {
		it('updatePrices is correct with zero fee.', async () => {
			const localCreationTime = await currentTime();
			const localMarket = await deployMarket({
				resolver: addressResolver.address,
				endOfBidding: localCreationTime + 100,
				maturity: localCreationTime + 200,
				oracleKey: sAUDKey,
				targetPrice: initialTargetPrice,
				longBid: initialLongBid,
				shortBid: initialShortBid,
				poolFee: toUnit(0),
				creatorFee: toUnit(0),
				refundFee: initialRefundFee,
				creator: initialBidder,
			});

			const supplies = [
				{ supply: [toUnit(0.1), toUnit(0.9)], prices: [toUnit(0.1), toUnit(0.9)] },
				{ supply: [toUnit(0.9), toUnit(0.1)], prices: [toUnit(0.9), toUnit(0.1)] },
				{ supply: [toUnit(1), toUnit(1)], prices: [toUnit(0.5), toUnit(0.5)] },
				{ supply: [toUnit(10000), toUnit(10000)], prices: [toUnit(0.5), toUnit(0.5)] },
				{ supply: [toUnit(3), toUnit(1)], prices: [toUnit(0.75), toUnit(0.25)] },
				{
					supply: [toUnit(15), toUnit(30)],
					prices: [divDecRound(toUnit(1), toUnit(3)), divDecRound(toUnit(2), toUnit(3))],
				},
				{
					supply: [toUnit(7.7), toUnit(17)],
					prices: (o => [o.long, o.short])(
						computePrices(toUnit(7.7), toUnit(17), toUnit(7.7 + 17), toBN(0))
					),
				},
			];

			for (const v of supplies) {
				await localMarket.updatePrices(v.supply[0], v.supply[1], v.supply[0].add(v.supply[1]));
				const prices = await localMarket.prices();
				assert.bnEqual(prices[0], v.prices[0]);
				assert.bnEqual(prices[1], v.prices[1]);
				assert.bnEqual(await localMarket.longPrice(), v.prices[0]);
				assert.bnEqual(await localMarket.shortPrice(), v.prices[1]);
				assert.bnEqual(prices[0].add(prices[1]), toUnit(1));
			}
		});

		it('updatePrices is correct with positive fee.', async () => {
			const localCreationTime = await currentTime();
			const localMarket = await deployMarket({
				resolver: addressResolver.address,
				endOfBidding: localCreationTime + 100,
				maturity: localCreationTime + 200,
				oracleKey: sAUDKey,
				targetPrice: initialTargetPrice,
				longBid: initialLongBid,
				shortBid: initialShortBid,
				poolFee: initialPoolFee,
				creatorFee: initialCreatorFee,
				refundFee: initialRefundFee,
				creator: initialBidder,
			});

			const pairs = [
				[toUnit(0.1), toUnit(0.9)],
				[toUnit(0.9), toUnit(0.1)],
				[toUnit(1), toUnit(1)],
				[toUnit(10000), toUnit(10000)],
				[toUnit(3), toUnit(1)],
				[toUnit(15), toUnit(30)],
				[toUnit(7.7), toUnit(17)],
			];

			for (const p of pairs) {
				await localMarket.updatePrices(p[0], p[1], p[0].add(p[1]));
				const prices = await localMarket.prices();
				const expectedPrices = computePrices(p[0], p[1], p[0].add(p[1]), totalInitialFee);
				assert.bnClose(prices[0], expectedPrices.long, 1);
				assert.bnClose(prices[1], expectedPrices.short, 1);
				assert.bnClose(await localMarket.longPrice(), expectedPrices.long, 1);
				assert.bnClose(await localMarket.shortPrice(), expectedPrices.short, 1);
				assert.bnClose(
					prices[0].add(prices[1]),
					divDecRound(toUnit(1), toUnit(1).sub(totalInitialFee)),
					1
				);
			}
		});

		it('updatePrices emits the correct event.', async () => {
			const localCreationTime = await currentTime();
			const localMarket = await deployMarket({
				resolver: addressResolver.address,
				endOfBidding: localCreationTime + 100,
				maturity: localCreationTime + 200,
				oracleKey: sAUDKey,
				targetPrice: initialTargetPrice,
				longBid: initialLongBid,
				shortBid: initialShortBid,
				poolFee: initialPoolFee,
				creatorFee: initialCreatorFee,
				refundFee: initialRefundFee,
				creator: initialBidder,
			});

			const tx = await localMarket.updatePrices(toUnit(1), toUnit(1), toUnit(2));
			const log = tx.logs[0];
			const expectedPrices = computePrices(toUnit(1), toUnit(1), toUnit(2), totalInitialFee);

			assert.equal(log.event, 'PricesUpdated');
			assert.bnEqual(log.args.longPrice, expectedPrices.long);
			assert.bnEqual(log.args.shortPrice, expectedPrices.short);
		});

		it('Update prices is correct with higher total debt than sum of bids.', async () => {
			const localCreationTime = await currentTime();
			const localMarket = await deployMarket({
				resolver: addressResolver.address,
				endOfBidding: localCreationTime + 100,
				maturity: localCreationTime + 200,
				oracleKey: sAUDKey,
				targetPrice: initialTargetPrice,
				longBid: initialLongBid,
				shortBid: initialShortBid,
				poolFee: initialPoolFee,
				creatorFee: initialCreatorFee,
				refundFee: initialRefundFee,
				creator: initialBidder,
			});

			await localMarket.updatePrices(toUnit(1), toUnit(1), toUnit(4));
			const price = divDecRound(toUnit(0.25), toUnit(1).sub(totalInitialFee));
			assert.bnClose(await localMarket.longPrice(), price, 1);
			assert.bnClose(await localMarket.shortPrice(), price, 1);
		});

		it('Current prices are correct with positive fee.', async () => {
			const currentPrices = await market.prices();
			const expectedPrices = computePrices(
				await long.totalBids(),
				await short.totalBids(),
				await market.deposited(),
				totalInitialFee
			);

			assert.bnClose(currentPrices[0], expectedPrices.long, 1);
			assert.bnClose(currentPrices[1], expectedPrices.short, 1);
		});

		it('senderPrice cannot be invoked except by options.', async () => {
			await assert.revert(market.senderPrice(), 'Message sender is not an option of this market.');
		});
	});

	describe('Maturity condition resolution', () => {
		it('Current oracle price and timestamp are correct.', async () => {
			const now = await currentTime();
			const price = toUnit(0.7);
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			const result = await market.oraclePriceAndTimestamp();

			assert.bnEqual(result.price, price);
			assert.bnEqual(result.updatedAt, now);
		});

		it('Result can fluctuate while unresolved, but is fixed after resolution.', async () => {
			const two = toBN(2);
			assert.isFalse(await market.resolved());

			let now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice.div(two)], now, {
				from: oracle,
			});
			assert.bnEqual(await market.result(), Side.Short);
			now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice.mul(two)], now, {
				from: oracle,
			});
			assert.bnEqual(await market.result(), Side.Long);

			await fastForward(biddingTime + timeToMaturity + 10);
			now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice.mul(two)], now, {
				from: oracle,
			});
			await market.resolve();

			assert.isTrue(await market.resolved());
			now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice.div(two)], now, {
				from: oracle,
			});
			assert.bnEqual(await market.result(), Side.Long);
			now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice.mul(two)], now, {
				from: oracle,
			});
			assert.bnEqual(await market.result(), Side.Long);
		});

		it('Result resolves correctly long.', async () => {
			await fastForward(timeToMaturity + 1);
			const now = await currentTime();
			const price = initialTargetPrice.add(toBN(1));
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			const tx = await market.resolve();
			assert.bnEqual(await market.result(), Side.Long);
			assert.isTrue(await market.resolved());
			assert.bnEqual(await market.finalOraclePrice(), price);

			const log = tx.logs[0];
			assert.equal(log.event, 'MarketResolved');
			assert.bnEqual(log.args.result, Side.Long);
			assert.bnEqual(log.args.oraclePrice, price);
			assert.bnEqual(log.args.oracleTimestamp, now);
		});

		it('Result resolves correctly short.', async () => {
			await fastForward(timeToMaturity + 1);
			const now = await currentTime();
			const price = initialTargetPrice.sub(toBN(1));
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			const tx = await market.resolve();
			assert.isTrue(await market.resolved());
			assert.bnEqual(await market.result(), Side.Short);
			assert.bnEqual(await market.finalOraclePrice(), price);

			const log = tx.logs[0];
			assert.equal(log.event, 'MarketResolved');
			assert.bnEqual(log.args.result, Side.Short);
			assert.bnEqual(log.args.oraclePrice, price);
			assert.bnEqual(log.args.oracleTimestamp, now);
		});

		it('A result equal to the target price resolves long.', async () => {
			await fastForward(timeToMaturity + 1);
			const now = await currentTime();
			const price = initialTargetPrice;
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await market.resolve();
			assert.isTrue(await market.resolved());
			assert.bnEqual(await market.result(), Side.Long);
			assert.bnEqual(await market.finalOraclePrice(), price);
		});

		it('Resolution cannot occur before maturity.', async () => {
			assert.isFalse(await market.canResolve());
			await assert.revert(market.resolve(), 'The maturity date has not been reached.');
		});

		it('Resolution can only occur once.', async () => {
			await fastForward(timeToMaturity + 1);
			const now = await currentTime();
			const price = initialTargetPrice;
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			assert.isTrue(await market.canResolve());
			await market.resolve();
			assert.isFalse(await market.canResolve());
			await assert.revert(market.resolve(), 'The market has already resolved.');
		});

		it('Resolution cannot occur if the price was last updated before the maturity window.', async () => {
			await fastForward(timeToMaturity + 1);
			const now = await currentTime();
			const price = initialTargetPrice;
			await exchangeRates.updateRates([sAUDKey], [price], now - (maturityWindow + 60), {
				from: oracle,
			});
			assert.isFalse(await market.canResolve());
			await assert.revert(
				market.resolve(),
				'The price was last updated before the maturity window.'
			);
		});

		it('Resolution can occur if the price was updated within the maturity window but before maturity.', async () => {
			await fastForward(timeToMaturity + 1);
			const now = await currentTime();
			const price = initialTargetPrice;
			await exchangeRates.updateRates([sAUDKey], [price], now - (maturityWindow - 60), {
				from: oracle,
			});
			assert.isTrue(await market.canResolve());
			await market.resolve();
		});

		it('Resolution properly records the collected fees.', async () => {
			await fastForward(timeToMaturity + 1);
			await exchangeRates.updateRates([sAUDKey], [toUnit(0.7)], await currentTime(), {
				from: oracle,
			});
			await market.resolve();
			const poolFee = mulDecRound(initialLongBid.add(initialShortBid), initialPoolFee);
			const creatorFee = mulDecRound(initialLongBid.add(initialShortBid), initialCreatorFee);
			assert.bnClose(await market.poolFeesCollected(), poolFee, 1);
			assert.bnClose(await market.creatorFeesCollected(), creatorFee, 1);
		});

		it('Resolution cannot occur if the system is suspended', async () => {
			await fastForward(timeToMaturity + 1);
			await exchangeRates.updateRates([sAUDKey], [toUnit(0.7)], await currentTime(), {
				from: oracle,
			});
			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});
			await assert.revert(market.resolve(), 'Operation prohibited');
		});

		it('Resolution cannot occur if the factory is paused', async () => {
			await fastForward(timeToMaturity + 1);
			await exchangeRates.updateRates([sAUDKey], [toUnit(0.7)], await currentTime(), {
				from: oracle,
			});
			await factory.setPaused(true, { from: accounts[1] });
			await assert.revert(
				market.resolve(),
				'This action cannot be performed while the contract is paused'
			);
		});
	});

	describe('Phases', () => {
		it('Can proceed through the phases properly.', async () => {
			assert.bnEqual(await market.phase(), Phase.Bidding);
			await fastForward(biddingTime + 1);
			assert.bnEqual(await market.phase(), Phase.Trading);
			await fastForward(timeToMaturity + 1);
			assert.bnEqual(await market.phase(), Phase.Maturity);
			await fastForward(exerciseDuration + 1);
			assert.bnEqual(await market.phase(), Phase.Destruction);
		});
	});

	describe('Bids', () => {
		it('Can place long bids properly.', async () => {
			const initialDebt = await market.deposited();

			await market.bidLong(initialLongBid, { from: newBidder });

			assert.bnEqual(await long.totalBids(), initialLongBid.mul(toBN(2)));
			assert.bnEqual(await long.bidOf(newBidder), initialLongBid);

			const bids = await market.bidsOf(newBidder);
			assert.bnEqual(bids.long, initialLongBid);
			assert.bnEqual(bids.short, toBN(0));

			const totalBids = await market.totalBids();
			assert.bnEqual(totalBids.long, initialLongBid.mul(toBN(2)));
			assert.bnEqual(totalBids.short, initialShortBid);
			assert.bnEqual(await market.deposited(), initialDebt.add(initialLongBid));
		});

		it('Can place short bids properly.', async () => {
			const initialDebt = await market.deposited();

			await market.bidShort(initialShortBid, { from: newBidder });

			assert.bnEqual(await short.totalBids(), initialShortBid.mul(toBN(2)));
			assert.bnEqual(await short.bidOf(newBidder), initialShortBid);

			const bids = await market.bidsOf(newBidder);
			assert.bnEqual(bids.long, toBN(0));
			assert.bnEqual(bids.short, initialShortBid);

			const totalBids = await market.totalBids();
			assert.bnEqual(totalBids.long, initialLongBid);
			assert.bnEqual(totalBids.short, initialShortBid.mul(toBN(2)));
			assert.bnEqual(await market.deposited(), initialDebt.add(initialShortBid));
		});

		it('Can place both long and short bids at once.', async () => {
			const initialDebt = await market.deposited();

			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });

			assert.bnEqual(await long.totalBids(), initialLongBid.mul(toBN(2)));
			assert.bnEqual(await long.bidOf(newBidder), initialLongBid);
			assert.bnEqual(await short.totalBids(), initialShortBid.mul(toBN(2)));
			assert.bnEqual(await short.bidOf(newBidder), initialShortBid);

			const bids = await market.bidsOf(newBidder);
			assert.bnEqual(bids.long, initialLongBid);
			assert.bnEqual(bids.short, initialShortBid);

			const totalBids = await market.totalBids();
			assert.bnEqual(totalBids.long, initialLongBid.mul(toBN(2)));
			assert.bnEqual(totalBids.short, initialShortBid.mul(toBN(2)));
			assert.bnEqual(
				await market.deposited(),
				initialDebt.add(initialShortBid).add(initialLongBid)
			);
		});

		it('Cannot bid past the end of bidding.', async () => {
			await fastForward(biddingTime + 1);
			await assert.revert(market.bidLong(100), 'Bidding must be active.');
			await assert.revert(market.bidShort(100), 'Bidding must be active.');
		});

		it('Bids properly affect prices.', async () => {
			let currentPrices = await market.prices();
			const expectedPrices = computePrices(
				await long.totalBids(),
				await short.totalBids(),
				await market.deposited(),
				totalInitialFee
			);

			assert.bnClose(currentPrices[0], expectedPrices.long, 1);
			assert.bnClose(currentPrices[1], expectedPrices.short, 1);

			await market.bidShort(initialShortBid);

			currentPrices = await market.prices();
			const halfWithFee = divDecRound(
				toUnit(1),
				mulDecRound(toUnit(2), toUnit(1).sub(totalInitialFee))
			);
			assert.bnClose(currentPrices[0], halfWithFee, 1);
			assert.bnClose(currentPrices[1], halfWithFee, 1);

			await market.bidLong(initialLongBid);

			currentPrices = await market.prices();
			assert.bnClose(currentPrices[0], expectedPrices.long, 1);
			assert.bnClose(currentPrices[1], expectedPrices.short, 1);
		});

		it('Bids properly emit events.', async () => {
			let tx = await market.bidLong(initialLongBid, { from: newBidder });
			let currentPrices = await market.prices();

			assert.equal(tx.logs[0].event, 'Bid');
			assert.bnEqual(tx.logs[0].args.side, Side.Long);
			assert.equal(tx.logs[0].args.bidder, newBidder);
			assert.bnEqual(tx.logs[0].args.bid, initialLongBid);

			assert.equal(tx.logs[1].event, 'PricesUpdated');
			assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
			assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);

			tx = await market.bidShort(initialShortBid, { from: newBidder });
			currentPrices = await market.prices();

			assert.equal(tx.logs[0].event, 'Bid');
			assert.bnEqual(tx.logs[0].args.side, Side.Short);
			assert.equal(tx.logs[0].args.bidder, newBidder);
			assert.bnEqual(tx.logs[0].args.bid, initialShortBid);

			assert.equal(tx.logs[1].event, 'PricesUpdated');
			assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
			assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);
		});

		it('Bids withdraw the proper amount of sUSD', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });
			assert.bnEqual(
				await sUSDSynth.balanceOf(newBidder),
				sUSDQty.sub(initialLongBid.add(initialShortBid))
			);
		});

		it('Bids fail on insufficient sUSD balance.', async () => {
			await assert.revert(
				market.bidLong(initialLongBid, { from: pauper }),
				'SafeMath: subtraction overflow'
			);
			await assert.revert(
				market.bidShort(initialShortBid, { from: pauper }),
				'SafeMath: subtraction overflow'
			);
		});

		it('Bids fail on insufficient sUSD allowance.', async () => {
			await sUSDSynth.approve(market.address, toBN(0), { from: newBidder });
			await assert.revert(
				market.bidLong(initialLongBid, { from: newBidder }),
				'SafeMath: subtraction overflow'
			);
			await assert.revert(
				market.bidShort(initialShortBid, { from: newBidder }),
				'SafeMath: subtraction overflow'
			);
		});

		it('Empty bids do nothing.', async () => {
			const tx1 = await market.bidLong(toBN(0), { from: newBidder });
			const tx2 = await market.bidShort(toBN(0), { from: newBidder });

			assert.bnEqual(await long.bidOf(newBidder), toBN(0));
			assert.bnEqual(await short.bidOf(newBidder), toBN(0));
			assert.equal(tx1.logs.length, 0);
			assert.equal(tx1.receipt.rawLogs, 0);
			assert.equal(tx2.logs.length, 0);
			assert.equal(tx2.receipt.rawLogs, 0);
		});

		it('Bidding fails when the system is suspended.', async () => {
			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});
			await assert.revert(market.bidLong(toBN(1), { from: newBidder }), 'Operation prohibited');
			await assert.revert(market.bidShort(toBN(1), { from: newBidder }), 'Operation prohibited');
		});

		it('Bidding fails when the factory is paused.', async () => {
			await factory.setPaused(true, { from: accounts[1] });
			await assert.revert(
				market.bidLong(toBN(1), { from: newBidder }),
				'This action cannot be performed while the contract is paused'
			);
			await assert.revert(
				market.bidShort(toBN(1), { from: newBidder }),
				'This action cannot be performed while the contract is paused'
			);
		});
	});

	describe('Refunds', () => {
		it('Can refund bids properly with zero fee.', async () => {
			const localFactory = await setupContract({
				accounts,
				contract: 'BinaryOptionMarketFactory',
				args: [
					initialBidder,
					addressResolver.address,
					maturityWindow,
					exerciseDuration,
					creatorDestructionDuration,
					minimumInitialLiquidity,
					toBN(0),
					toBN(0),
					toBN(0),
				],
			});
			await localFactory.setResolverAndSyncCache(addressResolver.address);
			await sUSDSynth.approve(localFactory.address, sUSDQty, { from: initialBidder });

			const localCreationTime = await currentTime();
			const tx = await localFactory.createMarket(
				localCreationTime + 100,
				localCreationTime + 200,
				sAUDKey,
				initialTargetPrice,
				initialLongBid,
				initialShortBid,
				{ from: initialBidder }
			);
			const localMarket = await TestableBinaryOptionMarket.at(tx.logs[1].args.market);
			await sUSDSynth.approve(localMarket.address, sUSDQty, { from: newBidder });

			const initialDebt = await localMarket.deposited();

			await localMarket.bidLong(initialLongBid, { from: newBidder });
			await localMarket.bidShort(initialShortBid, { from: newBidder });

			const localLong = await BinaryOption.at(await localMarket.longOption());
			const localShort = await BinaryOption.at(await localMarket.shortOption());

			assert.bnEqual(await localLong.totalBids(), initialLongBid.mul(toBN(2)));
			assert.bnEqual(await localLong.bidOf(newBidder), initialLongBid);
			assert.bnEqual(await localShort.totalBids(), initialShortBid.mul(toBN(2)));
			assert.bnEqual(await localShort.bidOf(newBidder), initialShortBid);
			assert.bnEqual(await localMarket.deposited(), initialDebt.mul(toBN(2)));

			await localMarket.refundLong(initialLongBid, { from: newBidder });
			await localMarket.refundShort(initialShortBid, { from: newBidder });

			assert.bnEqual(await localLong.totalBids(), initialLongBid);
			assert.bnEqual(await localLong.bidOf(newBidder), toUnit(0));
			assert.bnEqual(await localShort.totalBids(), initialShortBid);
			assert.bnEqual(await localShort.bidOf(newBidder), toUnit(0));
			assert.bnEqual(await localMarket.deposited(), initialDebt);
		});

		it('Can refund bids properly with positive fee.', async () => {
			const initialDebt = await market.deposited();
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });

			assert.bnEqual(await long.totalBids(), initialLongBid.mul(toBN(2)));
			assert.bnEqual(await long.bidOf(newBidder), initialLongBid);
			assert.bnEqual(await short.totalBids(), initialShortBid.mul(toBN(2)));
			assert.bnEqual(await short.bidOf(newBidder), initialShortBid);
			assert.bnEqual(await market.deposited(), initialDebt.mul(toBN(2)));

			await market.refundLong(initialLongBid, { from: newBidder });
			await market.refundShort(initialShortBid, { from: newBidder });

			assert.bnEqual(await long.totalBids(), initialLongBid);
			assert.bnEqual(await long.bidOf(newBidder), toUnit(0));
			assert.bnEqual(await short.totalBids(), initialShortBid);
			assert.bnEqual(await short.bidOf(newBidder), toUnit(0));

			const fee = mulDecRound(initialLongBid.add(initialShortBid), initialRefundFee);
			// The fee is retained in the total debt.
			assert.bnEqual(await market.deposited(), initialDebt.add(fee));
		});

		it('Refunds will fail if too large.', async () => {
			// Refund with no bids.
			await assert.revert(
				market.refundLong(toUnit(1), { from: newBidder }),
				'SafeMath: subtraction overflow'
			);
			await assert.revert(
				market.refundShort(toUnit(1), { from: newBidder }),
				'SafeMath: subtraction overflow'
			);

			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });

			// Refund larger than total supply.
			const totalSupply = await market.deposited();
			await assert.revert(
				market.refundLong(totalSupply, { from: newBidder }),
				'SafeMath: subtraction overflow'
			);
			await assert.revert(
				market.refundShort(totalSupply, { from: newBidder }),
				'SafeMath: subtraction overflow'
			);

			// Smaller than total supply but larger than balance.
			await assert.revert(
				market.refundLong(initialLongBid.add(toBN(1)), { from: newBidder }),
				'SafeMath: subtraction overflow'
			);
			await assert.revert(
				market.refundShort(initialShortBid.add(toBN(1)), { from: newBidder }),
				'SafeMath: subtraction overflow'
			);
		});

		it('Refunds properly affect prices.', async () => {
			await market.bidShort(initialShortBid, { from: newBidder });
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.refundShort(initialShortBid, { from: newBidder });
			await market.refundLong(initialLongBid, { from: newBidder });

			const debt = mulDecRound(
				initialLongBid.add(initialShortBid),
				toUnit(1).add(initialRefundFee)
			);
			const expectedPrices = computePrices(initialLongBid, initialShortBid, debt, totalInitialFee);
			const currentPrices = await market.prices();

			assert.bnClose(currentPrices[0], expectedPrices.long, 1);
			assert.bnClose(currentPrices[1], expectedPrices.short, 1);
		});

		it('Cannot refund past the end of bidding.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });

			await fastForward(biddingTime + 1);

			await assert.revert(
				market.refundLong(initialLongBid, { from: newBidder }),
				'Bidding must be active.'
			);
			await assert.revert(
				market.refundShort(initialShortBid, { from: newBidder }),
				'Bidding must be active.'
			);
		});

		it('Refunds properly emit events.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });

			const longFee = mulDecRound(initialLongBid, initialRefundFee);
			const shortFee = mulDecRound(initialShortBid, initialRefundFee);

			let tx = await market.refundLong(initialLongBid, { from: newBidder });
			let currentPrices = await market.prices();

			assert.equal(tx.logs[0].event, 'Refund');
			assert.bnEqual(tx.logs[0].args.side, Side.Long);
			assert.equal(tx.logs[0].args.refunder, newBidder);
			assert.bnEqual(tx.logs[0].args.refund, initialLongBid.sub(longFee));
			assert.bnEqual(tx.logs[0].args.fee, longFee);

			assert.equal(tx.logs[1].event, 'PricesUpdated');
			assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
			assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);

			tx = await market.refundShort(initialShortBid, { from: newBidder });
			currentPrices = await market.prices();

			assert.equal(tx.logs[0].event, 'Refund');
			assert.bnEqual(tx.logs[0].args.side, Side.Short);
			assert.equal(tx.logs[0].args.refunder, newBidder);
			assert.bnEqual(tx.logs[0].args.refund, initialShortBid.sub(shortFee));
			assert.bnEqual(tx.logs[0].args.fee, shortFee);

			assert.equal(tx.logs[1].event, 'PricesUpdated');
			assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
			assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);
		});

		it('Refunds remit the proper amount of sUSD', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });
			await market.refundLong(initialLongBid, { from: newBidder });
			await market.refundShort(initialShortBid, { from: newBidder });

			const fee = mulDecRound(initialLongBid.add(initialShortBid), initialRefundFee);
			assert.bnEqual(await sUSDSynth.balanceOf(newBidder), sUSDQty.sub(fee));
		});

		it('Empty refunds do nothing.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });
			const tx1 = await market.refundLong(toBN(0), { from: newBidder });
			const tx2 = await market.refundShort(toBN(0), { from: newBidder });

			assert.bnEqual(await long.bidOf(newBidder), initialLongBid);
			assert.bnEqual(await short.bidOf(newBidder), initialShortBid);
			assert.equal(tx1.logs.length, 0);
			assert.equal(tx1.receipt.rawLogs, 0);
			assert.equal(tx2.logs.length, 0);
			assert.equal(tx2.receipt.rawLogs, 0);
		});

		it('Creator may not refund if it would violate the capital requirement.', async () => {
			const perSide = minimumInitialLiquidity.div(toBN(2));

			market.refundLong(initialLongBid.sub(perSide), { from: initialBidder });
			market.refundShort(initialShortBid.sub(perSide), { from: initialBidder });

			await assert.revert(
				market.refundLong(toUnit(0.1), { from: initialBidder }),
				'Minimum creator capital requirement violated.'
			);
			await assert.revert(
				market.refundShort(toUnit(0.1), { from: initialBidder }),
				'Minimum creator capital requirement violated.'
			);
		});

		it('Creator may not refund their entire position of either option.', async () => {
			await assert.revert(
				market.refundLong(initialLongBid, { from: initialBidder }),
				'Cannot refund entire creator position.'
			);
			await assert.revert(
				market.refundShort(initialShortBid, { from: initialBidder }),
				'Cannot refund entire creator position.'
			);
		});

		it('Refunding fails when the system is suspended.', async () => {
			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});

			await assert.revert(
				market.refundLong(toBN(1), { from: initialBidder }),
				'Operation prohibited'
			);
			await assert.revert(
				market.refundShort(toBN(1), { from: initialBidder }),
				'Operation prohibited'
			);
		});

		it('Refunding fails when the factory is paused.', async () => {
			await factory.setPaused(true, { from: accounts[1] });

			await assert.revert(
				market.refundLong(toBN(1), { from: initialBidder }),
				'This action cannot be performed while the contract is paused'
			);
			await assert.revert(
				market.refundShort(toBN(1), { from: initialBidder }),
				'This action cannot be performed while the contract is paused'
			);
		});
	});

	describe('Claiming Options', () => {
		it('Claims yield the proper balances.', async () => {
			await sUSDSynth.issue(pauper, sUSDQty);
			await sUSDSynth.approve(factory.address, sUSDQty, { from: pauper });
			await sUSDSynth.approve(market.address, sUSDQty, { from: pauper });

			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: pauper });

			await fastForward(biddingTime * 2);

			const tx1 = await market.claimOptions({ from: newBidder });
			const tx2 = await market.claimOptions({ from: pauper });

			const prices = await market.prices();

			const longOptions = divDecRound(initialLongBid, prices.long);
			const shortOptions = divDecRound(initialShortBid, prices.short);

			assert.bnClose(await long.balanceOf(newBidder), longOptions, 1);
			assert.bnEqual(await short.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await long.bidOf(newBidder), toBN(0));
			assert.bnEqual(await short.bidOf(newBidder), toBN(0));

			assert.bnEqual(await long.balanceOf(pauper), toBN(0));
			assert.bnClose(await short.balanceOf(pauper), shortOptions, 1);
			assert.bnEqual(await long.bidOf(pauper), toBN(0));
			assert.bnEqual(await short.bidOf(pauper), toBN(0));

			let logs = BinaryOption.decodeLogs(tx1.receipt.rawLogs);

			assert.equal(logs[0].address, long.address);
			assert.equal(logs[0].event, 'Transfer');
			assert.equal(logs[0].args.from, '0x' + '0'.repeat(40));
			assert.equal(logs[0].args.to, newBidder);
			assert.bnClose(logs[0].args.value, longOptions, 1);
			assert.equal(logs[1].address, long.address);
			assert.equal(logs[1].event, 'Issued');
			assert.equal(logs[1].args.account, newBidder);
			assert.bnClose(logs[1].args.value, longOptions, 1);
			assert.equal(tx1.logs[0].event, 'OptionsClaimed');
			assert.equal(tx1.logs[0].args.claimant, newBidder);
			assert.bnClose(tx1.logs[0].args.longOptions, longOptions, 1);
			assert.bnEqual(tx1.logs[0].args.shortOptions, toBN(0));

			logs = BinaryOption.decodeLogs(tx2.receipt.rawLogs);

			assert.equal(logs[0].address, short.address);
			assert.equal(logs[0].event, 'Transfer');
			assert.equal(logs[0].args.from, '0x' + '0'.repeat(40));
			assert.equal(logs[0].args.to, pauper);
			assert.bnClose(logs[0].args.value, shortOptions, 1);
			assert.equal(logs[1].address, short.address);
			assert.equal(logs[1].event, 'Issued');
			assert.equal(logs[1].args.account, pauper);
			assert.bnClose(logs[1].args.value, shortOptions, 1);
			assert.equal(tx2.logs[0].event, 'OptionsClaimed');
			assert.equal(tx2.logs[0].args.claimant, pauper);
			assert.bnEqual(tx2.logs[0].args.longOptions, toBN(0));
			assert.bnClose(tx2.logs[0].args.shortOptions, shortOptions, 1);
		});

		it('Can claim both sides simultaneously.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });

			await fastForward(biddingTime * 2);

			const tx = await market.claimOptions({ from: newBidder });
			const prices = await market.prices();
			const longOptions = divDecRound(initialLongBid, prices.long);
			const shortOptions = divDecRound(initialShortBid, prices.short);

			assert.bnClose(await long.balanceOf(newBidder), longOptions, 1);
			assert.bnClose(await short.balanceOf(newBidder), shortOptions, 1);

			const logs = BinaryOption.decodeLogs(tx.receipt.rawLogs);

			assert.equal(logs[0].address, long.address);
			assert.equal(logs[0].event, 'Transfer');
			assert.equal(logs[0].args.from, '0x' + '0'.repeat(40));
			assert.equal(logs[0].args.to, newBidder);
			assert.bnClose(logs[0].args.value, longOptions, 1);
			assert.equal(logs[1].address, long.address);
			assert.equal(logs[1].event, 'Issued');
			assert.equal(logs[1].args.account, newBidder);
			assert.bnClose(logs[1].args.value, longOptions, 1);
			assert.equal(logs[2].address, short.address);
			assert.equal(logs[2].event, 'Transfer');
			assert.equal(logs[2].args.from, '0x' + '0'.repeat(40));
			assert.equal(logs[2].args.to, newBidder);
			assert.bnClose(logs[2].args.value, shortOptions, 1);
			assert.equal(logs[3].address, short.address);
			assert.equal(logs[3].event, 'Issued');
			assert.equal(logs[3].args.account, newBidder);
			assert.bnClose(logs[3].args.value, shortOptions, 1);
		});

		it('Cannot claim options during bidding.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });
			await assert.revert(market.claimOptions({ from: newBidder }), 'Bidding must be complete.');
		});

		it('Claiming with no bids does nothing.', async () => {
			await fastForward(biddingTime * 2);
			const tx = await market.claimOptions({ from: newBidder });

			assert.bnEqual(await long.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await short.balanceOf(newBidder), toBN(0));
			assert.equal(tx.logs.length, 0);
			assert.equal(tx.receipt.rawLogs, 0);
		});

		it('Claiming works for an account which already has options.', async () => {
			await sUSDSynth.issue(pauper, sUSDQty);
			await sUSDSynth.approve(factory.address, sUSDQty, { from: pauper });
			await sUSDSynth.approve(market.address, sUSDQty, { from: pauper });
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidLong(initialLongBid, { from: pauper });
			await fastForward(biddingTime * 2);
			await market.claimOptions({ from: newBidder });

			long.transfer(pauper, toUnit(1), { from: newBidder });

			await market.claimOptions({ from: pauper });

			const prices = await market.prices();
			const longOptions = divDecRound(initialLongBid, prices.long);
			assert.bnClose(await long.balanceOf(pauper), longOptions.add(toUnit(1)));
		});

		it('Claiming fails if the system is suspended.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });
			await fastForward(biddingTime * 2);

			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});

			await assert.revert(market.claimOptions({ from: newBidder }), 'Operation prohibited');
		});

		it('Claiming fails if the factory is paused.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });
			await fastForward(biddingTime * 2);

			await factory.setPaused(true, { from: accounts[1] });
			await assert.revert(
				market.claimOptions({ from: newBidder }),
				'This action cannot be performed while the contract is paused'
			);
		});
	});

	describe('Exercising Options', () => {
		it('Exercising options yields the proper balances (long case).', async () => {
			await sUSDSynth.issue(pauper, sUSDQty);
			await sUSDSynth.approve(factory.address, sUSDQty, { from: pauper });
			await sUSDSynth.approve(market.address, sUSDQty, { from: pauper });

			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: pauper });

			await fastForward(biddingTime + 100);

			await market.claimOptions({ from: newBidder });
			await market.claimOptions({ from: pauper });

			await fastForward(timeToMaturity + 100);

			const newBidderBalance = await sUSDSynth.balanceOf(newBidder);
			const pauperBalance = await sUSDSynth.balanceOf(pauper);

			const now = await currentTime();
			const price = await market.targetOraclePrice();
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await market.resolve();

			const tx1 = await market.exerciseOptions({ from: newBidder });
			const tx2 = await market.exerciseOptions({ from: pauper });

			const prices = await market.prices();
			const longOptions = divDecRound(initialLongBid, prices.long);
			const shortOptions = divDecRound(initialShortBid, prices.short);

			assert.bnEqual(await long.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await short.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await long.bidOf(newBidder), toBN(0));
			assert.bnEqual(await short.bidOf(newBidder), toBN(0));
			assert.bnClose(await sUSDSynth.balanceOf(newBidder), newBidderBalance.add(longOptions), 1);

			assert.bnEqual(await long.balanceOf(pauper), toBN(0));
			assert.bnEqual(await short.balanceOf(pauper), toBN(0));
			assert.bnEqual(await long.bidOf(pauper), toBN(0));
			assert.bnEqual(await short.bidOf(pauper), toBN(0));
			assert.bnEqual(await sUSDSynth.balanceOf(pauper), pauperBalance);

			let logs = BinaryOption.decodeLogs(tx1.receipt.rawLogs);
			assert.equal(logs.length, 3);
			assert.equal(logs[0].address, long.address);
			assert.equal(logs[0].event, 'Transfer');
			assert.equal(logs[0].args.from, newBidder);
			assert.equal(logs[0].args.to, '0x' + '0'.repeat(40));
			assert.bnClose(logs[0].args.value, longOptions, 1);
			assert.equal(logs[1].address, long.address);
			assert.equal(logs[1].event, 'Burned');
			assert.equal(logs[1].args.account, newBidder);
			assert.bnClose(logs[1].args.value, longOptions, 1);
			assert.equal(tx1.logs.length, 1);
			assert.equal(tx1.logs[0].event, 'OptionsExercised');
			assert.equal(tx1.logs[0].args.claimant, newBidder);
			assert.bnClose(tx1.logs[0].args.payout, longOptions, 1);

			logs = BinaryOption.decodeLogs(tx2.receipt.rawLogs);
			assert.equal(logs.length, 2);
			assert.equal(logs[0].address, short.address);
			assert.equal(logs[0].event, 'Transfer');
			assert.equal(logs[0].args.from, pauper);
			assert.equal(logs[0].args.to, '0x' + '0'.repeat(40));
			assert.bnClose(logs[0].args.value, shortOptions, 1);
			assert.equal(logs[1].address, short.address);
			assert.equal(logs[1].event, 'Burned');
			assert.equal(logs[1].args.account, pauper);
			assert.bnClose(logs[1].args.value, shortOptions, 1);
			assert.equal(tx2.logs.length, 1);
			assert.equal(tx2.logs[0].event, 'OptionsExercised');
			assert.equal(tx2.logs[0].args.claimant, pauper);
			assert.bnClose(tx2.logs[0].args.payout, toBN(0), 1);
		});

		it('Exercising options yields the proper balances (short case).', async () => {
			await sUSDSynth.issue(pauper, sUSDQty);
			await sUSDSynth.approve(factory.address, sUSDQty, { from: pauper });
			await sUSDSynth.approve(market.address, sUSDQty, { from: pauper });

			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: pauper });

			await fastForward(biddingTime + 100);

			await market.claimOptions({ from: newBidder });
			await market.claimOptions({ from: pauper });

			await fastForward(timeToMaturity + 100);

			const newBidderBalance = await sUSDSynth.balanceOf(newBidder);
			const pauperBalance = await sUSDSynth.balanceOf(pauper);

			const now = await currentTime();
			const price = (await market.targetOraclePrice()).div(toBN(2));
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await market.resolve();

			const tx1 = await market.exerciseOptions({ from: newBidder });
			const tx2 = await market.exerciseOptions({ from: pauper });

			const prices = await market.prices();
			const longOptions = divDecRound(initialLongBid, prices.long);
			const shortOptions = divDecRound(initialShortBid, prices.short);

			assert.bnEqual(await long.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await short.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await long.bidOf(newBidder), toBN(0));
			assert.bnEqual(await short.bidOf(newBidder), toBN(0));
			assert.bnEqual(await sUSDSynth.balanceOf(newBidder), newBidderBalance);

			assert.bnEqual(await long.balanceOf(pauper), toBN(0));
			assert.bnEqual(await short.balanceOf(pauper), toBN(0));
			assert.bnEqual(await long.bidOf(pauper), toBN(0));
			assert.bnEqual(await short.bidOf(pauper), toBN(0));
			assert.bnClose(await sUSDSynth.balanceOf(pauper), pauperBalance.add(shortOptions), 1);

			let logs = BinaryOption.decodeLogs(tx1.receipt.rawLogs);
			assert.equal(logs.length, 2);
			assert.equal(logs[0].address, long.address);
			assert.equal(logs[0].event, 'Transfer');
			assert.equal(logs[0].args.from, newBidder);
			assert.equal(logs[0].args.to, '0x' + '0'.repeat(40));
			assert.bnClose(logs[0].args.value, longOptions, 1);
			assert.equal(logs[1].address, long.address);
			assert.equal(logs[1].event, 'Burned');
			assert.equal(logs[1].args.account, newBidder);
			assert.bnClose(logs[1].args.value, longOptions, 1);
			assert.equal(tx1.logs.length, 1);
			assert.equal(tx1.logs[0].event, 'OptionsExercised');
			assert.equal(tx1.logs[0].args.claimant, newBidder);
			assert.bnClose(tx1.logs[0].args.payout, toBN(0), 1);

			logs = BinaryOption.decodeLogs(tx2.receipt.rawLogs);
			assert.equal(logs.length, 3);
			assert.equal(logs[0].address, short.address);
			assert.equal(logs[0].event, 'Transfer');
			assert.equal(logs[0].args.from, pauper);
			assert.equal(logs[0].args.to, '0x' + '0'.repeat(40));
			assert.bnClose(logs[0].args.value, shortOptions, 1);
			assert.equal(logs[1].address, short.address);
			assert.equal(logs[1].event, 'Burned');
			assert.equal(logs[1].args.account, pauper);
			assert.bnClose(logs[1].args.value, shortOptions, 1);
			assert.equal(tx2.logs.length, 1);
			assert.equal(tx2.logs[0].event, 'OptionsExercised');
			assert.equal(tx2.logs[0].args.claimant, pauper);
			assert.bnClose(tx2.logs[0].args.payout, shortOptions, 1);
		});

		it('Only one side pays out if both sides are owned.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });
			await fastForward(biddingTime + 100);
			await market.claimOptions({ from: newBidder });
			await fastForward(timeToMaturity + 100);

			const newBidderBalance = await sUSDSynth.balanceOf(newBidder);

			const now = await currentTime();
			const price = await market.targetOraclePrice();
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await market.resolve();

			const tx = await market.exerciseOptions({ from: newBidder });

			const prices = await market.prices();
			const longOptions = divDecRound(initialLongBid, prices.long);
			const shortOptions = divDecRound(initialShortBid, prices.short);

			assert.bnEqual(await long.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await short.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await long.bidOf(newBidder), toBN(0));
			assert.bnEqual(await short.bidOf(newBidder), toBN(0));
			assert.bnClose(await sUSDSynth.balanceOf(newBidder), newBidderBalance.add(longOptions), 1);

			const logs = BinaryOption.decodeLogs(tx.receipt.rawLogs);
			assert.equal(logs.length, 5);
			assert.equal(logs[0].address, long.address);
			assert.equal(logs[0].event, 'Transfer');
			assert.equal(logs[0].args.from, newBidder);
			assert.equal(logs[0].args.to, '0x' + '0'.repeat(40));
			assert.bnClose(logs[0].args.value, longOptions, 1);
			assert.equal(logs[1].address, long.address);
			assert.equal(logs[1].event, 'Burned');
			assert.equal(logs[1].args.account, newBidder);
			assert.bnClose(logs[1].args.value, longOptions, 1);
			assert.equal(logs[2].address, short.address);
			assert.equal(logs[2].event, 'Transfer');
			assert.equal(logs[2].args.from, newBidder);
			assert.equal(logs[2].args.to, '0x' + '0'.repeat(40));
			assert.bnClose(logs[2].args.value, shortOptions, 1);
			assert.equal(logs[3].address, short.address);
			assert.equal(logs[3].event, 'Burned');
			assert.equal(logs[3].args.account, newBidder);
			assert.bnClose(logs[3].args.value, shortOptions, 1);
			assert.equal(tx.logs.length, 1);
			assert.equal(tx.logs[0].event, 'OptionsExercised');
			assert.equal(tx.logs[0].args.claimant, newBidder);
			assert.bnClose(tx.logs[0].args.payout, longOptions, 1);
		});

		it('Exercising options updates total deposits.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });

			const preDeposited = await market.deposited();
			const preTotalDeposited = await factory.totalDeposited();

			await fastForward(biddingTime + timeToMaturity + 100);
			await exchangeRates.updateRates(
				[sAUDKey],
				[await market.targetOraclePrice()],
				await currentTime(),
				{ from: oracle }
			);
			await market.resolve();
			await market.exerciseOptions({ from: newBidder });

			const longOptions = divDecRound(initialLongBid, (await market.prices()).long);
			assert.bnClose(await market.deposited(), preDeposited.sub(longOptions), 1);
			assert.bnClose(await factory.totalDeposited(), preTotalDeposited.sub(longOptions), 1);
		});

		it('Options cannot be exercised until a market has resolved.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });
			await fastForward(biddingTime + 100);
			await market.claimOptions({ from: newBidder });
			await fastForward(timeToMaturity + 100);
			await assert.revert(
				market.exerciseOptions({ from: newBidder }),
				'The market has not yet resolved.'
			);
		});

		it('Exercising options with none owned does nothing.', async () => {
			await fastForward(biddingTime + timeToMaturity + 100);
			const now = await currentTime();
			const price = await market.targetOraclePrice();
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await market.resolve();

			const tx = await market.exerciseOptions({ from: pauper });

			assert.equal(tx.receipt.rawLogs.length, 0);
			assert.equal(tx.logs.length, 0);
		});

		it('Unclaimed options are automatically claimed when exercised.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await market.bidShort(initialShortBid, { from: newBidder });

			await fastForward(biddingTime + timeToMaturity + 100);
			const newBidderBalance = await sUSDSynth.balanceOf(newBidder);

			const now = await currentTime();
			const price = await market.targetOraclePrice();
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await market.resolve();

			const tx = await market.exerciseOptions({ from: newBidder });

			const prices = await market.prices();
			const longOptions = divDecRound(initialLongBid, prices.long);
			const shortOptions = divDecRound(initialShortBid, prices.short);

			assert.bnEqual(await long.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await short.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await long.bidOf(newBidder), toBN(0));
			assert.bnEqual(await short.bidOf(newBidder), toBN(0));
			assert.bnClose(await sUSDSynth.balanceOf(newBidder), newBidderBalance.add(longOptions), 1);

			assert.equal(tx.logs[0].event, 'OptionsClaimed');
			assert.equal(tx.logs[0].args.claimant, newBidder);
			assert.bnClose(tx.logs[0].args.longOptions, longOptions, 1);
			assert.bnClose(tx.logs[0].args.shortOptions, shortOptions, 1);
			assert.equal(tx.logs[1].event, 'OptionsExercised');
			assert.equal(tx.logs[1].args.claimant, newBidder);
			assert.bnClose(tx.logs[1].args.payout, longOptions, 1);
		});

		it('Options cannot be exercised if the system is suspended.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await fastForward(biddingTime + timeToMaturity + 100);
			await exchangeRates.updateRates(
				[sAUDKey],
				[await market.targetOraclePrice()],
				await currentTime(),
				{ from: oracle }
			);
			await market.resolve();

			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});

			await assert.revert(market.exerciseOptions({ from: newBidder }), 'Operation prohibited');
		});

		it('Options cannot be exercised if the factory is paused.', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await fastForward(biddingTime + timeToMaturity + 100);
			await exchangeRates.updateRates(
				[sAUDKey],
				[await market.targetOraclePrice()],
				await currentTime(),
				{ from: oracle }
			);
			await market.resolve();

			await factory.setPaused(true, { from: accounts[1] });
			await assert.revert(
				market.exerciseOptions({ from: newBidder }),
				'This action cannot be performed while the contract is paused'
			);
		});
	});

	describe('Destruction', () => {
		it('Self destructed markets properly remit fees.', async () => {
			const feeAddress = await feePool.FEE_ADDRESS();

			const newBidderBalance = await sUSDSynth.balanceOf(newBidder);
			const creatorBalance = await sUSDSynth.balanceOf(initialBidder);
			const feePoolBalance = await sUSDSynth.balanceOf(feeAddress);
			const marketBalance = await sUSDSynth.balanceOf(market.address);
			const sumOfBalances = newBidderBalance
				.add(creatorBalance)
				.add(feePoolBalance)
				.add(marketBalance);

			await market.bidLong(initialLongBid, { from: newBidder });
			await fastForward(biddingTime + timeToMaturity + exerciseDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice], await currentTime(), {
				from: oracle,
			});
			await market.resolve();
			await market.exerciseOptions({ from: newBidder });
			await factory.destroyMarket(market.address, { from: initialBidder });

			const pot = mulDecRound(
				initialLongBid.mul(toBN(2)).add(initialShortBid),
				toUnit(1).sub(initialPoolFee.add(initialCreatorFee))
			);
			const poolFee = mulDecRound(initialLongBid.mul(toBN(2)).add(initialShortBid), initialPoolFee);
			const creatorFee = mulDecRound(
				initialLongBid.mul(toBN(2)).add(initialShortBid),
				initialCreatorFee
			);
			const creatorRecovered = pot.div(toBN(2)).add(creatorFee);
			const postNewBidderBalance = await sUSDSynth.balanceOf(newBidder);
			const postCreatorBalance = await sUSDSynth.balanceOf(initialBidder);
			const postFeePoolBalance = await sUSDSynth.balanceOf(feeAddress);

			assert.bnClose(postCreatorBalance, creatorBalance.add(creatorRecovered));
			assert.bnClose(postFeePoolBalance, feePoolBalance.add(poolFee));

			// And ensure no tokens were lost along the way.
			assert.bnEqual(await sUSDSynth.balanceOf(market.address), toBN(0));
			assert.bnEqual(
				postNewBidderBalance.add(postCreatorBalance).add(postFeePoolBalance),
				sumOfBalances
			);
		});

		it('Self destructed markets destroy themselves and their options.', async () => {
			const marketAddress = market.address;
			const longAddress = long.address;
			const shortAddress = short.address;

			await fastForward(biddingTime + timeToMaturity + exerciseDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice], await currentTime(), {
				from: oracle,
			});
			await market.resolve();
			await factory.destroyMarket(market.address, { from: initialBidder });

			assert.equal(await web3.eth.getCode(marketAddress), '0x');
			assert.equal(await web3.eth.getCode(longAddress), '0x');
			assert.equal(await web3.eth.getCode(shortAddress), '0x');
		});

		it('Unresolved markets cannot be destroyed', async () => {
			await fastForward(biddingTime + timeToMaturity + exerciseDuration + 10);
			await assert.revert(
				factory.destroyMarket(market.address, { from: initialBidder }),
				'This market has not yet resolved.'
			);
		});

		it('Market is not destructible before its time', async () => {
			await fastForward(biddingTime + timeToMaturity + 10);
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice], await currentTime(), {
				from: oracle,
			});
			await market.resolve();
			await assert.revert(
				factory.destroyMarket(market.address, { from: initialBidder }),
				'Market cannot be destroyed yet.'
			);
		});

		it('Market is not destructible except by the factory', async () => {
			await fastForward(biddingTime + timeToMaturity + exerciseDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice], await currentTime(), {
				from: oracle,
			});
			await market.resolve();

			await onlyGivenAddressCanInvoke({
				fnc: market.selfDestruct,
				args: [market.address],
				accounts,
				skipPassCheck: true,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Market remits any unclaimed bids to the creator.', async () => {
			const creatorBalance = await sUSDSynth.balanceOf(initialBidder);

			await market.bidLong(initialLongBid, { from: newBidder });
			await fastForward(biddingTime + timeToMaturity + exerciseDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice], await currentTime(), {
				from: oracle,
			});
			await market.resolve();
			await factory.destroyMarket(market.address, { from: initialBidder });

			const pot = mulDecRound(
				initialLongBid.mul(toBN(2)).add(initialShortBid),
				toUnit(1).sub(initialPoolFee.add(initialCreatorFee))
			);
			const creatorFee = mulDecRound(
				initialLongBid.mul(toBN(2)).add(initialShortBid),
				initialCreatorFee
			);
			const creatorRecovered = pot.add(creatorFee);
			const postCreatorBalance = await sUSDSynth.balanceOf(initialBidder);

			assert.bnClose(postCreatorBalance, creatorBalance.add(creatorRecovered));
		});

		it('Destruction funds are computed correctly', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });

			// Destruction funds are reported as zero before the contract is destructible.
			assert.bnEqual(await market.destructionFunds(), toBN(0));

			await fastForward(biddingTime + timeToMaturity + exerciseDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice], await currentTime(), {
				from: oracle,
			});
			await market.resolve();
			await market.exerciseOptions({ from: newBidder });

			const destructionFunds = await market.destructionFunds();

			await factory.destroyMarket(market.address, { from: initialBidder });

			const pot = mulDecRound(
				initialLongBid.mul(toBN(2)).add(initialShortBid),
				toUnit(1).sub(initialPoolFee.add(initialCreatorFee))
			);
			const creatorFee = mulDecRound(
				initialLongBid.mul(toBN(2)).add(initialShortBid),
				initialCreatorFee
			);
			const creatorRecovered = pot.div(toBN(2)).add(creatorFee);

			assert.bnClose(destructionFunds, creatorRecovered);
		});

		it('Full balance is remitted if synths were transferred to the market directly.', async () => {
			const feeAddress = await feePool.FEE_ADDRESS();
			const extraFunds = toUnit(100);
			const feePoolBalance = await sUSDSynth.balanceOf(feeAddress);

			await market.bidLong(initialLongBid, { from: newBidder });
			await fastForward(biddingTime + timeToMaturity + exerciseDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice], await currentTime(), {
				from: oracle,
			});
			await market.resolve();

			const preTotalDeposits = await factory.totalDeposited();
			const preDeposits = await market.deposited();
			await sUSDSynth.transfer(market.address, extraFunds, { from: newBidder });
			assert.bnEqual(await market.deposited(), preDeposits);
			assert.bnEqual(await factory.totalDeposited(), preTotalDeposits);

			await factory.destroyMarket(market.address, { from: initialBidder });

			const postFeePoolBalance = await sUSDSynth.balanceOf(feeAddress);
			const poolFee = mulDecRound(initialLongBid.mul(toBN(2)).add(initialShortBid), initialPoolFee);

			assert.bnClose(postFeePoolBalance, feePoolBalance.add(extraFunds).add(poolFee));
		});

		it('Market cannot be self destructed if the system is suspended', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await fastForward(biddingTime + timeToMaturity + exerciseDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice], await currentTime(), {
				from: oracle,
			});
			await market.resolve();
			await market.exerciseOptions({ from: newBidder });

			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});

			await assert.revert(
				factory.destroyMarket(market.address, { from: initialBidder }),
				'Operation prohibited'
			);
		});

		it('Market cannot be self destructed if the factory is paused', async () => {
			await market.bidLong(initialLongBid, { from: newBidder });
			await fastForward(biddingTime + timeToMaturity + exerciseDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialTargetPrice], await currentTime(), {
				from: oracle,
			});
			await market.resolve();
			await market.exerciseOptions({ from: newBidder });

			await factory.setPaused(true, { from: accounts[1] });
			await assert.revert(
				factory.destroyMarket(market.address, { from: initialBidder }),
				'This action cannot be performed while the contract is paused'
			);
		});
	});
});
