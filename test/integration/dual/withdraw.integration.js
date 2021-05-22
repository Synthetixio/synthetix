const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { ensureBalance } = require('../utils/tokens');
const { finalizationOnL1 } = require('../utils/watchers');

describe('withdraw() integration tests', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const amountToWithdraw = ethers.utils.parseEther('10');

	let owner;
	let Synthetix, SynthetixBridgeToBase;

	let ownerBalance, beneficiaryBalance;

	let withdrawalReceipt;

	function itCanPerformWithdrawals({ to }) {
		describe(`when the owner withdraws SNX for ${to}`, () => {
			let beneficiary;

			before('target contracts and users', () => {
				({ Synthetix, SynthetixBridgeToBase } = ctx.l2.contracts);

				owner = ctx.l2.owner;
				beneficiary = ctx.l2[to];
			});

			before('ensure the owner has SNX on L2', async () => {
				await ensureBalance({ ctx: ctx.l2, symbol: 'SNX', user: owner, balance: amountToWithdraw });
			});

			before('record balances', async () => {
				ownerBalance = await Synthetix.balanceOf(owner.address);
			});

			before('make the withdrawal', async () => {
				SynthetixBridgeToBase = SynthetixBridgeToBase.connect(owner);

				let tx;
				if (owner === beneficiary) {
					tx = await SynthetixBridgeToBase.withdraw(amountToWithdraw);
				} else {
					tx = await SynthetixBridgeToBase.withdrawTo(beneficiary.address, amountToWithdraw);
				}

				withdrawalReceipt = await tx.wait();
			});

			it('decreases the owner balance', async () => {
				const newOwnerBalance = await Synthetix.balanceOf(owner.address);

				assert.bnEqual(newOwnerBalance, ownerBalance.sub(amountToWithdraw));
			});

			describe('when the withdrawal gets picked up in L1', () => {
				before('target contracts and users', () => {
					({ Synthetix } = ctx.l1.contracts);

					owner = ctx.l1.owner;
					beneficiary = ctx.l1[to];
				});

				before('record balances', async () => {
					beneficiaryBalance = await Synthetix.balanceOf(beneficiary.address);
				});

				before('wait for withdrawal finalization', async () => {
					await finalizationOnL1({ ctx, transactionHash: withdrawalReceipt.transactionHash });
				});

				it('increases the beneficiary balance', async () => {
					const newBeneficiaryBalance = await Synthetix.balanceOf(beneficiary.address);

					assert.bnEqual(newBeneficiaryBalance, beneficiaryBalance.add(amountToWithdraw));
				});
			});
		});
	}

	itCanPerformWithdrawals({ to: 'owner' });
	itCanPerformWithdrawals({ to: 'user' });
});
