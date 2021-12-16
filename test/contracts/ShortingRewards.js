const { artifacts, contract } = require('hardhat');
const { toBN } = require('web3-utils');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');
const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	setupPriceAggregators,
	updateAggregatorRates,
} = require('./helpers');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { setupAllContracts, setupContract } = require('./setup');
const { currentTime, toUnit, fastForward } = require('../utils')();

let CollateralManager;
let CollateralManagerState;

contract('ShortingRewards', accounts => {
	const [
		deployerAccount,
		owner,
		,
		authority,
		rewardEscrowAddress,
		account1,
		mockRewardsDistributionAddress,
		account2,
	] = accounts;

	const sUSD = toBytes32('sUSD');
	const sETH = toBytes32('sETH');
	const iETH = toBytes32('iETH');
	const sBTC = toBytes32('sBTC');
	const iBTC = toBytes32('iBTC');
	const SNX = toBytes32('SNX');

	// Synthetix is the rewardsToken
	let rewardsToken,
		exchangeRates,
		shortingRewards,
		rewardsDistribution,
		systemSettings,
		feePool,
		synths,
		short,
		sUSDSynth,
		sBTCSynth,
		sETHSynth,
		issuer,
		debtCache,
		managerState,
		manager,
		addressResolver,
		tx,
		id;

	const DAY = 86400;
	const ZERO_BN = toBN(0);

	const getid = async tx => {
		const event = tx.logs.find(log => log.event === 'LoanCreated');
		return event.args.id;
	};

	const setRewardsTokenExchangeRate = async ({ rateStaleDays } = { rateStaleDays: 7 }) => {
		const rewardsTokenIdentifier = await rewardsToken.symbol();

		await systemSettings.setRateStalePeriod(DAY * rateStaleDays, { from: owner });
		await updateAggregatorRates(exchangeRates, [toBytes32(rewardsTokenIdentifier)], [toUnit('2')]);
		assert.equal(await exchangeRates.rateIsStale(toBytes32(rewardsTokenIdentifier)), false);
	};

	const issuesUSDToAccount = async (issueAmount, receiver) => {
		// Set up the depositor with an amount of synths to deposit.
		await sUSDSynth.issue(receiver, issueAmount, {
			from: owner,
		});
	};

	const issuesBTCtoAccount = async (issueAmount, receiver) => {
		await sBTCSynth.issue(receiver, issueAmount, { from: owner });
	};

	const issuesETHToAccount = async (issueAmount, receiver) => {
		await sETHSynth.issue(receiver, issueAmount, { from: owner });
	};

	const deployShort = async ({ owner, manager, resolver, collatKey, minColat, minSize }) => {
		return setupContract({
			accounts,
			contract: 'CollateralShort',
			args: [owner, manager, resolver, collatKey, minColat, minSize],
		});
	};

	addSnapshotBeforeRestoreAfterEach();

	before(async () => {
		CollateralManager = artifacts.require(`CollateralManager`);
		CollateralManagerState = artifacts.require('CollateralManagerState');
	});

	before(async () => {
		synths = ['sUSD', 'sBTC', 'sETH', 'iBTC', 'iETH'];
		({
			ExchangeRates: exchangeRates,
			SynthsUSD: sUSDSynth,
			SynthsBTC: sBTCSynth,
			SynthsETH: sETHSynth,
			FeePool: feePool,
			AddressResolver: addressResolver,
			Issuer: issuer,
			DebtCache: debtCache,
			RewardsDistribution: rewardsDistribution,
			Synthetix: rewardsToken,
			SystemSettings: systemSettings,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'FeePool',
				'AddressResolver',
				'ExchangeRates',
				'SystemStatus',
				'Issuer',
				'DebtCache',
				'RewardsDistribution',
				'Synthetix',
				'SystemSettings',
				'Exchanger',
				'CollateralUtil',
			],
		}));

		await setupPriceAggregators(exchangeRates, owner, [sBTC, iBTC, sETH, iETH, SNX]);

		managerState = await CollateralManagerState.new(owner, ZERO_ADDRESS, { from: deployerAccount });

		const maxDebt = toUnit(10000000);

		manager = await CollateralManager.new(
			managerState.address,
			owner,
			addressResolver.address,
			maxDebt,
			0,
			0,
			0,
			{
				from: deployerAccount,
			}
		);

		await managerState.setAssociatedContract(manager.address, { from: owner });

		short = await deployShort({
			owner: owner,
			manager: manager.address,
			resolver: addressResolver.address,
			collatKey: sUSD,
			minColat: toUnit(1.5),
			minSize: toUnit(0.1),
		});

		await addressResolver.importAddresses(
			[toBytes32('CollateralShort'), toBytes32('CollateralManager')],
			[short.address, manager.address],
			{
				from: owner,
			}
		);

		await feePool.rebuildCache();
		await manager.rebuildCache();
		await issuer.rebuildCache();
		await debtCache.rebuildCache();

		await manager.addCollaterals([short.address], { from: owner });

		await short.addSynths(
			['SynthsBTC', 'SynthsETH'].map(toBytes32),
			['sBTC', 'sETH'].map(toBytes32),
			{ from: owner }
		);

		await manager.addShortableSynths(
			['SynthsBTC', 'SynthsETH'].map(toBytes32),
			['sBTC', 'sETH'].map(toBytes32),
			{ from: owner }
		);

		await sUSDSynth.approve(short.address, toUnit(100000), { from: account1 });

		shortingRewards = await setupContract({
			accounts,
			contract: 'ShortingRewards',
			args: [owner, addressResolver.address, rewardsDistribution.address, rewardsToken.address],
		});

		await shortingRewards.rebuildCache();

		await Promise.all([
			rewardsDistribution.setAuthority(authority, { from: owner }),
			rewardsDistribution.setRewardEscrow(rewardEscrowAddress, { from: owner }),
			rewardsDistribution.setSynthetixProxy(rewardsToken.address, { from: owner }),
			rewardsDistribution.setFeePoolProxy(feePool.address, { from: owner }),
		]);

		await shortingRewards.setRewardsDistribution(mockRewardsDistributionAddress, {
			from: owner,
		});

		await short.addRewardsContracts(shortingRewards.address, sBTC, { from: owner });

		await setRewardsTokenExchangeRate();
	});

	beforeEach(async () => {
		await updateAggregatorRates(exchangeRates, [sETH, sBTC], [100, 10000].map(toUnit));

		await issuesUSDToAccount(toUnit(100000), owner);
		await issuesBTCtoAccount(toUnit(10), owner);
		await issuesETHToAccount(toUnit(100), owner);

		await issuesUSDToAccount(toUnit(20000), account1);
		await issuesBTCtoAccount(toUnit(2), account1);
		await issuesETHToAccount(toUnit(10), account1);

		await debtCache.takeDebtSnapshot();
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: shortingRewards.abi,
			ignoreParents: ['ReentrancyGuard', 'Owned', 'MixinResolver'],
			expected: [
				'enrol',
				'withdraw',
				'getReward',
				'notifyRewardAmount',
				'setPaused',
				'setRewardsDistribution',
				'setRewardsDuration',
			],
		});
	});

	describe('Constructor & Settings', () => {
		it('should set rewards token on constructor', async () => {
			assert.equal(await shortingRewards.rewardsToken(), rewardsToken.address);
		});

		it('should set owner on constructor', async () => {
			const ownerAddress = await shortingRewards.owner();
			assert.equal(ownerAddress, owner);
		});
	});

	describe('Function permissions', () => {
		const rewardValue = toUnit(1.0);

		before(async () => {
			await rewardsToken.transfer(shortingRewards.address, rewardValue, { from: owner });
		});

		it('only owner can call notifyRewardAmount', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: shortingRewards.notifyRewardAmount,
				args: [rewardValue],
				address: mockRewardsDistributionAddress,
				accounts,
			});
		});

		it('only rewardsDistribution address can call notifyRewardAmount', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: shortingRewards.notifyRewardAmount,
				args: [rewardValue],
				address: mockRewardsDistributionAddress,
				accounts,
			});
		});

		it('only owner address can call setRewardsDuration', async () => {
			await fastForward(DAY * 7);
			await onlyGivenAddressCanInvoke({
				fnc: shortingRewards.setRewardsDuration,
				args: [70],
				address: owner,
				accounts,
			});
		});

		it('only owner address can call setPaused', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: shortingRewards.setPaused,
				args: [true],
				address: owner,
				accounts,
			});
		});
	});

	describe('Pausable', async () => {
		beforeEach(async () => {
			await shortingRewards.setPaused(true, { from: owner });
		});
		it('should revert calling enrol() when paused', async () => {
			await assert.revert(
				short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 }),
				'This action cannot be performed while the contract is paused'
			);
		});
		it('should not revert calling stake() when unpaused', async () => {
			await shortingRewards.setPaused(false, { from: owner });

			await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });
		});
	});

	describe('lastTimeRewardApplicable()', () => {
		it('should return 0', async () => {
			assert.bnEqual(await shortingRewards.lastTimeRewardApplicable(), ZERO_BN);
		});

		describe('when updated', () => {
			it('should equal current timestamp', async () => {
				await shortingRewards.notifyRewardAmount(toUnit(1.0), {
					from: mockRewardsDistributionAddress,
				});

				const cur = await currentTime();
				const lastTimeReward = await shortingRewards.lastTimeRewardApplicable();

				assert.equal(cur.toString(), lastTimeReward.toString());
			});
		});
	});

	describe('rewardPerToken()', () => {
		it('should return 0', async () => {
			assert.bnEqual(await shortingRewards.rewardPerToken(), ZERO_BN);
		});

		it('should be > 0', async () => {
			tx = await short.open(toUnit(20000), toUnit(1), sBTC, { from: account1 });
			id = await getid(tx);

			const totalSupply = await shortingRewards.totalSupply();
			assert.bnGt(totalSupply, ZERO_BN);

			const rewardValue = toUnit(5000.0);
			await rewardsToken.transfer(shortingRewards.address, rewardValue, { from: owner });
			await shortingRewards.notifyRewardAmount(rewardValue, {
				from: mockRewardsDistributionAddress,
			});

			await fastForward(DAY);

			const rewardPerToken = await shortingRewards.rewardPerToken();
			assert.bnGt(rewardPerToken, ZERO_BN);

			await short.draw(id, toUnit(0.1), { from: account1 });

			await fastForward(DAY);

			const newRewardsPerToken = await shortingRewards.rewardPerToken();
			assert.bnGt(newRewardsPerToken, rewardPerToken);
		});
	});

	describe('onlyShort modifier', async () => {
		it('enrol() can only be called by the short contract', async () => {
			await assert.revert(
				shortingRewards.enrol(account1, toUnit(1), { from: account1 }),
				'Only Short Contract'
			);
		});

		it('withdraw() can only be called by the short contract', async () => {
			await assert.revert(
				shortingRewards.withdraw(account1, toUnit(1), { from: account1 }),
				'Only Short Contract'
			);
		});
	});

	describe('enrol()', () => {
		it('opening a short increases staking balance', async () => {
			const initialStakeBal = await shortingRewards.balanceOf(account1);

			await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });

			const postStakeBal = await shortingRewards.balanceOf(account1);

			assert.bnGt(postStakeBal, initialStakeBal);
		});

		it('drawing on a short increases the staking balance', async () => {
			const initialStakeBal = await shortingRewards.balanceOf(account1);

			tx = await short.open(toUnit(20000), toUnit(1), sBTC, { from: account1 });
			id = await getid(tx);

			const postOpenBal = await shortingRewards.balanceOf(account1);

			assert.bnGt(postOpenBal, initialStakeBal);
			assert.bnEqual(postOpenBal, toUnit(1));

			await fastForward(DAY);
			await short.draw(id, toUnit(0.1), { from: account1 });

			const postDrawBal = await shortingRewards.balanceOf(account1);

			assert.bnGt(postDrawBal, postOpenBal);
			assert.bnEqual(postDrawBal, toUnit(1.1));
		});
	});

	describe('When positions are liquidated, they are withdraw from the rewards', () => {
		it('closing reduces the balance to 0', async () => {
			const initialStakeBal = await shortingRewards.balanceOf(account1);

			tx = await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });
			id = await getid(tx);

			await fastForward(DAY);

			// Make the short so underwater it must get closed.
			await updateAggregatorRates(exchangeRates, [sBTC], ['20000'].map(toUnit));

			// close the loan via liquidation
			await issuesBTCtoAccount(toUnit(1), account2);
			await short.liquidate(account1, id, toUnit(1), { from: account2 });

			const postStakeBal = await shortingRewards.balanceOf(account1);

			// Should be back to 0
			assert.bnEqual(postStakeBal, initialStakeBal);
		});

		it('partial liquidation reduces the balannce', async () => {
			tx = await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });
			id = await getid(tx);

			await fastForward(DAY);

			// Make the short so underwater it must get closed.
			await updateAggregatorRates(exchangeRates, [sBTC], ['20000'].map(toUnit));

			// close the loan via liquidation
			await issuesBTCtoAccount(toUnit(1), account2);
			await short.liquidate(account1, id, toUnit(0.1), { from: account2 });

			const postStakeBal = await shortingRewards.balanceOf(account1);

			// Should be at 0.9 now
			assert.bnEqual(postStakeBal, toUnit(0.9));
		});
	});

	describe('earned()', () => {
		it('should be 0 when not staking', async () => {
			assert.bnEqual(await shortingRewards.earned(account1), ZERO_BN);
		});

		it('should be > 0 when staking', async () => {
			await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });

			const rewardValue = toUnit(5000.0);
			await rewardsToken.transfer(shortingRewards.address, rewardValue, { from: owner });
			await shortingRewards.notifyRewardAmount(rewardValue, {
				from: mockRewardsDistributionAddress,
			});

			await fastForward(DAY);

			const earned = await shortingRewards.earned(account1);

			assert.bnGt(earned, ZERO_BN);
		});

		it('rewardRate should increase if new rewards come before DURATION ends', async () => {
			const totalToDistribute = toUnit('5000');

			await rewardsToken.transfer(shortingRewards.address, totalToDistribute, { from: owner });
			await shortingRewards.notifyRewardAmount(totalToDistribute, {
				from: mockRewardsDistributionAddress,
			});

			const rewardRateInitial = await shortingRewards.rewardRate();

			await rewardsToken.transfer(shortingRewards.address, totalToDistribute, { from: owner });
			await shortingRewards.notifyRewardAmount(totalToDistribute, {
				from: mockRewardsDistributionAddress,
			});

			const rewardRateLater = await shortingRewards.rewardRate();

			assert.bnGt(rewardRateInitial, ZERO_BN);
			assert.bnGt(rewardRateLater, rewardRateInitial);
		});

		it('rewards token balance should rollover after DURATION', async () => {
			const totalToDistribute = toUnit('5000');

			await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });

			await rewardsToken.transfer(shortingRewards.address, totalToDistribute, { from: owner });
			await shortingRewards.notifyRewardAmount(totalToDistribute, {
				from: mockRewardsDistributionAddress,
			});

			await fastForward(DAY * 7);
			const earnedFirst = await shortingRewards.earned(account1);

			await setRewardsTokenExchangeRate();
			await rewardsToken.transfer(shortingRewards.address, totalToDistribute, { from: owner });
			await shortingRewards.notifyRewardAmount(totalToDistribute, {
				from: mockRewardsDistributionAddress,
			});

			await fastForward(DAY * 7);
			const earnedSecond = await shortingRewards.earned(account1);

			assert.bnEqual(earnedSecond, earnedFirst.add(earnedFirst));
		});
	});

	describe('getReward()', () => {
		it('should increase rewards token balance', async () => {
			const totalToDistribute = toUnit('5000');

			tx = await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });
			id = await getid(tx);

			await rewardsToken.transfer(shortingRewards.address, totalToDistribute, { from: owner });
			await shortingRewards.notifyRewardAmount(totalToDistribute, {
				from: mockRewardsDistributionAddress,
			});

			await fastForward(DAY);

			const initialRewardBal = await rewardsToken.balanceOf(account1);
			const initialEarnedBal = await shortingRewards.earned(account1);

			await issuesBTCtoAccount(toUnit(1), account1);
			await short.close(id, { from: account1 });
			await shortingRewards.getReward(account1);

			const postRewardBal = await rewardsToken.balanceOf(account1);
			const postEarnedBal = await shortingRewards.earned(account1);

			assert.bnLt(postEarnedBal, initialEarnedBal);
			assert.bnGt(postRewardBal, initialRewardBal);
		});
	});

	describe('setRewardsDuration()', () => {
		const sevenDays = DAY * 7;
		const seventyDays = DAY * 70;
		it('should increase rewards duration before starting distribution', async () => {
			const defaultDuration = await shortingRewards.rewardsDuration();
			assert.bnEqual(defaultDuration, sevenDays);

			await shortingRewards.setRewardsDuration(seventyDays, { from: owner });
			const newDuration = await shortingRewards.rewardsDuration();
			assert.bnEqual(newDuration, seventyDays);
		});
		it('should revert when setting setRewardsDuration before the period has finished', async () => {
			const totalToDistribute = toUnit('5000');

			tx = await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });
			id = await getid(tx);

			await rewardsToken.transfer(shortingRewards.address, totalToDistribute, { from: owner });
			await shortingRewards.notifyRewardAmount(totalToDistribute, {
				from: mockRewardsDistributionAddress,
			});

			await fastForward(DAY);

			await assert.revert(
				shortingRewards.setRewardsDuration(seventyDays, { from: owner }),
				'Previous rewards period must be complete before changing the duration for the new period'
			);
		});
		it('should update when setting setRewardsDuration after the period has finished', async () => {
			const totalToDistribute = toUnit('5000');

			tx = await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });
			id = await getid(tx);

			await rewardsToken.transfer(shortingRewards.address, totalToDistribute, { from: owner });
			await shortingRewards.notifyRewardAmount(totalToDistribute, {
				from: mockRewardsDistributionAddress,
			});

			await fastForward(DAY * 8);

			const transaction = await shortingRewards.setRewardsDuration(seventyDays, { from: owner });
			assert.eventEqual(transaction, 'RewardsDurationUpdated', {
				newDuration: seventyDays,
			});

			const newDuration = await shortingRewards.rewardsDuration();
			assert.bnEqual(newDuration, seventyDays);

			await shortingRewards.notifyRewardAmount(totalToDistribute, {
				from: mockRewardsDistributionAddress,
			});
		});

		it('should update when setting setRewardsDuration after the period has finished', async () => {
			const totalToDistribute = toUnit('5000');

			tx = await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });
			id = await getid(tx);

			await rewardsToken.transfer(shortingRewards.address, totalToDistribute, { from: owner });
			await shortingRewards.notifyRewardAmount(totalToDistribute, {
				from: mockRewardsDistributionAddress,
			});

			await fastForward(DAY * 4);
			await shortingRewards.getReward(account1);
			await fastForward(DAY * 4);

			// New Rewards period much lower
			await rewardsToken.transfer(shortingRewards.address, totalToDistribute, { from: owner });
			const transaction = await shortingRewards.setRewardsDuration(seventyDays, { from: owner });
			assert.eventEqual(transaction, 'RewardsDurationUpdated', {
				newDuration: seventyDays,
			});

			const newDuration = await shortingRewards.rewardsDuration();
			assert.bnEqual(newDuration, seventyDays);

			await shortingRewards.notifyRewardAmount(totalToDistribute, {
				from: mockRewardsDistributionAddress,
			});

			await fastForward(DAY * 71);
			await shortingRewards.getReward(account1);
		});
	});

	describe('getRewardForDuration()', () => {
		it('should increase rewards token balance', async () => {
			const totalToDistribute = toUnit('5000');
			await rewardsToken.transfer(shortingRewards.address, totalToDistribute, { from: owner });
			await shortingRewards.notifyRewardAmount(totalToDistribute, {
				from: mockRewardsDistributionAddress,
			});

			const rewardForDuration = await shortingRewards.getRewardForDuration();

			const duration = await shortingRewards.rewardsDuration();
			const rewardRate = await shortingRewards.rewardRate();

			assert.bnGt(rewardForDuration, ZERO_BN);
			assert.bnEqual(rewardForDuration, duration.mul(rewardRate));
		});
	});

	describe('withdraw()', () => {
		it('should increases lp token balance and decreases staking balance', async () => {
			const totalToStake = toUnit(1);

			tx = await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });
			id = await getid(tx);

			await fastForward(300);

			const initialStakeBal = await shortingRewards.balanceOf(account1);

			tx = await short.close(id, { from: account1 });

			const postStakeBal = await shortingRewards.balanceOf(account1);

			assert.bnEqual(postStakeBal.add(toBN(totalToStake)), initialStakeBal);
		});
	});

	describe('exit()', () => {
		it('should retrieve all earned and increase rewards bal', async () => {
			const totalToDistribute = toUnit('5000');

			tx = await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });
			id = await getid(tx);

			await rewardsToken.transfer(shortingRewards.address, totalToDistribute, { from: owner });
			await shortingRewards.notifyRewardAmount(toUnit(5000.0), {
				from: mockRewardsDistributionAddress,
			});

			await fastForward(DAY);

			const initialRewardBal = await rewardsToken.balanceOf(account1);
			const initialEarnedBal = await shortingRewards.earned(account1);
			await short.close(id, { from: account1 });
			await shortingRewards.getReward(account1);
			const postRewardBal = await rewardsToken.balanceOf(account1);
			const postEarnedBal = await shortingRewards.earned(account1);

			assert.bnLt(postEarnedBal, initialEarnedBal);
			assert.bnGt(postRewardBal, initialRewardBal);
			assert.bnEqual(postEarnedBal, ZERO_BN);
		});
	});

	describe('notifyRewardAmount()', () => {
		let localshortingRewards;

		before(async () => {
			localshortingRewards = await setupContract({
				accounts,
				contract: 'ShortingRewards',
				args: [owner, addressResolver.address, rewardsDistribution.address, rewardsToken.address],
			});

			await localshortingRewards.setRewardsDistribution(mockRewardsDistributionAddress, {
				from: owner,
			});
		});

		it('Reverts if the provided reward is greater than the balance.', async () => {
			const rewardValue = toUnit(1000);
			await rewardsToken.transfer(localshortingRewards.address, rewardValue, { from: owner });
			await assert.revert(
				localshortingRewards.notifyRewardAmount(rewardValue.add(toUnit(0.1)), {
					from: mockRewardsDistributionAddress,
				}),
				'Provided reward too high'
			);
		});

		it('Reverts if the provided reward is greater than the balance, plus rolled-over balance.', async () => {
			const rewardValue = toUnit(1000);
			await rewardsToken.transfer(localshortingRewards.address, rewardValue, { from: owner });
			localshortingRewards.notifyRewardAmount(rewardValue, {
				from: mockRewardsDistributionAddress,
			});
			await rewardsToken.transfer(localshortingRewards.address, rewardValue, { from: owner });
			// Now take into account any leftover quantity.
			await assert.revert(
				localshortingRewards.notifyRewardAmount(rewardValue.add(toUnit(0.1)), {
					from: mockRewardsDistributionAddress,
				}),
				'Provided reward too high'
			);
		});
	});

	describe('Integration Tests', () => {
		before(async () => {
			// Set rewardDistribution address
			await shortingRewards.setRewardsDistribution(rewardsDistribution.address, {
				from: owner,
			});
			assert.equal(await shortingRewards.rewardsDistribution(), rewardsDistribution.address);

			await setRewardsTokenExchangeRate();
		});

		it('stake and claim', async () => {
			// Transfer some LP Tokens to user
			const totalToStake = toUnit(1);

			tx = await short.open(toUnit(15000), toUnit(1), sBTC, { from: account1 });
			id = await getid(tx);

			// Distribute some rewards
			const totalToDistribute = toUnit('35000');
			assert.equal(await rewardsDistribution.distributionsLength(), 0);
			await rewardsDistribution.addRewardDistribution(shortingRewards.address, totalToDistribute, {
				from: owner,
			});
			assert.equal(await rewardsDistribution.distributionsLength(), 1);

			// Transfer Rewards to the RewardsDistribution contract address
			await rewardsToken.transfer(rewardsDistribution.address, totalToDistribute, { from: owner });

			// Distribute Rewards called from Synthetix contract as the authority to distribute
			await rewardsDistribution.distributeRewards(totalToDistribute, {
				from: authority,
			});

			// Period finish should be ~7 days from now
			const periodFinish = await shortingRewards.periodFinish();
			const curTimestamp = await currentTime();
			assert.equal(parseInt(periodFinish.toString(), 10), curTimestamp + DAY * 7);

			// Reward duration is 7 days, so we'll
			// Fastforward time by 6 days to prevent expiration
			await fastForward(DAY * 6);

			// Reward rate and reward per token
			const rewardRate = await shortingRewards.rewardRate();
			assert.bnGt(rewardRate, ZERO_BN);

			const rewardPerToken = await shortingRewards.rewardPerToken();
			assert.bnGt(rewardPerToken, ZERO_BN);

			// Make sure we earned in proportion to reward per token
			const rewardRewardsEarned = await shortingRewards.earned(account1);
			assert.bnEqual(rewardRewardsEarned, rewardPerToken.mul(totalToStake).div(toUnit(1)));

			// Make sure after withdrawing, we still have the ~amount of rewardRewards
			// The two values will be a bit different as time has "passed"
			tx = await short.repay(account1, id, toUnit(0.2), { from: account1 });

			const rewardRewardsEarnedPostWithdraw = await shortingRewards.earned(account1);
			assert.bnClose(rewardRewardsEarned, rewardRewardsEarnedPostWithdraw, toUnit('0.1'));
		});
	});
});
