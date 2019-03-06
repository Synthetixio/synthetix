const RewardEscrow = artifacts.require('RewardEscrow');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');

const { currentTime, fastForward, toUnit, ZERO_ADDRESS } = require('../utils/testUtils');

contract('RewardEscrow', async function(accounts) {
	const [
		deployerAccount,
		owner,
		feePoolAccount,
		account1,
		account2,
		account3,
		account4,
		account5,
	] = accounts;

	let feePool, rewardEscrow, synthetix;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		feePool = await FeePool.deployed();
		synthetix = await Synthetix.deployed();
		rewardEscrow = await RewardEscrow.deployed();
	});

	describe.only('settings ', async function() {
		it('should set synthetix on contructor', async function() {
			const synthetixAddress = await rewardEscrow.synthetix();
			assert.equal(synthetixAddress, Synthetix.address);
		});

		it('should set feePool on contructor', async function() {
			const feePoolAddress = await rewardEscrow.feePool();
			assert.equal(feePoolAddress, FeePool.address);
		});

		it('should set owner on contructor', async function() {
			const ownerAddress = await rewardEscrow.owner();
			assert.equal(ownerAddress, owner);
		});

		it('should allow owner to set synthetix', async function() {
			await rewardEscrow.setSynthetix(ZERO_ADDRESS, { from: owner });
			const synthetixAddress = await rewardEscrow.synthetix();
			assert.equal(synthetixAddress, ZERO_ADDRESS);
		});

		it('should allow owner to set feePool', async function() {
			await rewardEscrow.setFeePool(ZERO_ADDRESS, { from: owner });
			const feePoolAddress = await rewardEscrow.feePool();
			assert.equal(feePoolAddress, ZERO_ADDRESS);
		});
	});

	describe.only('Vesting Schedule Reads ', async function() {
		beforeEach(async function() {
			feePool = await FeePool.deployed();
			synthetix = await Synthetix.deployed();
			rewardEscrow = await RewardEscrow.deployed();

			// Ensure only FeePool Address can call rewardEscrow.appendVestingEntry()
			await rewardEscrow.setFeePool(feePoolAccount, { from: owner });
			const feePoolAddress = await rewardEscrow.feePool();
			assert.equal(feePoolAddress, feePoolAccount);

			// transfers of SNX to the escrow must occur before creating a vestinng entry
			await synthetix.transfer(RewardEscrow.address, toUnit('6000'), { from: owner });

			// add a few vesting entries as the feepool address
			await rewardEscrow.appendVestingEntry(account1, toUnit('1000'), { from: feePoolAccount });
			await fastForward(1000);
			await rewardEscrow.appendVestingEntry(account1, toUnit('2000'), { from: feePoolAccount });
			await fastForward(1000);
			await rewardEscrow.appendVestingEntry(account1, toUnit('3000'), { from: feePoolAccount });
		});

		it('should append a vesting entry and increase the contracts balance', async function() {
			const balanceOfRewardEscrow = await synthetix.balanceOf(RewardEscrow.address);
			assert.bnEqual(balanceOfRewardEscrow, toUnit('6000'));
		});

		it('should get an accounts total Vested Account Balance', async function() {
			const balanceOf = await rewardEscrow.balanceOf(account1);
			assert.bnEqual(balanceOf, toUnit('6000'));
		});

		it('should get an accounts number of vesting entries', async function() {
			const numVestingEntries = await rewardEscrow.numVestingEntries(account1);
			assert.equal(numVestingEntries, 3);
		});

		it('should get an accounts vesting schedule entry by index', async function() {
			let vestingScheduleEntry;
			vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			assert.bnEqual(vestingScheduleEntry[1], toUnit('1000'));

			vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 1);
			assert.bnEqual(vestingScheduleEntry[1], toUnit('2000'));

			vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 2);
			assert.bnEqual(vestingScheduleEntry[1], toUnit('3000'));
		});

		it('should get an accounts vesting time for a vesting entry index', async function() {
			let vestingTime;
			const now = await currentTime();
			const dayInMilliseconds = 86400;
			const oneYearAhead = now + dayInMilliseconds * 363;

			vestingTime = await rewardEscrow.getVestingTime(account1, 0);
			assert.isAtLeast(parseInt(vestingTime), oneYearAhead);

			vestingTime = await rewardEscrow.getVestingTime(account1, 1);
			assert.isAtLeast(parseInt(vestingTime), oneYearAhead);

			vestingTime = await rewardEscrow.getVestingTime(account1, 2);
			assert.isAtLeast(parseInt(vestingTime), oneYearAhead);
		});

		// it('should get an accounts vesting quantity for a vesting entry index', async function() {
		// 	// rewardEscrow.getVestingQuantity(account1, 0);
		// });
		// it('should get an accounts next vesting entry index', async function() {
		// 	// rewardEscrow.getNextVestingIndex(account1);
		// });
		// it('should get an accounts next vesting entry', async function() {
		// 	// rewardEscrow.getNextVestingEntry(account1);
		// });
		// it('should get an accounts next vesting time', async function() {
		// 	// rewardEscrow.getNextVestingTime(account1);
		// });
		// it('should get an accounts next vesting quantity', async function() {
		// 	// rewardEscrow.getNextVestingQuantity(account1);
		// });
	});

	describe.only('Vesting Schedule Writes', async function() {
		it.only('should not create a vesting entry with a zero amount', async function() {
			// transfers of SNX to the escrow must occur before creating an entry
			await synthetix.transfer(RewardEscrow.address, toUnit('1'));

			await assert.revert(
				rewardEscrow.appendVestingEntry(account1, toUnit('0'), { from: feePoolAccount })
			);
		});

		it('should not create a vesting entry if there is not enough SNX in the contracts balance', async function() {
			// transfers of SNX to the escrow must occur before creating an entry
			await synthetix.transfer(RewardEscrow.address, toUnit('1'));
			await assert.revert(
				rewardEscrow.appendVestingEntry(account1, toUnit('10'), { from: feePoolAccount })
			);
		});

		it('should not create more than 52 * 4 vesting entries', async function() {
			const MAX_VESTING_ENTRIES = await rewardEscrow.MAX_VESTING_ENTRIES;

			// transfers of SNX to the escrow must occur before creating an entry
			await synthetix.transfer(RewardEscrow.address, toUnit('209'));
			// append the MAX_VESTING_ENTRIES to the schedule
			for (let i = 0; i < MAX_VESTING_ENTRIES; i++) {
				rewardEscrow.appendVestingEntry(account1, toUnit('1'), { from: feePoolAccount });
			}
			// assert adding 1 more above the MAX_VESTING_ENTRIES fails
			await assert.revert(
				rewardEscrow.appendVestingEntry(account1, toUnit('1'), { from: feePoolAccount })
			);
		});
	});

	describe('Vesting', async function() {
		// it('should vest an accounts vest entries', async function() {
		// 	// rewardEscrow.vest({from:account1});
		// });
		// it('should be able to add 52 week * 4 years vesting entries', async function() {
		// 	// rewardEscrow.vest({from:account1});
		// });
		// it('should be able to vest 52 week * 4 years vesting entries', async function() {
		// 	// rewardEscrow.vest({from:account1});
		// });
		// it('should be fail to add > 52 week * 4 years vesting entries', async function() {
		// 	// rewardEscrow.vest({from:account1});
		// });
	});

	describe.only('Transfering', async function() {
		it('should not allow transfer of synthetix in escrow', async function() {
			// Ensure the transfer fails as all the synthetix are in escrow
			await assert.revert(synthetix.transfer(account2, toUnit('1000'), { from: account1 }));
		});
	});
});
