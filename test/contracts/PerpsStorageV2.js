'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

// const { setupAllContracts } = require('./setup');

// const { toUnit, toBN } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { toBytes32 } = require('../../index');

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('PerpsStorageV2', async accounts => {
	const [, owner, writeAccount, user1] = accounts;
	// let instance, resolver;
	let instance;

	const marketKey = toBytes32('pBTC');
	const baseAsset = toBytes32('BTC');
	const emptyBytes32 = toBytes32('');

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		// ({ AddressResolver: resolver } = await setupAllContracts({
		// 	accounts,
		// 	contracts: ['AddressResolver'],
		// }));

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

		it('requireInit: all fail for storage owner if market is not initialized', async () => {
			const revertMsg = 'market not initialised';
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
			// this initMarket is what enables the rest
			await instance.initMarket(marketKey, baseAsset, { from: writeAccount });
			await instance.positionWithInit(marketKey, user1, { from: writeAccount });
			await instance.updateFunding(marketKey, 0, { from: writeAccount });
			await instance.storePosition(marketKey, user1, 0, 0, 0, 0, { from: writeAccount });
			await instance.storeMarketAggregates(marketKey, 0, 0, 0, { from: writeAccount });
		});
	});

	describe('with initialized market ', async () => {
		beforeEach(async () => {
			await instance.initMarket(marketKey, baseAsset, { from: writeAccount });
		});

		it('', async () => {});
	});
});
