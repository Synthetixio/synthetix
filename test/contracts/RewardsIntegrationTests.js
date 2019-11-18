const FeePool = artifacts.require('FeePool');
// const FeePoolState = artifacts.require('FeePoolState');
const Synthetix = artifacts.require('Synthetix');
const Synth = artifacts.require('Synth');
const RewardEscrow = artifacts.require('RewardEscrow');
const SupplySchedule = artifacts.require('SupplySchedule');
const ExchangeRates = artifacts.require('ExchangeRates');
const { getWeb3 } = require('../utils/web3Helper');
const { getContractInstance } = require('../utils/web3Helper');
const { toBytes32 } = require('../..');

const {
	currentTime,
	fastForward,
	toUnit,
	toPreciseUnit,
	multiplyDecimal,
} = require('../utils/testUtils');
const web3 = getWeb3();
const getInstance = getContractInstance(web3);

contract('Rewards Integration Tests', async accounts => {
	// Updates rates with defaults so they're not stale.
	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC, iBTC],
			['0.5', '1.25', '0.1', '5000', '4000'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	};

	const fastForwardAndCloseFeePeriod = async () => {
		const feePeriodDuration = await feePool.feePeriodDuration();
		// Note: add on a small addition of 10 seconds - this seems to have
		// alleviated an issues with the tests flaking in CircleCI
		// test: "should assign accounts (1,2,3) to have (40%,40%,20%) of the debt/rewards"
		await fastForward(feePeriodDuration.toNumber() + 10);
		await feePool.closeCurrentFeePeriod({ from: feeAuthority });
		await updateRatesWithDefaults();
	};

	const fastForwardAndUpdateRates = async seconds => {
		await fastForward(seconds);
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

	// const logFeesByPeriod = async account => {
	// 	const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();
	// 	const feesByPeriod = await feePoolWeb3.methods.feesByPeriod(account).call();

	// 	console.log('---------------------feesByPeriod----------------------');
	// 	console.log('Account', account);
	// 	for (let i = 0; i < length; i++) {
	// 		console.log(`Fee Period[${i}] Fees: ${feesByPeriod[i][0]} Rewards: ${feesByPeriod[i][1]}`);
	// 	}
	// 	console.log('--------------------------------------------------------');
	// };

	// CURRENCIES
	const [sUSD, sAUD, sEUR, sBTC, SNX, iBTC] = ['sUSD', 'sAUD', 'sEUR', 'sBTC', 'SNX', 'iBTC'].map(
		toBytes32
	);

	// DIVISIONS
	const half = amount => amount.div(web3.utils.toBN('2'));
	const third = amount => amount.div(web3.utils.toBN('3'));
	// const twoThirds = amount => amount.div(web3.utils.toBN('3')).mul(web3.utils.toBN('2'));
	const quarter = amount => amount.div(web3.utils.toBN('4'));
	// const twoQuarters = amount => amount.div(web3.utils.toBN('4')).mul(web3.utils.toBN('2'));
	// const threeQuarters = amount => amount.div(web3.utils.toBN('4')).mul(web3.utils.toBN('3'));
	const oneFifth = amount => amount.div(web3.utils.toBN('5'));
	const twoFifths = amount => amount.div(web3.utils.toBN('5')).mul(web3.utils.toBN('2'));

	// PERCENTAGES
	const twentyPercent = toPreciseUnit('0.2');
	// const twentyFivePercent = toPreciseUnit('0.25');
	// const thirtyThreePercent = toPreciseUnit('0.333333333333333333333333333');
	const fortyPercent = toPreciseUnit('0.4');
	const fiftyPercent = toPreciseUnit('0.5');

	// AMOUNTS
	const tenK = toUnit('10000');
	const twentyK = toUnit('20000');

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
		// feePoolState,
		synthetix,
		// sUSDContract,
		sBTCContract,
		exchangeRates,
		supplySchedule,
		rewardEscrow,
		periodOneMintableSupplyMinusMinterReward;

	// CONSTANTS
	const MINTER_SNX_REWARD = toUnit('200'); // from SupplySchedule.minterReward

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		feePoolWeb3 = getInstance(FeePool);
		// feePoolState = await FeePoolState.deployed();
		synthetix = await Synthetix.deployed();
		// sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sBTCContract = await Synth.at(await synthetix.synths(sBTC));

		supplySchedule = await SupplySchedule.deployed();
		rewardEscrow = await RewardEscrow.deployed();

		// Fastforward a year into the staking rewards supply
		await fastForwardAndUpdateRates(YEAR + MINUTE);

		// Assign 1/3 of total SNX to 3 accounts
		const snxTotalSupply = await synthetix.totalSupply();
		const thirdOfSNX = third(snxTotalSupply);

		await synthetix.methods['transfer(address,uint256)'](account1, thirdOfSNX, { from: owner });
		await synthetix.methods['transfer(address,uint256)'](account2, thirdOfSNX, { from: owner });
		await synthetix.methods['transfer(address,uint256)'](account3, thirdOfSNX, { from: owner });

		// Get the SNX mintableSupply
		periodOneMintableSupplyMinusMinterReward = (await supplySchedule.mintableSupply()).sub(
			MINTER_SNX_REWARD
		);

		// Mint the staking rewards
		await synthetix.mint({ from: deployerAccount });
	});

	describe('3 accounts with 33.33% SNX all issue MAX and claim rewards', async () => {
		let FEE_PERIOD_LENGTH;
		let CLAIMABLE_PERIODS;

		beforeEach(async () => {
			FEE_PERIOD_LENGTH = (await feePool.FEE_PERIOD_LENGTH()).toNumber();
			CLAIMABLE_PERIODS = FEE_PERIOD_LENGTH - 1;
			// console.log('FEE_PERIOD_LENGTH', FEE_PERIOD_LENGTH);

			await synthetix.issueMaxSynths(sUSD, { from: account1 });
			await synthetix.issueMaxSynths(sUSD, { from: account2 });
			await synthetix.issueMaxSynths(sUSD, { from: account3 });
		});

		it('should allocate the 3 accounts a third of the rewards for 1 period', async () => {
			// Close Fee Period
			await fastForwardAndCloseFeePeriod();

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

		it('should show the totalRewardsAvailable in the claimable period 1', async () => {
			// Close Fee Period
			await fastForwardAndCloseFeePeriod();

			// Assert that we have correct values in the fee pool
			const totalRewardsAvailable = await feePool.totalRewardsAvailable();

			assert.bnEqual(totalRewardsAvailable, periodOneMintableSupplyMinusMinterReward);
		});

		it('should show the totalRewardsAvailable in the claimable periods 1 & 2', async () => {
			let mintedRewardsSupply;
			// We are currently in the 2nd week, close it and the next
			for (let i = 0; i <= CLAIMABLE_PERIODS - 1; i++) {
				// console.log('Close Fee Period', i);
				await fastForwardAndCloseFeePeriod();

				// FastForward a little for minting
				await fastForwardAndUpdateRates(MINUTE);

				// Get the SNX mintableSupply - the minter reward of 200 SNX
				mintedRewardsSupply = (await supplySchedule.mintableSupply()).sub(MINTER_SNX_REWARD);
				// console.log('mintedRewardsSupply', mintedRewardsSupply.toString());
				// Mint the staking rewards
				await synthetix.mint({ from: owner });

				// await logFeePeriods();
			}

			// Assert that we have correct values in the fee pool
			const totalRewardsAvailable = await feePool.totalRewardsAvailable();

			const twoWeeksRewards = mintedRewardsSupply.mul(web3.utils.toBN(CLAIMABLE_PERIODS));

			assert.bnEqual(totalRewardsAvailable, twoWeeksRewards);
		});

		it('should show the totalRewardsAvailable in the claimable periods 1 & 2 after 2 accounts claims', async () => {
			let mintedRewardsSupply;
			// We are currently in the 2nd week, close it and the next
			for (let i = 0; i <= CLAIMABLE_PERIODS - 1; i++) {
				// console.log('Close Fee Period', i);
				await fastForwardAndCloseFeePeriod();

				// FastForward a little for minting
				await fastForwardAndUpdateRates(MINUTE);

				// Get the SNX mintableSupply - the minter reward of 200 SNX
				mintedRewardsSupply = (await supplySchedule.mintableSupply()).sub(MINTER_SNX_REWARD);
				// console.log('mintedRewardsSupply', mintedRewardsSupply.toString());
				// Mint the staking rewards
				await synthetix.mint({ from: owner });

				// await logFeePeriods();
			}

			await feePool.claimFees(sUSD, { from: account1 });
			await feePool.claimFees(sUSD, { from: account2 });
			// await logFeePeriods();

			// Assert that we have correct values in the fee pool
			const totalRewardsAvailable = await feePool.totalRewardsAvailable();

			const twoWeeksRewards = mintedRewardsSupply.mul(web3.utils.toBN(CLAIMABLE_PERIODS));

			const rewardsLessAccountClaims = third(twoWeeksRewards);

			assert.bnClose(totalRewardsAvailable, rewardsLessAccountClaims, 10);
		});

		it('should mint SNX for the all claimable fee periods then all 3 accounts claim at the end of the claimable period', async () => {
			let mintedRewardsSupply;
			// We are currently in the 2nd week, close it and the next
			for (let i = 0; i <= CLAIMABLE_PERIODS - 1; i++) {
				// console.log('Close Fee Period', i);
				await fastForwardAndCloseFeePeriod();

				// FastForward a little for minting
				await fastForwardAndUpdateRates(MINUTE);

				// Get the SNX mintableSupply - the minter reward of 200 SNX
				mintedRewardsSupply = (await supplySchedule.mintableSupply()).sub(MINTER_SNX_REWARD);

				// Mint the staking rewards
				await synthetix.mint({ from: owner });

				// await logFeePeriods();
			}

			// All 3 accounts claim rewards
			await feePool.claimFees(sUSD, { from: account1 });
			await feePool.claimFees(sUSD, { from: account2 });
			await feePool.claimFees(sUSD, { from: account3 });

			// await logFeePeriods();

			const twoWeeksRewards = third(mintedRewardsSupply).mul(web3.utils.toBN(CLAIMABLE_PERIODS));

			// All 3 accounts have 1/3 of the rewards
			const accOneEscrowed = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			assert.bnEqual(accOneEscrowed[1], twoWeeksRewards, '1');

			const accTwoEscrowed = await rewardEscrow.getVestingScheduleEntry(account2, 0);
			assert.bnEqual(accTwoEscrowed[1], twoWeeksRewards, '1');

			const accThreeEscrowed = await rewardEscrow.getVestingScheduleEntry(account3, 0);
			assert.bnEqual(accThreeEscrowed[1], twoWeeksRewards, '1');
		});

		it('should rollover the unclaimed SNX rewards', async () => {
			// Close all claimable periods
			for (let i = 0; i <= CLAIMABLE_PERIODS; i++) {
				// console.log('Close Fee Period', i);
				await fastForwardAndCloseFeePeriod();
				// FastForward a bit to be able to mint
				await fastForwardAndUpdateRates(MINUTE);

				// Mint the staking rewards
				await synthetix.mint({ from: owner });

				// await logFeePeriods();
			}
			// Get the Rewards to roll over from the last week
			const periodToRollOver = await feePool.recentFeePeriods(CLAIMABLE_PERIODS);
			const rollOverRewards = periodToRollOver.rewardsToDistribute;

			// Close the extra week
			await fastForwardAndCloseFeePeriod();
			// FastForward a bit to be able to mint
			await fastForwardAndUpdateRates(MINUTE);
			// Mint the staking rewards
			await synthetix.mint({ from: owner });

			// Get last FeePeriod
			const lastFeePeriod = await feePool.recentFeePeriods(CLAIMABLE_PERIODS);

			// await logFeePeriods();

			// Assert rewards have rolled over
			assert.bnEqual(
				lastFeePeriod.rewardsToDistribute,
				periodOneMintableSupplyMinusMinterReward.add(rollOverRewards)
			);
		});

		it('should rollover the unclaimed SNX rewards on week over 2 terms (FEE_PERIOD_LENGTH * 2)', async () => {
			for (let i = 0; i <= FEE_PERIOD_LENGTH * 2; i++) {
				await fastForwardAndCloseFeePeriod();
				// FastForward a bit to be able to mint
				await fastForwardAndUpdateRates(MINUTE);
				// Mint the staking rewards
				await synthetix.mint({ from: owner });

				// await logFeePeriods();
			}
			// Get the Rewards to RollOver
			const periodToRollOver = await feePool.recentFeePeriods(CLAIMABLE_PERIODS);
			const rollOverRewards = periodToRollOver.rewardsToDistribute;

			// Close for the roll over
			await fastForwardAndCloseFeePeriod();
			// FastForward a bit to be able to mint
			await fastForwardAndUpdateRates(MINUTE);
			// Mint the staking rewards
			await synthetix.mint({ from: owner });
			// Get last FeePeriod
			const lastFeePeriod = await feePool.recentFeePeriods(CLAIMABLE_PERIODS);
			// Assert rewards have rolled over

			// await logFeePeriods();

			assert.bnEqual(
				lastFeePeriod.rewardsToDistribute,
				periodOneMintableSupplyMinusMinterReward.add(rollOverRewards)
			);
		});

		it('should rollover the partial unclaimed SNX rewards', async () => {
			for (let i = 0; i <= FEE_PERIOD_LENGTH; i++) {
				await fastForwardAndCloseFeePeriod();
				// FastForward a bit to be able to mint
				await fastForwardAndUpdateRates(MINUTE);

				// Mint the staking rewards
				await synthetix.mint({ from: owner });

				// Only 1 account claims rewards
				feePool.claimFees(sUSD, { from: account1 });

				// await logFeePeriods();
			}

			// Get last FeePeriod
			const lastFeePeriod = await feePool.recentFeePeriods(CLAIMABLE_PERIODS);
			// Assert rewards have rolled over
			assert.bnEqual(lastFeePeriod.rewardsClaimed, third(periodOneMintableSupplyMinusMinterReward));
		});

		it('should allow a user to leave the system and return and still claim rewards', async () => {
			// Close week 1
			await fastForwardAndCloseFeePeriod();
			// FastForward a bit to be able to mint
			await fastForwardAndUpdateRates(MINUTE);
			// Mint the staking rewards
			await synthetix.mint({ from: owner });
			// await logFeePeriods();

			// Account 1 leaves the system for week 2
			const burnableTotal = await synthetix.debtBalanceOf(account1, sUSD);
			await synthetix.burnSynths(sUSD, burnableTotal, { from: account1 });
			// await logFeesByPeriod(account1);

			// Close week 2, ffwd & mint
			await fastForwardAndCloseFeePeriod();
			await fastForwardAndUpdateRates(MINUTE);
			await synthetix.mint({ from: owner });
			// await logFeePeriods();
			// await logFeesByPeriod(account1);

			// Account 1 comes back into the system
			await synthetix.issueMaxSynths(sUSD, { from: account1 });

			// Only Account 1 claims rewards
			const rewardsAmount = third(periodOneMintableSupplyMinusMinterReward);
			const feesByPeriod = await feePoolWeb3.methods.feesByPeriod(account1).call();

			// await logFeesByPeriod(account1);
			// [1] ---------------------feesByPeriod----------------------
			// [1] Account 0xa4E5a88e601847Be0021582fC8fa4E760B342f4e
			// [1] Fee Period[0] Fees: 0 Rewards: 480702564102564102564102
			// [1] Fee Period[1] Fees: 0 Rewards: 0
			// [1] Fee Period[2] Fees: 0 Rewards: 480702564102564102564102
			// [1] --------------------------------------------------------
			// Asset Account 1 has re-entered the system and has awards in period 0
			assert.bnEqual(feesByPeriod[0][1], rewardsAmount);
			assert.bnEqual(feesByPeriod[1][1], 0);
			assert.bnEqual(feesByPeriod[2][1], rewardsAmount);

			// Only Account 1 claims rewards
			feePool.claimFees(sUSD, { from: account1 });

			// await logFeesByPeriod(account1);
			// ] ---------------------feesByPeriod----------------------
			// [1] Account 0xa4E5a88e601847Be0021582fC8fa4E760B342f4e
			// [1] Fee Period[0] Fees: 0 Rewards: 480702564102564102564102
			// [1] Fee Period[1] Fees: 0 Rewards: 0
			// [1] Fee Period[2] Fees: 0 Rewards: 0
			// [1] --------------------------------------------------------

			// Assert Account 1 has all their rewards minus the week they left the system
			const totalRewardsClaimable = rewardsAmount.mul(web3.utils.toBN(CLAIMABLE_PERIODS - 1));
			const account1EscrowEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			assert.bnEqual(account1EscrowEntry[1], totalRewardsClaimable);
		});

		it('should allocate correct SNX rewards as others leave the system', async () => {
			// Close Fee Period
			// console.log('Close Fee Period');
			await fastForwardAndCloseFeePeriod();

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
			fastForwardAndCloseFeePeriod();

			// Account1 Reenters in current unclosed period so no rewards yet
			// await synthetix.issueMaxSynths(sUSD, { from: account1 });

			// Accounts 2 & 3 now have 33% of period 1 and 50% of period 2
			// console.log('33% of p1', third(periodOneMintableSupplyMinusMinterReward).toString());
			// console.log('50% of p2', half(period2MintedRewardsSupply).toString());
			const rewardsAmount = third(periodOneMintableSupplyMinusMinterReward).add(
				half(period2MintedRewardsSupply)
			);
			// console.log('rewardsAmount calculated', rewardsAmount.toString());

			// await logFeePeriods();
			await new Promise(resolve => setTimeout(resolve, 1000)); // Test would fail without the logFeePeriods(). Race condition on chain. Just need to delay a tad.

			// Check account2 has correct rewardsAvailable
			const account2Rewards = await feePool.feesAvailable(account2, sUSD);
			// console.log('account2Rewards', rewardsAmount.toString(), account2Rewards[1].toString());
			assert.bnClose(account2Rewards[1], rewardsAmount, '2');

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
			const sBTCAmount = await synthetix.effectiveValue(sUSD, tenK, sBTC);
			// console.log('sBTCAmount', sBTCAmount.toString());
			await synthetix.issueSynths(sBTC, sBTCAmount, { from: account1 });
			await synthetix.issueSynths(sBTC, sBTCAmount, { from: account2 });

			await fastForwardAndCloseFeePeriod();
			// //////////////////////////////////////////////
			// 2nd Week
			// //////////////////////////////////////////////

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
			// console.log('account1Escrow[1]', account1Escrow[1].toString());
			assert.bnClose(account1Escrow[1], half(periodOneMintableSupplyMinusMinterReward), 1);

			const account2Escrow = await rewardEscrow.getVestingScheduleEntry(account2, 0);
			// console.log('account2Escrow[1]', account2Escrow[1].toString());
			assert.bnClose(account2Escrow[1], half(periodOneMintableSupplyMinusMinterReward), 1);

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
			await synthetix.issueSynths(sUSD, tenK, { from: account3 });

			// Get the SNX mintableSupply for week 2
			const periodTwoMintableSupply = (await supplySchedule.mintableSupply()).sub(
				MINTER_SNX_REWARD
			);

			// Mint the staking rewards
			await synthetix.mint({ from: owner });

			// Do some exchanging to generateFees
			await synthetix.exchange(sBTC, sBTCAmount, sUSD, { from: account1 });
			await synthetix.exchange(sBTC, sBTCAmount, sUSD, { from: account2 });

			// Close so we can claim
			await fastForwardAndCloseFeePeriod();
			// //////////////////////////////////////////////
			// 3rd Week
			// //////////////////////////////////////////////

			// await logFeePeriods();

			// Assert (1,2,3) have (40%,40%,20%) of the debt in the recently closed period
			const acc1Ownership = await feePool.effectiveDebtRatioForPeriod(account1, 1);
			const acc2Ownership = await feePool.effectiveDebtRatioForPeriod(account2, 1);
			const acc3Ownership = await feePool.effectiveDebtRatioForPeriod(account3, 1);
			// console.log('Account1.effectiveDebtRatioForPeriod', acc1Ownership.toString());
			// console.log('Account2.effectiveDebtRatioForPeriod', acc2Ownership.toString());
			// console.log('Account3.effectiveDebtRatioForPeriod', acc3Ownership.toString());
			assert.bnClose(acc1Ownership, fortyPercent, '5500');
			assert.bnClose(acc2Ownership, fortyPercent, '5500');
			assert.bnClose(acc3Ownership, twentyPercent, '89000');

			// await logFeesByPeriod(account1);
			// await logFeesByPeriod(account2);
			// await logFeesByPeriod(account3);

			// All 3 accounts claim rewards
			await feePool.claimFees(sUSD, { from: account1 });
			await feePool.claimFees(sUSD, { from: account2 });
			await feePool.claimFees(sUSD, { from: account3 });

			// await logFeePeriods();

			// Assert (1,2,3) have (40%,40%,20%) of the rewards in their 2nd escrow entry
			const account1EscrowEntry2 = await rewardEscrow.getVestingScheduleEntry(account1, 1);
			const account2EscrowEntry2 = await rewardEscrow.getVestingScheduleEntry(account2, 1);
			const account3EscrowEntry1 = await rewardEscrow.getVestingScheduleEntry(account3, 0); // Account3's first escrow entry
			// console.log('account1EscrowEntry2[1]', account1EscrowEntry2[1].toString());
			// console.log(
			// 	'twoFifths(periodTwoMintableSupply)',
			// 	twoFifths(periodTwoMintableSupply).toString()
			// );
			// console.log('account2EscrowEntry2[1]', account2EscrowEntry2[1].toString());
			// console.log(
			// 	'twoFifths(periodTwoMintableSupply)',
			// 	twoFifths(periodTwoMintableSupply).toString()
			// );
			// console.log('account3EscrowEntry1[1]', account3EscrowEntry1[1].toString());
			// console.log(
			// 	'oneFifth(periodTwoMintableSupply)',
			// 	oneFifth(periodTwoMintableSupply).toString()
			// );

			assert.bnClose(account1EscrowEntry2[1], twoFifths(periodTwoMintableSupply));
			assert.bnClose(account2EscrowEntry2[1], twoFifths(periodTwoMintableSupply));
			assert.bnClose(account3EscrowEntry1[1], oneFifth(periodTwoMintableSupply), 16);

			// now in p3 Acc1 burns all and leaves (-40%) and Acc2 has 67% and Acc3 33% rewards allocated as such

			// Account 1 Burns all sBTC
			const acc1sBTCBalance = await sBTCContract.balanceOf(account1, { from: account1 });
			await synthetix.burnSynths(sBTC, acc1sBTCBalance, { from: account1 });

			// Get the SNX mintableSupply for week 3
			const periodThreeMintableSupply = (await supplySchedule.mintableSupply()).sub(
				MINTER_SNX_REWARD
			);

			// Mint the staking rewards
			await synthetix.mint({ from: owner });

			// Close so we can claim
			await fastForwardAndCloseFeePeriod();
			// //////////////////////////////////////////////
			// 4th Week
			// //////////////////////////////////////////////

			// Accounts 2&3 claim rewards
			await feePool.claimFees(sUSD, { from: account1 });
			await feePool.claimFees(sUSD, { from: account2 });
			await feePool.claimFees(sUSD, { from: account3 });

			// await logFeesByPeriod(account1);
			// await logFeesByPeriod(account2);
			// await logFeesByPeriod(account3);
			// await logFeePeriods();

			// Account2 should have 67% of the minted rewards
			const account2Escrow3 = await rewardEscrow.getVestingScheduleEntry(account2, 2); // Account2's 3rd escrow entry
			// console.log('account2Escrow3[1]', account2Escrow3[1].toString());
			// console.log(
			// 	'twoThirds(periodThreeMintableSupply)',
			// 	twoFifths(periodThreeMintableSupply).toString()
			// );
			assert.bnClose(account2Escrow3[1], twoFifths(periodThreeMintableSupply));

			// Account3 should have 33% of the minted rewards
			const account3Escrow2 = await rewardEscrow.getVestingScheduleEntry(account3, 1); // Account3's 2nd escrow entry
			// console.log('account3Escrow3[1]', account3Escrow2[1].toString());
			// console.log(
			// 	'third(periodThreeMintableSupply)',
			// 	oneFifth(periodThreeMintableSupply).toString()
			// );
			assert.bnClose(account3Escrow2[1], oneFifth(periodThreeMintableSupply), 15);

			// Acc1 mints 20K (40%) close p (40,40,20)');
			await synthetix.issueSynths(sUSD, twentyK, { from: account1 });

			// Get the SNX mintableSupply for week 4
			const periodFourMintableSupply = (await supplySchedule.mintableSupply()).sub(
				MINTER_SNX_REWARD
			);

			// Mint the staking rewards
			await synthetix.mint({ from: owner });

			// Close so we can claim
			await fastForwardAndCloseFeePeriod();

			// //////////////////////////////////////////////
			// 5th Week
			// //////////////////////////////////////////////

			// Accounts 1,2,3 claim rewards
			await feePool.claimFees(sUSD, { from: account1 });
			await feePool.claimFees(sUSD, { from: account2 });
			await feePool.claimFees(sUSD, { from: account3 });

			// Assert (1,2,3) have (40%,40%,20%) of the rewards in their 2nd escrow entry
			const account1EscrowEntry4 = await rewardEscrow.getVestingScheduleEntry(account1, 1);
			const account2EscrowEntry4 = await rewardEscrow.getVestingScheduleEntry(account2, 1);
			const account3EscrowEntry3 = await rewardEscrow.getVestingScheduleEntry(account3, 0); // Account3's first escrow entry
			// console.log('account1EscrowEntry4[1]', account1EscrowEntry4[1].toString());
			// console.log('account1EscrowEntry4[1]', account2EscrowEntry4[1].toString());
			// console.log('account1EscrowEntry4[1]', account3EscrowEntry3[1].toString());

			assert.bnClose(account1EscrowEntry4[1], twoFifths(periodFourMintableSupply));
			assert.bnClose(account2EscrowEntry4[1], twoFifths(periodFourMintableSupply));
			assert.bnClose(account3EscrowEntry3[1], oneFifth(periodFourMintableSupply), 16);
		});

		it('(Inverse) Issue sBTC then shift rate down 50% then calc rewards');
	});

	describe('3 Accounts issue 10K sUSD each in week 1', async () => {
		const tenK = toUnit('10000');
		const twentyK = toUnit('20000');

		beforeEach(async () => {
			await synthetix.issueSynths(sUSD, tenK, { from: account1 });
			await synthetix.issueSynths(sUSD, tenK, { from: account2 });
			await synthetix.issueSynths(sUSD, tenK, { from: account3 });
		});

		it('Acc1 issues and burns multiple times and should have accounts 1,2,3 rewards 50%,25%,25%', async () => {
			// Acc 1 Issues 20K sUSD
			await synthetix.issueSynths(sUSD, tenK, { from: account1 });

			// Close week 2
			await fastForwardAndCloseFeePeriod();

			// //////////////////////////////////////////////
			// 3rd Week
			// //////////////////////////////////////////////

			// Accounts 1,2,3 claim rewards
			await feePool.claimFees(sUSD, { from: account1 });
			await feePool.claimFees(sUSD, { from: account2 });
			await feePool.claimFees(sUSD, { from: account3 });

			// Assert Accounts 1 has 50% & 2&3 have 25% of the minted rewards in their initial escrow entry
			const account1Escrow = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			const account2Escrow = await rewardEscrow.getVestingScheduleEntry(account2, 0);
			const account3Escrow = await rewardEscrow.getVestingScheduleEntry(account3, 0);
			// console.log('account1Escrow[1]', account1Escrow[1].toString());
			// console.log('account2Escrow[1]', account2Escrow[1].toString());
			// console.log('account3Escrow[1]', account3Escrow[1].toString());
			// console.log(
			// 	'half(periodOneMintableSupplyMinusMinterReward',
			// 	half(periodOneMintableSupplyMinusMinterReward).toString()
			// );
			// console.log(
			// 	'quarter(periodOneMintableSupplyMinusMinterReward)',
			// 	quarter(periodOneMintableSupplyMinusMinterReward).toString()
			// );
			assert.bnClose(account1Escrow[1], half(periodOneMintableSupplyMinusMinterReward), 49);
			assert.bnClose(account2Escrow[1], quarter(periodOneMintableSupplyMinusMinterReward), 26);
			assert.bnClose(account3Escrow[1], quarter(periodOneMintableSupplyMinusMinterReward), 24);

			// Acc1 Burns all
			await synthetix.burnSynths(sUSD, twentyK, { from: account1 });
			// Acc 1 Issues 10K sUSD
			await synthetix.issueSynths(sUSD, tenK, { from: account1 });
			// Acc 1 Issues 10K sUSD again
			await synthetix.issueSynths(sUSD, tenK, { from: account1 });

			// Get the SNX mintableSupply for week 2
			const periodTwoMintableSupply = (await supplySchedule.mintableSupply()).sub(
				MINTER_SNX_REWARD
			);

			// Mint the staking rewards
			await synthetix.mint({ from: owner });

			// Close week 3
			await fastForwardAndCloseFeePeriod();

			// //////////////////////////////////////////////
			// 3rd Week
			// //////////////////////////////////////////////

			// await logFeePeriods();
			// await logFeesByPeriod(account1);
			// await logFeesByPeriod(account2);
			// await logFeesByPeriod(account3);

			// Accounts 1,2,3 claim rewards
			await feePool.claimFees(sUSD, { from: account1 });
			await feePool.claimFees(sUSD, { from: account2 });
			await feePool.claimFees(sUSD, { from: account3 });

			// Assert Accounts 2&3 have 25% of the minted rewards in their initial escrow entry
			const account1Escrow2 = await rewardEscrow.getVestingScheduleEntry(account1, 1);
			const account2Escrow2 = await rewardEscrow.getVestingScheduleEntry(account2, 1);
			const account3Escrow2 = await rewardEscrow.getVestingScheduleEntry(account3, 1);
			// console.log('account1Escrow2[1]', account1Escrow2[1].toString());
			// console.log('account2Escrow2[1]', account2Escrow2[1].toString());
			// console.log('account3Escrow2[1]', account3Escrow2[1].toString());
			// console.log('half(periodTwoMintableSupply', half(periodTwoMintableSupply).toString());
			// console.log('quarter(periodTwoMintableSupply)', quarter(periodTwoMintableSupply).toString());
			assert.bnClose(account1Escrow2[1], half(periodTwoMintableSupply), 49);
			assert.bnClose(account2Escrow2[1], quarter(periodTwoMintableSupply), 26);
			assert.bnClose(account3Escrow2[1], quarter(periodTwoMintableSupply), 24);
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
			await fastForwardAndCloseFeePeriod();
			const rewardsAfter = await feePool.feesAvailable(account1, sUSD);
			// console.log('rewardsAfter', rewardsAfter[1].toString());
			assert.bnEqual(rewardsAfter[1], third(periodOneMintableSupplyMinusMinterReward));
		});

		it('should apply no penalty when users claim rewards above the penalty threshold ratio', async () => {
			// Decrease SNX collateral price by 5%
			const currentRate = await exchangeRates.rateForCurrency(SNX);
			const newRate = currentRate.sub(multiplyDecimal(currentRate, toUnit('0.05')));

			const timestamp = await currentTime();
			await exchangeRates.updateRates([SNX], [newRate], timestamp, {
				from: oracle,
			});

			// we will be able to claim fees
			assert.equal(await feePool.isFeesClaimable(account1), true);

			const snxRewards = await feePool.feesAvailable(account1, sUSD);
			assert.bnClose(snxRewards[1], third(periodOneMintableSupplyMinusMinterReward));

			// And if we claim them
			await feePool.claimFees(sUSD, { from: account1 });

			// We should have our decreased rewards amount in escrow
			const vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account1, 0);
			assert.bnClose(vestingScheduleEntry[1], third(periodOneMintableSupplyMinusMinterReward), 2);
		});
		it('should block user from claiming fees and rewards when users claim rewards >10% threshold collateralisation ratio', async () => {
			// But if the price of SNX decreases a lot...
			const newRate = (await exchangeRates.rateForCurrency(SNX)).sub(toUnit('0.09'));
			const timestamp = await currentTime();
			await exchangeRates.updateRates([SNX], [newRate], timestamp, {
				from: oracle,
			});

			// we will fall into the >100% bracket
			assert.equal(await feePool.isFeesClaimable(account1), false);

			// And if we claim then it should revert as there is nothing to claim
			await assert.revert(feePool.claimFees(sUSD, { from: account1 }));
		});
	});
});
