const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL1 } = require('../utils/optimism');

describe('withdrawTo() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const amountToWithdraw = ethers.utils.parseEther('10');

	let owner, user;
	let Synthetix, SynthetixBridgeToBase;

	let ownerBalance, beneficiaryBalance;

	let withdrawalReceipt;

	describe('when the owner withdraws SNX for a user', () => {
		before('target contracts and users', () => {
			({ Synthetix, SynthetixBridgeToBase } = ctx.l2.contracts);

			owner = ctx.l2.users.owner;
			user = ctx.l2.users.someUser;
		});

		before('record balances', async () => {
			ownerBalance = await Synthetix.balanceOf(owner.address);
		});

		before('make the withdrawal', async () => {
			SynthetixBridgeToBase = SynthetixBridgeToBase.connect(owner);

			const tx = await SynthetixBridgeToBase.withdrawTo(user.address, amountToWithdraw);
			withdrawalReceipt = await tx.wait();
		});

		it('decreases the owner balance', async () => {
			const newOwnerBalance = await Synthetix.balanceOf(owner.address);

			assert.bnEqual(newOwnerBalance, ownerBalance.sub(amountToWithdraw));
		});

		describe('when the withdrawal gets picked up in L1', () => {
			before('target contracts and users', () => {
				({ Synthetix } = ctx.l1.contracts);

				owner = ctx.l1.users.owner;
				user = ctx.l1.users.someUser;
			});

			before('record balances', async () => {
				beneficiaryBalance = await Synthetix.balanceOf(user.address);
			});

			before('wait for withdrawal finalization', async () => {
				await finalizationOnL1({ ctx, transactionHash: withdrawalReceipt.transactionHash });
			});

			it('increases the user balance', async () => {
				assert.bnEqual(
					await Synthetix.balanceOf(user.address),
					beneficiaryBalance.add(amountToWithdraw)
				);
			});
		});
	});
});
