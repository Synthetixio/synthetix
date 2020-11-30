'use strict';

const { contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts } = require('./setup');

// const { toUnit } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

// const {
// 	constants: { ZERO_ADDRESS },
// } = require('../..');

contract('BaseRewardEscrowV2', async accounts => {
	const [, owner, account1] = accounts;
	let baseRewardEscrowV2;

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		({ BaseRewardEscrowV2: baseRewardEscrowV2 } = await setupAllContracts({
			accounts,
			contracts: ['BaseRewardEscrowV2'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: baseRewardEscrowV2.abi,
			ignoreParents: ['MixinResolver'],
			expected: [
				'appendVestingEntry',
				'startMergingWindow',
				'setAccountMergingDuration',
				'nominateAccountToMerge',
				'mergeAccount',
				'migrateVestingSchedule',
				'migrateAccountEscrowBalances',
				'burnForMigration',
				'importVestingEntries',
			],
		});
	});

	describe('Constructor & Settings ', async () => {
		it('should set owner on contructor', async () => {
			const ownerAddress = await baseRewardEscrowV2.owner();
			assert.equal(ownerAddress, owner);
		});
	});

	describe('There are no escrow entries initially', async () => {
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await baseRewardEscrowV2.numVestingEntries(account1));
		});
	});
});
