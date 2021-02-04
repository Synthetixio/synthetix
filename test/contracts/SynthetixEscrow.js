'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { mockToken, setupContract } = require('./setup');

const { currentTime, fastForward, toUnit } = require('../utils')();

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('SynthetixEscrow', async accounts => {
	const DAY = 86400;
	const WEEK = 604800;
	const YEAR = 31556926;

	const [, owner, , account1, account2] = accounts;
	let escrow, synthetix;

	const getYearFromNow = async () => {
		const timestamp = await currentTime();
		return timestamp + YEAR;
	};

	const weeksFromNow = async weeks => {
		const timestamp = await currentTime();
		return timestamp + WEEK * weeks;
	};

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		// Mock SNX
		({ token: synthetix } = await mockToken({ accounts, name: 'Synthetix', symbol: 'SNX' }));

		escrow = await setupContract({
			accounts,
			contract: 'SynthetixEscrow',
			cache: {
				Synthetix: synthetix,
			},
		});
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('Constructor & Settings ', async () => {
		it('should set synthetix on contructor', async () => {
			const synthetixAddress = await escrow.synthetix();
			assert.equal(synthetixAddress, synthetix.address);
		});

		it('should set owner on contructor', async () => {
			const ownerAddress = await escrow.owner();
			assert.equal(ownerAddress, owner);
		});

		it('should allow owner to set synthetix', async () => {
			await escrow.setSynthetix(ZERO_ADDRESS, { from: owner });
			const synthetixAddress = await escrow.synthetix();
			assert.equal(synthetixAddress, ZERO_ADDRESS);
		});
	});

	describe('Only During Setup', async () => {
		it('should allow owner to purgeAccount', async () => {
			// Transfer of SNX to the escrow must occur before creating an entry
			await synthetix.transfer(escrow.address, toUnit('1000'), {
				from: owner,
			});
			await escrow.appendVestingEntry(account1, await getYearFromNow(), toUnit('1000'), {
				from: owner,
			});

			assert.equal(1, await escrow.numVestingEntries(account1));
			assert.bnEqual(toUnit('1000'), await escrow.totalVestedAccountBalance(account1));

			await escrow.purgeAccount(account1, { from: owner });

			assert.equal(0, await escrow.numVestingEntries(account1));
			assert.bnEqual(toUnit('0'), await escrow.totalVestedAccountBalance(account1));
		});
		it('should allow owner to call addVestingSchedule', async () => {
			// Transfer of SNX to the escrow must occur before creating an entry
			await synthetix.transfer(escrow.address, toUnit('200'), {
				from: owner,
			});

			const times = [await weeksFromNow(1), await weeksFromNow(2)];
			const quantities = [toUnit('100'), toUnit('100')];
			await escrow.addVestingSchedule(account1, times, quantities, { from: owner });

			assert.equal(2, await escrow.numVestingEntries(account1));
			assert.bnEqual(toUnit('200'), await escrow.totalVestedAccountBalance(account1));

			assert.isAtLeast(times[0], parseInt(await escrow.getVestingTime(account1, 0)));
			assert.isAtLeast(times[1], parseInt(await escrow.getVestingTime(account1, 1)));
		});
	});

	describe('Given there are no escrow entries', async () => {
		it('then numVestingEntries should return 0', async () => {
			assert.equal(0, await escrow.numVestingEntries(account1));
		});
		it('then getNextVestingEntry should return 0', async () => {
			const nextVestingEntry = await escrow.getNextVestingEntry(account1);
			assert.equal(nextVestingEntry[0], 0);
			assert.equal(nextVestingEntry[1], 0);
		});
		it('then calling vest should do nothing and not fail', async () => {
			await escrow.vest({ from: account1 });
			assert.bnEqual(toUnit('0'), await escrow.totalVestedAccountBalance(account1));
		});
	});

	describe('Functions', async () => {
		describe('Vesting Schedule Writes', async () => {
			it('should not create a vesting entry with a zero amount', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(escrow.address, toUnit('1'), {
					from: owner,
				});

				await assert.revert(
					escrow.appendVestingEntry(account1, await getYearFromNow(), toUnit('0'), { from: owner })
				);
			});

			it('should not create a vesting entry if there is not enough SNX in the contracts balance', async () => {
				// Transfer of SNX to the escrow must occur before creating an entry
				await synthetix.transfer(escrow.address, toUnit('1'), {
					from: owner,
				});
				await assert.revert(
					escrow.appendVestingEntry(account1, await getYearFromNow(), toUnit('10'), { from: owner })
				);
			});
		});

		describe('Vesting Schedule Reads ', async () => {
			beforeEach(async () => {
				// Transfer of SNX to the escrow must occur before creating a vestinng entry
				await synthetix.transfer(escrow.address, toUnit('6000'), {
					from: owner,
				});

				// Add a few vesting entries as the feepool address
				await escrow.appendVestingEntry(account1, await getYearFromNow(), toUnit('1000'), {
					from: owner,
				});
				await fastForward(WEEK);
				await escrow.appendVestingEntry(account1, await getYearFromNow(), toUnit('2000'), {
					from: owner,
				});
				await fastForward(WEEK);
				await escrow.appendVestingEntry(account1, await getYearFromNow(), toUnit('3000'), {
					from: owner,
				});
			});

			it('should append a vesting entry and increase the contracts balance', async () => {
				const balanceOfRewardEscrow = await synthetix.balanceOf(escrow.address);
				assert.bnEqual(balanceOfRewardEscrow, toUnit('6000'));
			});

			it('should get an accounts total Vested Account Balance', async () => {
				const balanceOf = await escrow.balanceOf(account1);
				assert.bnEqual(balanceOf, toUnit('6000'));
			});

			it('should get an accounts number of vesting entries', async () => {
				const numVestingEntries = await escrow.numVestingEntries(account1);
				assert.equal(numVestingEntries, 3);
			});

			it('should get an accounts vesting schedule entry by index', async () => {
				let vestingScheduleEntry;
				vestingScheduleEntry = await escrow.getVestingScheduleEntry(account1, 0);
				assert.bnEqual(vestingScheduleEntry[1], toUnit('1000'));

				vestingScheduleEntry = await escrow.getVestingScheduleEntry(account1, 1);
				assert.bnEqual(vestingScheduleEntry[1], toUnit('2000'));

				vestingScheduleEntry = await escrow.getVestingScheduleEntry(account1, 2);
				assert.bnEqual(vestingScheduleEntry[1], toUnit('3000'));
			});

			it('should get an accounts vesting time for a vesting entry index', async () => {
				const oneYearAhead = await getYearFromNow();
				assert.isAtLeast(oneYearAhead, parseInt(await escrow.getVestingTime(account1, 0)));
				assert.isAtLeast(oneYearAhead, parseInt(await escrow.getVestingTime(account1, 1)));
				assert.isAtLeast(oneYearAhead, parseInt(await escrow.getVestingTime(account1, 2)));
			});

			it('should get an accounts vesting quantity for a vesting entry index', async () => {
				assert.bnEqual(await escrow.getVestingQuantity(account1, 0), toUnit('1000'));
				assert.bnEqual(await escrow.getVestingQuantity(account1, 1), toUnit('2000'));
				assert.bnEqual(await escrow.getVestingQuantity(account1, 2), toUnit('3000'));
			});
		});

		describe('Partial Vesting', async () => {
			beforeEach(async () => {
				// Transfer of SNX to the escrow must occur before creating a vestinng entry
				await synthetix.transfer(escrow.address, toUnit('6000'), {
					from: owner,
				});

				// Add a few vesting entries as the feepool address
				await escrow.appendVestingEntry(account1, await getYearFromNow(), toUnit('1000'), {
					from: owner,
				});
				await fastForward(WEEK);
				await escrow.appendVestingEntry(account1, await getYearFromNow(), toUnit('2000'), {
					from: owner,
				});
				await fastForward(WEEK);
				await escrow.appendVestingEntry(account1, await getYearFromNow(), toUnit('3000'), {
					from: owner,
				});

				// fastForward to vest only the first weeks entry
				await fastForward(YEAR - WEEK * 2);

				// Vest
				await escrow.vest({ from: account1 });
			});

			it('should get an accounts next vesting entry index', async () => {
				assert.bnEqual(await escrow.getNextVestingIndex(account1), 1);
			});

			it('should get an accounts next vesting entry', async () => {
				const vestingScheduleEntry = await escrow.getNextVestingEntry(account1);
				assert.bnEqual(vestingScheduleEntry[1], toUnit('2000'));
			});

			it('should get an accounts next vesting time', async () => {
				const fiveDaysAhead = (await currentTime()) + DAY * 5;
				assert.isAtLeast(parseInt(await escrow.getNextVestingTime(account1)), fiveDaysAhead);
			});

			it('should get an accounts next vesting quantity', async () => {
				const nextVestingQuantity = await escrow.getNextVestingQuantity(account1);
				assert.bnEqual(nextVestingQuantity, toUnit('2000'));
			});
		});

		describe('Vesting', async () => {
			beforeEach(async () => {
				// Transfer of SNX to the escrow must occur before creating a vestinng entry
				await synthetix.transfer(escrow.address, toUnit('6000'), {
					from: owner,
				});

				// Add a few vesting entries as the feepool address
				await escrow.appendVestingEntry(account1, await getYearFromNow(), toUnit('1000'), {
					from: owner,
				});
				await fastForward(WEEK);
				await escrow.appendVestingEntry(account1, await getYearFromNow(), toUnit('2000'), {
					from: owner,
				});
				await fastForward(WEEK);
				await escrow.appendVestingEntry(account1, await getYearFromNow(), toUnit('3000'), {
					from: owner,
				});

				// Need to go into the future to vest
				await fastForward(YEAR + WEEK * 3);
			});

			it('should vest and transfer snx from contract to the user', async () => {
				await escrow.vest({ from: account1 });

				// Check user has all their vested SNX
				assert.bnEqual(await synthetix.balanceOf(account1), toUnit('6000'));

				// Check escrow does not have any SNX
				assert.bnEqual(await synthetix.balanceOf(escrow.address), toUnit('0'));
			});

			it('should vest and emit a Vest event', async () => {
				const vestTransaction = await escrow.vest({ from: account1 });

				// Vested(msg.sender, now, total);
				const vestedEvent = vestTransaction.logs.find(log => log.event === 'Vested');
				assert.eventEqual(vestedEvent, 'Vested', {
					beneficiary: account1,
					value: toUnit('6000'),
				});
			});
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
