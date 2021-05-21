const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { ensureBalance } = require('../utils/tokens');

describe.only('withdraw() integration tests', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const amountToWithdraw = ethers.utils.parseEther('10');

	let owner;
	let Synthetix, SynthetixBridgeToBase, SynthetixBridgeEscrow;

	let withdrawalReceipt;

	before('target contracts and users', () => {
		({ SynthetixBridgeEscrow } = ctx.l1.contracts);
		({ Synthetix, SynthetixBridgeToBase } = ctx.l2.contracts);

		[owner] = ctx.l2.users;
	});

	before('ensure the owner has SNX on L2', async () => {
		await ensureBalance({ ctx: ctx.l2, tokenName: 'Synthetix', user: owner, balance: amountToWithdraw });
	});

	before('ensure the escrow has SNX on L1', async () => {
		await ensureBalance({ ctx: ctx.l1, tokenName: 'Synthetix', user: SynthetixBridgeEscrow, balance: amountToWithdraw });
	});

	describe('when the owner withdraws SNX', () => {
		before('record balances', async () => {
			ownerBalance = await Synthetix.balanceOf(owner.address);
		});

		before('make the withdrawal', async () => {
			SynthetixBridgeToBase = SynthetixBridgeToBase.connect(owner);

			const tx = await SynthetixBridgeToBase.withdraw(amountToWithdraw);
			withdrawalReceipt = await tx.wait();
		});

		it('decreases the owner balance', async () => {
			const newOwnerBalance = await Synthetix.balanceOf(owner.address);

			assert.bnEqual(newOwnerBalance, ownerBalance.sub(amountToWithdraw));
		});

		describe('when the withdrawal gets picked up in L2', () => {
			before('target contracts and users', () => {
				({ Synthetix } = ctx.l1.contracts);

				[owner] = ctx.l1.users;
			});

			before('record balances', async () => {
				ownerBalance = await Synthetix.balanceOf(owner.address);
			});

			before('wait for withdrawal finalization', async () => {
				const [withdrawalMessageHash] = await ctx.watcher.getMessageHashesFromL1Tx(
					withdrawalReceipt.transactionHash
				);
				await ctx.watcher.getL2TransactionReceipt(withdrawalMessageHash);
			});

			it('increases the owner balance', async () => {
				const newOwnerBalance = await Synthetix.balanceOf(owner.address);

				assert.bnEqual(newOwnerBalance, ownerBalance.add(amountToDeposit));
			});
		});
	});
});
