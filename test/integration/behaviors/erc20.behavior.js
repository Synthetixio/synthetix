const ethers = require('ethers');
const { assert } = require('../../contracts/common');

function itBehavesLikeAnERC20({ ctx }) {
	describe('erc20 functionality', () => {
		let user;
		let Synthetix;

		let userBalance;

		before('target contracts and users', () => {
			({ Synthetix } = ctx.contracts);

			user = ctx.users.someUser;
		});

		before('record user balance', async () => {
			userBalance = await Synthetix.balanceOf(user.address);
		});

		describe('when the owner transfers SNX to the user', () => {
			const amountToTransfer = ethers.utils.parseEther('1');

			before('transfer', async () => {
				Synthetix = Synthetix.connect(ctx.users.owner);

				const tx = await Synthetix.transfer(user.address, amountToTransfer);
				await tx.wait();
			});

			it('increases the users balance', async () => {
				assert.bnEqual(await Synthetix.balanceOf(user.address), userBalance.add(amountToTransfer));
			});
		});
	});
}

module.exports = {
	itBehavesLikeAnERC20,
};
