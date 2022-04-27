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
const { toUnit } = require('../utils')();

contract('LiquidatorRewards', accounts => {
	const [sAUD, sEUR, SNX, sETH, ETH] = ['sAUD', 'sEUR', 'SNX', 'sETH', 'ETH'].map(toBytes32);
	const [, owner, , , stakingAccount1, mockSynthetix] = accounts;

	let addressResolver,
		debtCache,
		exchangeRates,
		liquidatorRewards,
		synths,
		synthetix,
		synthetixDebtShare;

	const ZERO_BN = toBN(0);

	const setupStaker = async () => {
		const snxCollateral = toUnit('1000');
		await synthetix.transfer(stakingAccount1, snxCollateral, { from: owner });

		await synthetix.issueMaxSynths({ from: stakingAccount1 });

		const totalSupply = await synthetixDebtShare.totalSupply();
		assert.bnGt(totalSupply, ZERO_BN);

		await addressResolver.importAddresses(['Synthetix'].map(toBytes32), [mockSynthetix], {
			from: owner,
		});
		await liquidatorRewards.rebuildCache();
	};

	addSnapshotBeforeRestoreAfterEach();

	before(async () => {
		synths = ['sUSD', 'sAUD', 'sEUR', 'sETH'];
		({
			AddressResolver: addressResolver,
			DebtCache: debtCache,
			LiquidatorRewards: liquidatorRewards,
			Synthetix: synthetix,
			SynthetixDebtShare: synthetixDebtShare,
			ExchangeRates: exchangeRates,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'AddressResolver',
				'CollateralManager',
				'DebtCache',
				'Exchanger',
				'ExchangeRates',
				'Issuer',
				'LiquidatorRewards',
				'RewardEscrowV2',
				'Synthetix',
				'SynthetixDebtShare',
				'SystemSettings',
			],
		}));

		await setupPriceAggregators(exchangeRates, owner, [sAUD, sEUR, sETH, ETH]);
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		// update the rates and take a snapshot
		await updateAggregatorRates(
			exchangeRates,
			[sAUD, sEUR, SNX, sETH],
			['0.5', '1.25', '0.1', '200'].map(toUnit)
		);
		await debtCache.takeDebtSnapshot();
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: liquidatorRewards.abi,
			ignoreParents: ['ReentrancyGuard', 'Owned'],
			expected: ['getReward', 'notifyRewardAmount', 'rebuildCache'],
		});
	});

	describe('Constructor & Settings', () => {
		it('should set owner on constructor', async () => {
			const ownerAddress = await liquidatorRewards.owner();
			assert.equal(ownerAddress, owner);
		});
		it('reward balance should be zero', async () => {
			const rewardsBalance = await synthetix.balanceOf(liquidatorRewards.address);
			assert.equal(0, rewardsBalance);

			const accumulatedRewards = await liquidatorRewards.accumulatedRewards();
			assert.equal(0, accumulatedRewards);
		});
	});

	describe('Function permissions', () => {
		const rewardValue = toUnit(100);

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

	describe('rewardPerShare()', () => {
		it('should return 0', async () => {
			assert.bnEqual(await liquidatorRewards.rewardPerShare(), ZERO_BN);
		});

		it('should be > 0', async () => {
			await setupStaker();

			const rewardValue = toUnit('100');
			await synthetix.transfer(liquidatorRewards.address, rewardValue, { from: owner });

			await liquidatorRewards.notifyRewardAmount(rewardValue, {
				from: mockSynthetix,
			});

			const rewardPerShare = await liquidatorRewards.rewardPerShare();
			assert.bnGt(rewardPerShare, ZERO_BN);
		});
	});

	describe('earned()', () => {
		it('should be 0 when not staking', async () => {
			assert.bnEqual(await liquidatorRewards.earned(stakingAccount1), ZERO_BN);
		});

		it('should be > 0 when staking', async () => {
			await setupStaker();

			const rewardValue = toUnit('100');
			await synthetix.transfer(liquidatorRewards.address, rewardValue, { from: owner });

			await liquidatorRewards.notifyRewardAmount(rewardValue, {
				from: mockSynthetix,
			});

			const earned = await liquidatorRewards.earned(stakingAccount1);
			assert.bnGt(earned, ZERO_BN);
		});

		it('rewards balance should increase if new rewards come in', async () => {
			// TODO: earned call
			const rewardsBalanceBefore = await synthetix.balanceOf(liquidatorRewards.address);
			const accumulatedRewardsBefore = await liquidatorRewards.accumulatedRewards();

			await setupStaker();

			const newRewards = toUnit('5000');
			await synthetix.transfer(liquidatorRewards.address, newRewards, { from: owner });

			await liquidatorRewards.notifyRewardAmount(newRewards, {
				from: mockSynthetix,
			});

			const rewardsBalanceAfter = await synthetix.balanceOf(liquidatorRewards.address);
			assert.bnEqual(rewardsBalanceBefore, ZERO_BN);
			assert.bnGt(rewardsBalanceAfter, rewardsBalanceBefore);

			const accumulatedRewardsAfter = await liquidatorRewards.accumulatedRewards();
			assert.bnEqual(accumulatedRewardsBefore, ZERO_BN);
			assert.bnGt(accumulatedRewardsAfter, accumulatedRewardsBefore);
		});
	});

	describe('getReward()', () => {
		it('rewards balance should decrease if rewards are claimed', async () => {
			const rewardsBalanceBefore = await synthetix.balanceOf(liquidatorRewards.address);

			await setupStaker();

			const rewardValue = toUnit('100');
			await synthetix.transfer(liquidatorRewards.address, rewardValue, { from: owner });

			await liquidatorRewards.notifyRewardAmount(rewardValue, {
				from: mockSynthetix,
			});

			await addressResolver.importAddresses(['Synthetix'].map(toBytes32), [synthetix.address], {
				from: owner,
			});
			await liquidatorRewards.rebuildCache();

			const initialEarnedBal = await liquidatorRewards.earned(stakingAccount1);

			const tx = await liquidatorRewards.getReward({ from: stakingAccount1 });

			assert.eventEqual(tx, 'RewardPaid', {
				user: stakingAccount1,
				reward: initialEarnedBal,
			});

			const postEarnedBal = await liquidatorRewards.earned(stakingAccount1);
			assert.bnEqual(postEarnedBal, '0');

			const rewardsBalanceAfter = await synthetix.balanceOf(liquidatorRewards.address);
			assert.bnGt(rewardsBalanceAfter, rewardsBalanceBefore);
		});
	});
});
