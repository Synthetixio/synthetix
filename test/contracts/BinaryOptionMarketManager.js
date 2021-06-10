'use strict';

const { artifacts, contract, web3 } = require('hardhat');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const {
	toUnit,
	currentTime,
	fastForward,
	multiplyDecimalRound,
	divideDecimalRound,
} = require('../utils')();
const { toBytes32 } = require('../..');
const { setupContract, setupAllContracts } = require('./setup');
const {
	setStatus,
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	getEventByName,
} = require('./helpers');

let BinaryOptionMarket;

const computePrices = (longs, shorts, debt, fee) => {
	const totalOptions = multiplyDecimalRound(debt, toUnit(1).sub(fee));
	return {
		long: divideDecimalRound(longs, totalOptions),
		short: divideDecimalRound(shorts, totalOptions),
	};
};

contract('BinaryOptionMarketManager', accounts => {
	const [initialCreator, managerOwner, bidder, dummy] = accounts;

	const sUSDQty = toUnit(10000);

	const capitalRequirement = toUnit(2);
	const skewLimit = toUnit(0.05);
	const maxOraclePriceAge = toBN(60 * 61);
	const expiryDuration = toBN(26 * 7 * 24 * 60 * 60);
	const maxTimeToMaturity = toBN(365 * 24 * 60 * 60);

	const initialPoolFee = toUnit(0.008);
	const initialCreatorFee = toUnit(0.002);
	const initialRefundFee = toUnit(0.02);

	let manager, factory, systemStatus, exchangeRates, addressResolver, sUSDSynth, oracle;

	const sAUDKey = toBytes32('sAUD');
	const iAUDKey = toBytes32('iAUD');

	const Side = {
		Long: toBN(0),
		Short: toBN(1),
	};

	const createMarket = async (
		man,
		oracleKey,
		strikePrice,
		refundsEnabled,
		times,
		bids,
		creator
	) => {
		const tx = await man.createMarket(oracleKey, strikePrice, refundsEnabled, times, bids, {
			from: creator,
		});
		return BinaryOptionMarket.at(getEventByName({ tx, name: 'MarketCreated' }).args.market);
	};

	before(async () => {
		BinaryOptionMarket = artifacts.require('BinaryOptionMarket');
	});

	before(async () => {
		({
			BinaryOptionMarketManager: manager,
			BinaryOptionMarketFactory: factory,
			SystemStatus: systemStatus,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSDSynth,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'SystemStatus',
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

		await Promise.all([
			sUSDSynth.issue(initialCreator, sUSDQty),
			sUSDSynth.approve(manager.address, sUSDQty, { from: initialCreator }),
			sUSDSynth.issue(bidder, sUSDQty),
			sUSDSynth.approve(manager.address, sUSDQty, { from: bidder }),
		]);
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('Basic parameters', () => {
		it('Static parameters are set properly', async () => {
			const durations = await manager.durations();
			assert.bnEqual(durations.expiryDuration, expiryDuration);
			assert.bnEqual(durations.maxOraclePriceAge, maxOraclePriceAge);
			assert.bnEqual(durations.maxTimeToMaturity, maxTimeToMaturity);

			const fees = await manager.fees();
			assert.bnEqual(fees.poolFee, initialPoolFee);
			assert.bnEqual(fees.creatorFee, initialCreatorFee);
			assert.bnEqual(fees.refundFee, initialRefundFee);

			const creatorLimits = await manager.creatorLimits();
			assert.bnEqual(creatorLimits.capitalRequirement, capitalRequirement);
			assert.bnEqual(creatorLimits.skewLimit, skewLimit);
			assert.bnEqual(await manager.totalDeposited(), toBN(0));
			assert.bnEqual(await manager.marketCreationEnabled(), true);
			assert.equal(await manager.resolver(), addressResolver.address);
			assert.equal(await manager.owner(), managerOwner);
		});

		it('Only expected functions are mutative', async () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: manager.abi,
				ignoreParents: ['Owned', 'Pausable', 'MixinResolver'],
				expected: [
					'cancelMarket',
					'createMarket',
					'decrementTotalDeposited',
					'expireMarkets',
					'incrementTotalDeposited',
					'rebuildMarketCaches',
					'migrateMarkets',
					'receiveMarkets',
					'resolveMarket',
					'setCreatorCapitalRequirement',
					'setCreatorFee',
					'setCreatorSkewLimit',
					'setExpiryDuration',
					'setMarketCreationEnabled',
					'setMaxOraclePriceAge',
					'setMaxTimeToMaturity',
					'setMigratingManager',
					'setPoolFee',
					'setRefundFee',
				],
			});
		});

		it('Set capital requirement', async () => {
			const newValue = toUnit(20);
			const tx = await manager.setCreatorCapitalRequirement(newValue, { from: managerOwner });
			assert.bnEqual((await manager.creatorLimits()).capitalRequirement, newValue);
			const log = tx.logs[0];
			assert.equal(log.event, 'CreatorCapitalRequirementUpdated');
			assert.bnEqual(log.args.value, newValue);
		});

		it('Only the owner can set the capital requirement', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setCreatorCapitalRequirement,
				args: [toUnit(20)],
				accounts,
				address: managerOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Set skew limit', async () => {
			const newValue = toUnit(0.3);
			const tx = await manager.setCreatorSkewLimit(newValue, { from: managerOwner });
			assert.bnEqual((await manager.creatorLimits()).skewLimit, newValue);
			const log = tx.logs[0];
			assert.equal(log.event, 'CreatorSkewLimitUpdated');
			assert.bnEqual(log.args.value, newValue);
		});

		it('Skew limit must be in range 0 to 1', async () => {
			const newValue = toUnit(1.01);
			await assert.revert(
				manager.setCreatorSkewLimit(newValue, { from: managerOwner }),
				'Creator skew limit must be no greater than 1.'
			);
		});

		it('Only the owner can set the skew limit', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setCreatorSkewLimit,
				args: [toUnit(0.2)],
				accounts,
				address: managerOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Set pool fee', async () => {
			const newFee = toUnit(0.5);
			const tx = await manager.setPoolFee(newFee, { from: managerOwner });
			assert.bnEqual((await manager.fees()).poolFee, newFee);
			const log = tx.logs[0];
			assert.equal(log.event, 'PoolFeeUpdated');
			assert.bnEqual(log.args.fee, newFee);
		});

		it('Only the owner can set the pool fee', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setPoolFee,
				args: [toUnit(0.5)],
				accounts,
				address: managerOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Set creator fee', async () => {
			const newFee = toUnit(0.5);
			const tx = await manager.setCreatorFee(newFee, { from: managerOwner });
			assert.bnEqual((await manager.fees()).creatorFee, newFee);
			const log = tx.logs[0];
			assert.equal(log.event, 'CreatorFeeUpdated');
			assert.bnEqual(log.args.fee, newFee);
		});

		it('Only the owner can set the creator fee', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setCreatorFee,
				args: [toUnit(0.5)],
				accounts,
				address: managerOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it("Total fee can't be set too high", async () => {
			await assert.revert(
				manager.setPoolFee(toUnit(1), { from: managerOwner }),
				'Total fee must be less than 100%.'
			);
			await assert.revert(
				manager.setCreatorFee(toUnit(1), { from: managerOwner }),
				'Total fee must be less than 100%.'
			);
		});

		it('Total fee must be nonzero.', async () => {
			await manager.setCreatorFee(toUnit(0), { from: managerOwner });
			await assert.revert(
				manager.setPoolFee(toBN(0), { from: managerOwner }),
				'Total fee must be nonzero.'
			);
			await manager.setCreatorFee(toUnit(0.5), { from: managerOwner });
			await manager.setPoolFee(toUnit(0), { from: managerOwner });
			await assert.revert(
				manager.setCreatorFee(toBN(0), { from: managerOwner }),
				'Total fee must be nonzero.'
			);
		});

		it('Set refund fee', async () => {
			const newFee = toUnit(1);
			const tx = await manager.setRefundFee(newFee, { from: managerOwner });
			assert.bnEqual((await manager.fees()).refundFee, newFee);
			const log = tx.logs[0];
			assert.equal(log.event, 'RefundFeeUpdated');
			assert.bnEqual(log.args.fee, newFee);
		});

		it('Only the owner can set the refund fee', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setRefundFee,
				args: [toUnit(0.5)],
				accounts,
				address: managerOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it("Refund fee can't be set too high", async () => {
			const newFee = toUnit(1.01);
			await assert.revert(
				manager.setRefundFee(newFee, { from: managerOwner }),
				'Refund fee must be no greater than 100%.'
			);
		});

		it('Set oracle maturity window', async () => {
			const tx = await manager.setMaxOraclePriceAge(100, { from: managerOwner });
			assert.bnEqual((await manager.durations()).maxOraclePriceAge, toBN(100));
			const log = tx.logs[0];
			assert.equal(log.event, 'MaxOraclePriceAgeUpdated');
			assert.bnEqual(log.args.duration, toBN(100));
		});

		it('Only the owner can set the oracle maturity window', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setMaxOraclePriceAge,
				args: [100],
				accounts,
				address: managerOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Set expiry duration', async () => {
			const tx = await manager.setExpiryDuration(100, { from: managerOwner });
			assert.bnEqual((await manager.durations()).expiryDuration, toBN(100));
			assert.eventEqual(tx.logs[0], 'ExpiryDurationUpdated', { duration: toBN(100) });
		});

		it('Only the owner can set the expiry duration', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setExpiryDuration,
				args: [toBN(100)],
				accounts,
				address: managerOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Set max time to maturity', async () => {
			const tx = await manager.setMaxTimeToMaturity(100, { from: managerOwner });
			assert.bnEqual((await manager.durations()).maxTimeToMaturity, toBN(100));
			const log = tx.logs[0];
			assert.equal(log.event, 'MaxTimeToMaturityUpdated');
			assert.bnEqual(log.args.duration, toBN(100));
		});

		it('Only the owner can set the max time to maturity', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setMaxTimeToMaturity,
				args: [100],
				accounts,
				address: managerOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});
	});

	describe('BinaryOptionMarketFactory', () => {
		it('createMarket cannot be invoked except by the manager.', async () => {
			const now = await currentTime();
			await onlyGivenAddressCanInvoke({
				fnc: factory.createMarket,
				args: [
					initialCreator,
					[capitalRequirement, skewLimit],
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 200, now + expiryDuration + 200],
					[toUnit(2), toUnit(2)],
					[initialPoolFee, initialCreatorFee, initialRefundFee],
				],
				accounts,
				skipPassCheck: true,
				reason: 'Only permitted by the manager.',
			});
		});

		it('Only expected functions are mutative.', async () => {
			await ensureOnlyExpectedMutativeFunctions({
				abi: factory.abi,
				ignoreParents: ['Owned', 'MixinResolver'],
				expected: ['createMarket'],
			});
		});
	});

	describe('Market creation', () => {
		it('Can create a market', async () => {
			const now = await currentTime();

			const result = await manager.createMarket(
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				{ from: initialCreator }
			);

			assert.eventEqual(getEventByName({ tx: result, name: 'OwnerChanged' }), 'OwnerChanged', {
				newOwner: manager.address,
			});
			assert.eventEqual(getEventByName({ tx: result, name: 'MarketCreated' }), 'MarketCreated', {
				creator: initialCreator,
				oracleKey: sAUDKey,
				strikePrice: toUnit(1),
				biddingEndDate: toBN(now + 100),
				maturityDate: toBN(now + 200),
				expiryDate: toBN(now + 200).add(expiryDuration),
			});

			const decodedLogs = BinaryOptionMarket.decodeLogs(result.receipt.rawLogs);
			assert.eventEqual(decodedLogs[1], 'Bid', {
				side: Side.Long,
				account: initialCreator,
				value: toUnit(2),
			});
			assert.eventEqual(decodedLogs[2], 'Bid', {
				side: Side.Short,
				account: initialCreator,
				value: toUnit(3),
			});

			const prices = computePrices(
				toUnit(2),
				toUnit(3),
				toUnit(5),
				initialPoolFee.add(initialCreatorFee)
			);
			assert.eventEqual(decodedLogs[3], 'PricesUpdated', {
				longPrice: prices.long,
				shortPrice: prices.short,
			});

			const market = await BinaryOptionMarket.at(
				getEventByName({ tx: result, name: 'MarketCreated' }).args.market
			);

			const times = await market.times();
			assert.bnEqual(times.biddingEnd, toBN(now + 100));
			assert.bnEqual(times.maturity, toBN(now + 200));
			assert.bnEqual(times.expiry, toBN(now + 200).add(expiryDuration));
			const oracleDetails = await market.oracleDetails();
			assert.equal(oracleDetails.key, sAUDKey);
			assert.bnEqual(oracleDetails.strikePrice, toUnit(1));
			assert.bnEqual(oracleDetails.finalPrice, toBN(0));
			assert.equal(await market.creator(), initialCreator);
			assert.equal(await market.owner(), manager.address);
			assert.equal(await market.resolver(), addressResolver.address);

			const bids = await market.totalBids();
			assert.bnEqual(bids[0], toUnit(2));
			assert.bnEqual(bids[1], toUnit(3));
			assert.bnEqual(await market.deposited(), toUnit(5));
			assert.bnEqual(await manager.totalDeposited(), toUnit(5));

			const fees = await market.fees();
			assert.bnEqual(fees.poolFee, initialPoolFee);
			assert.bnEqual(fees.creatorFee, initialCreatorFee);
			assert.bnEqual(fees.refundFee, initialRefundFee);

			assert.bnEqual(await manager.numActiveMarkets(), toBN(1));
			assert.equal((await manager.activeMarkets(0, 100))[0], market.address);
			assert.bnEqual(await manager.numMaturedMarkets(), toBN(0));
			assert.equal((await manager.maturedMarkets(0, 100)).length, 0);
		});

		it('Cannot create markets for invalid keys.', async () => {
			const now = await currentTime();

			const sUSDKey = toBytes32('sUSD');
			const nonRate = toBytes32('nonExistent');

			await assert.revert(
				manager.createMarket(
					sUSDKey,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(2), toUnit(3)],
					{
						from: initialCreator,
					}
				),
				'Invalid key'
			);

			await exchangeRates.setInversePricing(
				iAUDKey,
				toUnit(150),
				toUnit(200),
				toUnit(110),
				false,
				false,
				{ from: await exchangeRates.owner() }
			);
			await exchangeRates.updateRates([iAUDKey], [toUnit(151)], await currentTime(), {
				from: oracle,
			});

			await assert.revert(
				manager.createMarket(
					iAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(2), toUnit(3)],
					{
						from: initialCreator,
					}
				),
				'Invalid key'
			);

			await assert.revert(
				manager.createMarket(
					nonRate,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(2), toUnit(3)],
					{
						from: initialCreator,
					}
				),
				'Invalid key'
			);
		});

		it('Cannot create a market without sufficient capital to cover the initial bids.', async () => {
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(2), toUnit(3)],
					{
						from: dummy,
					}
				),
				'SafeMath: subtraction overflow'
			);

			await sUSDSynth.issue(dummy, sUSDQty);

			await assert.revert(
				manager.createMarket(
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(2), toUnit(3)],
					{
						from: dummy,
					}
				),
				'SafeMath: subtraction overflow'
			);

			await sUSDSynth.approve(manager.address, sUSDQty, { from: dummy });

			await manager.createMarket(
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				{
					from: dummy,
				}
			);
		});

		it('Cannot create a market providing insufficient initial bids', async () => {
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(0.1), toUnit(0.1)],
					{
						from: initialCreator,
					}
				),
				'Insufficient capital'
			);
		});

		it('Cannot create a market too far into the future', async () => {
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + maxTimeToMaturity + 200],
					[toUnit(0.1), toUnit(0.1)],
					{
						from: initialCreator,
					}
				),
				'Maturity too far in the future'
			);
		});

		it('Cannot create a market if either initial bid is zero', async () => {
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(0), toUnit(5)],
					{
						from: initialCreator,
					}
				),
				'Bids too skewed'
			);
			await assert.revert(
				manager.createMarket(
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(5), toUnit(0)],
					{
						from: initialCreator,
					}
				),
				'Bids too skewed'
			);
		});

		it('Cannot create a market if the system is suspended', async () => {
			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(5), toUnit(5)],
					{
						from: initialCreator,
					}
				),
				'Operation prohibited'
			);
		});

		it('Cannot create a market if the manager is paused', async () => {
			await manager.setPaused(true, { from: managerOwner });
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(5), toUnit(5)],
					{
						from: initialCreator,
					}
				),
				'This action cannot be performed while the contract is paused'
			);
		});

		it('Market creation can be enabled and disabled.', async () => {
			let tx = await manager.setMarketCreationEnabled(false, { from: managerOwner });
			assert.eventEqual(tx.logs[0], 'MarketCreationEnabledUpdated', {
				enabled: false,
			});
			assert.isFalse(await manager.marketCreationEnabled());

			tx = await manager.setMarketCreationEnabled(true, { from: managerOwner });
			assert.eventEqual(tx.logs[0], 'MarketCreationEnabledUpdated', {
				enabled: true,
			});

			assert.isTrue(await manager.marketCreationEnabled());

			tx = await manager.setMarketCreationEnabled(true, { from: managerOwner });
			assert.equal(tx.logs.length, 0);
		});

		it('Cannot create a market if market creation is disabled.', async () => {
			await manager.setMarketCreationEnabled(false, { from: managerOwner });
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(5), toUnit(5)],
					{
						from: initialCreator,
					}
				),
				'Market creation is disabled'
			);

			await manager.setMarketCreationEnabled(true, { from: managerOwner });
			const tx = await manager.createMarket(
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(5), toUnit(5)],
				{
					from: initialCreator,
				}
			);
			const localMarket = await BinaryOptionMarket.at(
				getEventByName({ tx, name: 'MarketCreated' }).args.market
			);

			assert.bnEqual((await localMarket.oracleDetails()).strikePrice, toUnit(1));
		});

		it('Cannot create a market if bidding is in the past.', async () => {
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(
					sAUDKey,
					toUnit(1),
					true,
					[now - 1, now + 100],
					[toUnit(2), toUnit(3)],
					{
						from: initialCreator,
					}
				),
				'End of bidding has passed'
			);
		});

		it('Cannot create a market if maturity is before end of bidding.', async () => {
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 99],
					[toUnit(2), toUnit(3)],
					{
						from: initialCreator,
					}
				),
				'Maturity predates end of bidding'
			);
		});
	});

	describe('Market expiry', () => {
		it('Can expire markets', async () => {
			const now = await currentTime();
			const [newMarket, newerMarket] = await Promise.all([
				createMarket(
					manager,
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(2), toUnit(3)],
					initialCreator
				),
				createMarket(
					manager,
					sAUDKey,
					toUnit(1),
					true,
					[now + 100, now + 200],
					[toUnit(1), toUnit(1)],
					initialCreator
				),
			]);

			const newAddress = newMarket.address;
			const newerAddress = newerMarket.address;

			assert.bnEqual(await manager.totalDeposited(), toUnit(7));
			await fastForward(expiryDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await manager.resolveMarket(newAddress);
			await manager.resolveMarket(newerAddress);
			const tx = await manager.expireMarkets([newAddress, newerAddress], { from: initialCreator });

			assert.eventEqual(tx.logs[0], 'MarketExpired', { market: newAddress });
			assert.eventEqual(tx.logs[1], 'MarketExpired', { market: newerAddress });
			assert.equal(await web3.eth.getCode(newAddress), '0x');
			assert.equal(await web3.eth.getCode(newerAddress), '0x');
			assert.bnEqual(await manager.totalDeposited(), toUnit(0));
		});

		it('Cannot expire a market that does not exist', async () => {
			await assert.revert(manager.expireMarkets([initialCreator], { from: initialCreator }));
		});

		it('Cannot expire an unresolved market.', async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);
			await assert.revert(
				manager.expireMarkets([newMarket.address], { from: initialCreator }),
				'Unexpired options remaining'
			);
		});

		it('Cannot expire an unexpired market.', async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);

			await fastForward(300);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await manager.resolveMarket(newMarket.address);
			await assert.revert(
				manager.expireMarkets([newMarket.address], { from: initialCreator }),
				'Unexpired options remaining'
			);
		});

		it('Cannot expire a market if the system is suspended.', async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);
			await fastForward(expiryDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await manager.resolveMarket(newMarket.address);

			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});

			await assert.revert(
				manager.expireMarkets([newMarket.address], { from: bidder }),
				'Operation prohibited'
			);
		});

		it('Cannot expire a market if the manager is paused.', async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);
			await fastForward(expiryDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await manager.resolveMarket(newMarket.address);

			await manager.setPaused(true, { from: managerOwner });
			await assert.revert(
				manager.expireMarkets([newMarket.address], { from: bidder }),
				'This action cannot be performed while the contract is paused'
			);
		});
	});

	describe('Market cancellation', () => {
		it('Market expiring a market removes it from the markets list', async () => {
			const now = await currentTime();
			const market = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);

			assert.equal((await manager.activeMarkets(0, 100))[0], market.address);
			await manager.cancelMarket(market.address);

			assert.equal((await manager.activeMarkets(0, 100)).length, 0);
			assert.equal((await manager.maturedMarkets(0, 100)).length, 0);
		});
	});

	describe('Market tracking', () => {
		it('Multiple markets can exist simultaneously, and debt is tracked properly across them.', async () => {
			const now = await currentTime();
			const markets = await Promise.all(
				[toUnit(1), toUnit(2), toUnit(3)].map(price =>
					createMarket(
						manager,
						sAUDKey,
						price,
						true,
						[now + 100, now + 200],
						[toUnit(1), toUnit(1)],
						initialCreator
					)
				)
			);
			await Promise.all(
				markets.map(market => sUSDSynth.approve(market.address, sUSDQty, { from: bidder }))
			);

			assert.bnEqual(await manager.totalDeposited(), toUnit(6));
			await markets[0].bid(Side.Long, toUnit(2), { from: bidder });
			assert.bnEqual(await manager.totalDeposited(), toUnit(8));
			await markets[1].bid(Side.Short, toUnit(2), { from: bidder });
			assert.bnEqual(await manager.totalDeposited(), toUnit(10));
			await markets[2].bid(Side.Short, toUnit(2), { from: bidder });
			assert.bnEqual(await manager.totalDeposited(), toUnit(12));

			await fastForward(expiryDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(2)], await currentTime(), {
				from: oracle,
			});
			await Promise.all(markets.map(m => manager.resolveMarket(m.address)));

			assert.bnEqual(await markets[0].result(), toBN(0));
			assert.bnEqual(await markets[1].result(), toBN(0));
			assert.bnEqual(await markets[2].result(), toBN(1));

			const feesRemitted = multiplyDecimalRound(initialPoolFee.add(initialCreatorFee), toUnit(4));

			await manager.expireMarkets([markets[0].address], { from: initialCreator });
			assert.bnEqual(await manager.totalDeposited(), toUnit(8).sub(feesRemitted.mul(toBN(2))));
			await manager.expireMarkets([markets[1].address], { from: initialCreator });
			assert.bnEqual(await manager.totalDeposited(), toUnit(4).sub(feesRemitted));
			await manager.expireMarkets([markets[2].address], { from: initialCreator });
			assert.bnEqual(await manager.totalDeposited(), toUnit(0));
		});

		it('Market resolution fails for unknown markets', async () => {
			await assert.revert(manager.resolveMarket(initialCreator), 'Not an active market');
		});

		it('Adding, resolving, and expiring markets properly updates market lists', async () => {
			const numMarkets = 8;
			assert.bnEqual(await manager.numActiveMarkets(), toBN(0));
			assert.equal((await manager.activeMarkets(0, 100)).length, 0);
			const now = await currentTime();
			const markets = await Promise.all(
				new Array(numMarkets)
					.fill(0)
					.map(() =>
						createMarket(
							manager,
							sAUDKey,
							toUnit(1),
							true,
							[now + 100, now + 200],
							[toUnit(1), toUnit(1)],
							initialCreator
						)
					)
			);
			assert.bnEqual(await manager.numMaturedMarkets(), toBN(0));
			assert.equal((await manager.maturedMarkets(0, 100)).length, 0);

			const evenMarkets = markets
				.filter((e, i) => i % 2 === 0)
				.map(m => m.address)
				.sort();
			const oddMarkets = markets
				.filter((e, i) => i % 2 !== 0)
				.map(m => m.address)
				.sort();

			const createdMarkets = markets.map(m => m.address).sort();

			let recordedMarkets = await manager.activeMarkets(0, 100);
			let recordedMarketsSorted = [...recordedMarkets].sort();
			assert.bnEqual(await manager.numActiveMarkets(), toBN(numMarkets));
			assert.equal(createdMarkets.length, recordedMarketsSorted.length);
			createdMarkets.forEach((p, i) => assert.equal(p, recordedMarketsSorted[i]));

			// Resolve all the even markets, ensuring they have been transferred.
			await fastForward(expiryDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(2)], await currentTime(), {
				from: oracle,
			});
			await Promise.all(evenMarkets.map(m => manager.resolveMarket(m)));

			assert.bnEqual(await manager.numActiveMarkets(), toBN(4));
			recordedMarkets = await manager.activeMarkets(0, 100);
			recordedMarketsSorted = [...recordedMarkets].sort();
			assert.equal(oddMarkets.length, recordedMarketsSorted.length);
			oddMarkets.forEach((p, i) => assert.equal(p, recordedMarketsSorted[i]));

			assert.bnEqual(await manager.numMaturedMarkets(), toBN(4));
			recordedMarkets = await manager.maturedMarkets(0, 100);
			recordedMarketsSorted = [...recordedMarkets].sort();
			assert.equal(evenMarkets.length, recordedMarkets.length);
			evenMarkets.forEach((p, i) => assert.equal(p, recordedMarkets[i]));

			// Destroy those markets
			await manager.expireMarkets(evenMarkets);

			// Mature the rest of the markets
			await Promise.all(oddMarkets.map(m => manager.resolveMarket(m)));
			let remainingMarkets = await manager.maturedMarkets(0, 100);
			let remainingMarketsSorted = [...remainingMarkets].sort();
			assert.bnEqual(await manager.numMaturedMarkets(), toBN(numMarkets / 2));
			oddMarkets.forEach((p, i) => assert.equal(p, remainingMarketsSorted[i]));

			// Can remove the last market
			const lastMarket = (await manager.maturedMarkets(numMarkets / 2 - 1, 1))[0];
			assert.isTrue(remainingMarkets.includes(lastMarket));
			await manager.expireMarkets([lastMarket], { from: initialCreator });
			remainingMarkets = await manager.maturedMarkets(0, 100);
			remainingMarketsSorted = [...remainingMarkets].sort();
			assert.bnEqual(await manager.numMaturedMarkets(), toBN(numMarkets / 2 - 1));
			assert.isFalse(remainingMarketsSorted.includes(lastMarket));

			// Destroy the remaining markets.
			await manager.expireMarkets(remainingMarketsSorted);
			assert.bnEqual(await manager.numActiveMarkets(), toBN(0));
			assert.equal((await manager.activeMarkets(0, 100)).length, 0);
			assert.bnEqual(await manager.numMaturedMarkets(), toBN(0));
			assert.equal((await manager.maturedMarkets(0, 100)).length, 0);
		});

		it('Pagination works properly', async () => {
			const numMarkets = 8;
			const now = await currentTime();
			const markets = [];
			const windowSize = 3;
			let ms;

			// Empty list
			for (let i = 0; i < numMarkets; i++) {
				ms = await manager.activeMarkets(i, 2);
				assert.equal(ms.length, 0);
			}

			for (let i = 1; i <= numMarkets; i++) {
				markets.push(
					await createMarket(
						manager,
						sAUDKey,
						toUnit(i),
						true,
						[now + 100, now + 200],
						[toUnit(1), toUnit(1)],
						initialCreator
					)
				);
			}

			// Single elements
			for (let i = 0; i < numMarkets; i++) {
				ms = await manager.activeMarkets(i, 1);
				assert.equal(ms.length, 1);
				const m = await BinaryOptionMarket.at(ms[0]);
				assert.bnEqual((await m.oracleDetails()).strikePrice, toUnit(i + 1));
			}

			// shifting window
			for (let i = 0; i < numMarkets - windowSize; i++) {
				ms = await manager.activeMarkets(i, windowSize);
				assert.equal(ms.length, windowSize);

				for (let j = 0; j < windowSize; j++) {
					const m = await BinaryOptionMarket.at(ms[j]);
					assert.bnEqual((await m.oracleDetails()).strikePrice, toUnit(i + j + 1));
				}
			}

			// entire list
			ms = await manager.activeMarkets(0, numMarkets);
			assert.equal(ms.length, numMarkets);
			for (let i = 0; i < numMarkets; i++) {
				const m = await BinaryOptionMarket.at(ms[i]);
				assert.bnEqual((await m.oracleDetails()).strikePrice, toUnit(i + 1));
			}

			// Page extends past end of list
			ms = await manager.activeMarkets(numMarkets - windowSize, windowSize * 2);
			assert.equal(ms.length, windowSize);
			for (let i = numMarkets - windowSize; i < numMarkets; i++) {
				const j = i - (numMarkets - windowSize);
				const m = await BinaryOptionMarket.at(ms[j]);
				assert.bnEqual((await m.oracleDetails()).strikePrice, toUnit(i + 1));
			}

			// zero page size
			for (let i = 0; i < numMarkets; i++) {
				ms = await manager.activeMarkets(i, 0);
				assert.equal(ms.length, 0);
			}

			// index past the end
			for (let i = 0; i < 3; i++) {
				ms = await manager.activeMarkets(numMarkets, i);
				assert.equal(ms.length, 0);
			}

			// Page size larger than entire list
			ms = await manager.activeMarkets(0, numMarkets * 2);
			assert.equal(ms.length, numMarkets);
			for (let i = 0; i < numMarkets; i++) {
				const m = await BinaryOptionMarket.at(ms[i]);
				assert.bnEqual((await m.oracleDetails()).strikePrice, toUnit(i + 1));
			}
		});
	});

	describe('Deposit management', () => {
		it('Only active markets can modify the total deposits.', async () => {
			const now = await currentTime();
			await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);

			await onlyGivenAddressCanInvoke({
				fnc: manager.incrementTotalDeposited,
				args: [toUnit(2)],
				accounts,
				reason: 'Permitted only for active markets',
			});
			await onlyGivenAddressCanInvoke({
				fnc: manager.decrementTotalDeposited,
				args: [toUnit(2)],
				accounts,
				reason: 'Permitted only for known markets',
			});
		});

		it('Creating a market affects total deposits properly.', async () => {
			const now = await currentTime();
			await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);
			assert.bnEqual(await manager.totalDeposited(), toUnit(5));
		});

		it('Market destruction affects total debt properly.', async () => {
			let now = await currentTime();
			await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);

			now = await currentTime();
			const newMarket = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(1), toUnit(1)],
				initialCreator
			);

			assert.bnEqual(await manager.totalDeposited(), toUnit(7));
			await fastForward(expiryDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await manager.resolveMarket(newMarket.address);
			await manager.expireMarkets([newMarket.address], { from: initialCreator });

			assert.bnEqual(await manager.totalDeposited(), toUnit(5));
		});

		it('Bidding affects total deposits properly.', async () => {
			const now = await currentTime();
			const market = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);
			const initialDebt = await manager.totalDeposited();

			await sUSDSynth.issue(bidder, sUSDQty);
			await sUSDSynth.approve(market.address, sUSDQty, { from: bidder });

			await market.bid(Side.Long, toUnit(1), { from: bidder });
			assert.bnEqual(await manager.totalDeposited(), initialDebt.add(toUnit(1)));

			await market.bid(Side.Short, toUnit(2), { from: bidder });
			assert.bnEqual(await manager.totalDeposited(), initialDebt.add(toUnit(3)));
		});

		it('Refunds affect total deposits properly.', async () => {
			const now = await currentTime();
			const market = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);
			const initialDebt = await manager.totalDeposited();

			await sUSDSynth.issue(bidder, sUSDQty);
			await sUSDSynth.approve(market.address, sUSDQty, { from: bidder });

			await market.bid(Side.Long, toUnit(1), { from: bidder });
			await market.bid(Side.Short, toUnit(2), { from: bidder });
			assert.bnEqual(await manager.totalDeposited(), initialDebt.add(toUnit(3)));

			await market.refund(Side.Long, toUnit(0.5), { from: bidder });
			await market.refund(Side.Short, toUnit(1), { from: bidder });
			const refundFeeRetained = multiplyDecimalRound(toUnit(1.5), initialRefundFee);
			assert.bnEqual(
				await manager.totalDeposited(),
				initialDebt.add(toUnit(1.5)).add(refundFeeRetained)
			);
		});
	});

	describe('Market migration', () => {
		let markets, newManager, now;

		before(async () => {
			now = await currentTime();
			markets = [];

			for (const p of [1, 2, 3]) {
				markets.push(
					await createMarket(
						manager,
						sAUDKey,
						toUnit(p),
						true,
						[now + 100, now + 200],
						[toUnit(1), toUnit(1)],
						initialCreator
					)
				);
			}

			newManager = await setupContract({
				accounts,
				contract: 'BinaryOptionMarketManager',
				args: [
					managerOwner,
					addressResolver.address,
					10000,
					10000,
					maxTimeToMaturity,
					toUnit(10),
					toUnit(0.05),
					toUnit(0.008),
					toUnit(0.002),
					toUnit(0.02),
				],
			});
			await addressResolver.importAddresses(
				[toBytes32('BinaryOptionMarketManager')],
				[newManager.address],
				{
					from: accounts[1],
				}
			);
			await Promise.all([newManager.rebuildCache(), factory.rebuildCache()]);

			await Promise.all(
				markets.map(m => sUSDSynth.approve(m.address, toUnit(1000), { from: bidder }))
			);
			await sUSDSynth.approve(newManager.address, toUnit(1000), { from: bidder });

			await newManager.setMigratingManager(manager.address, { from: managerOwner });
		});

		it('Migrating manager can be set', async () => {
			await manager.setMigratingManager(initialCreator, { from: managerOwner });
		});

		it('Migrating manager can only be set by the manager owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setMigratingManager,
				args: [initialCreator],
				accounts,
				address: managerOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Markets can be migrated between factories.', async () => {
			await manager.migrateMarkets(newManager.address, true, [markets[1].address], {
				from: managerOwner,
			});

			const oldMarkets = await manager.activeMarkets(0, 100);
			assert.bnEqual(await manager.numActiveMarkets(), toBN(2));
			assert.equal(oldMarkets.length, 2);
			assert.equal(oldMarkets[0], markets[0].address);
			assert.equal(oldMarkets[1], markets[2].address);

			const newMarkets = await newManager.activeMarkets(0, 100);
			assert.bnEqual(await newManager.numActiveMarkets(), toBN(1));
			assert.equal(newMarkets.length, 1);
			assert.equal(newMarkets[0], markets[1].address);

			assert.equal(await markets[0].owner(), manager.address);
			assert.equal(await markets[2].owner(), manager.address);
			assert.equal(await markets[1].owner(), newManager.address);
		});

		it('Markets can only be migrated by the owner.', async () => {
			onlyGivenAddressCanInvoke({
				fnc: manager.migrateMarkets,
				args: [newManager.address, true, [markets[1].address]],
				accounts,
				address: managerOwner,
				skipPassCheck: true,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Markets can only be received from the migrating manager.', async () => {
			onlyGivenAddressCanInvoke({
				fnc: manager.receiveMarkets,
				args: [true, [markets[1].address]],
				accounts,
				address: managerOwner,
				skipPassCheck: true,
				reason: 'Only permitted for migrating manager.',
			});
		});

		it('Markets cannot be migrated between factories if the migrating manager unset', async () => {
			await newManager.setMigratingManager('0x' + '0'.repeat(40), { from: managerOwner });
			await assert.revert(
				manager.migrateMarkets(newManager.address, true, [markets[1].address], {
					from: managerOwner,
				}),
				'Only permitted for migrating manager.'
			);
		});

		it('An empty migration does nothing, as does migration from an empty manager', async () => {
			const newerManager = await setupContract({
				accounts,
				contract: 'BinaryOptionMarketManager',
				args: [
					managerOwner,
					addressResolver.address,
					10000,
					10000,
					maxTimeToMaturity,
					toUnit(10),
					toUnit(0.05),
					toUnit(0.008),
					toUnit(0.002),
					toUnit(0.02),
				],
			});
			await manager.migrateMarkets(newManager.address, true, [], { from: managerOwner });
			assert.equal(await newManager.numActiveMarkets(), 0);

			await newerManager.setMigratingManager(newManager.address, { from: managerOwner });
			await newManager.migrateMarkets(newerManager.address, true, [], { from: managerOwner });
			assert.equal(await newerManager.numActiveMarkets(), 0);
		});

		it('Receiving an empty market list does nothing.', async () => {
			await newManager.setMigratingManager(managerOwner, { from: managerOwner });
			await newManager.receiveMarkets(true, [], { from: managerOwner });
			assert.bnEqual(await newManager.numActiveMarkets(), 0);
		});

		it('Cannot receive duplicate markets.', async () => {
			await manager.migrateMarkets(newManager.address, true, [markets[0].address], {
				from: managerOwner,
			});
			await newManager.setMigratingManager(managerOwner, { from: managerOwner });
			await assert.revert(
				newManager.receiveMarkets(true, [markets[0].address], { from: managerOwner }),
				'Market already known.'
			);
		});

		it('Markets can be migrated to a manager with existing markets.', async () => {
			await manager.migrateMarkets(newManager.address, true, [markets[1].address], {
				from: managerOwner,
			});

			// And a new market can still be created
			await sUSDSynth.approve(newManager.address, toUnit('1000'));
			const now = await currentTime();
			await newManager.createMarket(
				sAUDKey,
				toUnit(1),
				true,
				[now + 100, now + 200],
				[toUnit(6), toUnit(5)],
				{ from: initialCreator }
			);

			await manager.migrateMarkets(newManager.address, true, [markets[0].address], {
				from: managerOwner,
			});

			const oldMarkets = await manager.activeMarkets(0, 100);
			assert.bnEqual(await manager.numActiveMarkets(), toBN(1));
			assert.equal(oldMarkets.length, 1);
			assert.equal(oldMarkets[0], markets[2].address);

			const newMarkets = await newManager.activeMarkets(0, 100);
			assert.bnEqual(await newManager.numActiveMarkets(), toBN(3));
			assert.equal(newMarkets.length, 3);
			assert.equal(newMarkets[0], markets[1].address);
			assert.equal(newMarkets[2], markets[0].address);
		});

		it('All markets can be migrated from a manager.', async () => {
			await manager.migrateMarkets(
				newManager.address,
				true,
				markets.map(m => m.address).reverse(),
				{
					from: managerOwner,
				}
			);

			const oldMarkets = await manager.activeMarkets(0, 100);
			assert.bnEqual(await manager.numActiveMarkets(), toBN(0));
			assert.equal(oldMarkets.length, 0);

			const newMarkets = await newManager.activeMarkets(0, 100);
			assert.bnEqual(await newManager.numActiveMarkets(), toBN(3));
			assert.equal(newMarkets.length, 3);
			assert.equal(newMarkets[0], markets[2].address);
			assert.equal(newMarkets[1], markets[1].address);
			assert.equal(newMarkets[2], markets[0].address);
		});

		it('Migrating markets updates total deposits properly.', async () => {
			await manager.migrateMarkets(
				newManager.address,
				true,
				[markets[2].address, markets[1].address],
				{
					from: managerOwner,
				}
			);
			assert.bnEqual(await manager.totalDeposited(), toUnit(2));
			assert.bnEqual(await newManager.totalDeposited(), toUnit(4));
		});

		it('Migrated markets still operate properly.', async () => {
			await manager.migrateMarkets(
				newManager.address,
				true,
				[markets[2].address, markets[1].address],
				{
					from: managerOwner,
				}
			);

			await markets[0].bid(Side.Short, toUnit(1), { from: bidder });
			await markets[1].bid(Side.Long, toUnit(3), { from: bidder });
			assert.bnEqual(await manager.totalDeposited(), toUnit(3));
			assert.bnEqual(await newManager.totalDeposited(), toUnit(7));

			now = await currentTime();
			await createMarket(
				newManager,
				sAUDKey,
				toUnit(10),
				true,
				[now + 100, now + 200],
				[toUnit(10), toUnit(10)],
				bidder
			);
			assert.bnEqual(await newManager.totalDeposited(), toUnit(27));
			assert.bnEqual(await newManager.numActiveMarkets(), toBN(3));

			await fastForward(expiryDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await newManager.resolveMarket(markets[2].address);
			await newManager.expireMarkets([markets[2].address], { from: initialCreator });
			assert.bnEqual(await newManager.numActiveMarkets(), toBN(2));
			assert.bnEqual(await newManager.totalDeposited(), toUnit(25));
		});

		it('Market migration works while paused/suspended.', async () => {
			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});
			await manager.setPaused(true, { from: managerOwner });
			await newManager.setPaused(true, { from: managerOwner });
			assert.isTrue(await manager.paused());
			assert.isTrue(await newManager.paused());

			await manager.migrateMarkets(newManager.address, true, [markets[0].address], {
				from: managerOwner,
			});

			assert.bnEqual(await manager.numActiveMarkets(), toBN(2));
			assert.bnEqual(await newManager.numActiveMarkets(), toBN(1));
		});

		it('Market migration fails if any unknown markets are included', async () => {
			await assert.revert(
				manager.migrateMarkets(newManager.address, true, [markets[1].address, managerOwner], {
					from: managerOwner,
				}),
				'Market unknown.'
			);
		});

		it('Market migration events are properly emitted.', async () => {
			const tx = await manager.migrateMarkets(
				newManager.address,
				true,
				[markets[0].address, markets[1].address],
				{
					from: managerOwner,
				}
			);

			assert.equal(tx.logs[2].event, 'MarketsMigrated');
			assert.equal(tx.logs[2].args.receivingManager, newManager.address);
			assert.equal(tx.logs[2].args.markets[0], markets[0].address);
			assert.equal(tx.logs[2].args.markets[1], markets[1].address);
			assert.equal(tx.logs[5].event, 'MarketsReceived');
			assert.equal(tx.logs[5].args.migratingManager, manager.address);
			assert.equal(tx.logs[5].args.markets[0], markets[0].address);
			assert.equal(tx.logs[5].args.markets[1], markets[1].address);
		});

		it('Can sync the caches of child markets.', async () => {
			const statusMock = await setupContract({
				accounts,
				contract: 'GenericMock',
				mock: 'SystemStatus',
			});

			await addressResolver.importAddresses([toBytes32('SystemStatus')], [statusMock.address], {
				from: accounts[1],
			});

			// Only sets the resolver for the listed addresses
			await manager.rebuildMarketCaches([markets[0].address], {
				from: managerOwner,
			});

			assert.ok(await markets[0].isResolverCached());
			assert.notOk(await markets[1].isResolverCached());
			assert.notOk(await markets[2].isResolverCached());

			// Only sets the resolver for the remaining addresses
			await manager.rebuildMarketCaches([markets[1].address, markets[2].address], {
				from: managerOwner,
			});

			assert.ok(await markets[0].isResolverCached());
			assert.ok(await markets[1].isResolverCached());
			assert.ok(await markets[2].isResolverCached());
		});
	});
});
