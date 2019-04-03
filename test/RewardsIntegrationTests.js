const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const Synth = artifacts.require('Synth');
const RewardEscrow = artifacts.require('RewardEscrow');
const SupplySchedule = artifacts.require('SupplySchedule');

const { currentTime, fastForward, toUnit, ZERO_ADDRESS } = require('../utils/testUtils');

contract('Rewards Integration Tests', async function(accounts) {
	const SECOND = 1000;
	const MINUTE = 1000 * 60;
	const DAY = 86400;
	const WEEK = 604800;
	const YEAR = 31556926;

	// Updates rates with defaults so they're not stale.
	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC],
			['0.5', '1.25', '0.1', '4000'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	};

	const closeFeePeriod = async () => {
		const feePeriodDuration = await feePool.feePeriodDuration();
		await fastForward(feePeriodDuration);
		await feePool.closeCurrentFeePeriod({ from: feeAuthority });
		await updateRatesWithDefaults();
	};

	// const logFeePeriods = async () => {
	// 	const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

	// 	console.log('------------------');
	// 	for (let i = 0; i < length; i++) {
	// 		console.log(`Fee Period [${i}]:`);
	// 		const period = await feePool.recentFeePeriods(i);

	// 		for (const key of Object.keys(period)) {
	// 			if (isNaN(parseInt(key))) {
	// 				console.log(`  ${key}: ${period[key]}`);
	// 			}
	// 		}

	// 		console.log();
	// 	}
	// 	console.log('------------------');
	// };

	const [sUSD, sAUD, sEUR, sBTC, SNX, XDR] = ['sUSD', 'sAUD', 'sEUR', 'sBTC', 'SNX', 'XDR'].map(
		web3.utils.asciiToHex
	);

	const [
		deployerAccount,
		owner,
		oracle,
		feeAuthority,
		account1,
		account2,
		account3,
		account4,
	] = accounts;

	let feePool,
		FEE_ADDRESS,
		synthetix,
		exchangeRates,
		supplySchedule,
		rewardEscrow,
		sUSDContract,
		sAUDContract,
		XDRContract;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		FEE_ADDRESS = await feePool.FEE_ADDRESS();

		synthetix = await Synthetix.deployed();
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		XDRContract = await Synth.at(await synthetix.synths(XDR));

		supplySchedule = await SupplySchedule.deployed();
		rewardEscrow = await RewardEscrow.deployed();

		// Send a price update to guarantee we're not stale.
		await updateRatesWithDefaults();
	});

	describe('3 accounts with 33.33% SNX all issue MAX', async function() {
		beforeEach(async function() {
			// Fastforward a year into the staking rewards supply
			await fastForward(YEAR + MINUTE);

			// Send a price update to guarantee we're not stale.
			await updateRatesWithDefaults();

			// Assign 1/3 of total SNX to 3 accounts
			const thirdOfSNX = toUnit('33333333.3333333');
			await synthetix.transfer(account1, thirdOfSNX, { from: owner });
			await synthetix.transfer(account2, thirdOfSNX, { from: owner });
			await synthetix.transfer(account3, thirdOfSNX, { from: owner });

			// All accounts Issue MAX sUSD
			await synthetix.issueMaxSynths(sUSD, { from: account1 });
			await synthetix.issueMaxSynths(sUSD, { from: account2 });
			await synthetix.issueMaxSynths(sUSD, { from: account3 });
		});

		describe.only('Rewards Claiming', async function() {
			it('should allocate the 3 accounts a third of the rewards for 1 period', async function() {
				// FastForward into the first mintable week
				await fastForward(WEEK + MINUTE);

				// Get the SNX mintableSupply
				const mintableSupply = await supplySchedule.mintableSupply();

				// Mint the staking rewards
				await synthetix.mint({ from: owner });

				// Close Fee Period
				await feePool.closeCurrentFeePeriod({ from: feeAuthority });

				// All 3 accounts claim rewards
				await feePool.claimFees({ from: account1 });
				await feePool.claimFees({ from: account2 });
				await feePool.claimFees({ from: account3 });

				// All 3 accounts have 1/3 of the rewards
				let vestingScheduleEntry;
				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
				assert.bnEqual(vestingScheduleEntry[1], mintableSupply.div(3));

				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account2, 0);
				assert.bnEqual(vestingScheduleEntry[1], mintableSupply.div(3));

				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account3, 0);
				assert.bnEqual(vestingScheduleEntry[1], mintableSupply.div(3));
			});

			it('should mint SNX for the 6 fee periods then all 3 accounts claim at the end of the 6 week claimable period', async function() {
				const FEE_PERIOD_LENGTH = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

				for (let i = 0; i < FEE_PERIOD_LENGTH - 1; i++) {
					await closeFeePeriod();
				}

				// Get the SNX mintableSupply
				const mintableSupply = await supplySchedule.mintableSupply();

				// Mint the staking rewards
				await synthetix.mint({ from: owner });

				// All 3 accounts claim rewards
				await feePool.claimFees({ from: account1 });
				await feePool.claimFees({ from: account2 });
				await feePool.claimFees({ from: account3 });

				// All 3 accounts have 1/3 of the rewards
				let vestingScheduleEntry;
				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
				assert.bnEqual(vestingScheduleEntry[1], mintableSupply.div(web3.utils.toBN('3'));

				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account2, 0);
				assert.bnEqual(vestingScheduleEntry[1], mintableSupply.div(web3.utils.toBN('3')));

				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account3, 0);
				assert.bnEqual(vestingScheduleEntry[1], mintableSupply.div(web3.utils.toBN('3')));
			});

			it('should allocate correct SNX rewards as others leave the system', async function() {
				// FastForward into the first mintable week
				await fastForward(WEEK + MINUTE);

				// Get the SNX mintableSupply
				const periodOneMintableSupply = await supplySchedule.mintableSupply();

				// Mint the staking rewards
				await synthetix.mint({ from: owner });

				// Close Fee Period
				await feePool.closeCurrentFeePeriod({ from: feeAuthority });

				// Account1 claims but 2 & 3 dont
				await feePool.claimFees({ from: account1 });

				// All Account 1 has 1/3 of the rewards
				let vestingScheduleEntry;
				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
				assert.bnEqual(vestingScheduleEntry[1], periodOneMintableSupply.div(web3.utils.toBN('3')));

				// Account 1 leaves the system
				const burnableTotal = synthetix.debtBalanceOf(account1);
				synthetix.burnSynths(sUSD, burnableTotal);

				// Close the period after user leaves system
				closeFeePeriod();

				// Get the SNX mintableSupply
				const periodTwoMintableSupply = supplySchedule.mintableSupply();

				// Accounts 2 & 3 claim
				await feePool.claimFees({ from: account2 });
				await feePool.claimFees({ from: account3 });

				// Accounts 2 & 3 now have 33% of period 1 and 50% of period 2
				const rewardsAmount = periodOneMintableSupply.div(web3.utils.toBN('3')).add(periodTwoMintableSupply.div(web3.utils.toBN('2')));

				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account2, 0);
				assert.bnEqual(vestingScheduleEntry[1], rewardsAmount);

				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account3, 0);
				assert.bnEqual(vestingScheduleEntry[1], rewardsAmount);
			});

			describe('c-ratio penalties', async function() {
				const third = amount => amount.div(web3.utils.toBN('3'));
				const periodOneMintableSupply;

				beforeEach(async function() {
					// FastForward into the first mintable week
					await fastForward(WEEK + MINUTE);

					// Get the SNX mintableSupply
					periodOneMintableSupply = await supplySchedule.mintableSupply();
	
					// Mint the staking rewards
					await synthetix.mint({ from: owner });
				});
				
				it('should apply a penalty of 25% when users claim rewards between 22%-30% collateralisation ratio', async function() {
					const threeQuarters = amount => amount.div(web3.utils.toBN('4')).mul(web3.utils.toBN('3'));
					let synthFees, snxRewards;

					// We should have zero rewards available because the period is still open.
					(synthFees, snxRewards) = await feePool.feesAvailable(account1, sUSD);
					assert.bnEqual(snxRewards, 0);
			
					// Once the fee period is closed we should have 1/3 the rewards available because we have
					// 1/3 the collateral backing up the system.
					await closeFeePeriod();
					(synthFees, snxRewards) = await feePool.feesAvailable(account1, sUSD);
					assert.bnClose(snxRewards, third(periodOneMintableSupply));
			
					// But if the price of SNX decreases a bit...
					const newRate = (await exchangeRates.rateForCurrency(SNX)).sub(toUnit('0.01'));
					const timestamp = await currentTime();
					await exchangeRates.updateRates([SNX], [newRate], timestamp, {
						from: oracle,
					});
					
					// we will fall into the 22-30% bracket and lose 25% of those rewards.
					(synthFees, snxRewards) = await feePool.feesAvailable(account1, sUSD);
					assert.bnClose(
						snxRewards,
						threeQuarters(third(periodOneMintableSupply))
					);
			
					// And if we claim them
					await feePool.claimFees(sUSD, { from: account1 });
			
					// We should have our decreased rewards amount in escrow
					vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
					assert.bnEqual(vestingScheduleEntry[1], threeQuarters(third(periodOneMintableSupply)));
				});

				it('should apply a penalty of 50% when users claim rewards between 30%-40% collateralisation ratio', async function() {
					const half = amount => amount.div(web3.utils.toBN('2'));
					let synthFees, snxRewards;

					// We should have zero rewards available because the period is still open.
					(synthFees, snxRewards) = await feePool.feesAvailable(account1, sUSD);
					assert.bnEqual(snxRewards, 0);
			
					// Once the fee period is closed we should have 1/3 the rewards available because we have
					// 1/3 the collateral backing up the system.
					await closeFeePeriod();
					(synthFees, snxRewards) = await feePool.feesAvailable(account1, sUSD);
					assert.bnClose(snxRewards, third(periodOneMintableSupply));
			
					// But if the price of SNX decreases a bit...
					const newRate = (await exchangeRates.rateForCurrency(SNX)).sub(toUnit('0.045'));
					const timestamp = await currentTime();
					await exchangeRates.updateRates([SNX], [newRate], timestamp, {
						from: oracle,
					});
					
					// we will fall into the 30-40% bracket and lose 50% of those rewards.
					(synthFees, snxRewards) = await feePool.feesAvailable(account1, sUSD);
					assert.bnClose(
						snxRewards,
						half(third(periodOneMintableSupply))
					);
			
					// And if we claim them
					await feePool.claimFees(sUSD, { from: account1 });
			
					// We should have our decreased rewards amount in escrow
					vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
					assert.bnEqual(vestingScheduleEntry[1], threeQuarters(third(periodOneMintableSupply)));
				});

				it('should apply a penalty of 75% when users claim rewards between 40%-50% collateralisation ratio');
				it('should apply a penalty of 90% when users claim rewards between >50% collateralisation ratio');
				it('should apply a penalty of 100% when users claim rewards between >100% collateralisation ratio');
			});
		});
	});
});