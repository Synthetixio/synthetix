'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { mockToken, setupContract } = require('./setup');

const { currentTime, fastForward, toUnit } = require('../utils')();

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('RewardEscrow @ovm-skip', async accounts => {
	const SECOND = 1000;
	const DAY = 86400;
	const WEEK = 604800;
	const YEAR = 31556926;

	const [, owner, feePoolAccount, account1, account2] = accounts;
	let rewardEscrow, synthetix, feePool;

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		// Mock SNX
		({ token: synthetix } = await mockToken({ accounts, name: 'Synthetix', symbol: 'SNX' }));

		feePool = { address: feePoolAccount }; // mock contract with address

		rewardEscrow = await setupContract({
			accounts,
			contract: 'RewardEscrow',
			cache: {
				FeePool: feePool,
				Synthetix: synthetix,
			},
		});
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('Constructor & Settings ', async () => {
		it('should set synthetix on contructor', async () => {
			const synthetixAddress = await rewardEscrow.synthetix();
			assert.equal(synthetixAddress, synthetix.address);
		});

		it('should set feePool on contructor', async () => {
			const feePoolAddress = await rewardEscrow.feePool();
			assert.equal(feePoolAddress, feePool.address);
		});

		it('should set owner on contructor', async () => {
			const ownerAddress = await rewardEscrow.owner();
			assert.equal(ownerAddress, owner);
		});

		it('should allow owner to set synthetix', async () => {
			await rewardEscrow.setSynthetix(ZERO_ADDRESS, { from: owner });
			const synthetixAddress = await rewardEscrow.synthetix();
			assert.equal(synthetixAddress, ZERO_ADDRESS);
		});

		it('should allow owner to set feePool', async () => {
			await rewardEscrow.setFeePool(ZERO_ADDRESS, { from: owner });
			const feePoolAddress = await rewardEscrow.feePool();
			assert.equal(feePoolAddress, ZERO_ADDRESS);
		});
	});

	describe('Given there are no escrow entries', async () => {
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await rewardEscrow.numVestingEntries(account1));
		});
		it('then getNextVestingEntry should return 0', async () => {
			const nextVestingEntry = await rewardEscrow.getNextVestingEntry(account1);
			assert.equal(nextVestingEntry[0], 0);
			assert.equal(nextVestingEntry[1], 0);
		});
		it('then vest should do nothing and not revert', async () => {
			await rewardEscrow.vest({ from: account1 });
			assert.bnEqual(toUnit('0'), await rewardEscrow.totalVestedAccountBalance(account1));
		});
	});

	describe('Functions', async () => {
		beforeEach(async () => {
			// Ensure only FeePool Address can call rewardEscrow.appendVestingEntry()
			await rewardEscrow.setFeePool(feePoolAccount, { from: owner });
			const feePoolAddress = await rewardEscrow.feePool();
			assert.equal(feePoolAddress, feePoolAccount);
		});

		describe('Vesting Schedule Writes', async () => {
			it('should not create a vesting entry with a zero amount', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(rewardEscrow.address, toUnit('1'), {
					from: owner,
				});

				await assert.revert(
					rewardEscrow.appendVestingEntry(account1, toUnit('0'), { from: feePoolAccount })
				);
			});

			it('should not create a vesting entry if there is not enough SNX in the contracts balance', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(rewardEscrow.address, toUnit('1'), {
					from: owner,
				});
				await assert.revert(
					rewardEscrow.appendVestingEntry(account1, toUnit('10'), { from: feePoolAccount })
				);
			});
		});

		describe('Vesting Schedule Reads ', async () => {
			beforeEach(async () => {
				// Transfer of SNX to the escrow must occur before creating a vestinng entry
				await synthetix.transfer(rewardEscrow.address, toUnit('6000'), {
					from: owner,
				});

				// Add a few vesting entries as the feepool address
				await rewardEscrow.appendVestingEntry(account1, toUnit('1000'), { from: feePoolAccount });
				await fastForward(WEEK);
				await rewardEscrow.appendVestingEntry(account1, toUnit('2000'), { from: feePoolAccount });
				await fastForward(WEEK);
				await rewardEscrow.appendVestingEntry(account1, toUnit('3000'), { from: feePoolAccount });
			});

			it('should append a vesting entry and increase the contracts balance', async () => {
				const balanceOfRewardEscrow = await synthetix.balanceOf(rewardEscrow.address);
				assert.bnEqual(balanceOfRewardEscrow, toUnit('6000'));
			});

			it('should get an accounts total Vested Account Balance', async () => {
				const balanceOf = await rewardEscrow.balanceOf(account1);
				assert.bnEqual(balanceOf, toUnit('6000'));
			});

			it('should get an accounts number of vesting entries', async () => {
				const numVestingEntries = await rewardEscrow.numVestingEntries(account1);
				assert.equal(numVestingEntries, 3);
			});

			it('should get an accounts vesting schedule entry by index', async () => {
				let vestingScheduleEntry;
				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
				assert.bnEqual(vestingScheduleEntry[1], toUnit('1000'));

				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 1);
				assert.bnEqual(vestingScheduleEntry[1], toUnit('2000'));

				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 2);
				assert.bnEqual(vestingScheduleEntry[1], toUnit('3000'));
			});

			it('should get an accounts vesting time for a vesting entry index', async () => {
				const oneYearAhead = (await currentTime()) + DAY * 365;
				assert.isAtLeast(oneYearAhead, parseInt(await rewardEscrow.getVestingTime(account1, 0)));
				assert.isAtLeast(oneYearAhead, parseInt(await rewardEscrow.getVestingTime(account1, 1)));
				assert.isAtLeast(oneYearAhead, parseInt(await rewardEscrow.getVestingTime(account1, 2)));
			});

			it('should get an accounts vesting quantity for a vesting entry index', async () => {
				assert.bnEqual(await rewardEscrow.getVestingQuantity(account1, 0), toUnit('1000'));
				assert.bnEqual(await rewardEscrow.getVestingQuantity(account1, 1), toUnit('2000'));
				assert.bnEqual(await rewardEscrow.getVestingQuantity(account1, 2), toUnit('3000'));
			});
		});

		describe('Partial Vesting', async () => {
			beforeEach(async () => {
				// Transfer of SNX to the escrow must occur before creating a vestinng entry
				await synthetix.transfer(rewardEscrow.address, toUnit('6000'), {
					from: owner,
				});

				// Add a few vesting entries as the feepool address
				await rewardEscrow.appendVestingEntry(account1, toUnit('1000'), { from: feePoolAccount });
				await fastForward(WEEK);
				await rewardEscrow.appendVestingEntry(account1, toUnit('2000'), { from: feePoolAccount });
				await fastForward(WEEK);
				await rewardEscrow.appendVestingEntry(account1, toUnit('3000'), { from: feePoolAccount });

				// fastForward to vest only the first weeks entry
				await fastForward(YEAR - WEEK * 2);

				// Vest
				await rewardEscrow.vest({ from: account1 });
			});

			it('should get an accounts next vesting entry index', async () => {
				assert.bnEqual(await rewardEscrow.getNextVestingIndex(account1), 1);
			});

			it('should get an accounts next vesting entry', async () => {
				const vestingScheduleEntry = await rewardEscrow.getNextVestingEntry(account1);
				assert.bnEqual(vestingScheduleEntry[1], toUnit('2000'));
			});

			it('should get an accounts next vesting time', async () => {
				const fiveDaysAhead = (await currentTime()) + DAY * 5;
				assert.isAtLeast(parseInt(await rewardEscrow.getNextVestingTime(account1)), fiveDaysAhead);
			});

			it('should get an accounts next vesting quantity', async () => {
				const nextVestingQuantity = await rewardEscrow.getNextVestingQuantity(account1);
				assert.bnEqual(nextVestingQuantity, toUnit('2000'));
			});
		});

		describe('Vesting', async () => {
			beforeEach(async () => {
				// Transfer of SNX to the escrow must occur before creating a vestinng entry
				await synthetix.transfer(rewardEscrow.address, toUnit('6000'), {
					from: owner,
				});

				// Add a few vesting entries as the feepool address
				await rewardEscrow.appendVestingEntry(account1, toUnit('1000'), { from: feePoolAccount });
				await fastForward(WEEK);
				await rewardEscrow.appendVestingEntry(account1, toUnit('2000'), { from: feePoolAccount });
				await fastForward(WEEK);
				await rewardEscrow.appendVestingEntry(account1, toUnit('3000'), { from: feePoolAccount });

				// Need to go into the future to vest
				await fastForward(YEAR + WEEK * 3);
			});

			it('should vest and transfer snx from contract to the user', async () => {
				await rewardEscrow.vest({ from: account1 });

				// Check user has all their vested SNX
				assert.bnEqual(await synthetix.balanceOf(account1), toUnit('6000'));

				// Check rewardEscrow does not have any SNX
				assert.bnEqual(await synthetix.balanceOf(rewardEscrow.address), toUnit('0'));
			});

			it('should vest and emit a Vest event', async () => {
				const vestTransaction = await rewardEscrow.vest({ from: account1 });

				// Vested(msg.sender, now, total);
				const vestedEvent = vestTransaction.logs.find(log => log.event === 'Vested');
				assert.eventEqual(vestedEvent, 'Vested', {
					beneficiary: account1,
					value: toUnit('6000'),
				});
			});

			it('should vest and update totalEscrowedAccountBalance', async () => {
				// This account should have an escrowedAccountBalance
				let escrowedAccountBalance = await rewardEscrow.totalEscrowedAccountBalance(account1);
				assert.bnEqual(escrowedAccountBalance, toUnit('6000'));

				// Vest
				await rewardEscrow.vest({ from: account1 });

				// This account should not have any amount escrowed
				escrowedAccountBalance = await rewardEscrow.totalEscrowedAccountBalance(account1);
				assert.bnEqual(escrowedAccountBalance, toUnit('0'));
			});

			it('should vest and update totalVestedAccountBalance', async () => {
				// This account should have zero totalVestedAccountBalance
				let totalVestedAccountBalance = await rewardEscrow.totalVestedAccountBalance(account1);
				assert.bnEqual(totalVestedAccountBalance, toUnit('0'));

				// Vest
				await rewardEscrow.vest({ from: account1 });

				// This account should have vested its whole amount
				totalVestedAccountBalance = await rewardEscrow.totalVestedAccountBalance(account1);
				assert.bnEqual(totalVestedAccountBalance, toUnit('6000'));
			});

			it('should vest and update totalEscrowedBalance', async () => {
				await rewardEscrow.vest({ from: account1 });
				// There should be no Escrowed balance left in the contract
				assert.bnEqual(await rewardEscrow.totalEscrowedBalance(), toUnit('0'));
			});
		});

		describe('Stress Test', () => {
			it('should not create more than MAX_VESTING_ENTRIES vesting entries', async () => {
				const MAX_VESTING_ENTRIES = 260; // await rewardEscrow.MAX_VESTING_ENTRIES();

				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(rewardEscrow.address, toUnit('260'), {
					from: owner,
				});

				// append the MAX_VESTING_ENTRIES to the schedule
				for (let i = 0; i < MAX_VESTING_ENTRIES; i++) {
					rewardEscrow.appendVestingEntry(account1, toUnit('1'), { from: feePoolAccount });
					await fastForward(WEEK);
				}
				// assert adding 1 more above the MAX_VESTING_ENTRIES fails
				await assert.revert(
					rewardEscrow.appendVestingEntry(account1, toUnit('1'), { from: feePoolAccount })
				);
			}).timeout(60e3);

			it('should be able to vest 52 week * 5 years vesting entries', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(rewardEscrow.address, toUnit('260'), {
					from: owner,
				});

				const MAX_VESTING_ENTRIES = 260; // await rewardEscrow.MAX_VESTING_ENTRIES();

				// Append the MAX_VESTING_ENTRIES to the schedule
				for (let i = 0; i < MAX_VESTING_ENTRIES; i++) {
					rewardEscrow.appendVestingEntry(account1, toUnit('1'), { from: feePoolAccount });
					await fastForward(SECOND);
				}

				// Need to go into the future to vest
				await fastForward(YEAR + DAY);

				// Vest
				await rewardEscrow.vest({ from: account1 });

				// Check user has all their vested SNX
				assert.bnEqual(await synthetix.balanceOf(account1), toUnit('260'));

				// Check rewardEscrow does not have any SNX
				assert.bnEqual(await synthetix.balanceOf(rewardEscrow.address), toUnit('0'));

				// This account should have vested its whole amount
				assert.bnEqual(await rewardEscrow.totalEscrowedAccountBalance(account1), toUnit('0'));

				// This account should have vested its whole amount
				assert.bnEqual(await rewardEscrow.totalVestedAccountBalance(account1), toUnit('260'));
			}).timeout(60e3);

			it('should be able to read an accounts schedule of 5 vesting entries', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(rewardEscrow.address, toUnit('5'), {
					from: owner,
				});

				const VESTING_ENTRIES = 5;

				// Append the VESTING_ENTRIES to the schedule
				for (let i = 0; i < VESTING_ENTRIES; i++) {
					rewardEscrow.appendVestingEntry(account1, toUnit('1'), { from: feePoolAccount });
					await fastForward(SECOND);
				}

				// Get the vesting Schedule
				const accountSchedule = await rewardEscrow.checkAccountSchedule(account1);

				// Check accountSchedule entries
				for (let i = 1; i < VESTING_ENTRIES; i += 2) {
					if (accountSchedule[i]) {
						assert.bnEqual(accountSchedule[i], toUnit('1'));
					}
					break;
				}
			}).timeout(60e3);

			it('should be able to read the full account schedule 52 week * 5 years vesting entries', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(rewardEscrow.address, toUnit('260'), {
					from: owner,
				});

				const MAX_VESTING_ENTRIES = 260; // await rewardEscrow.MAX_VESTING_ENTRIES();

				// Append the MAX_VESTING_ENTRIES to the schedule
				for (let i = 0; i < MAX_VESTING_ENTRIES; i++) {
					rewardEscrow.appendVestingEntry(account1, toUnit('1'), { from: feePoolAccount });
					await fastForward(SECOND);
				}

				// Get the vesting Schedule
				const accountSchedule = await rewardEscrow.checkAccountSchedule(account1);

				// Check accountSchedule entries
				for (let i = 1; i < MAX_VESTING_ENTRIES; i += 2) {
					assert.bnEqual(accountSchedule[i], toUnit('1'));
				}
			}).timeout(60e3);
		});

		describe('Transfering', async () => {
			it('should not allow transfer of synthetix in escrow', async () => {
				// Ensure the transfer fails as all the synthetix are in escrow
				await assert.revert(
					synthetix.transfer(account2, toUnit('1000'), {
						from: account1,
					})
				);
			});
		});
	});
});
