'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { toUnit, currentTime, fastForward } = require('../utils')();
const { toBytes32 } = require('../..');
const { setupAllContracts } = require('./setup');
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
			assert.bnEqual(await factory.minimumInitialLiquidity(), minimumInitialLiquidity);
			assert.bnEqual(await factory.exerciseDuration(), exerciseDuration);
			assert.bnEqual(await factory.oracleMaturityWindow(), maturityWindow);
			assert.bnEqual(await factory.poolFee(), initialPoolFee);
			assert.bnEqual(await factory.creatorFee(), initialCreatorFee);
			assert.bnEqual(await factory.refundFee(), initialRefundFee);
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
			assert.bnEqual(await factory.poolFee(), newFee);
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
			assert.bnEqual(await factory.creatorFee(), newFee);
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
			assert.bnEqual(await factory.refundFee(), newFee);
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
			assert.bnEqual(await factory.oracleMaturityWindow(), toBN(100));
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
			assert.bnEqual(await factory.exerciseDuration(), toBN(100));
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
			assert.bnEqual(await factory.creatorDestructionDuration(), toBN(100));
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
			assert.equal(log.event, 'BinaryOptionMarketCreated');
			assert.equal(log.args.creator, initialCreator);
			assert.equal(log.args.oracleKey, sAUDKey);
			assert.bnEqual(log.args.targetPrice, toUnit(1));
			assert.bnEqual(log.args.endOfBidding, toBN(now + 100));
			assert.bnEqual(log.args.maturity, toBN(now + 200));

			const market = await BinaryOptionMarket.at(log.args.market);

			assert.bnEqual(await market.endOfBidding(), toBN(now + 100));
			assert.bnEqual(await market.maturity(), toBN(now + 200));
			assert.bnEqual(await market.destruction(), toBN(now + 200).add(exerciseDuration));
			assert.bnEqual(
				await factory.publiclyDestructibleTime(market.address),
				toBN(now + 200)
					.add(exerciseDuration)
					.add(creatorDestructionDuration)
			);
			assert.bnEqual(await market.targetOraclePrice(), toUnit(1));
			assert.bnEqual(await market.oracleMaturityWindow(), maturityWindow);
			assert.equal(await market.creator(), initialCreator);
			assert.equal(await market.owner(), factory.address);
			assert.equal(await market.resolver(), addressResolver.address);
			assert.equal(await market.oracleKey(), sAUDKey);

			const bids = await market.totalBids();
			assert.bnEqual(bids[0], toUnit(2));
			assert.bnEqual(bids[1], toUnit(3));
			assert.bnEqual(await market.deposited(), toUnit(5));
			assert.bnEqual(await factory.totalDeposited(), toUnit(5));

			assert.bnEqual(await market.poolFee(), initialPoolFee);
			assert.bnEqual(await market.creatorFee(), initialCreatorFee);
			assert.bnEqual(await market.refundFee(), initialRefundFee);

			assert.bnEqual(await factory.numMarkets(), toBN(1));
			assert.equal((await factory.marketArray())[0], market.address);
			assert.equal(await factory.markets(0), market.address);
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

			assert.equal(tx.logs[0].event, 'BinaryOptionMarketDestroyed');
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
			await markets[0].bidLong(toUnit(2), { from: bidder });
			assert.bnEqual(await factory.totalDeposited(), toUnit(8));
			await markets[1].bidShort(toUnit(2), { from: bidder });
			assert.bnEqual(await factory.totalDeposited(), toUnit(10));
			await markets[2].bidShort(toUnit(2), { from: bidder });
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
			assert.equal((await factory.marketArray()).length, 0);
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
			const recordedMarkets = (await factory.marketArray()).sort();

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
			let remainingMarkets = (await factory.marketArray()).sort();
			assert.bnEqual(await factory.numMarkets(), toBN(numMarkets / 2));
			oddMarkets.forEach((p, i) => assert.equal(p, remainingMarkets[i]));

			// Can remove the last market
			const lastMarket = await factory.markets(numMarkets / 2 - 1);
			assert.isTrue(remainingMarkets.includes(lastMarket));
			await factory.destroyMarket(lastMarket, { from: initialCreator });
			remainingMarkets = await factory.marketArray();
			assert.bnEqual(await factory.numMarkets(), toBN(numMarkets / 2 - 1));
			assert.isFalse(remainingMarkets.includes(lastMarket));

			// Destroy the remaining markets.
			await Promise.all(
				remainingMarkets.map(m => factory.destroyMarket(m, { from: initialCreator }))
			);
			assert.bnEqual(await factory.numMarkets(), toBN(0));
			assert.equal((await factory.marketArray()).length, 0);
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

			await market.bidLong(toUnit(1), { from: bidder });
			assert.bnEqual(await factory.totalDeposited(), initialDebt.add(toUnit(1)));

			await market.bidShort(toUnit(2), { from: bidder });
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

			await market.bidLong(toUnit(1), { from: bidder });
			await market.bidShort(toUnit(2), { from: bidder });
			assert.bnEqual(await factory.totalDeposited(), initialDebt.add(toUnit(3)));

			await market.refundLong(toUnit(0.5), { from: bidder });
			await market.refundShort(toUnit(1), { from: bidder });
			const refundFeeRetained = mulDecRound(toUnit(1.5), initialRefundFee);
			assert.bnEqual(
				await factory.totalDeposited(),
				initialDebt.add(toUnit(1.5)).add(refundFeeRetained)
			);
		});
	});
});
