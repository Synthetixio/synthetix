const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { ensureBalance } = require('../utils/balances');

function itCanPerformERC20Transfers({ ctx }) {
	const SNXAmount = ethers.utils.parseEther('10000');

	let user;
	let Synthetix;

	before('target contracts and users', () => {
		({ Synthetix } = ctx.contracts);

		user = ctx.user;
	});

	before('ensure the user has SNX', async () => {
		await ensureBalance({ ctx, symbol: 'SNX', user, balance: SNXAmount });
	});

	it('receives the expected amount of SNX', async () => {
		assert.bnEqual(await Synthetix.balanceOf(user.address), SNXAmount);
	});
}

module.exports = {
	itCanPerformERC20Transfers,
};
