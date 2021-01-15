'use strict';

const { contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts } = require('./setup');

// const { toUnit } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

// const {
// 	constants: { ZERO_ADDRESS },
// } = require('../..');

contract('ImportableRewardEscrowV2', async accounts => {
	const [, owner, account1] = accounts;
	let importableRewardEscrowV2;

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		({ ImportableRewardEscrowV2: importableRewardEscrowV2 } = await setupAllContracts({
			accounts,
			contracts: ['ImportableRewardEscrowV2'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: importableRewardEscrowV2.abi,
			ignoreParents: ['BaseRewardEscrowV2'],
			expected: [],
		});
	});

	describe('Constructor & Settings ', async () => {
		it('should set owner on contructor', async () => {
			const ownerAddress = await importableRewardEscrowV2.owner();
			assert.equal(ownerAddress, owner);
		});
	});

	describe('There are no escrow entries initially', async () => {
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await importableRewardEscrowV2.numVestingEntries(account1));
		});
	});
});
