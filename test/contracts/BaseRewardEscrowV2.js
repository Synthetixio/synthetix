'use strict';

const { contract, web3 } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { mockToken, setupAllContracts } = require('./setup');

// const { toUnit } = require('../utils')();

const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toUnit, currentTime, fastForward } = require('../utils')();

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

const BN = require('bn.js');

contract('BaseRewardEscrowV2', async accounts => {
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

			describe.only('When successfully appending new escrow entry for account 1 with 10 SNX', () => {
				let entryID, nextEntryIdAfter, now, escrowAmount;
				beforeEach(async () => {
					duration = 1 * YEAR;

					entryID = await baseRewardEscrowV2.nextEntryId();

					now = await currentTime();

					escrowAmount = toUnit('10');
					// Transfer of SNX to the escrow must occur before creating an entry
					await synthetix.transfer(baseRewardEscrowV2.address, escrowAmount, {
						from: owner,
					});

					// Append vesting entry
					await baseRewardEscrowV2.appendVestingEntry(account1, escrowAmount, duration, {
						from: feePoolAccount,
					});

					nextEntryIdAfter = await baseRewardEscrowV2.nextEntryId();
				});
				it('Should return the vesting entry for account 1 and entryID', async () => {
					const vestingEntry = await baseRewardEscrowV2.getVestingEntry(account1, entryID);

					// endTime is 1 year after
					assert.isTrue(vestingEntry.endTime.gte(now + duration));

					// escrowAmount is 10
					assert.bnEqual(vestingEntry.escrowAmount, escrowAmount);

					// remainingAmount is 10
					assert.bnEqual(vestingEntry.remainingAmount, escrowAmount);

					// duration is 1 year
					assert.bnEqual(vestingEntry.duration, duration);

					// last vested timestamp is 0
					assert.bnEqual(vestingEntry.lastVested, new BN(0));
				});
				it('Should increment the nextEntryID', async () => {
					assert.bnEqual(nextEntryIdAfter, entryID.add(new BN(1)));
				});
				describe('When 6 months has passed', () => {
					let vestingEntry, timeElapsed;
					beforeEach(async () => {
						timeElapsed = YEAR / 2;
						await fastForward(timeElapsed);
						vestingEntry = await baseRewardEscrowV2.getVestingEntry(account1, entryID);
					});
					it('last vested timestamp on entry is 0', async () => {
						assert.bnEqual(vestingEntry.lastVested, new BN(0));
					});
					it('remaining amount is same as the escrowAmount', async () => {
						assert.bnEqual(vestingEntry.remainingAmount, escrowAmount);
					});
					it('then the timeSinceLastVested the vesting entry is 1/2 year', async () => {
						const delta = await baseRewardEscrowV2.timeSinceLastVested(account1, entryID);
						assert.bnEqual(delta, vestingEntry.duration.div(new BN(2)));
					});
					it('then the vesting entry has 1/2 year * ratePerSecond claimable', async () => {
						const ratePerSecond = await baseRewardEscrowV2.ratePerSecond(account1, entryID);
						const expectedAmount = ratePerSecond.mul(new BN(timeElapsed));
						const claimable = await baseRewardEscrowV2.getVestingEntryClaimable(account1, entryID);
						assert.bnEqual(claimable, expectedAmount);
					});
				});
				describe('When one year has passed', () => {
					let vestingEntry;
					beforeEach(async () => {
						await fastForward(YEAR + 1);
						vestingEntry = await baseRewardEscrowV2.getVestingEntry(account1, entryID);
					});
					it('last vested timestamp on entry is 0', async () => {
						assert.bnEqual(vestingEntry.lastVested, new BN(0));
					});
					it('remaining amount is same as the escrowAmount', async () => {
						assert.bnEqual(vestingEntry.remainingAmount, escrowAmount);
					});
					it('then the timeSinceLastVested the vesting entry is the whole duration (1 year)', async () => {
						const delta = await baseRewardEscrowV2.timeSinceLastVested(account1, entryID);
						assert.bnEqual(delta, vestingEntry.duration);
					});
					it('then the vesting entry is fully claimable', async () => {
						const claimable = await baseRewardEscrowV2.getVestingEntryClaimable(account1, entryID);
						assert.bnEqual(claimable, escrowAmount);
					});
				});
			});
		});
		describe('Calculating the ratePerSecond emission of each entry', () => {
			beforeEach(async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(baseRewardEscrowV2.address, toUnit('31556926'), {
					from: owner,
				});
			});
			it('should be 1 SNX per second with entry of 31556926 SNX for 1 year (31556926 seconds) duration', async () => {
				const duration = 1 * YEAR;
				const expectedRatePerSecond = toUnit(1);

				const entryID = await baseRewardEscrowV2.nextEntryId();

				await baseRewardEscrowV2.appendVestingEntry(account1, toUnit('31556926'), duration, {
					from: feePoolAccount,
				});

				const ratePerSecond = await baseRewardEscrowV2.ratePerSecond(account1, entryID);

				assert.bnEqual(ratePerSecond, expectedRatePerSecond);
			});
			it('should be 0.5 SNX per second with entry of 15,778,463 SNX for 1 year (31556926 seconds) duration', async () => {
				const duration = 1 * YEAR;
				const expectedRatePerSecond = toUnit('0.5');

				const entryID = await baseRewardEscrowV2.nextEntryId();

				await baseRewardEscrowV2.appendVestingEntry(account1, toUnit('15778463'), duration, {
					from: feePoolAccount,
				});

				const ratePerSecond = await baseRewardEscrowV2.ratePerSecond(account1, entryID);

				assert.bnEqual(ratePerSecond, expectedRatePerSecond);
			});
			it('should be 0.25 SNX per second with entry of 7,889,231.5 SNX for 1 year (31556926 seconds) duration', async () => {
				const duration = 1 * YEAR;
				const expectedRatePerSecond = toUnit('0.25');

				const entryID = await baseRewardEscrowV2.nextEntryId();

				await baseRewardEscrowV2.appendVestingEntry(account1, toUnit('7889231.5'), duration, {
					from: feePoolAccount,
				});

				const ratePerSecond = await baseRewardEscrowV2.ratePerSecond(account1, entryID);

				assert.bnEqual(ratePerSecond, expectedRatePerSecond);
			});
			it('should return very small amount SNX per second with escrow amount of 31556927 wei for 1 year (31556926 seconds) duration', async () => {
				const duration = 1 * YEAR;
				const expectedRatePerSecond = web3.utils.toWei('1', 'wei');

				const entryID = await baseRewardEscrowV2.nextEntryId();

				await baseRewardEscrowV2.appendVestingEntry(account1, new BN(31556927), duration, {
					from: feePoolAccount,
				});

				const ratePerSecond = await baseRewardEscrowV2.ratePerSecond(account1, entryID);

				assert.bnEqual(ratePerSecond, expectedRatePerSecond);
			});
		});
	});
	describe('Creating a new escrow entry by approval', async () => {
		const duration = YEAR;
		beforeEach(async () => {
			// approve rewardEscrow to spend SNX
			await synthetix.approve(baseRewardEscrowV2.address, toUnit('10'), { from: owner });
		});
		it('should revert if escrow quanity is equal or less than duration seconds, as will result in 0 ratePerSecond', async () => {
			await assert.revert(
				baseRewardEscrowV2.createEscrowEntry(account1, new BN(1000), duration, { from: owner }),
				'Escrow quantity less than duration'
			);
		});
		it('should revert when beneficiary is address zero', async () => {
			await assert.revert(
				baseRewardEscrowV2.createEscrowEntry(ZERO_ADDRESS, toUnit('1'), duration),
				'Cannot create escrow with address(0)'
			);
		});
	});
});
