'use strict';

const { contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { mockToken, setupAllContracts } = require('./setup');

// const { toUnit } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

// const {
// 	constants: { ZERO_ADDRESS },
// } = require('../..');

contract('BaseRewardEscrowV2', async accounts => {
	const [, owner, feePoolAccount, account1] = accounts;
	let baseRewardEscrowV2, synthetix, feePool;

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		// Mock SNX
		({ token: synthetix } = await mockToken({ accounts, name: 'Synthetix', symbol: 'SNX' }));

		feePool = { address: feePoolAccount }; // mock contract with address

		({ BaseRewardEscrowV2: baseRewardEscrowV2 } = await setupAllContracts({
			accounts,
			contracts: ['BaseRewardEscrowV2'],
			mocks: {
				Synthetix: synthetix,
				FeePool: feePool,
			},
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
				'setMaxEscrowDuration',
				'nominateAccountToMerge',
				'mergeAccount',
				'migrateVestingSchedule',
				'migrateAccountEscrowBalances',
				'burnForMigration',
				'importVestingEntries',
				'createEscrowEntry',
				'vest',
			],
		});
	});

	describe('Constructor & Settings ', async () => {
		it('should set owner on contructor', async () => {
			const ownerAddress = await baseRewardEscrowV2.owner();
			assert.equal(ownerAddress, owner);
		});
		it('should set nextEntryId to 1', async () => {
			const nextEntryId = await baseRewardEscrowV2.nextEntryId();
			assert.equal(nextEntryId, 1);
		});
	});

	describe('There are no escrow entries initially', async () => {
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await baseRewardEscrowV2.numVestingEntries(account1));
		});
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await baseRewardEscrowV2.numVestingEntries(account1));
		});
		it('then totalEscrowedAccountBalance should return 0', async () => {
			assert.equal(0, await baseRewardEscrowV2.totalEscrowedAccountBalance(account1));
		});
		it('then totalVestedAccountBalance should return 0', async () => {
			assert.equal(0, await baseRewardEscrowV2.totalVestedAccountBalance(account1));
		});
	});
	describe('When a vesting entry is appended for account 1', async () => {
		beforeEach(async () => {});
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await baseRewardEscrowV2.numVestingEntries(account1));
		});
	});
	describe('Creating a new escrow entry', async () => {
		beforeEach(async () => {
			// approve rewardEscrow to spend SNX
		});
	});
});
