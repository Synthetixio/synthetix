const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');
const { approveIfNeeded } = require('../utils/approve');

describe('notifyRewardAmount() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const rewardsToDeposit = ethers.utils.parseEther('10');

	let owner;
	let FeePool,
		RewardsDistribution,
		RewardEscrowV2,
		Synthetix,
		SynthetixBridgeToOptimism,
		SynthetixBridgeEscrow;

	let depositReceipt;

	describe('when the owner diverts part of the inflation to L2', () => {
		before('target contracts and users', () => {
			({
				FeePool,
				RewardsDistribution,
				Synthetix,
				SynthetixBridgeEscrow,
				SynthetixBridgeToOptimism,
			} = ctx.l1.contracts);

			owner = ctx.l1.users.owner;
		});

		before('approve if needed', async () => {
			await approveIfNeeded({
				token: Synthetix,
				owner,
				beneficiary: SynthetixBridgeToOptimism,
				amount: rewardsToDeposit,
			});
		});

		describe('when a new distribution is added (bridge)', () => {
			let escrowBalance;

			before('record values', async () => {
				escrowBalance = await Synthetix.balanceOf(SynthetixBridgeEscrow.address);
			});

			before('add a new distribution and mint', async () => {
				RewardsDistribution = RewardsDistribution.connect(owner);
				Synthetix = Synthetix.connect(owner);

				let tx = await RewardsDistribution.addRewardDistribution(
					SynthetixBridgeToOptimism.address,
					rewardsToDeposit
				);
				await tx.wait();

				tx = await Synthetix.mint();
				depositReceipt = await tx.wait();
			});

			it('increases the escrow balance', async () => {
				const newEscrowBalance = await Synthetix.balanceOf(SynthetixBridgeEscrow.address);

				assert.bnEqual(newEscrowBalance, escrowBalance.add(rewardsToDeposit));
			});

			describe('when the rewards deposit gets picked up in L2', () => {
				let currentFeePeriodRewards;
				let rewardEscrowBalanceL2;

				before('target contracts', () => {
					({ FeePool, RewardEscrowV2, Synthetix } = ctx.l2.contracts);
				});

				before('record current values', async () => {
					rewardEscrowBalanceL2 = await Synthetix.balanceOf(RewardEscrowV2.address);
					currentFeePeriodRewards = (await FeePool.recentFeePeriods(0)).rewardsToDistribute;
				});

				before('wait for deposit finalization', async () => {
					await finalizationOnL2({ ctx, transactionHash: depositReceipt.transactionHash });
				});

				it('increases the current fee periods rewards to distribute', async () => {
					assert.bnEqual(
						(await FeePool.recentFeePeriods(0)).rewardsToDistribute,
						currentFeePeriodRewards.add(rewardsToDeposit)
					);
				});

				it('increases the RewardEscrowV2 balance', async () => {
					assert.bnEqual(
						await Synthetix.balanceOf(RewardEscrowV2.address),
						rewardEscrowBalanceL2.add(rewardsToDeposit)
					);
				});
			});
		});
	});
});
