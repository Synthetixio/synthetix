const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');

describe('Deposits integration tests (layer 1 and layer 2) - [DEPOSITS]', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const amountToDeposit = ethers.utils.parseEther('10');

	let owner;
	let Synthetix, SynthetixBridgeToOptimism, SynthetixBridgeEscrow;

	let ownerBalance, escrowBalance;

	let depositReceipt;

	before('target contracts and users', () => {
		({ Synthetix, SynthetixBridgeToOptimism, SynthetixBridgeEscrow } = ctx.l1.contracts);

		owner = ctx.l1.owner;
	});

	describe('when the owner deposits SNX', () => {
		before('record balances', async () => {
			ownerBalance = await Synthetix.balanceOf(owner.address);
			escrowBalance = await Synthetix.balanceOf(SynthetixBridgeEscrow.address);
		});

		before('approve if needed', async () => {
			const allowance = await Synthetix.allowance(owner.address, SynthetixBridgeToOptimism.address);

			if (allowance.lt(amountToDeposit)) {
				Synthetix = Synthetix.connect(owner);

				const tx = await Synthetix.approve(SynthetixBridgeToOptimism.address, amountToDeposit);
				await tx.wait();
			}
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
				({ Synthetix, SynthetixBridgeToBase } = ctx.l2.contracts);

				owner = ctx.l2.owner;
			});

			before('record balances', async () => {
				ownerBalance = await Synthetix.balanceOf(owner.address);
			});

			before('wait for deposit finalization', async () => {
				const [depositMessageHash] = await ctx.watcher.getMessageHashesFromL1Tx(
					depositReceipt.transactionHash
				);
				await ctx.watcher.getL2TransactionReceipt(depositMessageHash);
			});

			it('increases the owner balance', async () => {
				const newOwnerBalance = await Synthetix.balanceOf(owner.address);

				assert.bnEqual(newOwnerBalance, ownerBalance.add(amountToDeposit));
			});
		});
	});
});
