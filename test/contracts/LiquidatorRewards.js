const { contract } = require('hardhat');
const { toBN } = require('web3-utils');

const { toBytes32 } = require('../..');
const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	setupPriceAggregators,
	updateAggregatorRates,
} = require('./helpers');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { setupAllContracts } = require('./setup');
const { artifacts } = require('hardhat');
const { toUnit, fastForward } = require('../utils')();

contract('LiquidatorRewards', accounts => {
	const [sAUD, sEUR, SNX, sETH, ETH] = ['sAUD', 'sEUR', 'SNX', 'sETH', 'ETH'].map(toBytes32);
	const [, owner, , , stakingAccount1, stakingAccount2, mockSynthetix] = accounts;

	let addressResolver,
		debtCache,
		circuitBreaker,
		exchangeRates,
		liquidatorRewards,
		synths,
		synthetix,
		synthetixProxy,
		synthetixDebtShare,
		systemSettings;

	const ZERO_BN = toBN(0);

	const setupStakers = async () => {
		const snxCollateral = toUnit('1000');
		await synthetix.transfer(stakingAccount1, snxCollateral, { from: owner });
		await synthetix.transfer(stakingAccount2, snxCollateral, { from: owner });

		await synthetix.issueMaxSynths({ from: stakingAccount1 });
		await synthetix.issueMaxSynths({ from: stakingAccount2 });

		await addressResolver.importAddresses(['Synthetix'].map(toBytes32), [mockSynthetix], {
			from: owner,
		});
		await liquidatorRewards.rebuildCache();
	};

	const setupReward = async () => {
		const rewardValue = toUnit('1000');
		await synthetix.transfer(liquidatorRewards.address, rewardValue, { from: owner });

		await liquidatorRewards.notifyRewardAmount(rewardValue, {
			from: mockSynthetix,
		});

		await addressResolver.importAddresses(['Synthetix'].map(toBytes32), [synthetix.address], {
			from: owner,
		});
		await liquidatorRewards.rebuildCache();
	};

	addSnapshotBeforeRestoreAfterEach();

	before(async () => {
		synths = ['sUSD', 'sAUD', 'sEUR', 'sETH'];
		({
			AddressResolver: addressResolver,
			CircuitBreaker: circuitBreaker,
			DebtCache: debtCache,
			ExchangeRates: exchangeRates,
			LiquidatorRewards: liquidatorRewards,
			Synthetix: synthetix,
			ProxyERC20Synthetix: synthetixProxy,
			SynthetixDebtShare: synthetixDebtShare,
			SystemSettings: systemSettings,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'AddressResolver',
				'CollateralManager',
				'CircuitBreaker',
				'DebtCache',
				'Exchanger',
				'ExchangeRates',
				'Issuer',
				'Liquidator',
				'LiquidatorRewards',
				'RewardEscrowV2',
				'Synthetix',
				'SynthetixDebtShare',
				'SystemSettings',
			],
		}));

		// use implementation ABI on the proxy address to simplify calling
		synthetix = await artifacts.require('Synthetix').at(synthetixProxy.address);

		await setupPriceAggregators(exchangeRates, owner, [sAUD, sEUR, sETH, ETH]);
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		// update the rates and take a snapshot
		await updateAggregatorRates(
			exchangeRates,
			circuitBreaker,
			[sAUD, sEUR, SNX, sETH],
			['0.5', '1.25', '0.1', '200'].map(toUnit)
		);
		await debtCache.takeDebtSnapshot();
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: liquidatorRewards.abi,
			ignoreParents: ['ReentrancyGuard', 'Owned'],
			expected: ['getReward', 'notifyRewardAmount', 'rebuildCache', 'updateEntry'],
		});
	});

	describe('Constructor & Settings', () => {
		it('should set owner on constructor', async () => {
			const ownerAddress = await liquidatorRewards.owner();
			assert.equal(ownerAddress, owner);
		});
		it('reward balance should be zero', async () => {
			const rewardsBalance = await synthetix.balanceOf(liquidatorRewards.address);
			assert.bnEqual(rewardsBalance, ZERO_BN);

			const accumulatedRewardsPerShare = await liquidatorRewards.accumulatedRewardsPerShare();
			assert.bnEqual(accumulatedRewardsPerShare, ZERO_BN);
		});
	});

	describe('Function permissions', () => {
		const rewardValue = toUnit('100');

		it('only synthetix can call notifyRewardAmount', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: liquidatorRewards.notifyRewardAmount,
				accounts,
				args: [rewardValue],
				address: synthetix.address,
				skipPassCheck: true,
				reason: 'Synthetix only',
			});
		});
	});

	describe('earned()', () => {
		it('should be 0 when not staking', async () => {
			await addressResolver.importAddresses(['Synthetix'].map(toBytes32), [mockSynthetix], {
				from: owner,
			});
			await liquidatorRewards.rebuildCache();

			const rewardValue = toUnit('100');
			await synthetix.transfer(liquidatorRewards.address, rewardValue, { from: owner });

			assert.bnEqual(await liquidatorRewards.earned(stakingAccount1), ZERO_BN);
		});

		it('should be > 0 when staking', async () => {
			await setupStakers();

			const rewardValue = toUnit('100');
			await synthetix.transfer(liquidatorRewards.address, rewardValue, { from: owner });

			await liquidatorRewards.notifyRewardAmount(rewardValue, {
				from: mockSynthetix,
			});

			const earned = await liquidatorRewards.earned(stakingAccount1);
			assert.bnGt(earned, ZERO_BN);
		});

		it('should increase if new rewards come in', async () => {
			await setupStakers();

			const earnedBalanceBefore = await liquidatorRewards.earned(stakingAccount1);
			const rewardsBalanceBefore = await synthetix.balanceOf(liquidatorRewards.address);
			const accumulatedRewardsBefore = await liquidatorRewards.accumulatedRewardsPerShare();

			const newRewards = toUnit('5000');
			await synthetix.transfer(liquidatorRewards.address, newRewards, { from: owner });

			await liquidatorRewards.notifyRewardAmount(newRewards, {
				from: mockSynthetix,
			});

			const earnedBalanceAfter = await liquidatorRewards.earned(stakingAccount1);
			assert.bnEqual(earnedBalanceBefore, ZERO_BN);
			assert.bnGt(earnedBalanceAfter, earnedBalanceBefore);

			const rewardsBalanceAfter = await synthetix.balanceOf(liquidatorRewards.address);
			assert.bnEqual(rewardsBalanceBefore, ZERO_BN);
			assert.bnEqual(rewardsBalanceAfter, rewardsBalanceBefore.add(newRewards));

			const accumulatedRewardsAfter = await liquidatorRewards.accumulatedRewardsPerShare();
			assert.bnEqual(accumulatedRewardsBefore, ZERO_BN);
			assert.bnEqual(
				accumulatedRewardsAfter,
				accumulatedRewardsBefore.add(
					newRewards.mul(toUnit(1)).div(await synthetixDebtShare.totalSupply())
				)
			);
		});

		describe('when minting or burning debt', () => {
			beforeEach(async () => {
				await setupStakers();

				const rewardValue = toUnit('100');
				await synthetix.transfer(liquidatorRewards.address, rewardValue, { from: owner });

				await liquidatorRewards.notifyRewardAmount(rewardValue, {
					from: mockSynthetix,
				});
			});

			it('equal after minting', async () => {
				const beforeEarnedValue = await liquidatorRewards.earned(stakingAccount1);
				const beforeDebtShareBalance = await synthetixDebtShare.balanceOf(stakingAccount2);
				const beforeDebtSharesSupply = await synthetixDebtShare.totalSupply();

				await synthetix.transfer(stakingAccount2, toUnit('1000'), { from: owner });
				await synthetix.issueMaxSynths({ from: stakingAccount2 });

				const afterEarnedValue = await liquidatorRewards.earned(stakingAccount1);
				const afterDebtShareBalance = await synthetixDebtShare.balanceOf(stakingAccount2);
				const afterDebtSharesSupply = await synthetixDebtShare.totalSupply();

				assert.bnEqual(afterEarnedValue, beforeEarnedValue);
				assert.bnGt(afterDebtShareBalance, beforeDebtShareBalance);
				assert.bnGt(afterDebtSharesSupply, beforeDebtSharesSupply);
			});

			it('equal after burning', async () => {
				const beforeEarnedValue = await liquidatorRewards.earned(stakingAccount1);
				const beforeDebtShareBalance = await synthetixDebtShare.balanceOf(stakingAccount2);
				const beforeDebtSharesSupply = await synthetixDebtShare.totalSupply();

				// skip minimumStakeTime in order to burn synths
				await systemSettings.setMinimumStakeTime(10, { from: owner });
				await fastForward(10);

				await synthetix.burnSynths(toUnit('100'), { from: stakingAccount2 });

				const afterEarnedValue = await liquidatorRewards.earned(stakingAccount1);
				const afterDebtShareBalance = await synthetixDebtShare.balanceOf(stakingAccount2);
				const afterDebtSharesSupply = await synthetixDebtShare.totalSupply();

				assert.bnEqual(afterEarnedValue, beforeEarnedValue);
				assert.bnLt(afterDebtShareBalance, beforeDebtShareBalance);
				assert.bnLt(afterDebtSharesSupply, beforeDebtSharesSupply);
			});
		});
	});

	describe('getReward()', () => {
		beforeEach(async () => {
			await setupStakers();
		});

		it('should be zero if there are no rewards to claim', async () => {
			const accumulatedRewards = await liquidatorRewards.accumulatedRewardsPerShare();
			assert.bnEqual(accumulatedRewards, ZERO_BN);

			const postEarnedBal = await liquidatorRewards.earned(stakingAccount1);
			assert.bnEqual(postEarnedBal, ZERO_BN);

			const collateralBefore = await synthetix.collateral(stakingAccount1);

			await liquidatorRewards.getReward(stakingAccount1, { from: stakingAccount1 });

			const collateralAfter = await synthetix.collateral(stakingAccount1);

			assert.bnEqual(collateralAfter, collateralBefore);
		});

		it('should decrease after rewards are claimed', async () => {
			await setupReward();

			const initialEarnedBal = await liquidatorRewards.earned(stakingAccount1);
			const rewardsBalanceBeforeClaim = await synthetix.balanceOf(liquidatorRewards.address);

			const tx = await liquidatorRewards.getReward(stakingAccount1, { from: stakingAccount1 });

			assert.eventEqual(tx, 'RewardPaid', {
				user: stakingAccount1,
				reward: initialEarnedBal,
			});

			const postEarnedBal = await liquidatorRewards.earned(stakingAccount1);
			assert.bnEqual(postEarnedBal, ZERO_BN);

			const rewardsBalanceAfterClaim = await synthetix.balanceOf(liquidatorRewards.address);
			assert.bnEqual(rewardsBalanceAfterClaim, rewardsBalanceBeforeClaim.sub(initialEarnedBal));
		});

		it('should not allow rewards to be claimed again', async () => {
			await setupReward();

			const initialEarnedBal = await liquidatorRewards.earned(stakingAccount1);
			const rewardsBalanceBeforeClaim = await synthetix.balanceOf(liquidatorRewards.address);

			// claim rewards for the first time
			await liquidatorRewards.getReward(stakingAccount1, { from: stakingAccount1 });

			const rewardsBalanceAfterClaim = await synthetix.balanceOf(liquidatorRewards.address);
			assert.bnEqual(rewardsBalanceAfterClaim, rewardsBalanceBeforeClaim.sub(initialEarnedBal));

			const collateralBefore = await synthetix.collateral(stakingAccount1);

			// attempt to claim rewards again before any new rewards come in
			await liquidatorRewards.getReward(stakingAccount1, { from: stakingAccount1 });

			const collateralAfter = await synthetix.collateral(stakingAccount1);

			assert.bnEqual(collateralAfter, collateralBefore);
		});

		it('should remain the same for an account who did not claim yet', async () => {
			await setupReward();

			const initialEarnedBal1 = await liquidatorRewards.earned(stakingAccount1);
			const initialEarnedBal2 = await liquidatorRewards.earned(stakingAccount2);

			assert.bnGt(initialEarnedBal1, ZERO_BN);
			assert.bnGt(initialEarnedBal2, ZERO_BN);

			await liquidatorRewards.getReward(stakingAccount1, { from: stakingAccount1 });

			const postEarnedBal1 = await liquidatorRewards.earned(stakingAccount1);
			assert.bnEqual(postEarnedBal1, ZERO_BN);

			const postEarnedBal2 = await liquidatorRewards.earned(stakingAccount2);
			assert.bnEqual(postEarnedBal2, initialEarnedBal2);
		});
	});
});
