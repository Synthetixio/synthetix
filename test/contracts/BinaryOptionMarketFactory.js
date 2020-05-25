'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { toUnit, currentTime, fastForward } = require('../utils')();
const { toBytes32 } = require('../..');
const { setupContract, setupAllContracts } = require('./setup');
const {
	setStatus,
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
} = require('./helpers');

const BinaryOptionMarket = artifacts.require('BinaryOptionMarket');

contract('BinaryOptionMarketFactory', accounts => {
	const [initialCreator, factoryOwner, bidder, dummy] = accounts;

	const sUSDQty = toUnit(10000);

	const minimumInitialLiquidity = toUnit(2);
	const maturityWindow = toBN(60 * 61);
	const exerciseDuration = toBN(7 * 24 * 60 * 60);
	const creatorDestructionDuration = toBN(7 * 24 * 60 * 60);

	const initialPoolFee = toUnit(0.008);
	const initialCreatorFee = toUnit(0.002);
	const initialRefundFee = toUnit(0.02);

	let factory, systemStatus, exchangeRates, addressResolver, sUSDSynth, oracle;

	const sAUDKey = toBytes32('sAUD');

	const Side = {
		Long: toBN(0),
		Short: toBN(1),
	};

	const createMarket = async (
		fac,
		endOfBidding,
		maturity,
		oracleKey,
		targetPrice,
		longBid,
		shortBid,
		creator
	) => {
		const tx = await fac.createMarket(
			endOfBidding,
			maturity,
			oracleKey,
			targetPrice,
			longBid,
			shortBid,
			{ from: creator }
		);
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
				'BinaryOptionMarketFactory',
				'AddressResolver',
				'ExchangeRates',
				'FeePool',
				'Synthetix',
			],
		}));

		oracle = await exchangeRates.oracle();

		await sUSDSynth.issue(initialCreator, sUSDQty);
		await sUSDSynth.approve(factory.address, sUSDQty, { from: initialCreator });
		await sUSDSynth.issue(bidder, sUSDQty);
		await sUSDSynth.approve(factory.address, sUSDQty, { from: bidder });
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('Basic parameters', () => {
		it('Static parameters are set properly', async () => {
			const durations = await factory.durations();
			assert.bnEqual(durations.exerciseDuration, exerciseDuration);
			assert.bnEqual(durations.oracleMaturityWindow, maturityWindow);
			assert.bnEqual(durations.creatorDestructionDuration, creatorDestructionDuration);

			const fees = await factory.fees();
			assert.bnEqual(fees.poolFee, initialPoolFee);
			assert.bnEqual(fees.creatorFee, initialCreatorFee);
			assert.bnEqual(fees.refundFee, initialRefundFee);

			assert.bnEqual(await factory.minimumInitialLiquidity(), minimumInitialLiquidity);
			assert.bnEqual(await factory.totalDeposited(), toBN(0));
			assert.equal(await factory.resolver(), addressResolver.address);
			assert.equal(await factory.owner(), factoryOwner);
		});

		it('Only expected functions are mutative', async () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: factory.abi,
				ignoreParents: ['Owned', 'Pausable', 'MixinResolver'],
				expected: [
					'setOracleMaturityWindow',
					'setExerciseDuration',
					'setCreatorDestructionDuration',
					'setPoolFee',
					'setCreatorFee',
					'setRefundFee',
					'setMinimumInitialLiquidity',
					'incrementTotalDeposited',
					'decrementTotalDeposited',
					'createMarket',
					'destroyMarket',
					'setMarketCreationEnabled',
					'setMigratingFactory',
					'migrateMarkets',
					'receiveMarkets',
				],
			});
		});

		it('Set minimum initial liquidity', async () => {
			const newValue = toUnit(20);
			const tx = await factory.setMinimumInitialLiquidity(newValue, { from: factoryOwner });
			assert.bnEqual(await factory.minimumInitialLiquidity(), newValue);
			const log = tx.logs[0];
			assert.equal(log.event, 'MinimumInitialLiquidityChanged');
			assert.bnEqual(log.args.value, newValue);
		});

		it('Only the owner can set the minimum initial liquidity', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: factory.setMinimumInitialLiquidity,
				args: [toUnit(20)],
				accounts,
				address: factoryOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Set pool fee', async () => {
			const newFee = toUnit(0.5);
			const tx = await factory.setPoolFee(newFee, { from: factoryOwner });
			assert.bnEqual((await factory.fees()).poolFee, newFee);
			const log = tx.logs[0];
			assert.equal(log.event, 'PoolFeeChanged');
			assert.bnEqual(log.args.fee, newFee);
		});

		it("Pool fee can't be set too high", async () => {
			const newFee = toUnit(1);
			await assert.revert(
				factory.setPoolFee(newFee, { from: factoryOwner }),
				'Total fee must be less than 100%.'
			);
		});

		it('Only the owner can set the pool fee', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: factory.setPoolFee,
				args: [toUnit(0.5)],
				accounts,
				address: factoryOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Set creator fee', async () => {
			const newFee = toUnit(0.5);
			const tx = await factory.setCreatorFee(newFee, { from: factoryOwner });
			assert.bnEqual((await factory.fees()).creatorFee, newFee);
			const log = tx.logs[0];
			assert.equal(log.event, 'CreatorFeeChanged');
			assert.bnEqual(log.args.fee, newFee);
		});

		it("Creator fee can't be set too high", async () => {
			const newFee = toUnit(1);
			await assert.revert(
				factory.setCreatorFee(newFee, { from: factoryOwner }),
				'Total fee must be less than 100%.'
			);
		});

		it('Only the owner can set the creator fee', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: factory.setCreatorFee,
				args: [toUnit(0.5)],
				accounts,
				address: factoryOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Set refund fee', async () => {
			const newFee = toUnit(1);
			const tx = await factory.setRefundFee(newFee, { from: factoryOwner });
			assert.bnEqual((await factory.fees()).refundFee, newFee);
			const log = tx.logs[0];
			assert.equal(log.event, 'RefundFeeChanged');
			assert.bnEqual(log.args.fee, newFee);
		});

		it('Only the owner can set the refund fee', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: factory.setRefundFee,
				args: [toUnit(0.5)],
				accounts,
				address: factoryOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it("Refund fee can't be set too high", async () => {
			const newFee = toUnit(1.01);
			await assert.revert(
				factory.setRefundFee(newFee, { from: factoryOwner }),
				'Refund fee must be no greater than 100%.'
			);
		});

		it('Set oracle maturity window', async () => {
			const tx = await factory.setOracleMaturityWindow(100, { from: factoryOwner });
			assert.bnEqual((await factory.durations()).oracleMaturityWindow, toBN(100));
			const log = tx.logs[0];
			assert.equal(log.event, 'OracleMaturityWindowChanged');
			assert.bnEqual(log.args.duration, toBN(100));
		});

		it('Only the owner can set the oracle maturity window', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: factory.setOracleMaturityWindow,
				args: [100],
				accounts,
				address: factoryOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Set exercise duration', async () => {
			const tx = await factory.setExerciseDuration(100, { from: factoryOwner });
			assert.bnEqual((await factory.durations()).exerciseDuration, toBN(100));
			const log = tx.logs[0];
			assert.equal(log.event, 'ExerciseDurationChanged');
			assert.bnEqual(log.args.duration, toBN(100));
		});

		it('Only the owner can set the exercise duration', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: factory.setExerciseDuration,
				args: [100],
				accounts,
				address: factoryOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Set creator destruction duration', async () => {
			const tx = await factory.setCreatorDestructionDuration(100, { from: factoryOwner });
			assert.bnEqual((await factory.durations()).creatorDestructionDuration, toBN(100));
			const log = tx.logs[0];
			assert.equal(log.event, 'CreatorDestructionDurationChanged');
			assert.bnEqual(log.args.duration, toBN(100));
		});

		it('Only the owner can set the creator destruction duration', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: factory.setCreatorDestructionDuration,
				args: [100],
				accounts,
				address: factoryOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});
	});

	describe('Market creation', () => {
		it('Can create a market', async () => {
			const now = await currentTime();

			const result = await factory.createMarket(
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(2),
				toUnit(3),
				{ from: initialCreator }
			);

			let log = result.logs[0];
			assert.equal(log.event, 'OwnerChanged');
			assert.equal(log.args.newOwner, factory.address);

			log = result.logs[1];
			assert.equal(log.event, 'MarketCreated');
			assert.equal(log.args.creator, initialCreator);
			assert.equal(log.args.oracleKey, sAUDKey);
			assert.bnEqual(log.args.targetPrice, toUnit(1));
			assert.bnEqual(log.args.endOfBidding, toBN(now + 100));
			assert.bnEqual(log.args.maturity, toBN(now + 200));

			const market = await BinaryOptionMarket.at(log.args.market);

			const times = await market.times();
			assert.bnEqual(times.biddingEnd, toBN(now + 100));
			assert.bnEqual(times.maturity, toBN(now + 200));
			assert.bnEqual(times.destruction, toBN(now + 200).add(exerciseDuration));
			assert.bnEqual(
				await factory.publiclyDestructibleTime(market.address),
				toBN(now + 200)
					.add(exerciseDuration)
					.add(creatorDestructionDuration)
			);
			const oracleDetails = await market.oracleDetails();
			assert.equal(oracleDetails.key, sAUDKey);
			assert.bnEqual(oracleDetails.targetPrice, toUnit(1));
			assert.bnEqual(oracleDetails.finalPrice, toBN(0));
			assert.bnEqual(oracleDetails.maturityWindow, maturityWindow);
			assert.equal(await market.creator(), initialCreator);
			assert.equal(await market.owner(), factory.address);
			assert.equal(await market.resolver(), addressResolver.address);

			const bids = await market.totalBids();
			assert.bnEqual(bids[0], toUnit(2));
			assert.bnEqual(bids[1], toUnit(3));
			assert.bnEqual(await market.deposited(), toUnit(5));
			assert.bnEqual(await factory.totalDeposited(), toUnit(5));

			const fees = await market.fees();
			assert.bnEqual(fees.poolFee, initialPoolFee);
			assert.bnEqual(fees.creatorFee, initialCreatorFee);
			assert.bnEqual(fees.refundFee, initialRefundFee);

			assert.bnEqual(await factory.numMarkets(), toBN(1));
			assert.equal((await factory.markets(0, 100))[0], market.address);
		});

		it('Cannot create a market without sufficient capital to cover the initial bids.', async () => {
			const now = await currentTime();
			await assert.revert(
				factory.createMarket(now + 100, now + 200, sAUDKey, toUnit(1), toUnit(2), toUnit(3), {
					from: dummy,
				}),
				'SafeMath: subtraction overflow'
			);

			await sUSDSynth.issue(dummy, sUSDQty);

			await assert.revert(
				factory.createMarket(now + 100, now + 200, sAUDKey, toUnit(1), toUnit(2), toUnit(3), {
					from: dummy,
				}),
				'SafeMath: subtraction overflow'
			);

			await sUSDSynth.approve(factory.address, sUSDQty, { from: dummy });

			await factory.createMarket(now + 100, now + 200, sAUDKey, toUnit(1), toUnit(2), toUnit(3), {
				from: dummy,
			});
		});

		it('Cannot create a market providing insufficient initial bids', async () => {
			const now = await currentTime();
			await assert.revert(
				factory.createMarket(now + 100, now + 200, sAUDKey, toUnit(1), toUnit(0.1), toUnit(0.1), {
					from: initialCreator,
				}),
				'Insufficient initial capital provided.'
			);
		});

		it('Cannot create a market if either initial bid is zero', async () => {
			const now = await currentTime();
			await assert.revert(
				factory.createMarket(now + 100, now + 200, sAUDKey, toUnit(1), toUnit(0), toUnit(5), {
					from: initialCreator,
				}),
				'Option prices must be nonzero.'
			);
			await assert.revert(
				factory.createMarket(now + 100, now + 200, sAUDKey, toUnit(1), toUnit(5), toUnit(0), {
					from: initialCreator,
				}),
				'Option prices must be nonzero.'
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
				factory.createMarket(now + 100, now + 200, sAUDKey, toUnit(1), toUnit(5), toUnit(5), {
					from: initialCreator,
				}),
				'Operation prohibited'
			);
		});

		it('Cannot create a market if the factory is paused', async () => {
			await factory.setPaused(true, { from: factoryOwner });
			const now = await currentTime();
			await assert.revert(
				factory.createMarket(now + 100, now + 200, sAUDKey, toUnit(1), toUnit(5), toUnit(5), {
					from: initialCreator,
				}),
				'This action cannot be performed while the contract is paused'
			);
		});

		it('Market creation can be enabled and disabled.', async () => {
			let tx = await factory.setMarketCreationEnabled(false, { from: factoryOwner });
			assert.equal(tx.logs[0].event, 'MarketCreationChanged');
			assert.isFalse(tx.logs[0].args.enabled);
			assert.isFalse(await factory.marketCreationEnabled());

			tx = await factory.setMarketCreationEnabled(true, { from: factoryOwner });
			assert.equal(tx.logs[0].event, 'MarketCreationChanged');
			assert.isTrue(tx.logs[0].args.enabled);
			assert.isTrue(await factory.marketCreationEnabled());

			tx = await factory.setMarketCreationEnabled(true, { from: factoryOwner });
			assert.equal(tx.logs.length, 0);
		});

		it('Cannot create a market if market creation is disabled.', async () => {
			await factory.setMarketCreationEnabled(false, { from: factoryOwner });
			const now = await currentTime();
			await assert.revert(
				factory.createMarket(now + 100, now + 200, sAUDKey, toUnit(1), toUnit(5), toUnit(5), {
					from: initialCreator,
				}),
				'Market creation is disabled.'
			);

			await factory.setMarketCreationEnabled(true, { from: factoryOwner });
			const tx = await factory.createMarket(
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(5),
				toUnit(5),
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
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(2),
				toUnit(3),
				initialCreator
			);

			now = await currentTime();
			const newMarket = await createMarket(
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(1),
				toUnit(1),
				initialCreator
			);
			const address = newMarket.address;

			assert.bnEqual(await factory.totalDeposited(), toUnit(7));
			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await newMarket.resolve();

			const expectedBalance = (await sUSDSynth.balanceOf(initialCreator)).add(
				await newMarket.destructionFunds()
			);
			const tx = await factory.destroyMarket(newMarket.address, { from: initialCreator });

			assert.equal(tx.logs[0].event, 'MarketDestroyed');
			assert.equal(tx.logs[0].args.market, address);
			assert.equal(tx.logs[0].args.destroyer, initialCreator);
			assert.equal(await web3.eth.getCode(address), '0x');

			assert.bnEqual(await sUSDSynth.balanceOf(initialCreator), expectedBalance);
		});

		it('Cannot destroy a market that does not exist', async () => {
			await assert.revert(factory.destroyMarket(initialCreator, { from: initialCreator }));
		});

		it('Cannot destroy a non-destructible market.', async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(2),
				toUnit(3),
				initialCreator
			);
			await assert.revert(
				factory.destroyMarket(newMarket.address, { from: initialCreator }),
				'Market cannot be destroyed yet.'
			);
		});

		it("Only a market's original creator can initially destroy it within the exclusive period.", async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(2),
				toUnit(3),
				initialCreator
			);
			await fastForward(exerciseDuration.add(toBN(creatorDestructionDuration)));
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await newMarket.resolve();
			await assert.revert(
				factory.destroyMarket(newMarket.address, { from: bidder }),
				'Still within creator exclusive destruction period.'
			);
		});

		it('Anyone may destroy a market outside the exclusive period.', async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(2),
				toUnit(3),
				initialCreator
			);
			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await newMarket.resolve();

			const expectedBalance = (await sUSDSynth.balanceOf(bidder)).add(
				await newMarket.destructionFunds()
			);
			const tx = await factory.destroyMarket(newMarket.address, { from: bidder });
			assert.bnEqual(await sUSDSynth.balanceOf(bidder), expectedBalance);
			assert.equal(tx.logs[0].args.destroyer, bidder);
		});

		it('Cannot destroy a market if the system is suspended.', async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(2),
				toUnit(3),
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
				factory.destroyMarket(newMarket.address, { from: bidder }),
				'Operation prohibited'
			);
		});

		it('Cannot destroy a market if the factory is paused.', async () => {
			const now = await currentTime();
			const newMarket = await createMarket(
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(2),
				toUnit(3),
				initialCreator
			);
			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await newMarket.resolve();

			await factory.setPaused(true, { from: factoryOwner });
			await assert.revert(
				factory.destroyMarket(newMarket.address, { from: bidder }),
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
						factory,
						now + 100,
						now + 200,
						sAUDKey,
						price,
						toUnit(1),
						toUnit(1),
						initialCreator
					)
				)
			);
			await Promise.all(
				markets.map(market => sUSDSynth.approve(market.address, sUSDQty, { from: bidder }))
			);

			assert.bnEqual(await factory.totalDeposited(), toUnit(6));
			await markets[0].bid(Side.Long, toUnit(2), { from: bidder });
			assert.bnEqual(await factory.totalDeposited(), toUnit(8));
			await markets[1].bid(Side.Short, toUnit(2), { from: bidder });
			assert.bnEqual(await factory.totalDeposited(), toUnit(10));
			await markets[2].bid(Side.Short, toUnit(2), { from: bidder });
			assert.bnEqual(await factory.totalDeposited(), toUnit(12));

			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(2)], await currentTime(), {
				from: oracle,
			});
			await Promise.all(markets.map(m => m.resolve()));

			assert.bnEqual(await markets[0].result(), toBN(0));
			assert.bnEqual(await markets[1].result(), toBN(0));
			assert.bnEqual(await markets[2].result(), toBN(1));

			await factory.destroyMarket(markets[0].address, { from: initialCreator });
			assert.bnEqual(await factory.totalDeposited(), toUnit(8));
			await factory.destroyMarket(markets[1].address, { from: initialCreator });
			assert.bnEqual(await factory.totalDeposited(), toUnit(4));
			await factory.destroyMarket(markets[2].address, { from: initialCreator });
			assert.bnEqual(await factory.totalDeposited(), toUnit(0));
		});

		it('Adding and removing markets properly updates the market list', async () => {
			const numMarkets = 8;
			assert.bnEqual(await factory.numMarkets(), toBN(0));
			assert.equal((await factory.markets(0, 100)).length, 0);
			const now = await currentTime();
			const markets = await Promise.all(
				new Array(numMarkets)
					.fill(0)
					.map(() =>
						createMarket(
							factory,
							now + 100,
							now + 200,
							sAUDKey,
							toUnit(1),
							toUnit(1),
							toUnit(1),
							initialCreator
						)
					)
			);

			const createdMarkets = markets.map(m => m.address).sort();
			const recordedMarkets = (await factory.markets(0, 100)).sort();

			assert.bnEqual(await factory.numMarkets(), toBN(numMarkets));
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
				evenMarkets.map(m => factory.destroyMarket(m.address, { from: initialCreator }))
			);
			const oddMarkets = markets
				.filter((e, i) => i % 2 !== 0)
				.map(m => m.address)
				.sort();
			let remainingMarkets = (await factory.markets(0, 100)).sort();
			assert.bnEqual(await factory.numMarkets(), toBN(numMarkets / 2));
			oddMarkets.forEach((p, i) => assert.equal(p, remainingMarkets[i]));

			// Can remove the last market
			const lastMarket = (await factory.markets(numMarkets / 2 - 1, 1))[0];
			assert.isTrue(remainingMarkets.includes(lastMarket));
			await factory.destroyMarket(lastMarket, { from: initialCreator });
			remainingMarkets = await factory.markets(0, 100);
			assert.bnEqual(await factory.numMarkets(), toBN(numMarkets / 2 - 1));
			assert.isFalse(remainingMarkets.includes(lastMarket));

			// Destroy the remaining markets.
			await Promise.all(
				remainingMarkets.map(m => factory.destroyMarket(m, { from: initialCreator }))
			);
			assert.bnEqual(await factory.numMarkets(), toBN(0));
			assert.equal((await factory.markets(0, 100)).length, 0);
		});

		it('Pagination works properly', async () => {
			const numMarkets = 8;
			const now = await currentTime();
			const markets = [];
			const windowSize = 3;
			let ms;

			// Empty list
			for (let i = 0; i < numMarkets; i++) {
				ms = await factory.markets(i, 2);
				assert.equal(ms.length, 0);
			}

			for (let i = 1; i <= numMarkets; i++) {
				markets.push(
					await createMarket(
						factory,
						now + 100,
						now + 200,
						sAUDKey,
						toUnit(i),
						toUnit(1),
						toUnit(1),
						initialCreator
					)
				);
			}

			// Single elements
			for (let i = 0; i < numMarkets; i++) {
				ms = await factory.markets(i, 1);
				assert.equal(ms.length, 1);
				const m = await BinaryOptionMarket.at(ms[0]);
				assert.bnEqual((await m.oracleDetails()).targetPrice, toUnit(i + 1));
			}

			// shifting window
			for (let i = 0; i < numMarkets - windowSize; i++) {
				ms = await factory.markets(i, windowSize);
				assert.equal(ms.length, windowSize);

				for (let j = 0; j < windowSize; j++) {
					const m = await BinaryOptionMarket.at(ms[j]);
					assert.bnEqual((await m.oracleDetails()).targetPrice, toUnit(i + j + 1));
				}
			}

			// entire list
			ms = await factory.markets(0, numMarkets);
			assert.equal(ms.length, numMarkets);
			for (let i = 0; i < numMarkets; i++) {
				const m = await BinaryOptionMarket.at(ms[i]);
				assert.bnEqual((await m.oracleDetails()).targetPrice, toUnit(i + 1));
			}

			// Page extends past end of list
			ms = await factory.markets(numMarkets - windowSize, windowSize * 2);
			assert.equal(ms.length, windowSize);
			for (let i = numMarkets - windowSize; i < numMarkets; i++) {
				const j = i - (numMarkets - windowSize);
				const m = await BinaryOptionMarket.at(ms[j]);
				assert.bnEqual((await m.oracleDetails()).targetPrice, toUnit(i + 1));
			}

			// zero page size
			for (let i = 0; i < numMarkets; i++) {
				ms = await factory.markets(i, 0);
				assert.equal(ms.length, 0);
			}

			// index past the end
			for (let i = 0; i < 3; i++) {
				ms = await factory.markets(numMarkets, i);
				assert.equal(ms.length, 0);
			}

			// Page size larger than entire list
			ms = await factory.markets(0, numMarkets*2);
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
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(2),
				toUnit(3),
				initialCreator
			);

			await onlyGivenAddressCanInvoke({
				fnc: factory.incrementTotalDeposited,
				args: [toUnit(2)],
				accounts,
				reason: 'Permitted only for known markets',
			});
			await onlyGivenAddressCanInvoke({
				fnc: factory.decrementTotalDeposited,
				args: [toUnit(2)],
				accounts,
				reason: 'Permitted only for known markets',
			});
		});

		it('Creating a market affects total deposits properly.', async () => {
			const now = await currentTime();
			await createMarket(
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(2),
				toUnit(3),
				initialCreator
			);
			assert.bnEqual(await factory.totalDeposited(), toUnit(5));
		});

		it('Market destruction affects total debt properly.', async () => {
			let now = await currentTime();
			await createMarket(
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(2),
				toUnit(3),
				initialCreator
			);

			now = await currentTime();
			const newMarket = await createMarket(
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(1),
				toUnit(1),
				initialCreator
			);

			assert.bnEqual(await factory.totalDeposited(), toUnit(7));
			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await newMarket.resolve();
			await factory.destroyMarket(newMarket.address, { from: initialCreator });

			assert.bnEqual(await factory.totalDeposited(), toUnit(5));
		});

		it('Bidding affects total deposits properly.', async () => {
			const now = await currentTime();
			const market = await createMarket(
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(2),
				toUnit(3),
				initialCreator
			);
			const initialDebt = await factory.totalDeposited();

			await sUSDSynth.issue(bidder, sUSDQty);
			await sUSDSynth.approve(market.address, sUSDQty, { from: bidder });

			await market.bid(Side.Long, toUnit(1), { from: bidder });
			assert.bnEqual(await factory.totalDeposited(), initialDebt.add(toUnit(1)));

			await market.bid(Side.Short, toUnit(2), { from: bidder });
			assert.bnEqual(await factory.totalDeposited(), initialDebt.add(toUnit(3)));
		});

		it('Refunds affect total deposits properly.', async () => {
			const now = await currentTime();
			const market = await createMarket(
				factory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(1),
				toUnit(2),
				toUnit(3),
				initialCreator
			);
			const initialDebt = await factory.totalDeposited();

			await sUSDSynth.issue(bidder, sUSDQty);
			await sUSDSynth.approve(market.address, sUSDQty, { from: bidder });

			await market.bid(Side.Long, toUnit(1), { from: bidder });
			await market.bid(Side.Short, toUnit(2), { from: bidder });
			assert.bnEqual(await factory.totalDeposited(), initialDebt.add(toUnit(3)));

			await market.refund(Side.Long, toUnit(0.5), { from: bidder });
			await market.refund(Side.Short, toUnit(1), { from: bidder });
			const refundFeeRetained = mulDecRound(toUnit(1.5), initialRefundFee);
			assert.bnEqual(
				await factory.totalDeposited(),
				initialDebt.add(toUnit(1.5)).add(refundFeeRetained)
			);
		});
	});

	describe('Market migration', () => {
		let markets, newFactory, now;

		before(async () => {
			now = await currentTime();
			markets = [];

			for (const p of [1, 2, 3]) {
				markets.push(
					await createMarket(
						factory,
						now + 100,
						now + 200,
						sAUDKey,
						toUnit(p),
						toUnit(1),
						toUnit(1),
						initialCreator
					)
				);
			}

			newFactory = await setupContract({
				accounts,
				contract: 'BinaryOptionMarketFactory',
				args: [
					factoryOwner,
					addressResolver.address,
					10000,
					10000,
					10000,
					toUnit(10),
					toUnit(0.008),
					toUnit(0.002),
					toUnit(0.02),
				],
			});
			await newFactory.setResolverAndSyncCache(addressResolver.address, { from: factoryOwner });

			await Promise.all(
				markets.map(m => sUSDSynth.approve(m.address, toUnit(1000), { from: bidder }))
			);
			await sUSDSynth.approve(newFactory.address, toUnit(1000), { from: bidder });

			await newFactory.setMigratingFactory(factory.address, { from: factoryOwner });
		});

		it('Migrating factory can be set', async () => {
			await factory.setMigratingFactory(initialCreator, { from: factoryOwner });
		});

		it('Migrating factory can only be set by the factory owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: factory.setMigratingFactory,
				args: [initialCreator],
				accounts,
				address: factoryOwner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Markets can be migrated between factories.', async () => {
			await factory.migrateMarkets(newFactory.address, [markets[1].address], {
				from: factoryOwner,
			});

			const oldMarkets = await factory.markets(0, 100);
			assert.bnEqual(await factory.numMarkets(), toBN(2));
			assert.equal(oldMarkets.length, 2);
			assert.equal(oldMarkets[0], markets[0].address);
			assert.equal(oldMarkets[1], markets[2].address);

			const newMarkets = await newFactory.markets(0, 100);
			assert.bnEqual(await newFactory.numMarkets(), toBN(1));
			assert.equal(newMarkets.length, 1);
			assert.equal(newMarkets[0], markets[1].address);

			assert.equal(await markets[0].owner(), factory.address);
			assert.equal(await markets[2].owner(), factory.address);
			assert.equal(await markets[1].owner(), newFactory.address);
		});

		it('Markets can only be migrated by the owner.', async () => {
			onlyGivenAddressCanInvoke({
				fnc: factory.migrateMarkets,
				args: [newFactory.address, [markets[1].address]],
				accounts,
				address: factoryOwner,
				skipPassCheck: true,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('Markets can only be received from the migrating factory.', async () => {
			onlyGivenAddressCanInvoke({
				fnc: factory.receiveMarkets,
				args: [[markets[1].address]],
				accounts,
				address: factory.address,
				skipPassCheck: true,
				reason: 'Only permitted for migrating factory.',
			});
		});

		it('Markets cannot be migrated between factories if the migrating factory unset', async () => {
			await newFactory.setMigratingFactory('0x' + '0'.repeat(40), { from: factoryOwner });
			await assert.revert(
				factory.migrateMarkets(newFactory.address, [markets[1].address], { from: factoryOwner }),
				'Only permitted for migrating factory.'
			);
		});

		it('An empty migration does nothing, as does migration from an empty factory', async () => {
			const newerFactory = await setupContract({
				accounts,
				contract: 'BinaryOptionMarketFactory',
				args: [
					factoryOwner,
					addressResolver.address,
					10000,
					10000,
					10000,
					toUnit(10),
					toUnit(0.008),
					toUnit(0.002),
					toUnit(0.02),
				],
			});
			await factory.migrateMarkets(newFactory.address, [], { from: factoryOwner });
			assert.equal(await newFactory.numMarkets(), 0);

			await newerFactory.setMigratingFactory(newFactory.address, { from: factoryOwner });
			await newFactory.migrateMarkets(newerFactory.address, [], { from: factoryOwner });
			assert.equal(await newerFactory.numMarkets(), 0);
		});

		it('Markets can be migrated to a factories with existing markets.', async () => {
			await factory.migrateMarkets(newFactory.address, [markets[1].address], {
				from: factoryOwner,
			});
			await factory.migrateMarkets(newFactory.address, [markets[0].address], {
				from: factoryOwner,
			});

			const oldMarkets = await factory.markets(0, 100);
			assert.bnEqual(await factory.numMarkets(), toBN(1));
			assert.equal(oldMarkets.length, 1);
			assert.equal(oldMarkets[0], markets[2].address);

			const newMarkets = await newFactory.markets(0, 100);
			assert.bnEqual(await newFactory.numMarkets(), toBN(2));
			assert.equal(newMarkets.length, 2);
			assert.equal(newMarkets[0], markets[1].address);
			assert.equal(newMarkets[1], markets[0].address);
		});

		it('All markets can be migrated from a factory.', async () => {
			await factory.migrateMarkets(newFactory.address, markets.map(m => m.address).reverse(), {
				from: factoryOwner,
			});

			const oldMarkets = await factory.markets(0, 100);
			assert.bnEqual(await factory.numMarkets(), toBN(0));
			assert.equal(oldMarkets.length, 0);

			const newMarkets = await newFactory.markets(0, 100);
			assert.bnEqual(await newFactory.numMarkets(), toBN(3));
			assert.equal(newMarkets.length, 3);
			assert.equal(newMarkets[0], markets[2].address);
			assert.equal(newMarkets[1], markets[1].address);
			assert.equal(newMarkets[2], markets[0].address);
		});

		it('Migrating markets updates total deposits properly.', async () => {
			await factory.migrateMarkets(newFactory.address, [markets[2].address, markets[1].address], {
				from: factoryOwner,
			});
			assert.bnEqual(await factory.totalDeposited(), toUnit(2));
			assert.bnEqual(await newFactory.totalDeposited(), toUnit(4));
		});

		it('Migrated markets still operate properly.', async () => {
			await factory.migrateMarkets(newFactory.address, [markets[2].address, markets[1].address], {
				from: factoryOwner,
			});

			await markets[0].bid(Side.Short, toUnit(1), { from: bidder });
			await markets[1].bid(Side.Long, toUnit(3), { from: bidder });
			assert.bnEqual(await factory.totalDeposited(), toUnit(3));
			assert.bnEqual(await newFactory.totalDeposited(), toUnit(7));

			now = await currentTime();
			await createMarket(
				newFactory,
				now + 100,
				now + 200,
				sAUDKey,
				toUnit(10),
				toUnit(10),
				toUnit(10),
				bidder
			);
			assert.bnEqual(await newFactory.totalDeposited(), toUnit(27));
			assert.bnEqual(await newFactory.numMarkets(), toBN(3));

			await fastForward(exerciseDuration + 1000);
			await exchangeRates.updateRates([sAUDKey], [toUnit(5)], await currentTime(), {
				from: oracle,
			});
			await markets[2].resolve();
			await newFactory.destroyMarket(markets[2].address, { from: initialCreator });
			assert.bnEqual(await newFactory.numMarkets(), toBN(2));
			assert.bnEqual(await newFactory.totalDeposited(), toUnit(25));
		});

		it('Market migration works while paused/suspended.', async () => {
			await setStatus({
				owner: accounts[1],
				systemStatus,
				section: 'System',
				suspend: true,
			});
			await factory.setPaused(true, { from: factoryOwner });
			await newFactory.setPaused(true, { from: factoryOwner });
			assert.isTrue(await factory.paused());
			assert.isTrue(await newFactory.paused());

			await factory.migrateMarkets(newFactory.address, [markets[0].address], {
				from: factoryOwner,
			});

			assert.bnEqual(await factory.numMarkets(), toBN(2));
			assert.bnEqual(await newFactory.numMarkets(), toBN(1));
		});

		it('Market migration fails if any unknown markets are included', async () => {
			await assert.revert(
				factory.migrateMarkets(newFactory.address, [markets[1].address, factoryOwner], {
					from: factoryOwner,
				}),
				'Market unknown.'
			);
		});

		it('Market migration events are properly emitted.', async () => {
			const tx = await factory.migrateMarkets(
				newFactory.address,
				[markets[0].address, markets[1].address],
				{
					from: factoryOwner,
				}
			);

			assert.equal(tx.logs[2].event, 'MarketsMigrated');
			assert.equal(tx.logs[2].args.receivingFactory, newFactory.address);
			assert.equal(tx.logs[2].args.markets[0], markets[0].address);
			assert.equal(tx.logs[2].args.markets[1], markets[1].address);
			assert.equal(tx.logs[5].event, 'MarketsReceived');
			assert.equal(tx.logs[5].args.migratingFactory, factory.address);
			assert.equal(tx.logs[5].args.markets[0], markets[0].address);
			assert.equal(tx.logs[5].args.markets[1], markets[1].address);
		});
	});
});
