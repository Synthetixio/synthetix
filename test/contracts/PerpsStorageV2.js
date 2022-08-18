'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { toUnit, currentTime } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	getDecodedLogs,
	decodedEventEqual,
} = require('./helpers');
const { toBytes32 } = require('../../index');

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('PerpsStorageV2', async accounts => {
	const [, owner, writeAccount, user1] = accounts;
	let instance;

	const marketKey = toBytes32('pBTC');
	const baseAsset = toBytes32('BTC');
	const emptyBytes32 = toBytes32('');

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		// create new instance, controlled by writeAccount
		instance = await artifacts.require('PerpsStorageV2').new(owner, writeAccount);
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: instance.abi,
			ignoreParents: ['Owned', 'State'],
			expected: [
				'initMarket',
				'positionWithInit',
				'updateFunding',
				'storePosition',
				'storeMarketAggregates',
			],
		});
	});

	it('contract has CONTRACT_NAME getter', async () => {
		assert.equal(await instance.CONTRACT_NAME(), toBytes32('PerpsStorageV2'));
	});

	describe('after construction should have expected view values', async () => {
		it('market and addresses views', async () => {
			assert.deepEqual(await instance.marketScalars(marketKey), [emptyBytes32, 0, 0, 0, 0]);
			assert.deepEqual(await instance.lastFundingEntry(marketKey), [0, 0]);
			assert.equal(await instance.positionIdToAccount(marketKey, 0), ZERO_ADDRESS);
		});

		it('positions view returns correct marketKey even without init', async () => {
			const expected = [marketKey, 0, [0, 0], 0, 0, 0, 0];
			assert.deepEqual(await instance.positions(marketKey, user1), expected);
		});
	});

	describe('mutative methods access', async () => {
		it('onlyAssociatedContract: all revert for anyone that is not storage owner', async () => {
			const revertMsg = 'associated contract';
			await assert.revert(instance.initMarket(marketKey, baseAsset, { from: owner }), revertMsg);
			await assert.revert(instance.positionWithInit(marketKey, user1, { from: owner }), revertMsg);
			await assert.revert(instance.updateFunding(marketKey, 0, { from: owner }), revertMsg);
			await assert.revert(
				instance.storePosition(marketKey, user1, 0, 0, 0, 0, { from: owner }),
				revertMsg
			);
			await assert.revert(
				instance.storeMarketAggregates(marketKey, 0, 0, 0, { from: owner }),
				revertMsg
			);
		});

		it('all write methods fail for storage owner if market is not initialized', async () => {
			const revertMsg = 'Market not initialised';
			await assert.revert(
				instance.positionWithInit(marketKey, user1, { from: writeAccount }),
				revertMsg
			);
			await assert.revert(instance.updateFunding(marketKey, 0, { from: writeAccount }), revertMsg);
			await assert.revert(
				instance.storePosition(marketKey, user1, 0, 0, 0, 0, { from: writeAccount }),
				revertMsg
			);
			await assert.revert(
				instance.storeMarketAggregates(marketKey, 0, 0, 0, { from: writeAccount }),
				revertMsg
			);
		});

		it('all succeed for storage owner when market initialized', async () => {
			// the first initMarket is what enables the rest
			await instance.initMarket(marketKey, baseAsset, { from: writeAccount });
			await instance.updateFunding(marketKey, 0, { from: writeAccount });
			await instance.storeMarketAggregates(marketKey, 0, 0, 0, { from: writeAccount });
			// this positionWithInit is what enables storePosition (negative is tested below)
			await instance.positionWithInit(marketKey, user1, { from: writeAccount });
			await instance.storePosition(marketKey, user1, 0, 0, 0, 0, { from: writeAccount });
		});
	});

	describe('initMarket', async () => {
		let timestamp;
		let tx;
		beforeEach(async () => {
			tx = await instance.initMarket(marketKey, baseAsset, { from: writeAccount });
			timestamp = await currentTime();
		});

		it('reverts for bad input', async () => {
			await assert.revert(
				instance.initMarket(emptyBytes32, baseAsset, { from: writeAccount }),
				'Market key cannot be empty'
			);
			await assert.revert(
				instance.initMarket(marketKey, emptyBytes32, { from: writeAccount }),
				'Asset key cannot be empty'
			);
			await assert.revert(
				instance.initMarket(marketKey, baseAsset, { from: writeAccount }),
				'Already initialized'
			);
		});

		it('MarketInitialised and FundingUpdated events emitted', async () => {
			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [instance] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'MarketInitialised',
				emittedFrom: instance.address,
				args: [marketKey, baseAsset],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'FundingUpdated',
				emittedFrom: instance.address,
				args: [marketKey, 0, await currentTime()],
				log: decodedLogs[1],
			});
		});

		it('marketScalars: baseAsset is set', async () => {
			assert.deepEqual(await instance.marketScalars(marketKey), [baseAsset, 0, 0, 0, 0]);
		});

		it('lastFundingEntry: a 0 funding entry was pushed', async () => {
			assert.deepEqual(await instance.lastFundingEntry(marketKey), [0, timestamp]);
		});
	});

	describe('with initialized market', () => {
		let tx, timestamp;

		beforeEach(async () => {
			// init market
			await instance.initMarket(marketKey, baseAsset, { from: writeAccount });
			timestamp = await currentTime();
		});

		describe('positionWithInit', async () => {
			const expectedId = 1;
			beforeEach(async () => {
				tx = await instance.positionWithInit(marketKey, user1, { from: writeAccount });
			});

			it('views and events are correct for new position', async () => {
				// positions view returns id and last funding entry
				const expected = [marketKey, expectedId, [0, timestamp], 0, 0, 0, 0];
				assert.deepEqual(await instance.positions(marketKey, user1), expected);

				// events are emitted
				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [instance] });
				assert.equal(decodedLogs.length, 1);
				decodedEventEqual({
					event: 'PositionInitialised',
					emittedFrom: instance.address,
					args: [marketKey, expectedId, user1],
					log: decodedLogs[0],
				});

				// lastPositionId is incremented
				assert.deepEqual(await instance.marketScalars(marketKey), [baseAsset, 0, 0, 0, expectedId]);

				// positionIdToAccount returns correct account
				assert.equal(await instance.positionIdToAccount(marketKey, expectedId), user1);
			});

			it('second init is idempotent and no event is emitted', async () => {
				tx = await instance.positionWithInit(marketKey, user1, { from: writeAccount });

				// positions view unchanged
				const expected = [marketKey, expectedId, [0, timestamp], 0, 0, 0, 0];
				assert.deepEqual(await instance.positions(marketKey, user1), expected);

				// no event is emitted
				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [instance] });
				assert.equal(decodedLogs.length, 0);

				// lastPositionId unchanged
				assert.deepEqual(await instance.marketScalars(marketKey), [baseAsset, 0, 0, 0, expectedId]);

				// positionIdToAccount unchanged
				assert.equal(await instance.positionIdToAccount(marketKey, expectedId), user1);
			});

			it('position is returned as return argument', async () => {
				const position = await instance.positionWithInit.call(marketKey, user1, {
					from: writeAccount,
				});
				const expected = await instance.positions(marketKey, user1);
				assert.deepEqual(position, expected);
			});
		});

		describe('updateFunding', async () => {
			const funding = toUnit(1);
			beforeEach(async () => {
				tx = await instance.updateFunding(marketKey, funding, { from: writeAccount });
			});

			it('views and events are correct', async () => {
				const timestamp = await currentTime();

				// lastFundingEntry view
				assert.deepEqual(await instance.lastFundingEntry(marketKey), [funding, timestamp]);

				// event is emitted
				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [instance] });
				assert.equal(decodedLogs.length, 1);
				decodedEventEqual({
					event: 'FundingUpdated',
					emittedFrom: instance.address,
					args: [marketKey, funding, timestamp],
					log: decodedLogs[0],
				});
			});
		});

		describe('storePosition', async () => {
			const expectedId = 1;
			const margin = toUnit('100');
			const lockedMargin = toUnit('10');
			const lastPrice = toUnit('2');
			const size = toUnit('1');

			it('non existent position reverts', async () => {
				// store some data
				await assert.revert(
					instance.storePosition(marketKey, user1, margin, lockedMargin, size, lastPrice, {
						from: writeAccount,
					}),
					'Position not initialized'
				);
			});

			describe('already initialized position', async () => {
				beforeEach(async () => {
					// init position
					await instance.positionWithInit(marketKey, user1, { from: writeAccount });
					// store some data
					await instance.storePosition(marketKey, user1, margin, lockedMargin, size, lastPrice, {
						from: writeAccount,
					});
				});

				it('views are correct for position', async () => {
					const expectedPosition = {
						marketKey,
						id: expectedId,
						lastFundingEntry: [0, timestamp],
						margin,
						lockedMargin,
						size,
						lastPrice,
					};

					assert.deepEqual(await instance.positions(marketKey, user1), expectedPosition);

					// lastPositionId is as expected
					assert.equal((await instance.marketScalars(marketKey)).lastPositionId, expectedId);

					// positionIdToAccount as expected
					assert.equal(await instance.positionIdToAccount(marketKey, expectedId), user1);

					// position is returned as return argument
					const position = await instance.storePosition.call(
						marketKey,
						user1,
						margin,
						lockedMargin,
						size,
						lastPrice,
						{
							from: writeAccount,
						}
					);
					assert.deepEqual(position, await instance.positions(marketKey, user1));
				});
			});
		});

		describe('storeMarketAggregates', async () => {
			const lastPositionId = 0;
			const marketSize = toUnit('100');
			const marketSkew = toUnit('10');
			const entryDebtCorrection = toUnit('1');

			it('marketScalars view is correct', async () => {
				// store
				await instance.storeMarketAggregates(
					marketKey,
					marketSize,
					marketSkew,
					entryDebtCorrection,
					{
						from: writeAccount,
					}
				);
				// check view
				assert.deepEqual(await instance.marketScalars(marketKey), {
					baseAsset,
					marketSize,
					marketSkew,
					entryDebtCorrection,
					lastPositionId,
				});
			});
		});
	});
});
