'use strict';

const { contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { mockToken, setupAllContracts } = require('./setup');

// const { toUnit } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

// const {
// 	constants: { ZERO_ADDRESS },
// } = require('../..');

contract('RewardEscrowV2', async accounts => {
	const [, owner, feePoolAccount, account1] = accounts;
	let rewardEscrowV2, synthetix, feePool, rewardEscrow;

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		// Mock SNX
		({ token: synthetix } = await mockToken({ accounts, name: 'Synthetix', symbol: 'SNX' }));

		feePool = { address: feePoolAccount }; // mock contract with address

		({ RewardEscrowV2: rewardEscrowV2 } = await setupAllContracts({
			accounts,
			contracts: ['RewardEscrowV2'],
			mocks: {
				Synthetix: synthetix,
				FeePool: feePool,
				RewardEscrow: rewardEscrow,
			},
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: rewardEscrowV2.abi,
			ignoreParents: ['BaseRewardEscrowV2'],
			expected: ['importVestingSchedule'],
		});
	});

	describe('Constructor & Settings ', async () => {
		it('should set owner on contructor', async () => {
			const ownerAddress = await rewardEscrowV2.owner();
			assert.equal(ownerAddress, owner);
		});
	});

	describe('There are no escrow entries initially', async () => {
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await rewardEscrowV2.numVestingEntries(account1));
		});
	});

	describe('When the system is inactive', () => {
		beforeEach(async () => {});
	});

	describe('When account is pending escrow migration to new contract', async () => {
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await rewardEscrowV2.numVestingEntries(account1));
		});
	});

	describe('migrateAccountEscrowBalances', () => {
		beforeEach(async () => {});
	});

	describe('importVestingSchedule', () => {
		beforeEach(async () => {});
	});

	describe('migrateVestingSchedule', () => {
		beforeEach(async () => {});
	});
});
