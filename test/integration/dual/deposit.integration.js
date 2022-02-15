const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL2 } = require('../utils/optimism');
const { approveIfNeeded } = require('../utils/approve');

describe('deposit() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const amountToDeposit = ethers.utils.parseEther('10');

	let owner;
	let Synthetix, SynthetixL2, SynthetixBridgeToOptimism, SynthetixBridgeEscrow;

	let ownerBalance, ownerL2Balance, escrowBalance;

	let depositReceipt;

	describe('when the owner deposits MIME', () => {
		before('target contracts and users', () => {
			({ Synthetix, SynthetixBridgeToOptimism, SynthetixBridgeEscrow } = ctx.l1.contracts);
			({ Synthetix: SynthetixL2 } = ctx.l2.contracts);

			owner = ctx.l1.users.owner;
		});

		before('record balances', async () => {
			ownerBalance = await Synthetix.balanceOf(owner.address);
			ownerL2Balance = await SynthetixL2.balanceOf(owner.address);
			escrowBalance = await Synthetix.balanceOf(SynthetixBridgeEscrow.address);
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

			const tx = await SynthetixBridgeToOptimism.deposit(amountToDeposit);
			depositReceipt = await tx.wait();
		});

		it('decreases the owner balance', async () => {
			const newOwnerBalance = await Synthetix.balanceOf(owner.address);

			assert.bnEqual(newOwnerBalance, ownerBalance.sub(amountToDeposit));
		});

		it('increases the escrow balance', async () => {
			const newEscrowBalance = await Synthetix.balanceOf(SynthetixBridgeEscrow.address);

			assert.bnEqual(newEscrowBalance, escrowBalance.add(amountToDeposit));
		});

		describe('when the deposit gets picked up in L2', () => {
			before('target contracts and users', () => {
				owner = ctx.l2.users.owner;
			});

			before('wait for deposit finalization', async () => {
				await finalizationOnL2({ ctx, transactionHash: depositReceipt.transactionHash });
			});

			it('increases the owner balance', async () => {
				assert.bnEqual(
					await SynthetixL2.balanceOf(owner.address),
					ownerL2Balance.add(amountToDeposit)
				);
			});
		});
	});
});
