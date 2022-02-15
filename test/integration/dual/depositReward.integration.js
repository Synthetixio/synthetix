const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');
const { approveIfNeeded } = require('../utils/approve');

describe('depositReward() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const rewardsToDeposit = ethers.utils.parseEther('10');

	let owner;
	let FeePoolL2,
		Synthetix,
		SynthetixL2,
		SynthetixBridgeEscrow,
		SynthetixBridgeToOptimism,
		RewardEscrowV2L2;

	let depositReceipt, escrowBalance;
	let currentFeePeriodRewards, rewardEscrowBalanceL2;

	describe('when the owner deposits MIME for rewards', () => {
		before('target contracts and users', () => {
			({ Synthetix, SynthetixBridgeEscrow, SynthetixBridgeToOptimism } = ctx.l1.contracts);
			({
				FeePool: FeePoolL2,
				RewardEscrowV2: RewardEscrowV2L2,
				Synthetix: SynthetixL2,
			} = ctx.l2.contracts);

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

		before('record values', async () => {
			escrowBalance = await Synthetix.balanceOf(SynthetixBridgeEscrow.address);

			rewardEscrowBalanceL2 = await SynthetixL2.balanceOf(RewardEscrowV2L2.address);
			currentFeePeriodRewards = (await FeePoolL2.recentFeePeriods(0)).rewardsToDistribute;
		});

		before('deposit rewards', async () => {
			SynthetixBridgeToOptimism = SynthetixBridgeToOptimism.connect(owner);

			const tx = await SynthetixBridgeToOptimism.depositReward(rewardsToDeposit);
			depositReceipt = await tx.wait();
		});

		it('increases the escrow balance', async () => {
			const newEscrowBalance = await Synthetix.balanceOf(SynthetixBridgeEscrow.address);

			assert.bnEqual(newEscrowBalance, escrowBalance.add(rewardsToDeposit));
		});

		describe('when the deposit gets picked up in L2', () => {
			before('wait for deposit finalization', async () => {
				await finalizationOnL2({ ctx, transactionHash: depositReceipt.transactionHash });
			});

			it('increases the RewardEscrowV2 balance on L2', async () => {
				assert.bnEqual(
					await SynthetixL2.balanceOf(RewardEscrowV2L2.address),
					rewardEscrowBalanceL2.add(rewardsToDeposit)
				);
			});

			it('increases the current fee periods rewards to distribute', async () => {
				assert.bnEqual(
					(await FeePoolL2.recentFeePeriods(0)).rewardsToDistribute,
					currentFeePeriodRewards.add(rewardsToDeposit)
				);
			});
		});
	});
});
