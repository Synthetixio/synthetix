'use strict';

const { artifacts, contract, web3 } = require('hardhat');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const {
	currentTime,
	fastForward,
	toUnit,
	multiplyDecimalRound,
	divideDecimalRound,
} = require('../utils')();
const { toBytes32 } = require('../..');
const { setupAllContracts, setupContract, mockGenericContractFnc } = require('./setup');
const {
	setStatus,
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	getDecodedLogs,
	decodedEventEqual,
	getEventByName,
} = require('./helpers');

let MockBinaryOptionMarketManager;
let TestableBinaryOptionMarket;
let BinaryOptionMarket;
let BinaryOption;
let SafeDecimalMath;
let Synth;

// All inputs should be BNs.
const computePrices = (longs, shorts, debt, fee) => {
	const totalOptions = multiplyDecimalRound(debt, toUnit(1).sub(fee));
	return {
		long: divideDecimalRound(longs, totalOptions),
		short: divideDecimalRound(shorts, totalOptions),
	};
};

contract('BinaryOptionMarket @gas-skip', accounts => {
	const [initialBidder, newBidder, pauper] = accounts;

	const ZERO_ADDRESS = '0x' + '0'.repeat(40);

	const sUSDQty = toUnit(10000);

	const capitalRequirement = toUnit(2);
	const skewLimit = toUnit(0.05);
	const oneDay = 60 * 60 * 24;
	const maxOraclePriceAge = 61 * 60;
	const expiryDuration = 26 * 7 * 24 * 60 * 60;
	const biddingTime = oneDay;
	const timeToMaturity = oneDay * 7;
	const initialLongBid = toUnit(10);
	const initialShortBid = toUnit(5);
	const initialStrikePrice = toUnit(100);
	const initialPoolFee = toUnit(0.008);
	const initialCreatorFee = toUnit(0.002);
	const initialRefundFee = toUnit(0.02);
	const totalInitialFee = initialPoolFee.add(initialCreatorFee);
	const sAUDKey = toBytes32('sAUD');

	let creationTime;

	let systemStatus,
		manager,
		managerMock,
		market,
		exchangeRates,
		addressResolver,
		feePool,
		sUSDSynth,
		sUSDProxy,
		oracle,
		long,
		short;

	const Phase = {
		Bidding: toBN(0),
		Trading: toBN(1),
		Maturity: toBN(2),
		Expiry: toBN(3),
	};

	const Side = {
		Long: toBN(0),
		Short: toBN(1),
	};

	const deployMarket = async ({
		resolver,
		endOfBidding,
		maturity,
		expiry,
		oracleKey,
		strikePrice,
		refundsEnabled,
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
				accounts[0],
				creator,
				resolver,
				[capitalRequirement, skewLimit],
				oracleKey,
				strikePrice,
				refundsEnabled,
				[endOfBidding, maturity, expiry],
				[longBid, shortBid],
				[poolFee, creatorFee, refundFee],
			],
		});
	};

	const setupNewMarket = async () => {
		({
			SystemStatus: systemStatus,
			BinaryOptionMarketManager: manager,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			FeePool: feePool,
			SynthsUSD: sUSDSynth,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'BinaryOptionMarketManager',
				'AddressResolver',
				'ExchangeRates',
				'FeePool',
				'Synthetix',
			],
		}));

		oracle = await exchangeRates.oracle();
		await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
			from: oracle,
		});

		sUSDProxy = await sUSDSynth.proxy();

		await Promise.all([
			sUSDSynth.issue(initialBidder, sUSDQty),
			sUSDSynth.approve(manager.address, sUSDQty, { from: initialBidder }),
			sUSDSynth.issue(newBidder, sUSDQty),
			sUSDSynth.approve(manager.address, sUSDQty, { from: newBidder }),
		]);

		creationTime = await currentTime();
		const tx = await manager.createMarket(
			sAUDKey,
			initialStrikePrice,
			true,
			[creationTime + biddingTime, creationTime + timeToMaturity],
			[initialLongBid, initialShortBid],
			{ from: initialBidder }
		);

		market = await BinaryOptionMarket.at(getEventByName({ tx, name: 'MarketCreated' }).args.market);
		const options = await market.options();
		long = await BinaryOption.at(options.long);
		short = await BinaryOption.at(options.short);

		await Promise.all([
			sUSDSynth.approve(market.address, sUSDQty, { from: initialBidder }),
			sUSDSynth.approve(market.address, sUSDQty, { from: newBidder }),
		]);

		managerMock = await setupContract({
			accounts,
			contract: 'GenericMock',
			mock: 'BinaryOptionMarketManager',
		});

		const functions = [
			['incrementTotalDeposited', []],
			['decrementTotalDeposited', []],
			['durations', [61 * 60, 0, 0]],
			['paused', [false]],
		];

		await Promise.all(
			functions.map(f =>
				mockGenericContractFnc({
					instance: managerMock,
					fncName: f[0],
					mock: 'BinaryOptionMarketManager',
					returns: f[1],
				})
			)
		);
	};

	before(async () => {
		MockBinaryOptionMarketManager = artifacts.require('MockBinaryOptionMarketManager');
		TestableBinaryOptionMarket = artifacts.require('TestableBinaryOptionMarket');
		BinaryOptionMarket = artifacts.require('BinaryOptionMarket');
		BinaryOption = artifacts.require('BinaryOption');
		SafeDecimalMath = artifacts.require('SafeDecimalMath');
		Synth = artifacts.require('Synth');

		const math = await SafeDecimalMath.new();
		TestableBinaryOptionMarket.link(math);
		MockBinaryOptionMarketManager.link(math);
		await setupNewMarket();
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('Basic parameters', () => {
		it('static parameters are set properly', async () => {
			const times = await market.times();
			assert.bnEqual(times.biddingEnd, toBN(creationTime + biddingTime));
			assert.bnEqual(times.maturity, toBN(creationTime + timeToMaturity));
			assert.bnEqual(times.expiry, toBN(creationTime + timeToMaturity + expiryDuration));

			const oracleDetails = await market.oracleDetails();
			assert.equal(oracleDetails.key, sAUDKey);
			assert.bnEqual(oracleDetails.strikePrice, initialStrikePrice);
			assert.bnEqual(oracleDetails.finalPrice, toBN(0));

			const fees = await market.fees();
			assert.bnEqual(fees.poolFee, initialPoolFee);
			assert.bnEqual(fees.creatorFee, initialCreatorFee);
			assert.bnEqual(fees.refundFee, initialRefundFee);

			assert.bnEqual(await market.deposited(), initialLongBid.add(initialShortBid));
			assert.equal(await market.owner(), manager.address);
			assert.equal(await market.creator(), initialBidder);
		});

		it('BinaryOption instances are set up properly.', async () => {
			const prices = computePrices(
				initialLongBid,
				initialShortBid,
				initialLongBid.add(initialShortBid),
				totalInitialFee
			);
			const observedPrices = await market.prices();
			assert.bnEqual(observedPrices.long, prices.long);
			assert.bnEqual(observedPrices.short, prices.short);

			const bids = await market.bidsOf(initialBidder);
			assert.bnEqual(await long.bidOf(initialBidder), initialLongBid);
			assert.bnEqual(await short.bidOf(initialBidder), initialShortBid);
			assert.bnEqual(bids.long, initialLongBid);
			assert.bnEqual(bids.short, initialShortBid);
			assert.bnEqual(await long.totalBids(), initialLongBid);
			assert.bnEqual(await short.totalBids(), initialShortBid);

			const claimable = await market.claimableBalancesOf(initialBidder);
			const totalClaimable = await market.totalClaimableSupplies();
			assert.bnEqual(claimable.long, await long.claimableBalanceOf(initialBidder));
			assert.bnEqual(claimable.short, await short.claimableBalanceOf(initialBidder));
			assert.bnEqual(totalClaimable.long, claimable.long);
			assert.bnEqual(totalClaimable.short, claimable.short);

			await fastForward(biddingTime + 1);
			await market.claimOptions({ from: initialBidder });

			const balances = await market.balancesOf(initialBidder);
			assert.bnEqual(balances.long, claimable.long);
			assert.bnEqual(balances.short, claimable.short);

			const totalSupplies = await market.totalSupplies();
			assert.bnEqual(totalSupplies.long, claimable.long);
			assert.bnEqual(totalSupplies.short, claimable.short);

			const refundsEnabled = await market.refundsEnabled();
			assert.isTrue(refundsEnabled);
		});

		it('BinaryOption instances cannot transfer if the system is suspended or paused', async () => {
			await long.approve(pauper, toUnit(100), { from: initialBidder });
			await manager.setPaused(true, { from: accounts[1] });
			await assert.revert(
				long.transfer(market.address, toUnit(1), { from: initialBidder }),
				'This action cannot be performed while the contract is paused'
			);
			await assert.revert(
				long.transferFrom(initialBidder, market.address, toUnit(1), { from: pauper }),
				'This action cannot be performed while the contract is paused'
			);
			await manager.setPaused(false, { from: accounts[1] });

			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});
			await assert.revert(
				long.transfer(market.address, toUnit(1), { from: initialBidder }),
				'Operation prohibited'
			);
			await assert.revert(
				long.transferFrom(initialBidder, market.address, toUnit(1), { from: pauper }),
				'Operation prohibited'
			);
		});

		it('Bad constructor parameters revert.', async () => {
			// Insufficient capital
			let localCreationTime = await currentTime();
			await assert.revert(
				deployMarket({
					resolver: addressResolver.address,
					endOfBidding: localCreationTime + 100,
					maturity: localCreationTime + 200,
					expiry: localCreationTime + 200 + expiryDuration,
					oracleKey: sAUDKey,
					strikePrice: initialStrikePrice,
					longBid: toUnit(0),
					shortBid: toUnit(0),
					poolFee: initialPoolFee,
					creatorFee: initialCreatorFee,
					refundFee: initialRefundFee,
					creator: initialBidder,
					refundsEnabled: true,
				}),
				'Insufficient capital'
			);

			// zero initial price on either side
			localCreationTime = await currentTime();
			await assert.revert(
				deployMarket({
					resolver: addressResolver.address,
					endOfBidding: localCreationTime + 100,
					maturity: localCreationTime + 200,
					expiry: localCreationTime + 200 + expiryDuration,
					oracleKey: sAUDKey,
					strikePrice: initialStrikePrice,
					longBid: toUnit(0),
					shortBid: initialShortBid,
					poolFee: initialPoolFee,
					creatorFee: initialCreatorFee,
					refundFee: initialRefundFee,
					creator: initialBidder,
					refundsEnabled: true,
				}),
				'Bids too skewed'
			);

			localCreationTime = await currentTime();
			await assert.revert(
				deployMarket({
					resolver: addressResolver.address,
					endOfBidding: localCreationTime + 100,
					maturity: localCreationTime + 200,
					expiry: localCreationTime + 200 + expiryDuration,
					oracleKey: sAUDKey,
					strikePrice: initialStrikePrice,
					longBid: initialLongBid,
					shortBid: toUnit(0),
					poolFee: initialPoolFee,
					creatorFee: initialCreatorFee,
					refundFee: initialRefundFee,
					creator: initialBidder,
					refundsEnabled: true,
				}),
				'Bids too skewed'
			);
		});

		it('Only expected functions are mutative', async () => {
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
		});
	});

	describe('Prices', () => {
		it('updatePrices is correct.', async () => {
			const localCreationTime = await currentTime();
			const localMarket = await deployMarket({
				resolver: addressResolver.address,
				endOfBidding: localCreationTime + 100,
				maturity: localCreationTime + 200,
				expiry: localCreationTime + 200 + expiryDuration,
				oracleKey: sAUDKey,
				strikePrice: initialStrikePrice,
				longBid: initialLongBid,
				shortBid: initialShortBid,
				poolFee: initialPoolFee,
				creatorFee: initialCreatorFee,
				refundFee: initialRefundFee,
				creator: initialBidder,
				refundsEnabled: true,
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
				assert.bnClose(
					prices[0].add(prices[1]),
					divideDecimalRound(toUnit(1), toUnit(1).sub(totalInitialFee)),
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
				expiry: localCreationTime + 200 + expiryDuration,
				oracleKey: sAUDKey,
				strikePrice: initialStrikePrice,
				longBid: initialLongBid,
				shortBid: initialShortBid,
				poolFee: initialPoolFee,
				creatorFee: initialCreatorFee,
				refundFee: initialRefundFee,
				creator: initialBidder,
				refundsEnabled: true,
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
				expiry: localCreationTime + 200 + expiryDuration,
				oracleKey: sAUDKey,
				strikePrice: initialStrikePrice,
				longBid: initialLongBid,
				shortBid: initialShortBid,
				poolFee: initialPoolFee,
				creatorFee: initialCreatorFee,
				refundFee: initialRefundFee,
				creator: initialBidder,
				refundsEnabled: true,
			});

			await localMarket.updatePrices(toUnit(1), toUnit(1), toUnit(4));
			const price = divideDecimalRound(toUnit(0.25), toUnit(1).sub(totalInitialFee));
			const observedPrices = await localMarket.prices();
			assert.bnClose(observedPrices.long, price, 1);
			assert.bnClose(observedPrices.short, price, 1);
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

		it('senderPriceAndExercisableDeposits cannot be invoked except by options.', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: market.senderPriceAndExercisableDeposits,
				args: [],
				accounts,
				skipPassCheck: true,
				reason: 'Sender is not an option',
			});
		});

		it('pricesAfterBidOrRefund correctly computes the result of bids.', async () => {
			const [longBid, shortBid] = [toUnit(1), toUnit(23)];

			// Long side
			let expectedPrices = await market.pricesAfterBidOrRefund(Side.Long, longBid, false);
			await market.bid(Side.Long, longBid);
			let prices = await market.prices();
			assert.bnEqual(expectedPrices.long, prices.long);
			assert.bnEqual(expectedPrices.short, prices.short);

			// Null bids are computed properly
			expectedPrices = await market.pricesAfterBidOrRefund(Side.Long, toBN(0), false);
			assert.bnEqual(expectedPrices.long, prices.long);
			assert.bnEqual(expectedPrices.short, prices.short);

			// Short side
			expectedPrices = await market.pricesAfterBidOrRefund(Side.Short, shortBid, false);
			await market.bid(Side.Short, shortBid);
			prices = await market.prices();
			assert.bnEqual(expectedPrices.long, prices.long);
			assert.bnEqual(expectedPrices.short, prices.short);

			// Null bids are computed properly
			expectedPrices = await market.pricesAfterBidOrRefund(Side.Short, toBN(0), false);
			assert.bnEqual(expectedPrices.long, prices.long);
			assert.bnEqual(expectedPrices.short, prices.short);
		});

		it('pricesAfterBidOrRefund correctly computes the result of refunds.', async () => {
			const [longRefund, shortRefund] = [toUnit(8), toUnit(2)];

			// Long side
			let expectedPrices = await market.pricesAfterBidOrRefund(Side.Long, longRefund, true);
			await market.refund(Side.Long, longRefund);
			let prices = await market.prices();
			assert.bnEqual(expectedPrices.long, prices.long);
			assert.bnEqual(expectedPrices.short, prices.short);

			// Null bids are computed properly
			expectedPrices = await market.pricesAfterBidOrRefund(Side.Long, toBN(0), true);
			assert.bnEqual(expectedPrices.long, prices.long);
			assert.bnEqual(expectedPrices.short, prices.short);

			// Short side
			expectedPrices = await market.pricesAfterBidOrRefund(Side.Short, shortRefund, true);
			await market.refund(Side.Short, shortRefund);
			prices = await market.prices();
			assert.bnEqual(expectedPrices.long, prices.long);
			assert.bnEqual(expectedPrices.short, prices.short);

			// Null bids are computed properly
			expectedPrices = await market.pricesAfterBidOrRefund(Side.Short, toBN(0), true);
			assert.bnEqual(expectedPrices.long, prices.long);
			assert.bnEqual(expectedPrices.short, prices.short);
		});

		it('pricesAfterBidOrRefund reverts if the refund is larger than the total on either side.', async () => {
			const bids = await market.bidsOf(accounts[0]);
			await assert.revert(
				market.pricesAfterBidOrRefund(Side.Long, bids.long.add(toBN(1)), true),
				'SafeMath: subtraction overflow'
			);
			await assert.revert(
				market.pricesAfterBidOrRefund(Side.Short, bids.short.add(toBN(1)), true),
				'SafeMath: subtraction overflow'
			);
		});

		it('pricesAfterBidOrRefund reverts if a refund is equal to the total on either side.', async () => {
			const bids = await market.bidsOf(accounts[0]);
			await assert.revert(
				market.pricesAfterBidOrRefund(Side.Long, bids.long, true),
				'Bids must be nonzero'
			);
			await assert.revert(
				market.pricesAfterBidOrRefund(Side.Short, bids.short, true),
				'Bids must be nonzero'
			);
		});

		it('bidOrRefundForPrice correctly computes same-side bid values', async () => {
			// Long -> Long
			const longPrice = toUnit(0.7);
			let bid = await market.bidOrRefundForPrice(Side.Long, Side.Long, longPrice, false);
			await market.bid(Side.Long, bid);
			let prices = await market.prices();
			assert.bnClose(prices.long, longPrice);

			// Short -> Short
			const shortPrice = toUnit(0.4);
			bid = await market.bidOrRefundForPrice(Side.Short, Side.Short, shortPrice, false);
			await market.bid(Side.Short, bid);
			prices = await market.prices();
			assert.bnClose(prices.short, shortPrice);

			// Attempting to go to a lower price by bidding on the same side yields 0.
			assert.bnEqual(
				await market.bidOrRefundForPrice(Side.Long, Side.Long, toUnit(0.1), false),
				toBN(0)
			);
			assert.bnEqual(
				await market.bidOrRefundForPrice(Side.Short, Side.Short, toUnit(0.1), false),
				toBN(0)
			);
		});

		it('bidOrRefundForPrice correctly computes opposite-side bid values', async () => {
			// Long -> Short
			const shortPrice = toUnit(0.2);
			let bid = await market.bidOrRefundForPrice(Side.Long, Side.Short, shortPrice, false);
			await market.bid(Side.Long, bid);
			let prices = await market.prices();
			assert.bnClose(prices.short, shortPrice);

			// Short -> Long
			const longPrice = toUnit(0.5);
			bid = await market.bidOrRefundForPrice(Side.Short, Side.Long, longPrice, false);
			await market.bid(Side.Short, bid);
			prices = await market.prices();
			assert.bnClose(prices.long, longPrice);

			// Attempting to go to a higher price by bidding on the other side yields 0.
			assert.bnEqual(
				await market.bidOrRefundForPrice(Side.Long, Side.Short, toUnit(0.9), false),
				toBN(0)
			);
			assert.bnEqual(
				await market.bidOrRefundForPrice(Side.Short, Side.Long, toUnit(0.9), false),
				toBN(0)
			);
		});

		it('bidOrRefundForPrice correctly computes same-side refund values', async () => {
			// Long -> Long
			const longPrice = toUnit(0.4);
			let refund = await market.bidOrRefundForPrice(Side.Long, Side.Long, longPrice, true);
			await market.refund(Side.Long, refund);
			let prices = await market.prices();
			assert.bnClose(prices.long, longPrice);

			// Short -> Short
			const shortPrice = toUnit(0.55);
			refund = await market.bidOrRefundForPrice(Side.Short, Side.Short, shortPrice, true);
			await market.refund(Side.Short, refund);
			prices = await market.prices();
			assert.bnClose(prices.short, shortPrice);

			// Attempting to go to a higher price by refunding on the same side yields 0.
			assert.bnEqual(
				await market.bidOrRefundForPrice(Side.Long, Side.Long, toUnit(0.9), true),
				toBN(0)
			);
			assert.bnEqual(
				await market.bidOrRefundForPrice(Side.Short, Side.Short, toUnit(0.9), true),
				toBN(0)
			);
		});

		it('bidOrRefundForPrice correctly computes opposite-side refund values', async () => {
			// Long -> Short
			const shortPrice = toUnit(0.5);
			let refund = await market.bidOrRefundForPrice(Side.Long, Side.Short, shortPrice, true);
			await market.refund(Side.Long, refund);
			let prices = await market.prices();
			assert.bnClose(prices.short, shortPrice);

			// Short -> Long
			const longPrice = toUnit(0.6);
			refund = await market.bidOrRefundForPrice(Side.Short, Side.Long, longPrice, true);
			await market.refund(Side.Short, refund);
			prices = await market.prices();
			assert.bnClose(prices.long, longPrice);

			// Attempting to go to a lower price by refunding on the other side yields 0.
			assert.bnEqual(
				await market.bidOrRefundForPrice(Side.Long, Side.Short, toUnit(0.1), true),
				toBN(0)
			);
			assert.bnEqual(
				await market.bidOrRefundForPrice(Side.Short, Side.Long, toUnit(0.1), true),
				toBN(0)
			);
		});

		it('pricesAfterBidOrRefund and bidOrRefundForPrice are inverses for bids', async () => {
			// bidOrRefundForPrice ∘ pricesAfterBidOrRefund

			let price = toUnit(0.7);
			let bid = await market.bidOrRefundForPrice(Side.Long, Side.Long, price, false);
			let prices = await market.pricesAfterBidOrRefund(Side.Long, bid, false);
			assert.bnClose(price, prices.long);
			bid = await market.bidOrRefundForPrice(Side.Short, Side.Short, price, false);
			prices = await market.pricesAfterBidOrRefund(Side.Short, bid, false);
			assert.bnClose(price, prices.short);

			price = toUnit(0.2);
			bid = await market.bidOrRefundForPrice(Side.Long, Side.Short, price, false);
			prices = await market.pricesAfterBidOrRefund(Side.Long, bid, false);
			assert.bnClose(price, prices.short);
			bid = await market.bidOrRefundForPrice(Side.Short, Side.Long, price, false);
			prices = await market.pricesAfterBidOrRefund(Side.Short, bid, false);
			assert.bnClose(price, prices.long);

			// pricesAfterBidOrRefund ∘ bidOrRefundForPrice

			bid = toUnit(1);
			prices = await market.pricesAfterBidOrRefund(Side.Long, bid, false);
			assert.bnClose(
				await market.bidOrRefundForPrice(Side.Long, Side.Long, prices.long, false),
				bid
			);
			assert.bnClose(
				await market.bidOrRefundForPrice(Side.Long, Side.Short, prices.short, false),
				bid
			);
			prices = await market.pricesAfterBidOrRefund(Side.Short, bid, false);
			assert.bnClose(
				await market.bidOrRefundForPrice(Side.Short, Side.Short, prices.short, false),
				bid
			);
			assert.bnClose(
				await market.bidOrRefundForPrice(Side.Short, Side.Long, prices.long, false),
				bid
			);
		});

		it('pricesAfterBidOrRefund and bidOrRefundForPrice are inverses for bids', async () => {
			// bidOrRefundForPrice ∘ pricesAfterBidOrRefund

			let price = toUnit(0.25);
			let refund = await market.bidOrRefundForPrice(Side.Long, Side.Long, price, true);
			let prices = await market.pricesAfterBidOrRefund(Side.Long, refund, true);
			assert.bnClose(price, prices.long);
			refund = await market.bidOrRefundForPrice(Side.Short, Side.Short, price, true);
			prices = await market.pricesAfterBidOrRefund(Side.Short, refund, true);
			assert.bnClose(price, prices.short);

			price = toUnit(0.85);
			refund = await market.bidOrRefundForPrice(Side.Long, Side.Short, price, true);
			prices = await market.pricesAfterBidOrRefund(Side.Long, refund, true);
			assert.bnClose(price, prices.short);
			refund = await market.bidOrRefundForPrice(Side.Short, Side.Long, price, true);
			prices = await market.pricesAfterBidOrRefund(Side.Short, refund, true);
			assert.bnClose(price, prices.long);

			// pricesAfterBidOrRefund ∘ bidOrRefundForPrice

			refund = toUnit(3.5);
			prices = await market.pricesAfterBidOrRefund(Side.Long, refund, true);
			assert.bnClose(
				await market.bidOrRefundForPrice(Side.Long, Side.Long, prices.long, true),
				refund,
				20
			);
			assert.bnClose(
				await market.bidOrRefundForPrice(Side.Long, Side.Short, prices.short, true),
				refund,
				20
			);
			prices = await market.pricesAfterBidOrRefund(Side.Short, refund, true);
			assert.bnClose(
				await market.bidOrRefundForPrice(Side.Short, Side.Short, prices.short, true),
				refund,
				20
			);
			assert.bnClose(
				await market.bidOrRefundForPrice(Side.Short, Side.Long, prices.long, true),
				refund,
				20
			);
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
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice.div(two)], now, {
				from: oracle,
			});
			assert.bnEqual(await market.result(), Side.Short);
			now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice.mul(two)], now, {
				from: oracle,
			});
			assert.bnEqual(await market.result(), Side.Long);

			await fastForward(biddingTime + timeToMaturity + 10);
			now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice.mul(two)], now, {
				from: oracle,
			});
			await manager.resolveMarket(market.address);

			assert.isTrue(await market.resolved());
			now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice.div(two)], now, {
				from: oracle,
			});
			assert.bnEqual(await market.result(), Side.Long);
			now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice.mul(two)], now, {
				from: oracle,
			});
			assert.bnEqual(await market.result(), Side.Long);
		});

		it('Result resolves correctly long.', async () => {
			await fastForward(timeToMaturity + 1);
			const now = await currentTime();
			const price = initialStrikePrice.add(toBN(1));
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			const tx = await manager.resolveMarket(market.address);
			assert.bnEqual(await market.result(), Side.Long);
			assert.isTrue(await market.resolved());
			assert.bnEqual((await market.oracleDetails()).finalPrice, price);

			const totalDeposited = initialLongBid.add(initialShortBid);
			const poolFees = multiplyDecimalRound(totalDeposited, initialPoolFee);
			const creatorFees = multiplyDecimalRound(totalDeposited, initialCreatorFee);

			const log = BinaryOptionMarket.decodeLogs(tx.receipt.rawLogs)[0];
			assert.eventEqual(log, 'MarketResolved', {
				result: Side.Long,
				oraclePrice: price,
				oracleTimestamp: now,
				deposited: totalDeposited.sub(poolFees.add(creatorFees)),
				poolFees,
				creatorFees,
			});
			assert.equal(log.event, 'MarketResolved');
			assert.bnEqual(log.args.result, Side.Long);
			assert.bnEqual(log.args.oraclePrice, price);
			assert.bnEqual(log.args.oracleTimestamp, now);
		});

		it('Result resolves correctly short.', async () => {
			await fastForward(timeToMaturity + 1);
			const now = await currentTime();
			const price = initialStrikePrice.sub(toBN(1));
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			const tx = await manager.resolveMarket(market.address);
			assert.isTrue(await market.resolved());
			assert.bnEqual(await market.result(), Side.Short);
			assert.bnEqual((await market.oracleDetails()).finalPrice, price);

			const log = BinaryOptionMarket.decodeLogs(tx.receipt.rawLogs)[0];
			assert.equal(log.event, 'MarketResolved');
			assert.bnEqual(log.args.result, Side.Short);
			assert.bnEqual(log.args.oraclePrice, price);
			assert.bnEqual(log.args.oracleTimestamp, now);
		});

		it('A result equal to the strike price resolves long.', async () => {
			await fastForward(timeToMaturity + 1);
			const now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice], now, { from: oracle });
			await manager.resolveMarket(market.address);
			assert.isTrue(await market.resolved());
			assert.bnEqual(await market.result(), Side.Long);
			assert.bnEqual((await market.oracleDetails()).finalPrice, initialStrikePrice);
		});

		it('Resolution cannot occur before maturity.', async () => {
			assert.isFalse(await market.canResolve());
			await assert.revert(manager.resolveMarket(market.address), 'Not yet mature');
		});

		it('Resolution can only occur once.', async () => {
			await fastForward(timeToMaturity + 1);
			const now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice], now, { from: oracle });
			assert.isTrue(await market.canResolve());
			await manager.resolveMarket(market.address);
			assert.isFalse(await market.canResolve());
			await assert.revert(manager.resolveMarket(market.address), 'Not an active market');

			// And check that it works at the market level.
			const mockManager = await MockBinaryOptionMarketManager.new();
			const localCreationTime = await currentTime();
			await mockManager.createMarket(
				addressResolver.address,
				initialBidder,
				[capitalRequirement, skewLimit],
				sAUDKey,
				initialStrikePrice,
				true,
				[
					localCreationTime + 100,
					localCreationTime + 200,
					localCreationTime + 200 + expiryDuration,
				],
				[toUnit(10), toUnit(10)],
				[initialPoolFee, initialCreatorFee, initialRefundFee]
			);
			await sUSDSynth.transfer(await mockManager.market(), toUnit(20));
			await fastForward(500);
			await mockManager.resolveMarket();
			await assert.revert(mockManager.resolveMarket(), 'Market already resolved');
		});

		it('Resolution cannot occur if the price is too old.', async () => {
			await fastForward(timeToMaturity + 1);
			const now = await currentTime();
			await exchangeRates.updateRates(
				[sAUDKey],
				[initialStrikePrice],
				now - (maxOraclePriceAge + 60),
				{
					from: oracle,
				}
			);
			assert.isFalse(await market.canResolve());
			await assert.revert(manager.resolveMarket(market.address), 'Price is stale');
		});

		it('Resolution can occur if the price was updated within the maturity window but before maturity.', async () => {
			await fastForward(timeToMaturity + 1);
			const now = await currentTime();
			await exchangeRates.updateRates(
				[sAUDKey],
				[initialStrikePrice],
				now - (maxOraclePriceAge - 60),
				{
					from: oracle,
				}
			);
			assert.isTrue(await market.canResolve());
			await manager.resolveMarket(market.address);
		});

		it('Resolution properly remits the collected fees.', async () => {
			await fastForward(timeToMaturity + 1);
			await exchangeRates.updateRates([sAUDKey], [toUnit(0.7)], await currentTime(), {
				from: oracle,
			});

			const feeAddress = await feePool.FEE_ADDRESS();

			const [
				creatorPrebalance,
				poolPrebalance,
				preDeposits,
				preExercisable,
				preTotalDeposits,
			] = await Promise.all([
				sUSDSynth.balanceOf(initialBidder),
				sUSDSynth.balanceOf(feeAddress),
				market.deposited(),
				market.exercisableDeposits(),
				manager.totalDeposited(),
			]);

			const tx = await manager.resolveMarket(market.address);
			const logs = Synth.decodeLogs(tx.receipt.rawLogs);

			const [
				creatorPostbalance,
				poolPostbalance,
				postDeposits,
				postExercisable,
				postTotalDeposits,
			] = await Promise.all([
				sUSDSynth.balanceOf(initialBidder),
				sUSDSynth.balanceOf(feeAddress),
				market.deposited(),
				market.exercisableDeposits(),
				manager.totalDeposited(),
			]);

			const poolFee = multiplyDecimalRound(initialLongBid.add(initialShortBid), initialPoolFee);
			const creatorFee = multiplyDecimalRound(
				initialLongBid.add(initialShortBid),
				initialCreatorFee
			);

			const poolReceived = poolPostbalance.sub(poolPrebalance);
			const creatorReceived = creatorPostbalance.sub(creatorPrebalance);
			assert.bnClose(poolReceived, poolFee, 1);
			assert.bnClose(creatorReceived, creatorFee, 1);
			assert.bnClose(postDeposits, preDeposits.sub(poolFee.add(creatorFee)));
			assert.bnClose(postDeposits, preExercisable);
			assert.bnClose(postExercisable, preExercisable);
			assert.bnClose(postTotalDeposits, preTotalDeposits.sub(poolFee.add(creatorFee)));

			assert.eventEqual(logs[0], 'Transfer', {
				from: market.address,
				to: await feePool.FEE_ADDRESS(),
				value: poolReceived,
			});
			assert.eventEqual(logs[1], 'Transfer', {
				from: market.address,
				to: initialBidder,
				value: creatorReceived,
			});
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
			await assert.revert(manager.resolveMarket(market.address), 'Operation prohibited');
		});

		it('Resolution cannot occur if the manager is paused', async () => {
			await fastForward(timeToMaturity + 1);
			await exchangeRates.updateRates([sAUDKey], [toUnit(0.7)], await currentTime(), {
				from: oracle,
			});
			await manager.setPaused(true, { from: accounts[1] });
			await assert.revert(
				manager.resolveMarket(market.address),
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
			await fastForward(expiryDuration + 1);

			const now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice], now, {
				from: oracle,
			});
			await manager.resolveMarket(market.address);

			assert.bnEqual(await market.phase(), Phase.Expiry);
		});

		it('Market can expire early if everything has been exercised.', async () => {
			await fastForward(biddingTime + timeToMaturity + 1);

			const now = await currentTime();
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice], now, {
				from: oracle,
			});
			await manager.resolveMarket(market.address);

			assert.bnEqual(await market.phase(), Phase.Maturity);
			await market.exerciseOptions({ from: initialBidder });
			assert.bnEqual(await market.phase(), Phase.Expiry);
		});
	});

	describe('Bids', () => {
		it('Can place long bids properly.', async () => {
			const initialDebt = await market.deposited();

			await market.bid(Side.Long, initialLongBid, { from: newBidder });

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

			await market.bid(Side.Short, initialShortBid, { from: newBidder });

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

			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });

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
			await assert.revert(market.bid(Side.Long, 100), 'Bidding inactive');
			await assert.revert(market.bid(Side.Short, 100), 'Bidding inactive');
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

			await market.bid(Side.Short, initialShortBid);

			currentPrices = await market.prices();
			const halfWithFee = divideDecimalRound(
				toUnit(1),
				multiplyDecimalRound(toUnit(2), toUnit(1).sub(totalInitialFee))
			);
			assert.bnClose(currentPrices[0], halfWithFee, 1);
			assert.bnClose(currentPrices[1], halfWithFee, 1);

			await market.bid(Side.Long, initialLongBid);

			currentPrices = await market.prices();
			assert.bnClose(currentPrices[0], expectedPrices.long, 1);
			assert.bnClose(currentPrices[1], expectedPrices.short, 1);
		});

		it('Bids properly emit events.', async () => {
			let tx = await market.bid(Side.Long, initialLongBid, { from: newBidder });
			let currentPrices = await market.prices();

			assert.equal(tx.logs[0].event, 'Bid');
			assert.bnEqual(tx.logs[0].args.side, Side.Long);
			assert.equal(tx.logs[0].args.account, newBidder);
			assert.bnEqual(tx.logs[0].args.value, initialLongBid);

			assert.equal(tx.logs[1].event, 'PricesUpdated');
			assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
			assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);

			tx = await market.bid(Side.Short, initialShortBid, { from: newBidder });
			currentPrices = await market.prices();

			assert.equal(tx.logs[0].event, 'Bid');
			assert.bnEqual(tx.logs[0].args.side, Side.Short);
			assert.equal(tx.logs[0].args.account, newBidder);
			assert.bnEqual(tx.logs[0].args.value, initialShortBid);

			assert.equal(tx.logs[1].event, 'PricesUpdated');
			assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
			assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);
		});

		it('Bids withdraw the proper amount of sUSD', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });
			assert.bnEqual(
				await sUSDSynth.balanceOf(newBidder),
				sUSDQty.sub(initialLongBid.add(initialShortBid))
			);
		});

		it('Bids fail on insufficient sUSD balance.', async () => {
			await assert.revert(
				market.bid(Side.Long, initialLongBid, { from: pauper }),
				'SafeMath: subtraction overflow'
			);
			await assert.revert(
				market.bid(Side.Short, initialShortBid, { from: pauper }),
				'SafeMath: subtraction overflow'
			);
		});

		it('Bids fail on insufficient sUSD allowance.', async () => {
			await sUSDSynth.approve(market.address, toBN(0), { from: newBidder });
			await assert.revert(
				market.bid(Side.Long, initialLongBid, { from: newBidder }),
				'SafeMath: subtraction overflow'
			);
			await assert.revert(
				market.bid(Side.Short, initialShortBid, { from: newBidder }),
				'SafeMath: subtraction overflow'
			);
		});

		it('Empty bids do nothing.', async () => {
			const tx1 = await market.bid(Side.Long, toBN(0), { from: newBidder });
			const tx2 = await market.bid(Side.Short, toBN(0), { from: newBidder });

			assert.bnEqual(await long.bidOf(newBidder), toBN(0));
			assert.bnEqual(await short.bidOf(newBidder), toBN(0));
			assert.equal(tx1.logs.length, 0);
			assert.equal(tx1.receipt.rawLogs, 0);
			assert.equal(tx2.logs.length, 0);
			assert.equal(tx2.receipt.rawLogs, 0);
		});

		it('Bids less than $0.01 revert.', async () => {
			await assert.revert(
				market.bid(Side.Long, toUnit('0.0099'), { from: newBidder }),
				'Balance < $0.01'
			);
			await assert.revert(
				market.bid(Side.Short, toUnit('0.0099'), { from: newBidder }),
				'Balance < $0.01'
			);

			// But we can make smaller bids if our balance is already large enough.
			await market.bid(Side.Long, toUnit('0.01'), { from: newBidder });
			await market.bid(Side.Long, toUnit('0.0099'), { from: newBidder });
			assert.bnEqual(await long.bidOf(newBidder), toUnit('0.0199'));
		});

		it('Bidding fails when the system is suspended.', async () => {
			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});
			await assert.revert(
				market.bid(Side.Long, toUnit(1), { from: newBidder }),
				'Operation prohibited'
			);
			await assert.revert(
				market.bid(Side.Short, toUnit(1), { from: newBidder }),
				'Operation prohibited'
			);
		});

		it('Bidding fails when the manager is paused.', async () => {
			await manager.setPaused(true, { from: accounts[1] });
			await assert.revert(
				market.bid(Side.Long, toUnit(1), { from: newBidder }),
				'This action cannot be performed while the contract is paused'
			);
			await assert.revert(
				market.bid(Side.Short, toUnit(1), { from: newBidder }),
				'This action cannot be performed while the contract is paused'
			);
		});
	});

	describe('Refunds', () => {
		it('Can refund bids properly.', async () => {
			const initialDebt = await market.deposited();
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });

			assert.bnEqual(await long.totalBids(), initialLongBid.mul(toBN(2)));
			assert.bnEqual(await long.bidOf(newBidder), initialLongBid);
			assert.bnEqual(await short.totalBids(), initialShortBid.mul(toBN(2)));
			assert.bnEqual(await short.bidOf(newBidder), initialShortBid);
			assert.bnEqual(await market.deposited(), initialDebt.mul(toBN(2)));

			await market.refund(Side.Long, initialLongBid, { from: newBidder });
			await market.refund(Side.Short, initialShortBid, { from: newBidder });

			assert.bnEqual(await long.totalBids(), initialLongBid);
			assert.bnEqual(await long.bidOf(newBidder), toUnit(0));
			assert.bnEqual(await short.totalBids(), initialShortBid);
			assert.bnEqual(await short.bidOf(newBidder), toUnit(0));

			const fee = multiplyDecimalRound(initialLongBid.add(initialShortBid), initialRefundFee);
			// The fee is retained in the total debt.
			assert.bnEqual(await market.deposited(), initialDebt.add(fee));
		});

		it('Refunds will fail if not enabled.', async () => {
			const localCreationTime = await currentTime();
			const tx = await manager.createMarket(
				sAUDKey,
				initialStrikePrice,
				false,
				[localCreationTime + biddingTime, localCreationTime + timeToMaturity],
				[initialLongBid, initialShortBid],
				{ from: initialBidder }
			);
			const localMarket = await BinaryOptionMarket.at(
				getEventByName({ tx, name: 'MarketCreated' }).args.market
			);
			assert.isFalse(await localMarket.refundsEnabled());

			await sUSDSynth.approve(localMarket.address, initialLongBid.mul(toBN(10)), {
				from: newBidder,
			});
			await localMarket.bid(Side.Long, initialLongBid, { from: newBidder });
			await localMarket.bid(Side.Short, initialShortBid, { from: newBidder });
			await assert.revert(
				localMarket.refund(Side.Long, initialLongBid, { from: newBidder }),
				'Refunds disabled'
			);
			await assert.revert(
				localMarket.refund(Side.Short, initialShortBid, { from: newBidder }),
				'Refunds disabled'
			);
		});

		it('Refunds will fail if too large.', async () => {
			// Refund with no bids.
			await assert.revert(
				market.refund(Side.Long, toUnit(1), { from: newBidder }),
				'SafeMath: subtraction overflow'
			);
			await assert.revert(
				market.refund(Side.Short, toUnit(1), { from: newBidder }),
				'SafeMath: subtraction overflow'
			);

			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });

			// Refund larger than total supply.
			const totalSupply = await market.deposited();
			await assert.revert(
				market.refund(Side.Long, totalSupply, { from: newBidder }),
				'SafeMath: subtraction overflow'
			);
			await assert.revert(
				market.refund(Side.Short, totalSupply, { from: newBidder }),
				'SafeMath: subtraction overflow'
			);

			// Smaller than total supply but larger than balance.
			await assert.revert(
				market.refund(Side.Long, initialLongBid.add(toBN(1)), { from: newBidder }),
				'SafeMath: subtraction overflow'
			);
			await assert.revert(
				market.refund(Side.Short, initialShortBid.add(toBN(1)), { from: newBidder }),
				'SafeMath: subtraction overflow'
			);
		});

		it('Refunds properly affect prices.', async () => {
			await market.bid(Side.Short, initialShortBid, { from: newBidder });
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.refund(Side.Short, initialShortBid, { from: newBidder });
			await market.refund(Side.Long, initialLongBid, { from: newBidder });

			const debt = multiplyDecimalRound(
				initialLongBid.add(initialShortBid),
				toUnit(1).add(initialRefundFee)
			);
			const expectedPrices = computePrices(initialLongBid, initialShortBid, debt, totalInitialFee);
			const currentPrices = await market.prices();

			assert.bnClose(currentPrices[0], expectedPrices.long, 1);
			assert.bnClose(currentPrices[1], expectedPrices.short, 1);
		});

		it('Cannot refund past the end of bidding.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });

			await fastForward(biddingTime + 1);

			await assert.revert(
				market.refund(Side.Long, initialLongBid, { from: newBidder }),
				'Bidding inactive'
			);
			await assert.revert(
				market.refund(Side.Short, initialShortBid, { from: newBidder }),
				'Bidding inactive'
			);
		});

		it('Refunds properly emit events.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });

			const longFee = multiplyDecimalRound(initialLongBid, initialRefundFee);
			const shortFee = multiplyDecimalRound(initialShortBid, initialRefundFee);

			let tx = await market.refund(Side.Long, initialLongBid, { from: newBidder });
			let currentPrices = await market.prices();

			assert.equal(tx.logs[0].event, 'Refund');
			assert.bnEqual(tx.logs[0].args.side, Side.Long);
			assert.equal(tx.logs[0].args.account, newBidder);
			assert.bnEqual(tx.logs[0].args.value, initialLongBid.sub(longFee));
			assert.bnEqual(tx.logs[0].args.fee, longFee);

			assert.equal(tx.logs[1].event, 'PricesUpdated');
			assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
			assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);

			tx = await market.refund(Side.Short, initialShortBid, { from: newBidder });
			currentPrices = await market.prices();

			assert.equal(tx.logs[0].event, 'Refund');
			assert.bnEqual(tx.logs[0].args.side, Side.Short);
			assert.equal(tx.logs[0].args.account, newBidder);
			assert.bnEqual(tx.logs[0].args.value, initialShortBid.sub(shortFee));
			assert.bnEqual(tx.logs[0].args.fee, shortFee);

			assert.equal(tx.logs[1].event, 'PricesUpdated');
			assert.bnEqual(tx.logs[1].args.longPrice, currentPrices[0]);
			assert.bnEqual(tx.logs[1].args.shortPrice, currentPrices[1]);
		});

		it('Refunds remit the proper amount of sUSD', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });
			await market.refund(Side.Long, initialLongBid, { from: newBidder });
			await market.refund(Side.Short, initialShortBid, { from: newBidder });

			const fee = multiplyDecimalRound(initialLongBid.add(initialShortBid), initialRefundFee);
			assert.bnEqual(await sUSDSynth.balanceOf(newBidder), sUSDQty.sub(fee));
		});

		it('Empty refunds do nothing.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });
			const tx1 = await market.refund(Side.Long, toBN(0), { from: newBidder });
			const tx2 = await market.refund(Side.Short, toBN(0), { from: newBidder });

			assert.bnEqual(await long.bidOf(newBidder), initialLongBid);
			assert.bnEqual(await short.bidOf(newBidder), initialShortBid);
			assert.equal(tx1.logs.length, 0);
			assert.equal(tx1.receipt.rawLogs, 0);
			assert.equal(tx2.logs.length, 0);
			assert.equal(tx2.receipt.rawLogs, 0);
		});

		it('Creator may not refund if it would violate the capital requirement.', async () => {
			const perSide = capitalRequirement.div(toBN(2));

			market.refund(Side.Long, initialLongBid.sub(perSide), { from: initialBidder });
			market.refund(Side.Short, initialShortBid.sub(perSide), { from: initialBidder });

			await assert.revert(
				market.refund(Side.Long, toUnit(0.1), { from: initialBidder }),
				'Insufficient capital'
			);
			await assert.revert(
				market.refund(Side.Short, toUnit(0.1), { from: initialBidder }),
				'Insufficient capital'
			);
		});

		it('Creator may not refund their entire position of either option.', async () => {
			await assert.revert(
				market.refund(Side.Long, initialLongBid, { from: initialBidder }),
				'Bids too skewed'
			);
			await assert.revert(
				market.refund(Side.Short, initialShortBid, { from: initialBidder }),
				'Bids too skewed'
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
				market.refund(Side.Long, toBN(1), { from: initialBidder }),
				'Operation prohibited'
			);
			await assert.revert(
				market.refund(Side.Short, toBN(1), { from: initialBidder }),
				'Operation prohibited'
			);
		});

		it('Refunding fails when the manager is paused.', async () => {
			await manager.setPaused(true, { from: accounts[1] });

			await assert.revert(
				market.refund(Side.Long, toBN(1), { from: initialBidder }),
				'This action cannot be performed while the contract is paused'
			);
			await assert.revert(
				market.refund(Side.Short, toBN(1), { from: initialBidder }),
				'This action cannot be performed while the contract is paused'
			);
		});

		it('Refunds yielding a bid less than $0.01 fail.', async () => {
			await market.bid(Side.Long, toUnit(1), { from: newBidder });
			await market.bid(Side.Short, toUnit(1), { from: newBidder });

			const longRefund = toUnit(1).sub(toUnit('0.0099'));
			const shortRefund = toUnit(1).sub(toUnit('0.0099'));

			await assert.revert(
				market.refund(Side.Long, longRefund, { from: newBidder }),
				'Balance < $0.01'
			);
			await assert.revert(
				market.refund(Side.Short, shortRefund, { from: newBidder }),
				'Balance < $0.01'
			);
		});
	});

	describe('Claiming Options', () => {
		it('Claims yield the proper balances before resolution.', async () => {
			await sUSDSynth.issue(pauper, sUSDQty);
			await sUSDSynth.approve(manager.address, sUSDQty, { from: pauper });
			await sUSDSynth.approve(market.address, sUSDQty, { from: pauper });

			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: pauper });

			await fastForward(biddingTime + 100);

			const prices = await market.prices();
			const longOptions = divideDecimalRound(initialLongBid, prices.long);
			const shortOptions = divideDecimalRound(initialShortBid, prices.short);

			const initialBidderClaimable = await market.claimableBalancesOf(initialBidder);
			const newBidderClaimable = await market.claimableBalancesOf(newBidder);
			const pauperClaimable = await market.claimableBalancesOf(pauper);
			assert.bnClose(initialBidderClaimable.long, longOptions);
			assert.bnClose(initialBidderClaimable.short, shortOptions);
			assert.bnClose(newBidderClaimable.long, longOptions);
			assert.bnEqual(newBidderClaimable.short, toBN(0));
			assert.bnEqual(pauperClaimable.long, toBN(0));
			assert.bnClose(pauperClaimable.short, shortOptions);

			const tx1 = await market.claimOptions({ from: newBidder });
			const tx2 = await market.claimOptions({ from: pauper });

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
			assert.equal(tx1.logs[0].args.account, newBidder);
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
			assert.equal(tx2.logs[0].args.account, pauper);
			assert.bnEqual(tx2.logs[0].args.longOptions, toBN(0));
			assert.bnClose(tx2.logs[0].args.shortOptions, shortOptions, 1);
		});

		it('Claims yield the proper balances after resolution.', async () => {
			await sUSDSynth.issue(pauper, sUSDQty);
			await sUSDSynth.approve(manager.address, sUSDQty, { from: pauper });
			await sUSDSynth.approve(market.address, sUSDQty, { from: pauper });

			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: pauper });

			const prices = await market.prices();
			const longOptions = divideDecimalRound(initialLongBid, prices.long);
			const shortOptions = divideDecimalRound(initialShortBid, prices.short);

			const totalClaimableSupplies = await market.totalClaimableSupplies();
			assert.bnClose(totalClaimableSupplies.long, longOptions.mul(toBN(2)), 60);
			assert.bnClose(totalClaimableSupplies.short, shortOptions.mul(toBN(2)), 60);

			// Resolve the market
			await fastForward(biddingTime + timeToMaturity + 100);
			const now = await currentTime();
			const price = (await market.oracleDetails()).strikePrice;
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await manager.resolveMarket(market.address);

			const postTotalClaimable = await market.totalClaimableSupplies();

			// The claimable balance after resolution drops to zero.
			assert.bnEqual(postTotalClaimable.long, totalClaimableSupplies.long);
			assert.bnEqual(postTotalClaimable.short, toBN(0));

			const initialBidderClaimable = await market.claimableBalancesOf(initialBidder);
			const newBidderClaimable = await market.claimableBalancesOf(newBidder);
			const pauperClaimable = await market.claimableBalancesOf(pauper);
			assert.bnClose(initialBidderClaimable.long, longOptions);
			assert.bnClose(initialBidderClaimable.short, toBN(0));
			assert.bnClose(newBidderClaimable.long, longOptions);
			assert.bnEqual(newBidderClaimable.short, toBN(0));
			assert.bnEqual(pauperClaimable.long, toBN(0));
			assert.bnClose(pauperClaimable.short, toBN(0));

			// Only the winning side has any options to claim.
			const tx1 = await market.claimOptions({ from: initialBidder });
			const tx2 = await market.claimOptions({ from: newBidder });

			// The pauper lost, so he has nothing to claim
			await assert.revert(market.claimOptions({ from: pauper }), 'Nothing to claim');

			assert.bnClose(await long.balanceOf(initialBidder), longOptions, 20);
			assert.bnEqual(await short.balanceOf(initialBidder), toBN(0));
			assert.bnEqual(await long.bidOf(initialBidder), toBN(0));
			assert.bnEqual(await short.bidOf(initialBidder), initialShortBid); // The losing bid is not wiped out

			assert.bnClose(await long.balanceOf(newBidder), longOptions, 20);
			assert.bnEqual(await short.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await long.bidOf(newBidder), toBN(0));
			assert.bnEqual(await short.bidOf(newBidder), toBN(0));

			assert.bnEqual(await long.balanceOf(pauper), toBN(0));
			assert.bnEqual(await short.balanceOf(pauper), toBN(0));
			assert.bnEqual(await long.bidOf(pauper), toBN(0));
			assert.bnEqual(await short.bidOf(pauper), initialShortBid);

			let logs = BinaryOption.decodeLogs(tx1.receipt.rawLogs);

			assert.equal(logs[0].address, long.address);
			assert.equal(logs[0].event, 'Transfer');
			assert.equal(logs[0].args.from, '0x' + '0'.repeat(40));
			assert.equal(logs[0].args.to, initialBidder);
			assert.bnClose(logs[0].args.value, longOptions, 1);
			assert.equal(logs[1].address, long.address);
			assert.equal(logs[1].event, 'Issued');
			assert.equal(logs[1].args.account, initialBidder);
			assert.bnClose(logs[1].args.value, longOptions, 1);
			assert.equal(tx1.logs[0].event, 'OptionsClaimed');
			assert.equal(tx1.logs[0].args.account, initialBidder);
			assert.bnClose(tx1.logs[0].args.longOptions, longOptions, 1);
			assert.bnEqual(tx1.logs[0].args.shortOptions, toBN(0));

			logs = BinaryOption.decodeLogs(tx2.receipt.rawLogs);

			assert.equal(logs[0].address, long.address);
			assert.equal(logs[0].event, 'Transfer');
			assert.equal(logs[0].args.from, '0x' + '0'.repeat(40));
			assert.equal(logs[0].args.to, newBidder);
			assert.bnClose(logs[0].args.value, longOptions, 20);
			assert.equal(logs[1].address, long.address);
			assert.equal(logs[1].event, 'Issued');
			assert.equal(logs[1].args.account, newBidder);
			assert.bnClose(logs[1].args.value, longOptions, 20);
			assert.equal(tx2.logs[0].event, 'OptionsClaimed');
			assert.equal(tx2.logs[0].args.account, newBidder);
			assert.bnClose(tx2.logs[0].args.longOptions, longOptions, 20);
			assert.bnEqual(tx2.logs[0].args.shortOptions, toBN(0));
		});

		it('Can claim both sides simultaneously.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });

			await fastForward(biddingTime * 2);

			const tx = await market.claimOptions({ from: newBidder });
			const prices = await market.prices();
			const longOptions = divideDecimalRound(initialLongBid, prices.long);
			const shortOptions = divideDecimalRound(initialShortBid, prices.short);

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

		it('Can claim when the implicit losing claimable option balance is greater than the deposited sUSD', async () => {
			await sUSDSynth.issue(pauper, sUSDQty);
			await sUSDSynth.approve(manager.address, sUSDQty, { from: pauper });
			await sUSDSynth.approve(market.address, sUSDQty, { from: pauper });

			// Set up some bids to trigger the failure condition from SIP-71
			await market.bid(Side.Short, initialLongBid, { from: initialBidder });
			await market.bid(Side.Long, initialLongBid.div(toBN(3)), { from: pauper });
			await market.bid(Side.Short, initialLongBid.div(toBN(3)), { from: pauper });
			await market.bid(Side.Long, initialLongBid.div(toBN(3)), { from: newBidder });

			await fastForward(biddingTime + timeToMaturity + 100);
			const now = await currentTime();
			const price = (await market.oracleDetails()).strikePrice;
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await manager.resolveMarket(market.address);

			await market.exerciseOptions({ from: newBidder });

			const claimable = await market.claimableBalancesOf(initialBidder);
			await market.claimOptions({ from: initialBidder });
			const balances = await market.balancesOf(initialBidder);
			assert.bnEqual(balances.long, claimable.long);
			assert.bnEqual(balances.short, toBN(0));
		});

		it('Cannot claim options during bidding.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });
			await assert.revert(market.claimOptions({ from: newBidder }), 'Bidding incomplete');
		});

		it('Claiming with no bids reverts.', async () => {
			await fastForward(biddingTime * 2);
			await assert.revert(market.claimOptions({ from: newBidder }), 'Nothing to claim');
		});

		it('Claiming works for an account which already has options.', async () => {
			await sUSDSynth.issue(pauper, sUSDQty);
			await sUSDSynth.approve(manager.address, sUSDQty, { from: pauper });
			await sUSDSynth.approve(market.address, sUSDQty, { from: pauper });
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Long, initialLongBid, { from: pauper });
			await fastForward(biddingTime * 2);
			await market.claimOptions({ from: newBidder });

			long.transfer(pauper, toUnit(1), { from: newBidder });

			await market.claimOptions({ from: pauper });

			const prices = await market.prices();
			const longOptions = divideDecimalRound(initialLongBid, prices.long);
			assert.bnClose(await long.balanceOf(pauper), longOptions.add(toUnit(1)));
		});

		it('Claiming fails if the system is suspended.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });
			await fastForward(biddingTime * 2);

			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});

			await assert.revert(market.claimOptions({ from: newBidder }), 'Operation prohibited');
		});

		it('Claiming fails if the manager is paused.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });
			await fastForward(biddingTime * 2);

			await manager.setPaused(true, { from: accounts[1] });
			await assert.revert(
				market.claimOptions({ from: newBidder }),
				'This action cannot be performed while the contract is paused'
			);
		});
	});

	describe('Exercising Options', () => {
		it('Exercising options yields the proper balances (long case).', async () => {
			await sUSDSynth.issue(pauper, sUSDQty);
			await sUSDSynth.approve(manager.address, sUSDQty, { from: pauper });
			await sUSDSynth.approve(market.address, sUSDQty, { from: pauper });

			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: pauper });

			await fastForward(biddingTime + 100);

			await market.claimOptions({ from: newBidder });
			await market.claimOptions({ from: pauper });

			await fastForward(timeToMaturity + 100);

			const newBidderBalance = await sUSDSynth.balanceOf(newBidder);
			const pauperBalance = await sUSDSynth.balanceOf(pauper);

			const now = await currentTime();
			const price = (await market.oracleDetails()).strikePrice;
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await manager.resolveMarket(market.address);

			const tx1 = await market.exerciseOptions({ from: newBidder });
			const tx2 = await market.exerciseOptions({ from: pauper });

			const prices = await market.prices();
			const longOptions = divideDecimalRound(initialLongBid, prices.long);
			const shortOptions = divideDecimalRound(initialShortBid, prices.short);

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
			assert.equal(tx1.logs[0].args.account, newBidder);
			assert.bnClose(tx1.logs[0].args.value, longOptions, 1);

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
			assert.equal(tx2.logs[0].args.account, pauper);
			assert.bnClose(tx2.logs[0].args.value, toBN(0), 1);
		});

		it('Exercising options yields the proper balances (short case).', async () => {
			await sUSDSynth.issue(pauper, sUSDQty);
			await sUSDSynth.approve(manager.address, sUSDQty, { from: pauper });
			await sUSDSynth.approve(market.address, sUSDQty, { from: pauper });

			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: pauper });

			await fastForward(biddingTime + 100);

			await market.claimOptions({ from: newBidder });
			await market.claimOptions({ from: pauper });

			await fastForward(timeToMaturity + 100);

			const newBidderBalance = await sUSDSynth.balanceOf(newBidder);
			const pauperBalance = await sUSDSynth.balanceOf(pauper);

			const now = await currentTime();
			const strikePrice = (await market.oracleDetails()).strikePrice;
			const price = strikePrice.div(toBN(2));
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await manager.resolveMarket(market.address);

			const tx1 = await market.exerciseOptions({ from: newBidder });
			const tx2 = await market.exerciseOptions({ from: pauper });

			const prices = await market.prices();
			const longOptions = divideDecimalRound(initialLongBid, prices.long);
			const shortOptions = divideDecimalRound(initialShortBid, prices.short);

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
			assert.equal(tx1.logs[0].args.account, newBidder);
			assert.bnClose(tx1.logs[0].args.value, toBN(0), 1);

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
			assert.equal(tx2.logs[0].args.account, pauper);
			assert.bnClose(tx2.logs[0].args.value, shortOptions, 1);
		});

		it('Only one side pays out if both sides are owned.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });
			await fastForward(biddingTime + 100);
			await market.claimOptions({ from: newBidder });
			await fastForward(timeToMaturity + 100);

			const newBidderBalance = await sUSDSynth.balanceOf(newBidder);

			const now = await currentTime();
			const price = (await market.oracleDetails()).strikePrice;
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await manager.resolveMarket(market.address);

			const tx = await market.exerciseOptions({ from: newBidder });

			const prices = await market.prices();
			const longOptions = divideDecimalRound(initialLongBid, prices.long);
			const shortOptions = divideDecimalRound(initialShortBid, prices.short);

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
			assert.equal(tx.logs[0].args.account, newBidder);
			assert.bnClose(tx.logs[0].args.value, longOptions, 1);
		});

		it('Exercising options updates total deposits.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });

			await fastForward(biddingTime + timeToMaturity + 100);
			await exchangeRates.updateRates(
				[sAUDKey],
				[(await market.oracleDetails()).strikePrice],
				await currentTime(),
				{ from: oracle }
			);
			await manager.resolveMarket(market.address);

			const preDeposited = await market.deposited();
			const preTotalDeposited = await manager.totalDeposited();

			await market.exerciseOptions({ from: newBidder });

			const longOptions = divideDecimalRound(initialLongBid, (await market.prices()).long);
			assert.bnClose(await market.deposited(), preDeposited.sub(longOptions), 1);
			assert.bnClose(await manager.totalDeposited(), preTotalDeposited.sub(longOptions), 1);
		});

		it('Exercising options resolves an unresolved market.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });
			await fastForward(biddingTime + 100);
			await market.claimOptions({ from: newBidder });
			await fastForward(timeToMaturity + 100);
			await exchangeRates.updateRates(
				[sAUDKey],
				[(await market.oracleDetails()).strikePrice],
				await currentTime(),
				{ from: oracle }
			);
			assert.isFalse(await market.resolved());
			await market.exerciseOptions({ from: newBidder });
			assert.isTrue(await market.resolved());
		});

		it('Exercising options with none owned reverts.', async () => {
			await fastForward(biddingTime + timeToMaturity + 100);
			const now = await currentTime();
			const price = (await market.oracleDetails()).strikePrice;
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await manager.resolveMarket(market.address);

			await assert.revert(market.exerciseOptions({ from: pauper }), 'Nothing to exercise');
		});

		it('Unclaimed options are automatically claimed when exercised.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });

			await fastForward(biddingTime + timeToMaturity + 100);
			const newBidderBalance = await sUSDSynth.balanceOf(newBidder);

			const now = await currentTime();
			const price = (await market.oracleDetails()).strikePrice;
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await manager.resolveMarket(market.address);

			const tx = await market.exerciseOptions({ from: newBidder });

			const prices = await market.prices();
			const longOptions = divideDecimalRound(initialLongBid, prices.long);

			assert.bnEqual(await long.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await short.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await long.bidOf(newBidder), toBN(0));
			assert.bnEqual(await short.bidOf(newBidder), initialShortBid); // The bid on the losing side isn't zeroed.
			assert.bnClose(await sUSDSynth.balanceOf(newBidder), newBidderBalance.add(longOptions), 1);

			assert.equal(tx.logs[0].event, 'OptionsClaimed');
			assert.equal(tx.logs[0].args.account, newBidder);
			assert.bnClose(tx.logs[0].args.longOptions, longOptions, 1);
			assert.bnClose(tx.logs[0].args.shortOptions, toBN(0), 1);
			assert.equal(tx.logs[1].event, 'OptionsExercised');
			assert.equal(tx.logs[1].args.account, newBidder);
			assert.bnClose(tx.logs[1].args.value, longOptions, 1);
		});

		it('Unclaimed options are automatically claimed even when exercised from an unresolved market.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialShortBid, { from: newBidder });

			await fastForward(biddingTime + timeToMaturity + 100);
			const newBidderBalance = await sUSDSynth.balanceOf(newBidder);

			const now = await currentTime();
			const price = (await market.oracleDetails()).strikePrice;
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });

			const tx = await market.exerciseOptions({ from: newBidder });

			const prices = await market.prices();
			const longOptions = divideDecimalRound(initialLongBid, prices.long);

			assert.bnEqual(await long.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await short.balanceOf(newBidder), toBN(0));
			assert.bnEqual(await long.bidOf(newBidder), toBN(0));
			assert.bnEqual(await short.bidOf(newBidder), initialShortBid); // The bid on the losing side isn't zeroed.
			assert.bnClose(await sUSDSynth.balanceOf(newBidder), newBidderBalance.add(longOptions), 1);

			assert.equal(tx.logs[0].event, 'MarketResolved');
			assert.equal(tx.logs[1].event, 'OptionsClaimed');
			assert.equal(tx.logs[1].args.account, newBidder);
			assert.bnClose(tx.logs[1].args.longOptions, longOptions, 1);
			assert.bnClose(tx.logs[1].args.shortOptions, toBN(0), 1);
			assert.equal(tx.logs[2].event, 'OptionsExercised');
			assert.equal(tx.logs[2].args.account, newBidder);
			assert.bnClose(tx.logs[2].args.value, longOptions, 1);
		});

		it('Options cannot be exercised if the system is suspended.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await fastForward(biddingTime + timeToMaturity + 100);
			await exchangeRates.updateRates(
				[sAUDKey],
				[(await market.oracleDetails()).strikePrice],
				await currentTime(),
				{ from: oracle }
			);
			await manager.resolveMarket(market.address);

			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});

			await assert.revert(market.exerciseOptions({ from: newBidder }), 'Operation prohibited');
		});

		it('Options cannot be exercised if the manager is paused.', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await fastForward(biddingTime + timeToMaturity + 100);
			await exchangeRates.updateRates(
				[sAUDKey],
				[(await market.oracleDetails()).strikePrice],
				await currentTime(),
				{ from: oracle }
			);
			await manager.resolveMarket(market.address);

			await manager.setPaused(true, { from: accounts[1] });
			await assert.revert(
				market.exerciseOptions({ from: newBidder }),
				'This action cannot be performed while the contract is paused'
			);
		});

		it('Options can be exercised if transferred to another account.', async () => {
			await fastForward(biddingTime + 100);
			const bidderClaimable = await market.claimableBalancesOf(initialBidder);
			await market.claimOptions({ from: initialBidder });

			await long.transfer(newBidder, bidderClaimable.long.div(toBN(2)), { from: initialBidder });
			await short.transfer(pauper, bidderClaimable.short.div(toBN(2)), { from: initialBidder });

			await fastForward(timeToMaturity + 100);

			const now = await currentTime();
			const price = (await market.oracleDetails()).strikePrice;
			await exchangeRates.updateRates([sAUDKey], [price], now, { from: oracle });
			await manager.resolveMarket(market.address);

			let tx = await market.exerciseOptions({ from: initialBidder });
			let logs = await getDecodedLogs({
				hash: tx.receipt.transactionHash,
				contracts: [manager, market, long],
			});

			assert.equal(logs.length, 6);
			decodedEventEqual({
				event: 'Transfer',
				emittedFrom: long.address,
				args: [initialBidder, ZERO_ADDRESS, bidderClaimable.long.div(toBN(2))],
				log: logs[0],
			});
			decodedEventEqual({
				event: 'Burned',
				emittedFrom: long.address,
				args: [initialBidder, bidderClaimable.long.div(toBN(2))],
				log: logs[1],
			});
			decodedEventEqual({
				event: 'Transfer',
				emittedFrom: short.address,
				args: [initialBidder, ZERO_ADDRESS, bidderClaimable.short.div(toBN(2))],
				log: logs[2],
			});
			decodedEventEqual({
				event: 'Burned',
				emittedFrom: short.address,
				args: [initialBidder, bidderClaimable.short.div(toBN(2))],
				log: logs[3],
			});
			decodedEventEqual({
				event: 'OptionsExercised',
				emittedFrom: market.address,
				args: [initialBidder, bidderClaimable.long.div(toBN(2))],
				log: logs[4],
			});
			decodedEventEqual({
				event: 'Transfer',
				emittedFrom: sUSDProxy,
				args: [market.address, initialBidder, bidderClaimable.long.div(toBN(2))],
				log: logs[5],
			});

			tx = await market.exerciseOptions({ from: newBidder });
			logs = await getDecodedLogs({
				hash: tx.receipt.transactionHash,
				contracts: [manager, market, long],
			});

			assert.equal(logs.length, 4);
			decodedEventEqual({
				event: 'Transfer',
				emittedFrom: long.address,
				args: [newBidder, ZERO_ADDRESS, bidderClaimable.long.div(toBN(2))],
				log: logs[0],
			});
			decodedEventEqual({
				event: 'Burned',
				emittedFrom: long.address,
				args: [newBidder, bidderClaimable.long.div(toBN(2))],
				log: logs[1],
			});
			decodedEventEqual({
				event: 'OptionsExercised',
				emittedFrom: market.address,
				args: [newBidder, bidderClaimable.long.div(toBN(2))],
				log: logs[2],
			});
			decodedEventEqual({
				event: 'Transfer',
				emittedFrom: sUSDProxy,
				args: [market.address, newBidder, bidderClaimable.long.div(toBN(2))],
				log: logs[3],
			});

			tx = await market.exerciseOptions({ from: pauper });
			logs = await getDecodedLogs({
				hash: tx.receipt.transactionHash,
				contracts: [manager, market, long],
			});

			assert.equal(logs.length, 3);
			decodedEventEqual({
				event: 'Transfer',
				emittedFrom: short.address,
				args: [pauper, ZERO_ADDRESS, bidderClaimable.short.div(toBN(2))],
				log: logs[0],
			});
			decodedEventEqual({
				event: 'Burned',
				emittedFrom: short.address,
				args: [pauper, bidderClaimable.short.div(toBN(2))],
				log: logs[1],
			});
			decodedEventEqual({
				event: 'OptionsExercised',
				emittedFrom: market.address,
				args: [pauper, toBN(0)],
				log: logs[2],
			});
		});
	});

	describe('Expiry', () => {
		it('Expired markets destroy themselves and their options.', async () => {
			const marketAddress = market.address;
			const longAddress = long.address;
			const shortAddress = short.address;

			await fastForward(biddingTime + timeToMaturity + expiryDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice], await currentTime(), {
				from: oracle,
			});
			await manager.resolveMarket(market.address);
			await manager.expireMarkets([market.address], { from: initialBidder });

			assert.equal(await web3.eth.getCode(marketAddress), '0x');
			assert.equal(await web3.eth.getCode(longAddress), '0x');
			assert.equal(await web3.eth.getCode(shortAddress), '0x');
		});

		it('Unresolved markets cannot be expired', async () => {
			await fastForward(biddingTime + timeToMaturity + expiryDuration + 10);
			await assert.revert(
				manager.expireMarkets([market.address], { from: initialBidder }),
				'Unexpired options remaining'
			);
		});

		it('Market cannot be expired before its time', async () => {
			await fastForward(biddingTime + timeToMaturity + 10);
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice], await currentTime(), {
				from: oracle,
			});
			await manager.resolveMarket(market.address);
			await assert.revert(
				manager.expireMarkets([market.address], { from: initialBidder }),
				'Unexpired options remaining'
			);
		});

		it('Market can be expired early if all options are exercised', async () => {
			await fastForward(biddingTime + timeToMaturity + 10);
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice], await currentTime(), {
				from: oracle,
			});
			await market.exerciseOptions({ from: initialBidder });
			const marketAddress = market.address;
			await manager.expireMarkets([market.address], { from: initialBidder });
			assert.equal(await web3.eth.getCode(marketAddress), '0x');
		});

		it('Market cannot be expired except by the manager', async () => {
			await fastForward(biddingTime + timeToMaturity + expiryDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice], await currentTime(), {
				from: oracle,
			});
			await manager.resolveMarket(market.address);

			await onlyGivenAddressCanInvoke({
				fnc: market.expire,
				args: [initialBidder],
				accounts,
				skipPassCheck: true,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Expired market remits any unclaimed options and extra sUSD to the caller.', async () => {
			await sUSDSynth.transfer(market.address, toUnit(1));
			const creatorBalance = await sUSDSynth.balanceOf(initialBidder);

			await market.bid(Side.Long, initialLongBid, { from: newBidder });

			const deposited = await market.deposited();
			const preTotalDeposited = await manager.totalDeposited();

			await fastForward(biddingTime + timeToMaturity + expiryDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice], await currentTime(), {
				from: oracle,
			});
			await manager.resolveMarket(market.address);
			await manager.expireMarkets([market.address], { from: initialBidder });

			const pot = multiplyDecimalRound(
				initialLongBid.mul(toBN(2)).add(initialShortBid),
				toUnit(1).sub(initialPoolFee.add(initialCreatorFee))
			);
			const creatorFee = multiplyDecimalRound(
				initialLongBid.mul(toBN(2)).add(initialShortBid),
				initialCreatorFee
			);
			const creatorRecovered = pot.add(creatorFee).add(toUnit(1));
			const postCreatorBalance = await sUSDSynth.balanceOf(initialBidder);
			assert.bnClose(postCreatorBalance, creatorBalance.add(creatorRecovered));
			assert.bnEqual(await manager.totalDeposited(), preTotalDeposited.sub(deposited));
		});

		it('Expired market emits no transfer if there is nothing to remit.', async () => {
			await fastForward(biddingTime + timeToMaturity + expiryDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice], await currentTime(), {
				from: oracle,
			});

			const marketAddress = market.address;
			await market.exerciseOptions({ from: initialBidder });

			const creatorBalance = await sUSDSynth.balanceOf(initialBidder);
			const tx = await manager.expireMarkets([market.address], { from: initialBidder });
			const postCreatorBalance = await sUSDSynth.balanceOf(initialBidder);
			assert.bnEqual(postCreatorBalance, creatorBalance);

			const log = tx.receipt.logs[0];
			assert.eventEqual(log, 'MarketExpired', {
				market: marketAddress,
			});

			const logs = Synth.decodeLogs(tx.receipt.rawLogs);
			assert.equal(logs.length, 0);
		});

		it('Market cannot be expired if the system is suspended', async () => {
			await fastForward(biddingTime + timeToMaturity + expiryDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice], await currentTime(), {
				from: oracle,
			});
			await manager.resolveMarket(market.address);

			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});

			await assert.revert(
				manager.expireMarkets([market.address], { from: initialBidder }),
				'Operation prohibited'
			);
		});

		it('Market cannot be expired if the manager is paused', async () => {
			await fastForward(biddingTime + timeToMaturity + expiryDuration + 10);
			await exchangeRates.updateRates([sAUDKey], [initialStrikePrice], await currentTime(), {
				from: oracle,
			});
			await manager.resolveMarket(market.address);
			await manager.setPaused(true, { from: accounts[1] });
			await assert.revert(
				manager.expireMarkets([market.address], { from: initialBidder }),
				'This action cannot be performed while the contract is paused'
			);
		});
	});

	describe('Cancellation', () => {
		it('Market can be cancelled', async () => {
			const marketAddress = market.address;
			const longAddress = long.address;
			const shortAddress = short.address;

			// Balance in the contract is remitted to the creator
			const preBalance = await sUSDSynth.balanceOf(initialBidder);
			const preTotalDeposits = await manager.totalDeposited();
			const tx = await manager.cancelMarket(market.address, { from: initialBidder });
			const postBalance = await sUSDSynth.balanceOf(initialBidder);
			const postTotalDeposits = await manager.totalDeposited();
			assert.bnEqual(postBalance, preBalance.add(initialLongBid.add(initialShortBid)));
			assert.bnEqual(postTotalDeposits, preTotalDeposits.sub(initialLongBid.add(initialShortBid)));

			assert.equal(tx.receipt.logs.length, 1);
			assert.eventEqual(tx.receipt.logs[0], 'MarketCancelled', { market: marketAddress });

			assert.equal(await web3.eth.getCode(marketAddress), '0x');
			assert.equal(await web3.eth.getCode(longAddress), '0x');
			assert.equal(await web3.eth.getCode(shortAddress), '0x');
		});

		it('Market cannot be cancelled if the system is suspended', async () => {
			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});

			await assert.revert(
				manager.cancelMarket(market.address, { from: initialBidder }),
				'Operation prohibited'
			);
		});

		it('Market cannot be expired if the manager is paused', async () => {
			await manager.setPaused(true, { from: accounts[1] });
			await assert.revert(
				manager.cancelMarket(market.address, { from: initialBidder }),
				'This action cannot be performed while the contract is paused'
			);
		});

		it('Cancellation function can only be invoked by manager', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: market.cancel,
				args: [initialBidder],
				accounts,
				skipPassCheck: true,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Market is only cancellable by its creator', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.cancelMarket,
				args: [market.address],
				address: initialBidder,
				accounts,
				skipPassCheck: false,
				reason: 'Sender not market creator',
			});
		});

		it('Market can only be cancelled during bidding', async () => {
			await fastForward(biddingTime + 1);
			await assert.revert(
				manager.cancelMarket(market.address, { from: initialBidder }),
				'Bidding inactive'
			);
			await fastForward(timeToMaturity + 1);
			await assert.revert(
				manager.cancelMarket(market.address, { from: initialBidder }),
				'Bidding inactive'
			);
			await fastForward(expiryDuration + 1);
			await assert.revert(
				manager.cancelMarket(market.address, { from: initialBidder }),
				'Bidding inactive'
			);
		});

		it('Market cannot be cancelled if anyone has bid on it (long)', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await assert.revert(
				manager.cancelMarket(market.address, { from: initialBidder }),
				'Not cancellable'
			);
		});

		it('Market cannot be cancelled if anyone has bid on it (short)', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await assert.revert(
				manager.cancelMarket(market.address, { from: initialBidder }),
				'Not cancellable'
			);
		});

		it('Market cancellable if everyone refunds', async () => {
			await market.bid(Side.Long, initialLongBid, { from: newBidder });
			await market.bid(Side.Short, initialLongBid, { from: newBidder });
			await assert.revert(
				manager.cancelMarket(market.address, { from: initialBidder }),
				'Not cancellable'
			);

			// But cancellable again if all users withdraw.
			await market.refund(Side.Long, initialLongBid, { from: newBidder });
			await market.refund(Side.Short, initialLongBid, { from: newBidder });

			// Also the initial bidder may bid all they like.
			await market.bid(Side.Long, initialLongBid, { from: initialBidder });
			await market.bid(Side.Short, initialLongBid, { from: initialBidder });

			await manager.cancelMarket(market.address, { from: initialBidder });
		});
	});
});
