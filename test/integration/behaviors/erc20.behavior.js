const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { ensureBalance } = require('../utils/balances');

function itBehavesLikeAnERC20({ ctx, contract }) {
	describe('erc20 functionality', () => {
		let owner, user;
		let Token;

		let userBalance;

		const amountToTransfer = ethers.utils.parseEther('1');

		before('target contracts and users', () => {
			if (contract) {
				Token = ctx.contracts[contract];
			} else {
				const { Synthetix } = ctx.contracts;
				Token = Synthetix;
			}

			owner = ctx.users.owner;
			user = ctx.users.someUser;
		});

		before('ensure owner balance for Token', async () => {
			const symbol = await Token.symbol();

			await ensureBalance({
				ctx,
				symbol,
				user: ctx.users.owner,
				balance: ethers.utils.parseEther('10'),
			});
		});

		before('record user balance', async () => {
			userBalance = await Token.balanceOf(user.address);
		});

		describe('when the owner transfers Tokens to the user', async () => {
			before('transfer', async () => {
				Token = Token.connect(owner);

				const tx = await Token.transfer(user.address, amountToTransfer);
				await tx.wait();
			});

			it('increases the users balance', async () => {
				assert.bnEqual(await Token.balanceOf(user.address), userBalance.add(amountToTransfer));
			});
		});
	});
}

module.exports = {
	itBehavesLikeAnERC20,
};
