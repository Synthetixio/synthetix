const ethers = require('ethers');
const { assert } = require('../../contracts/common');

function itBehavesLikeAnERC20({ ctx }) {
	describe('erc20 functionality', () => {
		let owner, user;
		let Synthetix;

		let userBalance;

		const amountToTransfer = ethers.utils.parseEther('1');

		before('target contracts and users', () => {
			({ Synthetix } = ctx.contracts);

			owner = ctx.users.owner;
			user = ctx.users.someUser;
		});

		before('record user balance', async () => {
			userBalance = await Synthetix.balanceOf(user.address);
		});

		describe('when the owner transfers SNX to the user', () => {
			before('transfer', async () => {
				Synthetix = Synthetix.connect(owner);

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
