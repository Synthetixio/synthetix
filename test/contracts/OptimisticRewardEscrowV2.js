'use strict';

const { contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts } = require('./setup');

// const { toUnit } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

// const {
// 	constants: { ZERO_ADDRESS },
// } = require('../..');

contract('OptimisticRewardEscrowV2', async accounts => {
	const [, owner, account1] = accounts;
	let optimisticRewardEscrowV2;

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		({ OptimisticRewardEscrowV2: optimisticRewardEscrowV2 } = await setupAllContracts({
			accounts,
			contracts: ['OptimisticRewardEscrowV2'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: optimisticRewardEscrowV2.abi,
			ignoreParents: ['BaseRewardEscrowV2'],
			expected: [],
		});
	});

	describe('Constructor & Settings ', async () => {
		it('should set owner on contructor', async () => {
			const ownerAddress = await optimisticRewardEscrowV2.owner();
			assert.equal(ownerAddress, owner);
		});
	});

	describe('There are no escrow entries initially', async () => {
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await optimisticRewardEscrowV2.numVestingEntries(account1));
		});
	});
});
