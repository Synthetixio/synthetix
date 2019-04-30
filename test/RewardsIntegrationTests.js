const FeePool = artifacts.require('FeePool');
const FeePoolState = artifacts.require('FeePoolState');
const Synthetix = artifacts.require('Synthetix');
const RewardEscrow = artifacts.require('RewardEscrow');
const SupplySchedule = artifacts.require('SupplySchedule');
const ExchangeRates = artifacts.require('ExchangeRates');
const { getWeb3, getContractInstance } = require('../utils/web3Helper');

const { currentTime, fastForward, toUnit, toPreciseUnit } = require('../utils/testUtils');
const web3 = getWeb3();
const getInstance = getContractInstance(web3);

contract('Rewards Integration Tests', async accounts => {
	// Updates rates with defaults so they're not stale.
	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC],
			['0.5', '1.25', '0.1', '5000'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	};

	const closeFeePeriodAndFastForward = async () => {
		const feePeriodDuration = await feePool.feePeriodDuration();
		await fastForward(feePeriodDuration);
		await feePool.closeCurrentFeePeriod({ from: feeAuthority });
		await updateRatesWithDefaults();
	};

	const fastForwardAndUpdateRates = async seconds => {
		await fastForward(seconds);
		await updateRatesWithDefaults();
	};

	const logFeePeriods = async () => {
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

		console.log('------------------');
		for (let i = 0; i < length; i++) {
			console.log(`Fee Period [${i}]:`);
			const period = await feePool.recentFeePeriods(i);

			for (const key of Object.keys(period)) {
				if (isNaN(parseInt(key))) {
					console.log(`  ${key}: ${period[key]}`);
				}
			}

			console.log();
		}
		console.log('------------------');
	};

	const logFeesByPeriod = async account => {
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();
		const feesByPeriod = await feePoolWeb3.methods.feesByPeriod(account).call();

		console.log('---------------------feesByPeriod----------------------');
		console.log('Account', account);
		for (let i = 0; i < length; i++) {
			console.log(`Fee Period[${i}] Fees: ${feesByPeriod[i][0]} Rewards: ${feesByPeriod[i][1]}`);
		}
		console.log('--------------------------------------------------------');
	};

	// CURRENCIES
	const [sUSD, sAUD, sEUR, sBTC, SNX] = ['sUSD', 'sAUD', 'sEUR', 'sBTC', 'SNX'].map(
		web3.utils.asciiToHex
	);

	// DIVISIONS
	const half = amount => amount.div(web3.utils.toBN('2'));
	const third = amount => amount.div(web3.utils.toBN('3'));
	const threeQuarters = amount => amount.div(web3.utils.toBN('4')).mul(web3.utils.toBN('3'));
	const quarter = amount => amount.div(web3.utils.toBN('4'));
	const tenth = amount => amount.div(web3.utils.toBN('10'));

	// PERCENTAGES
	// const twentyPercent = toPreciseUnit('0.2');
	const twentyFivePercent = toPreciseUnit('0.25');
	const thirtyThreePercent = toPreciseUnit('0.333333333333333333333333333');
	// const fortyPercent = toPreciseUnit('0.4');
	const fiftyPercent = toPreciseUnit('0.5');

	// TIME IN SECONDS
	const SECOND = 1000;
	const MINUTE = SECOND * 60;
	// const HOUR = MINUTE * 60;
	// const DAY = 86400;
	const WEEK = 604800;
	const YEAR = 31556926;

	// ACCOUNTS
	const [
		deployerAccount,
		owner,
		oracle,
		feeAuthority,
		account1,
		account2,
		account3,
		// account4,
	] = accounts;

	// VARIABLES
	let feePool,
		feePoolWeb3,
		feePoolState,
		synthetix,
		// sUSDContract,
		exchangeRates,
		supplySchedule,
		rewardEscrow,
		periodOneMintableSupplyMinusMinterReward;

	// CONSTANTS
	const MINTER_SNX_REWARD = toUnit('200');

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		feePoolWeb3 = getInstance(FeePool);
		feePoolState = await FeePoolState.deployed();
		synthetix = await Synthetix.deployed();
		// sUSDContract = await Synth.at(await synthetix.synths(sUSD));

		supplySchedule = await SupplySchedule.deployed();
		rewardEscrow = await RewardEscrow.deployed();

		// Fastforward a year into the staking rewards supply
		console.log('Fastforward a year into the staking rewards supply');
		await fastForwardAndUpdateRates(YEAR + MINUTE);

		// Assign 1/3 of total SNX to 3 accounts
		console.log('Assign 1/3 of total SNX to 3 accounts');
		const snxTotalSupply = await synthetix.totalSupply();
		console.log('snxTotalSupply', snxTotalSupply.toString());
		const thirdOfSNX = third(snxTotalSupply);
		console.log('thirdOfSNX', thirdOfSNX.toString());

		await synthetix.transfer(account1, thirdOfSNX, { from: owner });
		await synthetix.transfer(account2, thirdOfSNX, { from: owner });
		await synthetix.transfer(account3, thirdOfSNX, { from: owner });

		const balanceOfOwner = await synthetix.balanceOf(owner, { from: owner });
		console.log('balanceOfOwner', balanceOfOwner.toString());

		// Get the SNX mintableSupply
		periodOneMintableSupplyMinusMinterReward = (await supplySchedule.mintableSupply()).sub(
			MINTER_SNX_REWARD
		);
		console.log(
			'periodOneMintableSupplyMinusMinterReward',
			periodOneMintableSupplyMinusMinterReward.toString()
		);

		// Mint the staking rewards
		console.log('Mint the staking rewards');
		await synthetix.mint({ from: owner });
	});

	describe('3 accounts with 33.33% SNX all issue MAX and claim rewards', async () => {
		beforeEach(async () => {
			console.log('3 Accounts issueMaxSynths in p1');
			await synthetix.issueMaxSynths(sUSD, { from: account1 });
			await synthetix.issueMaxSynths(sUSD, { from: account2 });
			await synthetix.issueMaxSynths(sUSD, { from: account3 });
		});

		it('should allocate the 3 accounts a third of the rewards for 1 period', async () => {
			// Close Fee Period
			console.log('Close Fee Period');
			await closeFeePeriodAndFastForward();

			// All 3 accounts claim rewards
			await feePool.claimFees(sUSD, { from: account1 });
			await feePool.claimFees(sUSD, { from: account2 });
			await feePool.claimFees(sUSD, { from: account3 });

			// All 3 accounts have 1/3 of the rewards
			const accOneEscrowed = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			assert.bnEqual(accOneEscrowed[1], third(periodOneMintableSupplyMinusMinterReward));

			const accTwoEscrowed = await rewardEscrow.getVestingScheduleEntry(account2, 0);
			assert.bnEqual(accTwoEscrowed[1], third(periodOneMintableSupplyMinusMinterReward));

			const accThreeEscrowed = await rewardEscrow.getVestingScheduleEntry(account3, 0);
			assert.bnEqual(accThreeEscrowed[1], third(periodOneMintableSupplyMinusMinterReward));
		});

		it('should mint SNX for the 6 fee periods then all 3 accounts claim at the end of the 6 week claimable period', async () => {
			// Close all six periods
			const FEE_PERIOD_LENGTH = (await feePool.FEE_PERIOD_LENGTH()).toNumber();
			for (let i = 0; i <= FEE_PERIOD_LENGTH - 1; i++) {
				await closeFeePeriodAndFastForward();
			}

			// Get the SNX mintableSupply - the minter reward of 200 SNX
			const mintedRewardsSupply = (await supplySchedule.mintableSupply()).sub(MINTER_SNX_REWARD);

			// Mint the staking rewards
			await synthetix.mint({ from: owner });

			// FastForward into the next week to be able to Close Fee Period
			await fastForwardAndUpdateRates(WEEK + MINUTE);

			// Close Fee Period
			await feePool.closeCurrentFeePeriod({ from: feeAuthority });

			// All 3 accounts claim rewards
			await feePool.claimFees(sUSD, { from: account1 });
			await feePool.claimFees(sUSD, { from: account2 });
			await feePool.claimFees(sUSD, { from: account3 });

			// All 3 accounts have 1/3 of the rewards
			const accOneEscrowed = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			assert.bnClose(accOneEscrowed[1], third(mintedRewardsSupply), '1');

			const accTwoEscrowed = await rewardEscrow.getVestingScheduleEntry(account2, 0);
			assert.bnClose(accTwoEscrowed[1], third(mintedRewardsSupply), '1');

			const accThreeEscrowed = await rewardEscrow.getVestingScheduleEntry(account3, 0);
			assert.bnClose(accThreeEscrowed[1], third(mintedRewardsSupply), '1');
		});

		it('should allocate correct SNX rewards as others leave the system', async () => {
			// Close Fee Period
			console.log('Close Fee Period');
			await closeFeePeriodAndFastForward();

			// Account1 claims but 2 & 3 dont
			await feePool.claimFees(sUSD, { from: account1 });

			// All Account 1 has 1/3 of the rewards escrowed
			const account1Escrowed = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			assert.bnClose(account1Escrowed[1], third(periodOneMintableSupplyMinusMinterReward), 1);

			// Account 1 leaves the system
			const burnableTotal = await synthetix.debtBalanceOf(account1, sUSD);
			await synthetix.burnSynths(sUSD, burnableTotal, { from: account1 });

			// FastForward into the second mintable week
			await fastForwardAndUpdateRates(WEEK + MINUTE);

			// Get the SNX mintableSupply for period 2
			const period2MintedRewardsSupply = (await supplySchedule.mintableSupply()).sub(
				MINTER_SNX_REWARD
			);

			// Mint the staking rewards for p2
			await synthetix.mint({ from: owner });

			// Close the period after user leaves system
			closeFeePeriodAndFastForward();

			// Account1 Reenters in current unclosed period so no rewards yet
			// await synthetix.issueMaxSynths(sUSD, { from: account1 });

			// Accounts 2 & 3 now have 33% of period 1 and 50% of period 2
			// console.log('33% of p1', third(periodOneMintableSupplyMinusMinterReward).toString());
			// console.log('50% of p2', half(period2MintedRewardsSupply).toString());
			const rewardsAmount = third(periodOneMintableSupplyMinusMinterReward).add(
				half(period2MintedRewardsSupply)
			);
			// console.log('rewardsAmount calculated', rewardsAmount.toString());

			await logFeePeriods();

			// Check account2 has correct rewardsAvailable
			const account2Rewards = await feePool.feesAvailable(account2, sUSD);
			// console.log('account2Rewards', rewardsAmount.toString(), account2Rewards[1].toString());
			assert.bnClose(account2Rewards[1], rewardsAmount, '1');

			// Check account3 has correct rewardsAvailable
			const account3Rewards = await feePool.feesAvailable(account3, sUSD);
			// console.log('rewardsAvailable', rewardsAmount.toString(), account3Rewards[1].toString());
			assert.bnClose(account3Rewards[1], rewardsAmount, '1');

			// Accounts 2 & 3 claim
			await feePool.claimFees(sUSD, { from: account2 });
			// updateRatesWithDefaults();
			await feePool.claimFees(sUSD, { from: account3 });

			// Accounts 2 & 3 now have the rewards escrowed
			const account2Escrowed = await rewardEscrow.getVestingScheduleEntry(account2, 0);
			// console.log('account2Escrowed[1]', account2Escrowed[1].toString());
			assert.bnClose(account2Escrowed[1], rewardsAmount, '1');
			const account3Escrowed = await rewardEscrow.getVestingScheduleEntry(account3, 0);
			// console.log('account3Escrowed[1]', account2Escrowed[1].toString());
			assert.bnClose(account3Escrowed[1], rewardsAmount, '1');
		});
	});

	describe('Accounts not claiming', async () => {
		it('Acc 1 doesnt claim and rewards should roll over');
		it('ctd Acc2 & 3 should get the extra amount');
	});

	describe('Exchange Rate Shift tests', async () => {
		it('should assign accounts (1,2,3) to have (40%,40%,20%) of the debt/rewards', async () => {
			// Account 1&2 issue 10K USD in sBTC each, holding 50% of the total debt.
			const tenK = toUnit('10000');
			const sBTCAmount = await synthetix.effectiveValue(sUSD, tenK, sBTC);
			// console.log('sBTCAmount', sBTCAmount.toString());
			await synthetix.issueSynths(sBTC, sBTCAmount, { from: account1 });
			await synthetix.issueSynths(sBTC, sBTCAmount, { from: account2 });
			// await synthetix.issueSynths(sUSD, toUnit('1'), { from: account3 });

			await closeFeePeriodAndFastForward();

			// Assert 1, 2 have 50% each of the effectiveDebtRatioForPeriod
			const debtRatioAccount1 = await feePool.effectiveDebtRatioForPeriod(account1, 1);
			// console.log('debtRatioAccount1', debtRatioAccount1.toString());
			const debtRatioAccount2 = await feePool.effectiveDebtRatioForPeriod(account2, 1);
			// console.log('debtRatioAccount2', debtRatioAccount1.toString());

			assert.bnEqual(debtRatioAccount1, fiftyPercent);
			assert.bnEqual(debtRatioAccount2, fiftyPercent);

			// Accounts 1&2 claim rewards
			await feePool.claimFees(sUSD, { from: account1 });
			await feePool.claimFees(sUSD, { from: account2 });

			// Assert Accounts 1&2 have 50% of the minted rewards in their initial escrow entry
			const account1Escrow = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			console.log('account1Escrow[1]', account1Escrow[1].toString());
			// assert.bnClose(account1Escrow[1], half(periodOneMintableSupplyMinusMinterReward), 1);

			const account2Escrow = await rewardEscrow.getVestingScheduleEntry(account2, 0);
			console.log('account2Escrow[1]', account2Escrow[1].toString());
			// assert.bnClose(account2Escrow[1], half(periodOneMintableSupplyMinusMinterReward), 1);

			// Increase sBTC price by 100%
			const timestamp = await currentTime();
			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX, sBTC],
				['0.5', '1.25', '0.1', '10000'].map(toUnit),
				timestamp,
				{
					from: oracle,
				}
			);

			// Account 3 (enters the system and) mints 10K sUSD and should have 20% of the debt not 33.33%
			await synthetix.issueSynths(sUSD, toUnit('5000'), { from: account3 });

			// Get the SNX mintableSupply for week 2
			const periodTwoMintableSupply = (await supplySchedule.mintableSupply()).sub(
				MINTER_SNX_REWARD
			);

			// Mint the staking rewards
			await synthetix.mint({ from: owner });

			// Do some exchanging to generateFees
			await synthetix.exchange(sBTC, sBTCAmount, sUSD, account1, { from: account1 });
			await synthetix.exchange(sBTC, sBTCAmount, sUSD, account2, { from: account2 });

			// Close so we can claim
			await closeFeePeriodAndFastForward();

			await logFeePeriods();

			// Assert (1,2,3) have (40%,40%,20%) of the debt in the recently closed period
			const acc1Ownership = await feePool.effectiveDebtRatioForPeriod(account1, 1);
			const acc2Ownership = await feePool.effectiveDebtRatioForPeriod(account2, 1);
			const acc3Ownership = await feePool.effectiveDebtRatioForPeriod(account3, 1);
			console.log('Account1.effectiveDebtRatioForPeriod', acc1Ownership.toString());
			console.log('Account2.effectiveDebtRatioForPeriod', acc2Ownership.toString());
			console.log('Account3.effectiveDebtRatioForPeriod', acc3Ownership.toString());
			// assert.bnClose(acc1Ownership, fortyPercent, '5500');
			// assert.bnClose(acc2Ownership, fortyPercent, '5500');
			// assert.bnClose(acc3Ownership, twentyPercent, '89000');

			await logFeesByPeriod(account1);
			await logFeesByPeriod(account2);
			await logFeesByPeriod(account3);

			const account3Rewards = await feePool.feesAvailable(account3, sUSD, { from: account3 });
			console.log('account3Rewards', account3Rewards[1].toString());

			// feePoolState.applicableIssuanceData(account3, closingDebtIndex);

			// All 3 accounts claim rewards
			await feePool.claimFees(sUSD, { from: account1 });
			const rewardsToDistributeAfter1Claim = await feePool.recentFeePeriods(1);
			console.log(
				'rewardsToDistributeAfter1Claim',
				rewardsToDistributeAfter1Claim.rewardsClaimed.toString()
			);
			await feePool.claimFees(sUSD, { from: account2 });
			const rewardsToDistributeAfter2Claim = await feePool.recentFeePeriods(1);
			console.log(
				'rewardsToDistributeAfter2Claim',
				rewardsToDistributeAfter2Claim.rewardsClaimed.toString()
			);
			const remainingRewards = rewardsToDistributeAfter2Claim.rewardsToDistribute.sub(
				rewardsToDistributeAfter2Claim.rewardsClaimed
			);
			console.log('remainingRewards', remainingRewards.toString());

			const account3IssuanceData = await feePoolState.accountIssuanceLedger(account3, 0, {
				from: account3,
			});
			console.log('account3IssuanceData.debtRatio', account3IssuanceData[0].toString());
			console.log('account3IssuanceData.debtEntryIndex', account3IssuanceData[1].toString());

			const account3IssuanceData2 = await feePoolState.accountIssuanceLedger(account3, 1, {
				from: account3,
			});
			console.log('account3IssuanceData2.debtRatio', account3IssuanceData2[0].toString());
			console.log('account3IssuanceData2.debtEntryIndex', account3IssuanceData2[1].toString());

			await logFeePeriods();

			await feePool.claimFees(sUSD, { from: account3 }); // revert No fees or rewards available for period, or fees already claimed

			// Assert (1,2,3) have (40%,40%,20%) of the rewards
			const account1EscrowEntry2 = await rewardEscrow.getVestingScheduleEntry(account1, 1);
			console.log('account1EscrowEntry2[1]', account1EscrowEntry2[1].toString());
			const account2EscrowEntry2 = await rewardEscrow.getVestingScheduleEntry(account2, 1);
			console.log('account2EscrowEntry2[1]', account2EscrowEntry2[1].toString());
			const account3EscrowEntry1 = await rewardEscrow.getVestingScheduleEntry(account3, 0); // Its this accounts first escrow entry
			console.log('account3EscrowEntry1[1]', account3EscrowEntry1[1].toString());

			assert.bnEqual(
				account1EscrowEntry2[1],
				periodTwoMintableSupply.div(web3.utils.toBN('4')).mul(web3.utils.toBN('2'))
			);
			assert.bnEqual(
				account2EscrowEntry2[1],
				periodTwoMintableSupply.div(web3.utils.toBN('4')).mul(web3.utils.toBN('2'))
			);
			assert.bnEqual(
				account3EscrowEntry1[1],
				periodTwoMintableSupply.div(web3.utils.toBN('4')).mul(web3.utils.toBN('1'))
			);
		});

		it(
			'ctd now in p3 Acc1 burns all and leaves (-40%) and Acc2 has 67% and Acc3 33% rewards allocated as such'
		);
		it('p3: Acc1 mints 20K (40%) close p (40,40,20)');
		it('(Inverse) Issue sBTC then shift rate down 50% then calc rewards');
	});

	describe('3 Accounts issue 10K sUSD each in p(1)', async () => {
		const tenK = toUnit('10000');
		const twentyK = toUnit('20000');

		beforeEach(async () => {
			console.log('3 Accounts issue 10K USD in sUSD each in p1');
			await synthetix.issueSynths(sUSD, tenK, { from: account1 });
			await synthetix.issueSynths(sUSD, tenK, { from: account2 });
			await synthetix.issueSynths(sUSD, tenK, { from: account3 });

			// Close p1
			console.log('Close p1');
			await closeFeePeriodAndFastForward();
		});
		it('Assert Accounts have 33% ownership each', async () => {
			// assert.bnClose(await feePool.effectiveDebtRatioForPeriod(account1, 1), thirtyThreePercent);
			const account1Ownership = await feePool.effectiveDebtRatioForPeriod(account1, 1);
			// console.log('account1Ownership', account1Ownership.toString());
			// const account1DebtBalanceOf = await synthetix.debtBalanceOf(account1, sUSD);
			// console.log('account1DebtBalanceOf', account1DebtBalanceOf.toString());
			assert.bnClose(account1Ownership, thirtyThreePercent, 48611); // Rounding to 27 places

			// assert.bnClose(await feePool.effectiveDebtRatioForPeriod(account2, 1), thirtyThreePercent);
			const account2Ownership = await feePool.effectiveDebtRatioForPeriod(account2, 1);
			// console.log('account2Ownership', account2Ownership.toString());
			// const account2DebtBalanceOf = await synthetix.debtBalanceOf(account2, sUSD);
			// console.log('account2DebtBalanceOf', account2DebtBalanceOf.toString());
			assert.bnClose(account2Ownership, thirtyThreePercent, 48611); // Rounding to 27 places
			// assert.bnClose(await feePool.effectiveDebtRatioForPeriod(account3, 1), thirtyThreePercent);
			const account3Ownership = await feePool.effectiveDebtRatioForPeriod(account3, 1);
			// console.log('account3Ownership', account3Ownership.toString());
			// const account3DebtBalanceOf = await synthetix.debtBalanceOf(account3, sUSD);
			// console.log('account3DebtBalanceOf', account3DebtBalanceOf.toString());
			assert.bnClose(account3Ownership, thirtyThreePercent, 30555); // Rounding to 27 places
		});
		it('p2 Acc1 Issues 20K sUSD should now have 50% debt/rewards, Acc2&3 now 25%', async () => {
			// Acc 1 Issues another 20K sUSD
			console.log('Acc 1 Issues another 20K sUSD');
			await synthetix.issueSynths(sUSD, twentyK, { from: account1 });

			// Close p2
			console.log('Close p2');
			await closeFeePeriodAndFastForward();

			// Assert Acc 1 has 50% debt
			const acc1Ownership = await feePool.effectiveDebtRatioForPeriod(account1, 1);
			console.log('Assert Acc 1 has 50% debt', acc1Ownership.toString()); // 60
			// assert.bnEqual(acc1Ownership, fiftyPercent);

			// Assert Acc 2&3 has 25% debt each
			const acc2Ownership = await feePool.effectiveDebtRatioForPeriod(account2, 1);
			const acc3Ownership = await feePool.effectiveDebtRatioForPeriod(account3, 1);
			console.log('Assert Acc 2&3 has 25% debt each', acc2Ownership.toString());
			assert.bnEqual(acc2Ownership, twentyFivePercent); // 20
			assert.bnEqual(acc3Ownership, twentyFivePercent); // 20
		});

		it('p3 Acc1 Burns all then mints 10K, then mints 10K again should have debt/rewards 50%', async () => {
			// Acc 1 Issues 20K sUSD
			await synthetix.issueSynths(sUSD, twentyK, { from: account1 });

			// Close p2
			await closeFeePeriodAndFastForward();

			// Assert Acc 1 has 50% debt
			assert.bnEqual(await feePool.effectiveDebtRatioForPeriod(account1, 1), fiftyPercent);

			// Assert Acc 2&3 has 25% debt each
			assert.bnEqual(await feePool.effectiveDebtRatioForPeriod(account2, 1), twentyFivePercent);
			assert.bnEqual(await feePool.effectiveDebtRatioForPeriod(account3, 1), twentyFivePercent);

			// p3
			// Acc1 Burns all
			await synthetix.burnSynths(sUSD, twentyK, { from: account1 });
			// Acc 1 Issues 10K sUSD
			await synthetix.issueSynths(sUSD, tenK, { from: account1 });
			// Acc 1 Issues 10K sUSD
			await synthetix.issueSynths(sUSD, tenK, { from: account1 });

			// Close p3
			await closeFeePeriodAndFastForward();

			// Assert Acc 1 has 50% debt
			const acc1Ownership = await feePool.effectiveDebtRatioForPeriod(account1, 1);
			console.log('Assert Acc 1 has 50% debt', acc1Ownership.toString());
			assert.bnEqual(acc1Ownership, fiftyPercent);

			// Assert Acc 2&3 has 25% debt each
			const acc2Ownership = await feePool.effectiveDebtRatioForPeriod(account2, 1);
			const acc3Ownership = await feePool.effectiveDebtRatioForPeriod(account3, 1);
			console.log('Assert Acc 2&3 has 25% debt each', acc2Ownership.toString());
			assert.bnEqual(acc2Ownership, twentyFivePercent);
			assert.bnEqual(acc3Ownership, twentyFivePercent);
		});

		it('should duplicate previous tests but wait till end of 6 weeks claimable is the same');
	});

	describe('Collateralisation Ratio Penalties', async () => {
		beforeEach(async () => {
			// console.log('3 accounts issueMaxSynths in p1');
			await synthetix.issueMaxSynths(sUSD, { from: account1 });
			await synthetix.issueMaxSynths(sUSD, { from: account2 });
			await synthetix.issueMaxSynths(sUSD, { from: account3 });

			// We should have zero rewards available because the period is still open.
			const rewardsBefore = await feePool.feesAvailable(account1, sUSD);
			assert.bnEqual(rewardsBefore[1], 0);

			// Once the fee period is closed we should have 1/3 the rewards available because we have
			// 1/3 the collateral backing up the system.
			await closeFeePeriodAndFastForward();
			const rewardsAfter = await feePool.feesAvailable(account1, sUSD);
			// console.log('rewardsAfter', rewardsAfter[1].toString());
			assert.bnEqual(rewardsAfter[1], third(periodOneMintableSupplyMinusMinterReward));
		});

		it('should apply a penalty of 25% when users claim rewards between 22%-30% collateralisation ratio', async () => {
			// But if the price of SNX decreases a bit...
			const newRate = (await exchangeRates.rateForCurrency(SNX)).sub(toUnit('0.01'));
			const timestamp = await currentTime();
			await exchangeRates.updateRates([SNX], [newRate], timestamp, {
				from: oracle,
			});

			// we will fall into the 22-30% bracket
			const feePenalty = await feePool.currentPenalty(account1);
			assert.bnEqual(feePenalty, toUnit('0.25'));

			// and lose 25% of those rewards.
			const snxRewardsPenalized = await feePool.feesAvailable(account1, sUSD);
			assert.bnClose(
				snxRewardsPenalized[1],
				threeQuarters(third(periodOneMintableSupplyMinusMinterReward))
			);

			// And if we claim them
			await feePool.claimFees(sUSD, { from: account1 });

			// We should have our decreased rewards amount in escrow
			const vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			assert.bnClose(
				vestingScheduleEntry[1],
				threeQuarters(third(periodOneMintableSupplyMinusMinterReward)),
				2
			);
		});

		it('should apply a penalty of 50% when users claim rewards between 30%-40% collateralisation ratio', async () => {
			// But if the price of SNX decreases a bit...
			const newRate = (await exchangeRates.rateForCurrency(SNX)).sub(toUnit('0.045'));
			const timestamp = await currentTime();
			await exchangeRates.updateRates([SNX], [newRate], timestamp, {
				from: oracle,
			});

			// we will fall into the 30-40% bracket
			const feePenalty = await feePool.currentPenalty(account1);
			assert.bnEqual(feePenalty, toUnit('0.5'));

			// and lose 50% of those rewards.
			const snxRewardsPenalized = await feePool.feesAvailable(account1, sUSD);
			assert.bnClose(snxRewardsPenalized[1], half(third(periodOneMintableSupplyMinusMinterReward)));

			// And if we claim them
			await feePool.claimFees(sUSD, { from: account1 });

			// We should have our decreased rewards amount in escrow
			const vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			assert.bnClose(
				vestingScheduleEntry[1],
				half(third(periodOneMintableSupplyMinusMinterReward))
			);
		});

		it('should apply a penalty of 75% when users claim rewards between 40%-50% collateralisation ratio', async () => {
			// But if the price of SNX decreases a bit...
			const newRate = (await exchangeRates.rateForCurrency(SNX)).sub(toUnit('0.06'));
			const timestamp = await currentTime();
			await exchangeRates.updateRates([SNX], [newRate], timestamp, {
				from: oracle,
			});

			// we will fall into the 40-50%  bracket
			const feePenalty = await feePool.currentPenalty(account1);
			assert.bnEqual(feePenalty, toUnit('0.75'));

			// and lose 75% of those rewards.
			const snxRewardsPenalized = await feePool.feesAvailable(account1, sUSD);
			assert.bnClose(
				snxRewardsPenalized[1],
				quarter(third(periodOneMintableSupplyMinusMinterReward))
			);

			// And if we claim them
			await feePool.claimFees(sUSD, { from: account1 });

			// We should have our decreased rewards amount in escrow
			const vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			assert.bnClose(
				vestingScheduleEntry[1],
				quarter(third(periodOneMintableSupplyMinusMinterReward))
			);
		});
		it('should apply a penalty of 90% when users claim rewards between >50% collateralisation ratio', async () => {
			// But if the price of SNX decreases quite a bit...
			const newRate = (await exchangeRates.rateForCurrency(SNX)).sub(toUnit('0.08'));
			const timestamp = await currentTime();
			await exchangeRates.updateRates([SNX], [newRate], timestamp, {
				from: oracle,
			});

			// we will fall into the >50% bracket
			const feePenalty = await feePool.currentPenalty(account1);
			assert.bnEqual(feePenalty, toUnit('0.9'));

			// and lose 90% of those rewards.
			const snxRewardsPenalized = await feePool.feesAvailable(account1, sUSD);
			assert.bnClose(
				snxRewardsPenalized[1],
				tenth(third(periodOneMintableSupplyMinusMinterReward))
			);

			// And if we claim them
			await feePool.claimFees(sUSD, { from: account1 });

			// We should have our decreased rewards amount in escrow
			const vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			assert.bnClose(
				vestingScheduleEntry[1],
				tenth(third(periodOneMintableSupplyMinusMinterReward))
			);
		});
		it('should apply a penalty of 100% when users claim rewards between >100% collateralisation ratio', async () => {
			// But if the price of SNX decreases a lot...
			const newRate = (await exchangeRates.rateForCurrency(SNX)).sub(toUnit('0.09'));
			const timestamp = await currentTime();
			await exchangeRates.updateRates([SNX], [newRate], timestamp, {
				from: oracle,
			});

			// we will fall into the >100% bracket
			const feePenalty = await feePool.currentPenalty(account1);
			assert.bnEqual(feePenalty, toUnit('1'));

			// and lose 100% of those rewards.
			const snxRewardsPenalized = await feePool.feesAvailable(account1, sUSD);
			assert.bnClose(snxRewardsPenalized[1], toUnit('0'));

			// And if we claim then it should revert as there is nothing to claim
			await assert.revert(feePool.claimFees(sUSD, { from: account1 }));
		});
	});
});
