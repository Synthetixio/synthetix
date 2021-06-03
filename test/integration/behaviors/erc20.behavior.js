const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { ensureBalance } = require('../utils/balances');

function itBehavesLikeAnERC20({ ctx, contract }) {
	describe('erc20 functionality', () => {
		let owner, user;
		let Contract;

		let userBalance;

		const amountToTransfer = ethers.utils.parseEther('1');

		before('target contracts and users', async () => {
			if (contract) {
				Contract = ctx.contracts[contract];
				const symbol = await Contract.symbol();

				await ensureBalance({
					ctx,
					symbol,
					user: ctx.users.owner,
					balance: ethers.utils.parseEther('100'),
				});
			} else {
				const { Synthetix } = ctx.contracts;
				Contract = Synthetix;
			}

			owner = ctx.users.owner;
			user = ctx.users.someUser;
		});

		before('record user balance', async () => {
			userBalance = await Contract.balanceOf(user.address);
		});

		describe('when the owner transfers Tokens to the user', async () => {
			before('transfer', async () => {
				Contract = Contract.connect(owner);

				const tx = await Contract.transfer(user.address, amountToTransfer);
				await tx.wait();
			});

			it(`increases the users balance`, async () => {
				assert.bnEqual(await Contract.balanceOf(user.address), userBalance.add(amountToTransfer));
			});
		});
	});
}

module.exports = {
	itBehavesLikeAnERC20,
};
