const ethers = require('ethers');
const chalk = require('chalk');
const hre = require('hardhat');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { finalizationOnL1 } = require('../utils/optimism');

describe('withdrawTo() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const amountToWithdraw = ethers.utils.parseEther('10');

	let owner, user;
	let Synthetix, SynthetixL1, SynthetixBridgeToBase;

	let ownerBalance, beneficiaryBalance;

	let withdrawalReceipt;

	describe('when the owner withdraws MIME for a user', () => {
		before('target contracts and users', () => {
			({ Synthetix, SynthetixBridgeToBase } = ctx.l2.contracts);
			({ Synthetix: SynthetixL1 } = ctx.l1.contracts);

			owner = ctx.l2.users.owner;
			user = ctx.l2.users.someUser;
		});

		before('record balances', async () => {
			ownerBalance = await Synthetix.balanceOf(owner.address);
			beneficiaryBalance = await SynthetixL1.balanceOf(user.address);
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
			before(function() {
				if (!hre.config.debugOptimism) {
					console.log(
						chalk.yellow.bold(
							'WARNING: Skipping until ops tool relayer is stable for L1>L2 finalizations'
						)
					);
					this.skip();
				}
			});

			before('target contracts and users', () => {
				owner = ctx.l1.users.owner;
				user = ctx.l1.users.someUser;
			});

			before('wait for withdrawal finalization', async () => {
				await finalizationOnL1({ ctx, transactionHash: withdrawalReceipt.transactionHash });
			});

			it('increases the user balance', async () => {
				assert.bnEqual(
					await SynthetixL1.balanceOf(user.address),
					beneficiaryBalance.add(amountToWithdraw)
				);
			});
		});
	});
});
