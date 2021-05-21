const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');

describe('Deposits integration tests (layer 1 and layer 2) - [DEPOSITS]', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const amountPerDeposit = ethers.utils.parseEther('10');
	const totalToDeposit = amountPerDeposit.mul(2);

	let owner, user;
	let Synthetix, SynthetixBridgeToOptimism, SynthetixBridgeEscrow;

	let ownerBalance, escrowBalance;

	let depositReceipt, depositsToReceipt;

	before('target contracts and users', () => {
		({ Synthetix, SynthetixBridgeToOptimism, SynthetixBridgeEscrow } = ctx.l1.contracts);

		owner = ctx.l1.owner;
		user = ctx.l1.user;
	});

	describe('when the owner deposits SNX', () => {
		before('record balances', async () => {
			ownerBalance = await Synthetix.balanceOf(owner.address);
			escrowBalance = await Synthetix.balanceOf(SynthetixBridgeEscrow.address);
		});

		before('approve if needed', async () => {
			const allowance = await Synthetix.allowance(owner.address, SynthetixBridgeToOptimism.address);

			if (allowance.lt(totalToDeposit)) {
				Synthetix = Synthetix.connect(owner);

				const tx = await Synthetix.approve(SynthetixBridgeToOptimism.address, totalToDeposit);
				await tx.wait();
			}
		});

		before('make two deposits', async () => {
			SynthetixBridgeToOptimism = SynthetixBridgeToOptimism.connect(owner);

			let tx;

			tx = await SynthetixBridgeToOptimism.deposit(amountPerDeposit);
			depositReceipt = await tx.wait();

			tx = await SynthetixBridgeToOptimism.depositTo(user.address, amountPerDeposit);
			depositToReceipt = await tx.wait();
		});

		it('decreases the owner balance', async () => {
			const newOwnerBalance = await Synthetix.balanceOf(owner.address);

			assert.bnEqual(newOwnerBalance, ownerBalance.sub(totalToDeposit));
		});

		it('increases the escrow balance', async () => {
			const newEscrowBalance = await Synthetix.balanceOf(SynthetixBridgeEscrow.address);

			assert.bnEqual(newEscrowBalance, escrowBalance.add(totalToDeposit));
		});

		describe('when the deposits get picked up in L2', () => {
			before('target contracts and users', () => {
				({ Synthetix, SynthetixBridgeToBase } = ctx.l2.contracts);

				owner = ctx.l2.owner;
				user = ctx.l2.user;
			});

			before('record balances', async () => {
				ownerBalance = await Synthetix.balanceOf(owner.address);
				userBalance = await Synthetix.balanceOf(user.address);
			});

			before('wait for deposit finalization', async () => {
				const [depositMessageHash] = await ctx.watcher.getMessageHashesFromL1Tx(
					depositReceipt.transactionHash
				);
				await ctx.watcher.getL2TransactionReceipt(depositMessageHash);

				const [depositToMessageHash] = await ctx.watcher.getMessageHashesFromL1Tx(
					depositToReceipt.transactionHash
				);
				await ctx.watcher.getL2TransactionReceipt(depositToMessageHash);
			});

			it('increases the owner balance', async () => {
				const newOwnerBalance = await Synthetix.balanceOf(owner.address);

				assert.bnEqual(newOwnerBalance, ownerBalance.add(amountPerDeposit));
			});

			it('increases the user balance', async () => {
				const newUserBalance = await Synthetix.balanceOf(user.address);

				assert.bnEqual(newUserBalance, userBalance.add(amountPerDeposit));
			});
		});
	});
});
