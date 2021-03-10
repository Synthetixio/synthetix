'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { mockToken, setupAllContracts, setupContract } = require('./setup');

const { toUnit, currentTime, fastForward } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toBytes32 } = require('../..');

const BN = require('bn.js');

contract('RewardEscrowV2 @ovm-skip', async accounts => {
	const WEEK = 60 * 60 * 24 * 7; // week in seconds
	const [, owner, feePoolAccount, account1] = accounts;
	let rewardEscrowV2, synthetix, feePool, rewardEscrow, resolver;

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		// Mock SNX
		({ token: synthetix } = await mockToken({ accounts, name: 'Synthetix', symbol: 'SNX' }));

		feePool = { address: feePoolAccount }; // mock contract with address

		({ RewardEscrowV2: rewardEscrowV2, AddressResolver: resolver } = await setupAllContracts({
			accounts,
			contracts: ['RewardEscrowV2'],
			mocks: {
				Synthetix: synthetix,
				FeePool: feePool,
			},
		}));

		rewardEscrow = await setupContract({
			accounts,
			contract: 'RewardEscrow',
			mock: {
				FeePool: feePool,
				Synthetix: synthetix,
			},
		});

		await rewardEscrow.setFeePool(feePool.address, { from: owner });
		await rewardEscrow.setSynthetix(synthetix.address, { from: owner });

		await resolver.importAddresses([toBytes32('RewardEscrow')], [rewardEscrow.address], {
			from: owner,
		});

		await rewardEscrowV2.rebuildCache({ from: owner });
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: rewardEscrowV2.abi,
			ignoreParents: ['BaseRewardEscrowV2'],
			expected: ['importVestingSchedule', 'setMigrateEntriesThresholdAmount'],
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

	describe('importVestingSchedule', () => {
		it('should revert after setup period over', async () => {
			const setupPeriod = 8 * WEEK;
			await fastForward(setupPeriod + 100);

			await assert.revert(
				rewardEscrowV2.importVestingSchedule([account1], [toUnit('10')], {
					from: owner,
				}),
				'Can only perform this action during setup'
			);
		});
		it('should revert if migrateAccountEscrowBalances isnt called first', async () => {
			await assert.revert(
				rewardEscrowV2.importVestingSchedule([account1], [toUnit('10')], {
					from: owner,
				}),
				'Address escrow balance is 0'
			);
		});
		describe('importing escrowBalances and vestedBalances for accounts', () => {
			beforeEach(async () => {});
		});
	});

	describe('migrateAccountEscrowBalances', () => {
		it('should revert after setup period over', async () => {
			const setupPeriod = 8 * WEEK;
			await fastForward(setupPeriod + 100);

			await assert.revert(
				rewardEscrowV2.migrateAccountEscrowBalances([account1], [toUnit('10')], [0], {
					from: owner,
				}),
				'Can only perform this action during setup'
			);
		});
		it('should revert trying to re-import for same account', async () => {
			await rewardEscrowV2.migrateAccountEscrowBalances([account1], [toUnit('10')], [0], {
				from: owner,
			});

			// second time should revert
			await assert.revert(
				rewardEscrowV2.migrateAccountEscrowBalances([account1], [toUnit('10')], [0], {
					from: owner,
				}),
				'Account migration is pending already'
			);
		});
	});

	describe('migrateVestingSchedule', () => {
		describe('when totalBalancePendingMigration is 1000 SNX or less', () => {
			it('should migrate the pending migration balance of 800 as vestable entry', async () => {
				const escrowAmount = toUnit('800');

				// migrateAccountEscrowBalance to RewardEscrowV2 for 800 SNX
				await rewardEscrowV2.migrateAccountEscrowBalances([account1], [escrowAmount], [0], {
					from: owner,
				});

				// call migrateVestingSchedule
				await rewardEscrowV2.migrateVestingSchedule(account1, { from: owner });

				// totalBalancePending is 0
				assert.bnEqual(await rewardEscrowV2.totalBalancePendingMigration(account1), 0);

				// check account 1 has 1 vesting entry created
				assert.bnEqual(await rewardEscrowV2.numVestingEntries(account1), new BN(1));

				const vestingEntry = await rewardEscrowV2.getVestingEntry(account1, 1);

				const now = currentTime();

				assert.bnEqual(vestingEntry.escrowAmount, escrowAmount);

				// entry end time should be before now (can be vested)
				assert.isTrue(now >= vestingEntry.endTime);
			});
			it('should migrate the pending migration balance of 1000', async () => {
				const escrowAmount = toUnit('1000');

				// migrateAccountEscrowBalance to RewardEscrowV2 for 1000 SNX
				await rewardEscrowV2.migrateAccountEscrowBalances([account1], [escrowAmount], [0], {
					from: owner,
				});

				// call migrateVestingSchedule
				await rewardEscrowV2.migrateVestingSchedule(account1, { from: owner });

				// totalBalancePending is 0
				assert.bnEqual(await rewardEscrowV2.totalBalancePendingMigration(account1), 0);

				// check account 1 has 1 vesting entry created
				assert.bnEqual(await rewardEscrowV2.numVestingEntries(account1), new BN(1));

				const vestingEntry = await rewardEscrowV2.getVestingEntry(account1, 1);

				assert.bnEqual(vestingEntry.escrowAmount, escrowAmount);

				const now = await currentTime();

				// entry end time should be before now (can be vested)
				assert.isTrue(now >= vestingEntry.endTime);
			});
		});
		describe('when migrating pending vesting entries and entries that can be vested already', () => {
			const quantity = toUnit('10');

			beforeEach(async () => {
				// setup vesting entries on old RewardEscrow
				await synthetix.transfer(rewardEscrow.address, toUnit('2000'), { from: owner });

				// migrateAccountEscrowBalance to RewardEscrowV2 for 1040 SNX
				await rewardEscrowV2.migrateAccountEscrowBalances([account1], [toUnit('1040')], [0], {
					from: owner,
				});

				// append vesting entries for account1 - 104 for 2 * 52 weeks
				// half of the reward escrow entries can be vested after
				for (let i = 0; i < 104; i++) {
					await rewardEscrow.appendVestingEntry(account1, quantity, { from: feePoolAccount });

					// fastForward one week
					// last week fast forward half a week so the 52nd escrow entry is not claimable yet
					if (i === 103) {
						await fastForward(WEEK / 2);
					} else {
						await fastForward(WEEK);
					}
				}

				// should have 104 entries on rewardEscrow
				assert.bnEqual(await rewardEscrow.numVestingEntries(account1), 104);
			});
			it('should migrate 52 pending vesting entry schedule from old rewardEscrouw', async () => {
				await rewardEscrowV2.migrateVestingSchedule(account1, { from: owner });

				// account 1 should have 52 vesting entries copied
				assert.bnEqual(await rewardEscrowV2.numVestingEntries(account1), new BN(52));

				// totalBalancePendingMigration for account1 should be less 520 (1040 - 520 = 520)
				// There would be another 520 SNX to migrate as a single vestable entry
				assert.bnEqual(await rewardEscrowV2.totalBalancePendingMigration(account1), toUnit('520'));

				// check 52 entries are setup
				for (let id = 1; id <= 52; id++) {
					const entry = await rewardEscrowV2.getVestingEntry(account1, id);

					// check all entries have 10 SNX
					assert.bnEqual(entry.escrowAmount, quantity);
				}

				// check 52nd entry is not claimable yet
				assert.bnEqual(await rewardEscrowV2.getVestingEntryClaimable(account1, 52), 0);
			});
		});
		describe('when migrating pending vesting entries but less than 52 entries', () => {
			const quantity = toUnit('500');

			beforeEach(async () => {
				// setup vesting entries on old RewardEscrow
				await synthetix.transfer(rewardEscrow.address, toUnit('2000'), { from: owner });

				// migrateAccountEscrowBalance to RewardEscrowV2 for 2000 SNX
				await rewardEscrowV2.migrateAccountEscrowBalances([account1], [toUnit('2000')], [0], {
					from: owner,
				});

				// append vesting entries for account1 - 4 vesting entries of 500 SNX
				for (let i = 0; i < 4; i++) {
					await rewardEscrow.appendVestingEntry(account1, quantity, { from: feePoolAccount });

					// fastForward one week
					await fastForward(WEEK);
				}

				// should have 4 entries on rewardEscrow
				assert.bnEqual(await rewardEscrow.numVestingEntries(account1), 4);
			});
			it('should migrate 4 pending vesting entry schedule from old rewardEscrouw', async () => {
				await rewardEscrowV2.migrateVestingSchedule(account1, { from: owner });

				// account 1 should have 4 vesting entries copied
				assert.bnEqual(await rewardEscrowV2.numVestingEntries(account1), new BN(4));

				// totalBalancePendingMigration for account1 should be 0
				assert.bnEqual(await rewardEscrowV2.totalBalancePendingMigration(account1), toUnit('0'));

				// check 4 entries are setup
				for (let id = 1; id <= 4; id++) {
					const entry = await rewardEscrowV2.getVestingEntry(account1, id);

					// check all entries have 500 SNX
					assert.bnEqual(entry.escrowAmount, quantity);
				}

				// check 4th entry is not claimable yet
				assert.bnEqual(await rewardEscrowV2.getVestingEntryClaimable(account1, 4), 0);
			});
		});
	});
});
