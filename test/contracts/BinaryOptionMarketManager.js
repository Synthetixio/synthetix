'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { toUnit, currentTime, fastForward } = require('../utils')();
const { toBytes32 } = require('../..');
const { setupContract, setupAllContracts, mockGenericContractFnc } = require('./setup');
const {
	setStatus,
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
} = require('./helpers');

const BinaryOptionMarket = artifacts.require('BinaryOptionMarket');

contract('BinaryOptionMarketManager', accounts => {
	const [initialCreator, managerOwner, bidder, dummy] = accounts;

	const sUSDQty = toUnit(10000);

	const minimumInitialLiquidity = toUnit(2);
	const maturityWindow = toBN(60 * 61);
	const exerciseDuration = toBN(7 * 24 * 60 * 60);
	const creatorDestructionDuration = toBN(7 * 24 * 60 * 60);
	const maxTimeToMaturity = toBN(365 * 24 * 60 * 60);

	const initialPoolFee = toUnit(0.008);
	const initialCreatorFee = toUnit(0.002);
	const initialRefundFee = toUnit(0.02);

	let manager, factory, systemStatus, exchangeRates, addressResolver, sUSDSynth, oracle;

	const sAUDKey = toBytes32('sAUD');

	const Side = {
		Long: toBN(0),
		Short: toBN(1),
	};

	const createMarket = async (man, oracleKey, targetPrice, times, bids, creator) => {
		const tx = await man.createMarket(oracleKey, targetPrice, times, bids, { from: creator });
		return BinaryOptionMarket.at(tx.logs[1].args.market);
	};

	const mulDecRound = (x, y) => {
		let result = x.mul(y).div(toUnit(0.1));
		if (result.mod(toBN(10)).gte(toBN(5))) {
			result = result.add(toBN(10));
		}
		return result.div(toBN(10));
	};

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

		await sUSDSynth.issue(initialCreator, sUSDQty);
		await sUSDSynth.approve(manager.address, sUSDQty, { from: initialCreator });
		await sUSDSynth.issue(bidder, sUSDQty);
		await sUSDSynth.approve(manager.address, sUSDQty, { from: bidder });
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('Basic parameters', () => {
		it('Static parameters are set properly', async () => {
			const durations = await manager.durations();
			assert.bnEqual(durations.exerciseDuration, exerciseDuration);
			assert.bnEqual(durations.oracleMaturityWindow, maturityWindow);
			assert.bnEqual(durations.creatorDestructionDuration, creatorDestructionDuration);
			assert.bnEqual(durations.maxTimeToMaturity, maxTimeToMaturity);

			const fees = await manager.fees();
			assert.bnEqual(fees.poolFee, initialPoolFee);
			assert.bnEqual(fees.creatorFee, initialCreatorFee);
			assert.bnEqual(fees.refundFee, initialRefundFee);

			assert.bnEqual(await manager.minimumInitialLiquidity(), minimumInitialLiquidity);
			assert.bnEqual(await manager.totalDeposited(), toBN(0));
			assert.equal(await manager.resolver(), addressResolver.address);
			assert.equal(await manager.owner(), managerOwner);
		});

		it('Only expected functions are mutative', async () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: manager.abi,
				ignoreParents: ['Owned', 'Pausable', 'SelfDestructible', 'MixinResolver'],
				expected: [
					'setOracleMaturityWindow',
					'setExerciseDuration',
					'setCreatorDestructionDuration',
					'setMaxTimeToMaturity',
					'setPoolFee',
					'setCreatorFee',
					'setRefundFee',
					'setMinimumInitialLiquidity',
					'incrementTotalDeposited',
					'decrementTotalDeposited',
					'createMarket',
					'destroyMarket',
					'setResolverAndSyncCacheOnMarkets',
					'setMarketCreationEnabled',
					'setMigratingManager',
					'migrateMarkets',
					'receiveMarkets',
				],
			});
		});

		it('Set minimum initial liquidity', async () => {
			const newValue = toUnit(20);
			const tx = await manager.setMinimumInitialLiquidity(newValue, { from: managerOwner });
			assert.bnEqual(await manager.minimumInitialLiquidity(), newValue);
			const log = tx.logs[0];
			assert.equal(log.event, 'MinimumInitialLiquidityUpdated');
			assert.bnEqual(log.args.value, newValue);
		});

		it('Only the owner can set the minimum initial liquidity', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setMinimumInitialLiquidity,
				args: [toUnit(20)],
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
			const tx = await manager.setOracleMaturityWindow(100, { from: managerOwner });
			assert.bnEqual((await manager.durations()).oracleMaturityWindow, toBN(100));
			const log = tx.logs[0];
			assert.equal(log.event, 'OracleMaturityWindowUpdated');
			assert.bnEqual(log.args.duration, toBN(100));
		});

		it('Only the owner can set the oracle maturity window', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setOracleMaturityWindow,
				args: [100],
				accounts,
				address: managerOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Set exercise duration', async () => {
			const tx = await manager.setExerciseDuration(100, { from: managerOwner });
			assert.bnEqual((await manager.durations()).exerciseDuration, toBN(100));
			const log = tx.logs[0];
			assert.equal(log.event, 'ExerciseDurationUpdated');
			assert.bnEqual(log.args.duration, toBN(100));
		});

		it('Only the owner can set the exercise duration', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setExerciseDuration,
				args: [100],
				accounts,
				address: managerOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Set creator destruction duration', async () => {
			const tx = await manager.setCreatorDestructionDuration(100, { from: managerOwner });
			assert.bnEqual((await manager.durations()).creatorDestructionDuration, toBN(100));
			const log = tx.logs[0];
			assert.equal(log.event, 'CreatorDestructionDurationUpdated');
			assert.bnEqual(log.args.duration, toBN(100));
		});

		it('Only the owner can set the creator destruction duration', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: manager.setCreatorDestructionDuration,
				args: [100],
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
					minimumInitialLiquidity,
					sAUDKey,
					toUnit(1),
					[now + 100, now + 200, now + exerciseDuration + 200],
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
				ignoreParents: ['Owned', 'SelfDestructible', 'MixinResolver'],
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
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				{ from: initialCreator }
			);

			let log = result.logs[0];
			assert.equal(log.event, 'OwnerChanged');
			assert.equal(log.args.newOwner, manager.address);

			log = result.logs[1];
			assert.equal(log.event, 'MarketCreated');
			assert.equal(log.args.creator, initialCreator);
			assert.equal(log.args.oracleKey, sAUDKey);
			assert.bnEqual(log.args.targetPrice, toUnit(1));
			assert.bnEqual(log.args.biddingEndDate, toBN(now + 100));
			assert.bnEqual(log.args.maturityDate, toBN(now + 200));
			assert.bnEqual(log.args.destructionDate, toBN(now + 200).add(exerciseDuration));

			const market = await BinaryOptionMarket.at(log.args.market);

			const times = await market.times();
			assert.bnEqual(times.biddingEnd, toBN(now + 100));
			assert.bnEqual(times.maturity, toBN(now + 200));
			assert.bnEqual(times.destruction, toBN(now + 200).add(exerciseDuration));
			assert.bnEqual(
				await manager.publiclyDestructibleTime(market.address),
				toBN(now + 200)
					.add(exerciseDuration)
					.add(creatorDestructionDuration)
			);
			const oracleDetails = await market.oracleDetails();
			assert.equal(oracleDetails.key, sAUDKey);
			assert.bnEqual(oracleDetails.targetPrice, toUnit(1));
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

			assert.bnEqual(await manager.numMarkets(), toBN(1));
			assert.equal((await manager.markets(0, 100))[0], market.address);
		});

		it('Cannot create a market without sufficient capital to cover the initial bids.', async () => {
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(sAUDKey, toUnit(1), [now + 100, now + 200], [toUnit(2), toUnit(3)], {
					from: dummy,
				}),
				'SafeMath: subtraction overflow'
			);

			await sUSDSynth.issue(dummy, sUSDQty);

			await assert.revert(
				manager.createMarket(sAUDKey, toUnit(1), [now + 100, now + 200], [toUnit(2), toUnit(3)], {
					from: dummy,
				}),
				'SafeMath: subtraction overflow'
			);

			await sUSDSynth.approve(manager.address, sUSDQty, { from: dummy });

			await manager.createMarket(
				sAUDKey,
				toUnit(1),
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
					[now + 100, now + 200],
					[toUnit(0.1), toUnit(0.1)],
					{
						from: initialCreator,
					}
				),
				'Insufficient initial capital provided.'
			);
		});

		it('Cannot create a market too far into the future', async () => {
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(
					sAUDKey,
					toUnit(1),
					[now + 100, now + maxTimeToMaturity + 200],
					[toUnit(0.1), toUnit(0.1)],
					{
						from: initialCreator,
					}
				),
				'Maturity too far in the future.'
			);
		});

		it('Cannot create a market if either initial bid is zero', async () => {
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(sAUDKey, toUnit(1), [now + 100, now + 200], [toUnit(0), toUnit(5)], {
					from: initialCreator,
				}),
				'Bids on each side must be nonzero.'
			);
			await assert.revert(
				manager.createMarket(sAUDKey, toUnit(1), [now + 100, now + 200], [toUnit(5), toUnit(0)], {
					from: initialCreator,
				}),
				'Bids on each side must be nonzero.'
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
				manager.createMarket(sAUDKey, toUnit(1), [now + 100, now + 200], [toUnit(5), toUnit(5)], {
					from: initialCreator,
				}),
				'Operation prohibited'
			);
		});

		it('Cannot create a market if the manager is paused', async () => {
			await manager.setPaused(true, { from: managerOwner });
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(sAUDKey, toUnit(1), [now + 100, now + 200], [toUnit(5), toUnit(5)], {
					from: initialCreator,
				}),
				'This action cannot be performed while the contract is paused'
			);
		});

		it('Market creation can be enabled and disabled.', async () => {
			let tx = await manager.setMarketCreationEnabled(false, { from: managerOwner });
			assert.equal(tx.logs[0].event, 'MarketCreationEnabledUpdated');
			assert.isFalse(tx.logs[0].args.enabled);
			assert.isFalse(await manager.marketCreationEnabled());

			tx = await manager.setMarketCreationEnabled(true, { from: managerOwner });
			assert.equal(tx.logs[0].event, 'MarketCreationEnabledUpdated');
			assert.isTrue(tx.logs[0].args.enabled);
			assert.isTrue(await manager.marketCreationEnabled());

			tx = await manager.setMarketCreationEnabled(true, { from: managerOwner });
			assert.equal(tx.logs.length, 0);
		});

		it('Cannot create a market if market creation is disabled.', async () => {
			await manager.setMarketCreationEnabled(false, { from: managerOwner });
			const now = await currentTime();
			await assert.revert(
				manager.createMarket(sAUDKey, toUnit(1), [now + 100, now + 200], [toUnit(5), toUnit(5)], {
					from: initialCreator,
				}),
				'Market creation is disabled.'
			);

			await manager.setMarketCreationEnabled(true, { from: managerOwner });
			const tx = await manager.createMarket(
				sAUDKey,
				toUnit(1),
				[now + 100, now + 200],
				[toUnit(5), toUnit(5)],
				{
					from: initialCreator,
				}
			);
			const localMarket = await BinaryOptionMarket.at(tx.logs[1].args.market);
			assert.bnEqual((await localMarket.oracleDetails()).targetPrice, toUnit(1));
		});
	});

	describe('Market destruction', () => {
		it('Can destroy a market', async () => {
			let now = await currentTime();
			await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);

			now = await currentTime();
			const newMarket = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				[now + 100, now + 200],
				[toUnit(1), toUnit(1)],
				initialCreator
			);
			const address = newMarket.address;

			assert.bnEqual(await manager.totalDeposited(), toUnit(7));
			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await newMarket.resolve();

			const expectedBalance = (await sUSDSynth.balanceOf(initialCreator)).add(
				await newMarket.destructionReward()
			);
			const tx = await manager.destroyMarket(newMarket.address, { from: initialCreator });

			assert.equal(tx.logs[0].event, 'MarketDestroyed');
			assert.equal(tx.logs[0].args.market, address);
			assert.equal(tx.logs[0].args.destroyer, initialCreator);
			assert.equal(await web3.eth.getCode(address), '0x');

			assert.bnEqual(await sUSDSynth.balanceOf(initialCreator), expectedBalance);
		});

		it('Cannot destroy a market that does not exist', async () => {
			await assert.revert(manager.destroyMarket(initialCreator, { from: initialCreator }));
		});

		it('Cannot destroy a non-destructible market.', async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);
			await assert.revert(
				manager.destroyMarket(newMarket.address, { from: initialCreator }),
				'Market cannot be destroyed yet.'
			);
		});

		it("Only a market's original creator can initially destroy it within the exclusive period.", async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);
			await fastForward(exerciseDuration.add(toBN(creatorDestructionDuration)));
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await newMarket.resolve();
			await assert.revert(
				manager.destroyMarket(newMarket.address, { from: bidder }),
				'Still within creator exclusive destruction period.'
			);
		});

		it('Anyone may destroy a market outside the exclusive period.', async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);
			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await newMarket.resolve();

			const expectedBalance = (await sUSDSynth.balanceOf(bidder)).add(
				await newMarket.destructionReward()
			);
			const tx = await manager.destroyMarket(newMarket.address, { from: bidder });
			assert.bnEqual(await sUSDSynth.balanceOf(bidder), expectedBalance);
			assert.equal(tx.logs[0].args.destroyer, bidder);
		});

		it('Cannot destroy a market if the system is suspended.', async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);
			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await newMarket.resolve();

			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});

			await assert.revert(
				manager.destroyMarket(newMarket.address, { from: bidder }),
				'Operation prohibited'
			);
		});

		it('Cannot destroy a market if the manager is paused.', async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);
			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await newMarket.resolve();

			await manager.setPaused(true, { from: managerOwner });
			await assert.revert(
				manager.destroyMarket(newMarket.address, { from: bidder }),
				'This action cannot be performed while the contract is paused'
			);
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

			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(2)], await currentTime(), {
				from: oracle,
			});
			await Promise.all(markets.map(m => m.resolve()));

			assert.bnEqual(await markets[0].result(), toBN(0));
			assert.bnEqual(await markets[1].result(), toBN(0));
			assert.bnEqual(await markets[2].result(), toBN(1));

			await manager.destroyMarket(markets[0].address, { from: initialCreator });
			assert.bnEqual(await manager.totalDeposited(), toUnit(8));
			await manager.destroyMarket(markets[1].address, { from: initialCreator });
			assert.bnEqual(await manager.totalDeposited(), toUnit(4));
			await manager.destroyMarket(markets[2].address, { from: initialCreator });
			assert.bnEqual(await manager.totalDeposited(), toUnit(0));
		});

		it('Adding and removing markets properly updates the market list', async () => {
			const numMarkets = 8;
			assert.bnEqual(await manager.numMarkets(), toBN(0));
			assert.equal((await manager.markets(0, 100)).length, 0);
			const now = await currentTime();
			const markets = await Promise.all(
				new Array(numMarkets)
					.fill(0)
					.map(() =>
						createMarket(
							manager,
							sAUDKey,
							toUnit(1),
							[now + 100, now + 200],
							[toUnit(1), toUnit(1)],
							initialCreator
						)
					)
			);

			const createdMarkets = markets.map(m => m.address).sort();
			const recordedMarkets = (await manager.markets(0, 100)).sort();

			assert.bnEqual(await manager.numMarkets(), toBN(numMarkets));
			assert.equal(createdMarkets.length, recordedMarkets.length);
			createdMarkets.forEach((p, i) => assert.equal(p, recordedMarkets[i]));

			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(2)], await currentTime(), {
				from: oracle,
			});
			await Promise.all(markets.map(m => m.resolve()));

			// Destroy half the markets
			const evenMarkets = markets.filter((e, i) => i % 2 === 0);
			await Promise.all(
				evenMarkets.map(m => manager.destroyMarket(m.address, { from: initialCreator }))
			);
			const oddMarkets = markets
				.filter((e, i) => i % 2 !== 0)
				.map(m => m.address)
				.sort();
			let remainingMarkets = (await manager.markets(0, 100)).sort();
			assert.bnEqual(await manager.numMarkets(), toBN(numMarkets / 2));
			oddMarkets.forEach((p, i) => assert.equal(p, remainingMarkets[i]));

			// Can remove the last market
			const lastMarket = (await manager.markets(numMarkets / 2 - 1, 1))[0];
			assert.isTrue(remainingMarkets.includes(lastMarket));
			await manager.destroyMarket(lastMarket, { from: initialCreator });
			remainingMarkets = await manager.markets(0, 100);
			assert.bnEqual(await manager.numMarkets(), toBN(numMarkets / 2 - 1));
			assert.isFalse(remainingMarkets.includes(lastMarket));

			// Destroy the remaining markets.
			await Promise.all(
				remainingMarkets.map(m => manager.destroyMarket(m, { from: initialCreator }))
			);
			assert.bnEqual(await manager.numMarkets(), toBN(0));
			assert.equal((await manager.markets(0, 100)).length, 0);
		});

		it('Pagination works properly', async () => {
			const numMarkets = 8;
			const now = await currentTime();
			const markets = [];
			const windowSize = 3;
			let ms;

			// Empty list
			for (let i = 0; i < numMarkets; i++) {
				ms = await manager.markets(i, 2);
				assert.equal(ms.length, 0);
			}

			for (let i = 1; i <= numMarkets; i++) {
				markets.push(
					await createMarket(
						manager,
						sAUDKey,
						toUnit(i),
						[now + 100, now + 200],
						[toUnit(1), toUnit(1)],
						initialCreator
					)
				);
			}

			// Single elements
			for (let i = 0; i < numMarkets; i++) {
				ms = await manager.markets(i, 1);
				assert.equal(ms.length, 1);
				const m = await BinaryOptionMarket.at(ms[0]);
				assert.bnEqual((await m.oracleDetails()).targetPrice, toUnit(i + 1));
			}

			// shifting window
			for (let i = 0; i < numMarkets - windowSize; i++) {
				ms = await manager.markets(i, windowSize);
				assert.equal(ms.length, windowSize);

				for (let j = 0; j < windowSize; j++) {
					const m = await BinaryOptionMarket.at(ms[j]);
					assert.bnEqual((await m.oracleDetails()).targetPrice, toUnit(i + j + 1));
				}
			}

			// entire list
			ms = await manager.markets(0, numMarkets);
			assert.equal(ms.length, numMarkets);
			for (let i = 0; i < numMarkets; i++) {
				const m = await BinaryOptionMarket.at(ms[i]);
				assert.bnEqual((await m.oracleDetails()).targetPrice, toUnit(i + 1));
			}

			// Page extends past end of list
			ms = await manager.markets(numMarkets - windowSize, windowSize * 2);
			assert.equal(ms.length, windowSize);
			for (let i = numMarkets - windowSize; i < numMarkets; i++) {
				const j = i - (numMarkets - windowSize);
				const m = await BinaryOptionMarket.at(ms[j]);
				assert.bnEqual((await m.oracleDetails()).targetPrice, toUnit(i + 1));
			}

			// zero page size
			for (let i = 0; i < numMarkets; i++) {
				ms = await manager.markets(i, 0);
				assert.equal(ms.length, 0);
			}

			// index past the end
			for (let i = 0; i < 3; i++) {
				ms = await manager.markets(numMarkets, i);
				assert.equal(ms.length, 0);
			}

			// Page size larger than entire list
			ms = await manager.markets(0, numMarkets * 2);
			assert.equal(ms.length, numMarkets);
			for (let i = 0; i < numMarkets; i++) {
				const m = await BinaryOptionMarket.at(ms[i]);
				assert.bnEqual((await m.oracleDetails()).targetPrice, toUnit(i + 1));
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
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);

			await onlyGivenAddressCanInvoke({
				fnc: manager.incrementTotalDeposited,
				args: [toUnit(2)],
				accounts,
				reason: 'Permitted only for known markets',
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
				[now + 100, now + 200],
				[toUnit(2), toUnit(3)],
				initialCreator
			);

			now = await currentTime();
			const newMarket = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
				[now + 100, now + 200],
				[toUnit(1), toUnit(1)],
				initialCreator
			);

			assert.bnEqual(await manager.totalDeposited(), toUnit(7));
			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await newMarket.resolve();
			await manager.destroyMarket(newMarket.address, { from: initialCreator });

			assert.bnEqual(await manager.totalDeposited(), toUnit(5));
		});

		it('Bidding affects total deposits properly.', async () => {
			const now = await currentTime();
			const market = await createMarket(
				manager,
				sAUDKey,
				toUnit(1),
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
			const refundFeeRetained = mulDecRound(toUnit(1.5), initialRefundFee);
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
					10000,
					maxTimeToMaturity,
					toUnit(10),
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
			await factory.setResolverAndSyncCache(addressResolver.address, { from: accounts[1] });
			await newManager.setResolverAndSyncCache(addressResolver.address, { from: managerOwner });

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
			await manager.migrateMarkets(newManager.address, [markets[1].address], {
				from: managerOwner,
			});

			const oldMarkets = await manager.markets(0, 100);
			assert.bnEqual(await manager.numMarkets(), toBN(2));
			assert.equal(oldMarkets.length, 2);
			assert.equal(oldMarkets[0], markets[0].address);
			assert.equal(oldMarkets[1], markets[2].address);

			const newMarkets = await newManager.markets(0, 100);
			assert.bnEqual(await newManager.numMarkets(), toBN(1));
			assert.equal(newMarkets.length, 1);
			assert.equal(newMarkets[0], markets[1].address);

			assert.equal(await markets[0].owner(), manager.address);
			assert.equal(await markets[2].owner(), manager.address);
			assert.equal(await markets[1].owner(), newManager.address);
		});

		it('Markets can only be migrated by the owner.', async () => {
			onlyGivenAddressCanInvoke({
				fnc: manager.migrateMarkets,
				args: [newManager.address, [markets[1].address]],
				accounts,
				address: managerOwner,
				skipPassCheck: true,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Markets can only be received from the migrating manager.', async () => {
			onlyGivenAddressCanInvoke({
				fnc: manager.receiveMarkets,
				args: [[markets[1].address]],
				accounts,
				address: manager.address,
				skipPassCheck: true,
				reason: 'Only permitted for migrating manager.',
			});
		});

		it('Markets cannot be migrated between factories if the migrating manager unset', async () => {
			await newManager.setMigratingManager('0x' + '0'.repeat(40), { from: managerOwner });
			await assert.revert(
				manager.migrateMarkets(newManager.address, [markets[1].address], { from: managerOwner }),
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
					10000,
					maxTimeToMaturity,
					toUnit(10),
					toUnit(0.008),
					toUnit(0.002),
					toUnit(0.02),
				],
			});
			await manager.migrateMarkets(newManager.address, [], { from: managerOwner });
			assert.equal(await newManager.numMarkets(), 0);

			await newerManager.setMigratingManager(newManager.address, { from: managerOwner });
			await newManager.migrateMarkets(newerManager.address, [], { from: managerOwner });
			assert.equal(await newerManager.numMarkets(), 0);
		});

		it('Receiving an empty market list does nothing.', async () => {
			await newManager.setMigratingManager(managerOwner, { from: managerOwner });
			await newManager.receiveMarkets([], { from: managerOwner });
			assert.bnEqual(await newManager.numMarkets(), 0);
		});

		it('Markets can be migrated to a factories with existing markets.', async () => {
			await manager.migrateMarkets(newManager.address, [markets[1].address], {
				from: managerOwner,
			});
			await manager.migrateMarkets(newManager.address, [markets[0].address], {
				from: managerOwner,
			});

			const oldMarkets = await manager.markets(0, 100);
			assert.bnEqual(await manager.numMarkets(), toBN(1));
			assert.equal(oldMarkets.length, 1);
			assert.equal(oldMarkets[0], markets[2].address);

			const newMarkets = await newManager.markets(0, 100);
			assert.bnEqual(await newManager.numMarkets(), toBN(2));
			assert.equal(newMarkets.length, 2);
			assert.equal(newMarkets[0], markets[1].address);
			assert.equal(newMarkets[1], markets[0].address);
		});

		it('All markets can be migrated from a manager.', async () => {
			await manager.migrateMarkets(newManager.address, markets.map(m => m.address).reverse(), {
				from: managerOwner,
			});

			const oldMarkets = await manager.markets(0, 100);
			assert.bnEqual(await manager.numMarkets(), toBN(0));
			assert.equal(oldMarkets.length, 0);

			const newMarkets = await newManager.markets(0, 100);
			assert.bnEqual(await newManager.numMarkets(), toBN(3));
			assert.equal(newMarkets.length, 3);
			assert.equal(newMarkets[0], markets[2].address);
			assert.equal(newMarkets[1], markets[1].address);
			assert.equal(newMarkets[2], markets[0].address);
		});

		it('Migrating markets updates total deposits properly.', async () => {
			await manager.migrateMarkets(newManager.address, [markets[2].address, markets[1].address], {
				from: managerOwner,
			});
			assert.bnEqual(await manager.totalDeposited(), toUnit(2));
			assert.bnEqual(await newManager.totalDeposited(), toUnit(4));
		});

		it('Migrated markets still operate properly.', async () => {
			await manager.migrateMarkets(newManager.address, [markets[2].address, markets[1].address], {
				from: managerOwner,
			});

			await markets[0].bid(Side.Short, toUnit(1), { from: bidder });
			await markets[1].bid(Side.Long, toUnit(3), { from: bidder });
			assert.bnEqual(await manager.totalDeposited(), toUnit(3));
			assert.bnEqual(await newManager.totalDeposited(), toUnit(7));

			now = await currentTime();
			await createMarket(
				newManager,
				sAUDKey,
				toUnit(10),
				[now + 100, now + 200],
				[toUnit(10), toUnit(10)],
				bidder
			);
			assert.bnEqual(await newManager.totalDeposited(), toUnit(27));
			assert.bnEqual(await newManager.numMarkets(), toBN(3));

			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await markets[2].resolve();
			await newManager.destroyMarket(markets[2].address, { from: initialCreator });
			assert.bnEqual(await newManager.numMarkets(), toBN(2));
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

			await manager.migrateMarkets(newManager.address, [markets[0].address], {
				from: managerOwner,
			});

			assert.bnEqual(await manager.numMarkets(), toBN(2));
			assert.bnEqual(await newManager.numMarkets(), toBN(1));
		});

		it('Market migration fails if any unknown markets are included', async () => {
			await assert.revert(
				manager.migrateMarkets(newManager.address, [markets[1].address, managerOwner], {
					from: managerOwner,
				}),
				'Market unknown.'
			);
		});

		it('Market migration events are properly emitted.', async () => {
			const tx = await manager.migrateMarkets(
				newManager.address,
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

		it('Can sync the resolver of child markets.', async () => {
			const resolverMock = await setupContract({
				accounts,
				contract: 'GenericMock',
				mock: 'AddressResolver',
			});

			await mockGenericContractFnc({
				instance: resolverMock,
				fncName: 'requireAndGetAddress',
				mock: 'AddressResolver',
				returns: [managerOwner],
			});

			// Only sets the resolver for the listed addresses
			await manager.setResolverAndSyncCacheOnMarkets(resolverMock.address, [markets[0].address], {
				from: managerOwner,
			});

			assert.equal(await markets[0].resolver(), resolverMock.address);
			assert.equal(await markets[1].resolver(), addressResolver.address);
			assert.equal(await markets[2].resolver(), addressResolver.address);

			// Only sets the resolver for the remaining addresses
			await manager.setResolverAndSyncCacheOnMarkets(
				resolverMock.address,
				[markets[1].address, markets[2].address],
				{ from: managerOwner }
			);

			assert.equal(await markets[0].resolver(), resolverMock.address);
			assert.equal(await markets[1].resolver(), resolverMock.address);
			assert.equal(await markets[2].resolver(), resolverMock.address);
		});

		it('Only the owner can sync market resolvers', async () => {
			onlyGivenAddressCanInvoke({
				fnc: manager.setResolverAndSyncCacheOnMarkets,
				args: [addressResolver.address, [markets[0].address]],
				accounts,
				address: managerOwner,
				skipPassCheck: true,
				reason: 'Only the contract owner may perform this action',
			});
		});
	});
});
