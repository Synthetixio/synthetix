'use strict';

const { contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { mockToken, setupAllContracts } = require('./setup');

// const { toUnit } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toUnit } = require('../utils')();

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('BaseRewardEscrowV2', async accounts => {
	const SECOND = 1000;
	const DAY = 86400;
	const WEEK = 604800;
	const YEAR = 31556926;

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
	describe('Creating vesting Schedule', async () => {
		describe('When appending vesting entry via feePool', async () => {
			let duration = YEAR;
			it('should revert appending a vesting entry from account1', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(baseRewardEscrowV2.address, toUnit('1'), {
					from: owner,
				});

				await assert.revert(
					baseRewardEscrowV2.appendVestingEntry(account1, toUnit('1'), duration, {
						from: account1,
					}),
					'Only the FeePool can perform this action'
				);
			});
			it('should revert appending a vesting entry with a zero amount', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(baseRewardEscrowV2.address, toUnit('1'), {
					from: owner,
				});

				await assert.revert(
					baseRewardEscrowV2.appendVestingEntry(account1, toUnit('0'), duration, {
						from: feePoolAccount,
					}),
					'Quantity cannot be zero'
				);
			});
			it('should revert appending a vesting entry if there is not enough SNX in the contracts balance', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(baseRewardEscrowV2.address, toUnit('1'), {
					from: owner,
				});
				await assert.revert(
					baseRewardEscrowV2.appendVestingEntry(account1, toUnit('10'), duration, {
						from: feePoolAccount,
					}),
					'Must be enough balance in the contract to provide for the vesting entry'
				);
			});
			it('should revert appending a vesting entry if the duration is 0', async () => {
				duration = 0;

				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(baseRewardEscrowV2.address, toUnit('10'), {
					from: owner,
				});
				await assert.revert(
					baseRewardEscrowV2.appendVestingEntry(account1, toUnit('10'), duration, {
						from: feePoolAccount,
					}),
					'Cannot escrow with 0 duration OR above MAX_DURATION'
				);
			});
			it('should revert appending a vesting entry if the duration is > MAX_DURATION', async () => {
				duration = (await baseRewardEscrowV2.MAX_DURATION()).add(toUnit(1));

				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(baseRewardEscrowV2.address, toUnit('10'), {
					from: owner,
				});
				await assert.revert(
					baseRewardEscrowV2.appendVestingEntry(account1, toUnit('10'), duration, {
						from: feePoolAccount,
					}),
					'Cannot escrow with 0 duration OR above MAX_DURATION'
				);
			});
		});
	});
	describe('Creating a new escrow entry by approval', async () => {
		beforeEach(async () => {
			// approve rewardEscrow to spend SNX
		});
	});
});
