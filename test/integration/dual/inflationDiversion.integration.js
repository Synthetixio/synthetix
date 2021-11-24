const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');

describe('inflationDiversion() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const rewardsToDeposit = ethers.utils.parseEther('25000');
	const tradingRewards = ethers.utils.parseEther('1000');

	let ownerL1, ownerL2;

	let FeePoolL2,
		RewardsDistributionL1,
		RewardsDistributionL2,
		RewardEscrowV2L2,
		Synthetix,
		SynthetixL2,
		SynthetixBridgeToOptimism,
		SynthetixBridgeEscrow,
		TradingRewards;

	let depositReceipt;

	let currentFeePeriodRewards;
	let rewardEscrowBalanceL2, tradingRewardsBalanceL2;
	const rewardsToDistribute = rewardsToDeposit.sub(tradingRewards);

	describe('when the owner diverts part of the inflation to L2', () => {
		before('target contracts and users', () => {
			({
				FeePool,
				RewardsDistribution: RewardsDistributionL1,
				Synthetix,
				SynthetixBridgeEscrow,
				SynthetixBridgeToOptimism,
			} = ctx.l1.contracts);

			({ RewardsDistribution: RewardsDistributionL2, TradingRewards, FeePool: FeePoolL2, RewardEscrowV2: RewardEscrowV2L2, Synthetix: SynthetixL2 } = ctx.l2.contracts);

			ownerL1 = ctx.l1.users.owner;
			ownerL2 = ctx.l2.users.owner;
		});

		describe('when new distributions are added (bridge)', () => {
			let escrowBalance;

			before('record values', async () => {
				escrowBalance = await Synthetix.balanceOf(SynthetixBridgeEscrow.address);

				rewardEscrowBalanceL2 = await SynthetixL2.balanceOf(RewardEscrowV2L2.address);
				tradingRewardsBalanceL2 = await SynthetixL2.balanceOf(TradingRewards.address);
				currentFeePeriodRewards = (await FeePoolL2.recentFeePeriods(0)).rewardsToDistribute;
			});

			before('add new distributions', async () => {
				Synthetix = Synthetix.connect(ownerL1);
				RewardsDistributionL1 = RewardsDistributionL1.connect(ownerL1);
				RewardsDistributionL2 = RewardsDistributionL2.connect(ownerL2);

				let tx = await RewardsDistributionL1.addRewardDistribution(
					SynthetixBridgeToOptimism.address,
					rewardsToDeposit
				);
				await tx.wait();

				tx = await RewardsDistributionL2.addRewardDistribution(
					TradingRewards.address,
					tradingRewards
				);
				await tx.wait();
			});

			it('populates the distributions array accordingly on both L1 and L2', async () => {
				let distribution = await RewardsDistributionL1.distributions(0);
				assert.equal(distribution.destination, SynthetixBridgeToOptimism.address);
				assert.bnEqual(distribution.amount, rewardsToDeposit);

				distribution = await RewardsDistributionL2.distributions(0);
				assert.equal(distribution.destination, TradingRewards.address);
				assert.bnEqual(distribution.amount, tradingRewards);
			});

			describe('when mint is invoked', () => {
				before('mint', async () => {
					Synthetix = Synthetix.connect(ownerL1);

					const tx = await Synthetix.mint();
					depositReceipt = await tx.wait();
				});

				it('increases the escrow balance', async () => {
					const newEscrowBalance = await Synthetix.balanceOf(SynthetixBridgeEscrow.address);

					assert.bnEqual(newEscrowBalance, escrowBalance.add(rewardsToDeposit));
				});

				describe('when the rewards deposit gets picked up in L2', () => {
					before('wait for deposit finalization', async () => {
						await finalizationOnL2({ ctx, transactionHash: depositReceipt.transactionHash });
					});

					it('increases the current fee periods rewards to distribute', async () => {
						assert.bnEqual(
							(await FeePoolL2.recentFeePeriods(0)).rewardsToDistribute,
							currentFeePeriodRewards.add(rewardsToDistribute)
						);
					});

					it('increases the TradingRewards balance on L2', async () => {
						assert.bnEqual(
							await SynthetixL2.balanceOf(TradingRewards.address),
							tradingRewardsBalanceL2.add(tradingRewards)
						);
					});

					it('increases the RewardEscrowV2 balance on L2', async () => {
						assert.bnEqual(
							await SynthetixL2.balanceOf(RewardEscrowV2L2.address),
							rewardEscrowBalanceL2.add(rewardsToDistribute)
						);
					});
				});
			});
		});
	});
});
