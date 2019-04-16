const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const RewardEscrow = artifacts.require('RewardEscrow');
const SupplySchedule = artifacts.require('SupplySchedule');

const { currentTime, fastForward, toUnit, toPreciseUnit } = require('../utils/testUtils');

contract('Rewards Integration Tests', async function(accounts) {
	// const SECOND = 1000;
	const MINUTE = 1000 * 60;
	// const DAY = 86400;
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

	const [sUSD, sAUD, sEUR, sBTC, SNX] = ['sUSD', 'sAUD', 'sEUR', 'sBTC', 'SNX'].map(
		web3.utils.asciiToHex
	);

	// const half = amount => amount.div(web3.utils.toBN('2'));
	// const third = amount => amount.div(web3.utils.toBN('3'));
	// const threeQuarters = amount => amount.div(web3.utils.toBN('4')).mul(web3.utils.toBN('3'));

	const twentyPercent = toPreciseUnit('0.2');
	const twentyFivePercent = toPreciseUnit('0.25');
	const thirtyThreePercent = toPreciseUnit('0.33');
	const fortyPercent = toPreciseUnit('0.4');
	const fiftyPercent = toPreciseUnit('0.5');

	const [
		// deployerAccount,
		owner,
		oracle,
		feeAuthority,
		account1,
		account2,
		account3,
		// account4,
	] = accounts;

	let feePool,
		// FEE_ADDRESS,
		synthetix,
		exchangeRates,
		supplySchedule,
		rewardEscrow;
	// sUSDContract,
	// sAUDContract,
	// XDRContract;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		// exchangeRates = await ExchangeRates.deployed();
		// feePool = await FeePool.deployed();
		// FEE_ADDRESS = await feePool.FEE_ADDRESS();

		synthetix = await Synthetix.deployed();
		// sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		// sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		// XDRContract = await Synth.at(await synthetix.synths(XDR));

		supplySchedule = await SupplySchedule.deployed();
		rewardEscrow = await RewardEscrow.deployed();

		// Send a price update to guarantee we're not stale.
		await updateRatesWithDefaults();
	});

	describe('Debt ownership tests', async function() {
		let periodOneMintableSupply;

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

			// Get the SNX mintableSupply
			periodOneMintableSupply = await supplySchedule.mintableSupply();

			// Mint the staking rewards
			await synthetix.mint({ from: owner });
		});

		it('should assign accounts (1,2,3) to have (40%,40%,20%) of the debt/rewards', async function() {
			let vestingScheduleEntry;
			// Account 1&2 issue 10K USD in sBTC each, holding 50% of the total debt.
			const tenK = toUnit('10000');
			const sBTCAmount = synthetix.effectiveExchangeValue(sUSD, tenK, sBTC);
			await synthetix.issueSynths(sBTC, sBTCAmount, { from: account1 });
			await synthetix.issueSynths(sBTC, sBTCAmount, { from: account2 });

			await closeFeePeriod();

			// Assert 1, 2 have 50% each of the effectiveDebtRatioForPeriod
			const debtRatioAccount1 = await FeePool.effectiveDebtRatioForPeriod(account1, 1);
			const debtRatioAccount2 = await FeePool.effectiveDebtRatioForPeriod(account2, 1);
			assert.bnEqual(debtRatioAccount1, fiftyPercent);
			assert.bnEqual(debtRatioAccount2, fiftyPercent);

			// Both accounts claim rewards
			await feePool.claimFees({ from: account1 });
			await feePool.claimFees({ from: account2 });

			// Assert both accounts have 50% of the minted rewards in their initial escrow entry
			vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			assert.bnEqual(vestingScheduleEntry[1], periodOneMintableSupply.div(2));
			vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account2, 0);
			assert.bnEqual(vestingScheduleEntry[1], periodOneMintableSupply.div(2));

			// Increase BTC price by 50%
			const timestamp = await currentTime();
			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX, sBTC],
				['0.5', '1.25', '0.1', '6000'].map(toUnit),
				timestamp,
				{
					from: oracle,
				}
			);

			// Account 3 (enters the system and) mints 10K sUSD and should have 20% of the debt not 33.33%
			await synthetix.issueSynths(sUSD, tenK, { from: account1 });

			// Get the SNX mintableSupply for week 2
			const periodTwoMintableSupply = await supplySchedule.mintableSupply();

			// Mint the staking rewards
			await synthetix.mint({ from: owner });

			// Close so we can claim
			await closeFeePeriod();

			// Assert (1,2,3) have (40%,40%,20%) of the debt in the recently closed period
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account1, 1), fortyPercent);
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account2, 1), fortyPercent);
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account3, 1), twentyPercent);

			// All 3 accounts claim rewards
			await feePool.claimFees({ from: account1 });
			await feePool.claimFees({ from: account2 });
			await feePool.claimFees({ from: account3 });

			// Assert (1,2,3) have (40%,40%,20%) of the rewards
			vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 1);
			assert.bnEqual(vestingScheduleEntry[1], periodTwoMintableSupply.div(5).mul(2));

			vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account2, 1);
			assert.bnEqual(vestingScheduleEntry[1], periodTwoMintableSupply.div(5).mul(2));

			vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account3, 0); // Its this accounts first escrow entry
			assert.bnEqual(vestingScheduleEntry[1], periodTwoMintableSupply.div(5).mul(1));
		});

		it(
			'ctd now in p3 Acc1 burns all and leaves (-40%) and Acc2 has 67% and Acc3 33% rewards allocated as such'
		);
		it('p3: Acc1 mints 20K (40%) close p (40,40,20)');
		it('(Inverse) Issue sBTC then shift rate down 50% then calc rewards');
	});

	describe('3 accounts with 33.33% SNX all issue 10K sUSD each in p(0)', async function() {
		const tenK = toUnit('10000');
		const twentyK = toUnit('20000');

		beforeEach(async function() {
			// 3 Accounts issue 10K USD in sUSD each in p1
			await synthetix.issueSynths(sUSD, twentyK, { from: account1 });
			await synthetix.issueSynths(sUSD, twentyK, { from: account2 });
			await synthetix.issueSynths(sUSD, twentyK, { from: account3 });

			// Close p1
			await closeFeePeriod();

			// Assert Accounts have 33% each
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account1, 1), thirtyThreePercent);
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account2, 1), thirtyThreePercent);
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account3, 1), thirtyThreePercent);
		});

		it('p2 Acc1 Issues 20K sUSD should now has 50% debt/rewards Acc2&3 25%', async function() {
			// Acc 1 Issues another 20K sUSD
			await synthetix.issueSynths(sUSD, twentyK, { from: account1 });

			// Close p2
			await closeFeePeriod();

			// Assert Acc 1 has 50% debt
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account1, 1), fiftyPercent);

			// Assert Acc 2&3 has 25% debt each
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account2, 1), twentyFivePercent);
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account3, 1), twentyFivePercent);
		});

		it('p3 Acc1 Burns all then mints 10K, then mints 10K again should have debt/rewards 50%', async function() {
			// Acc 1 Issues 20K sUSD
			await synthetix.issueSynths(sUSD, twentyK, { from: account1 });

			// Close p2
			await closeFeePeriod();

			// Assert Acc 1 has 50% debt
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account1, 1), fiftyPercent);

			// Assert Acc 2&3 has 25% debt each
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account2, 1), twentyFivePercent);
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account3, 1), twentyFivePercent);

			// p3
			// Acc1 Burns all
			await synthetix.burnSynths(sUSD, twentyK, { from: account1 });
			// Acc 1 Issues 10K sUSD
			await synthetix.issueSynths(sUSD, tenK, { from: account1 });
			// Acc 1 Issues 10K sUSD
			await synthetix.issueSynths(sUSD, tenK, { from: account1 });

			// Close p3
			await closeFeePeriod();

			// Assert Acc 1 has 50% debt
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account1, 1), fiftyPercent);

			// Assert Acc 2&3 has 25% debt each
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account2, 1), twentyFivePercent);
			assert.bnEqual(await FeePool.effectiveDebtRatioForPeriod(account3, 1), twentyFivePercent);
		});

		it('duplicate previous tests but wait till end of 6 weeks claimable is the same', async function() {});
	});
	describe('accounts not claiming', async function() {
		it('Acc 1 doesnt claim and rewards roll over');
		it('ctd Acc2 & 3 should get the extra amount');
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

		describe('Rewards Claiming', async function() {
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
				assert.bnEqual(vestingScheduleEntry[1], mintableSupply.div(web3.utils.toBN('3')));

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
				const rewardsAmount = periodOneMintableSupply
					.div(web3.utils.toBN('3'))
					.add(periodTwoMintableSupply.div(web3.utils.toBN('2')));

				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account2, 0);
				assert.bnEqual(vestingScheduleEntry[1], rewardsAmount);

				vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account3, 0);
				assert.bnEqual(vestingScheduleEntry[1], rewardsAmount);
			});

			describe('c-ratio penalties', async function() {
				const half = amount => amount.div(web3.utils.toBN('2'));
				const third = amount => amount.div(web3.utils.toBN('3'));
				const threeQuarters = amount => amount.div(web3.utils.toBN('4')).mul(web3.utils.toBN('3'));

				let periodOneMintableSupply;

				beforeEach(async function() {
					// FastForward into the first mintable week
					await fastForward(WEEK + MINUTE);

					// Get the SNX mintableSupply
					periodOneMintableSupply = await supplySchedule.mintableSupply();

					// Mint the staking rewards
					await synthetix.mint({ from: owner });
				});

				it('should apply a penalty of 25% when users claim rewards between 22%-30% collateralisation ratio', async function() {
					let snxRewards;

					// We should have zero rewards available because the period is still open.
					[, snxRewards] = await feePool.feesAvailable(account1, sUSD);
					assert.bnEqual(snxRewards, 0);

					// Once the fee period is closed we should have 1/3 the rewards available because we have
					// 1/3 the collateral backing up the system.
					await closeFeePeriod();
					[, snxRewards] = await feePool.feesAvailable(account1, sUSD);
					assert.bnClose(snxRewards, third(periodOneMintableSupply));

					// But if the price of SNX decreases a bit...
					const newRate = (await exchangeRates.rateForCurrency(SNX)).sub(toUnit('0.01'));
					const timestamp = await currentTime();
					await exchangeRates.updateRates([SNX], [newRate], timestamp, {
						from: oracle,
					});

					// we will fall into the 22-30% bracket and lose 25% of those rewards.
					[, snxRewards] = await feePool.feesAvailable(account1, sUSD);
					assert.bnClose(snxRewards, threeQuarters(third(periodOneMintableSupply)));

					// And if we claim them
					await feePool.claimFees(sUSD, { from: account1 });

					// We should have our decreased rewards amount in escrow
					let vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
					assert.bnEqual(vestingScheduleEntry[1], threeQuarters(third(periodOneMintableSupply)));
				});

				it('should apply a penalty of 50% when users claim rewards between 30%-40% collateralisation ratio', async function() {
					let snxRewards;

					// We should have zero rewards available because the period is still open.
					[, snxRewards] = await feePool.feesAvailable(account1, sUSD);
					assert.bnEqual(snxRewards, 0);

					// Once the fee period is closed we should have 1/3 the rewards available because we have
					// 1/3 the collateral backing up the system.
					await closeFeePeriod();
					[, snxRewards] = await feePool.feesAvailable(account1, sUSD);
					assert.bnClose(snxRewards, third(periodOneMintableSupply));

					// But if the price of SNX decreases a bit...
					const newRate = (await exchangeRates.rateForCurrency(SNX)).sub(toUnit('0.045'));
					const timestamp = await currentTime();
					await exchangeRates.updateRates([SNX], [newRate], timestamp, {
						from: oracle,
					});

					// we will fall into the 30-40% bracket and lose 50% of those rewards.
					[, snxRewards] = await feePool.feesAvailable(account1, sUSD);
					assert.bnClose(snxRewards, half(third(periodOneMintableSupply)));

					// And if we claim them
					await feePool.claimFees(sUSD, { from: account1 });

					// We should have our decreased rewards amount in escrow
					let vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
					assert.bnEqual(vestingScheduleEntry[1], threeQuarters(third(periodOneMintableSupply)));
				});

				it(
					'should apply a penalty of 75% when users claim rewards between 40%-50% collateralisation ratio'
				);
				it(
					'should apply a penalty of 90% when users claim rewards between >50% collateralisation ratio'
				);
				it(
					'should apply a penalty of 100% when users claim rewards between >100% collateralisation ratio'
				);
			});
		});
	});
});
