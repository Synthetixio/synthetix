const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');
const { approveIfNeeded } = require('../utils/approve');

describe('depositReward() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const amountToDeposit = ethers.utils.parseEther('10');

	let owner;
	let Synthetix, SynthetixBridgeToOptimism, FeePool;

	let depositReceipt;

	describe('when the owner deposits SNX for rewards', () => {
		before('target contracts and users', () => {
			({ Synthetix, SynthetixBridgeToOptimism } = ctx.l1.contracts);

			owner = ctx.l1.users.owner;
		});

		before('approve if needed', async () => {
			await approveIfNeeded({
				token: Synthetix,
				owner,
				beneficiary: SynthetixBridgeToOptimism,
				amount: amountToDeposit,
			});
		});

		before('make the deposit', async () => {
			SynthetixBridgeToOptimism = SynthetixBridgeToOptimism.connect(owner);

			const tx = await SynthetixBridgeToOptimism.depositReward(amountToDeposit);
			depositReceipt = await tx.wait();
		});

		describe('when the deposit gets picked up in L2', () => {
			let currentFeePeriodRewards;

			before('target contracts', () => {
				({ FeePool } = ctx.l2.contracts);
			});

			before('record current fee period rewards', async () => {
				currentFeePeriodRewards = (await FeePool.recentFeePeriods(0)).rewardsToDistribute;
			});

			before('wait for deposit finalization', async () => {
				await finalizationOnL2({ ctx, transactionHash: depositReceipt.transactionHash });
			});

			it('increases the current fee periods rewards to distribute', async () => {
				assert.bnEqual(
					(await FeePool.recentFeePeriods(0)).rewardsToDistribute,
					currentFeePeriodRewards.add(amountToDeposit)
				);
			});
		});
	});
});
