const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { ensureBalance } = require('../utils/balances');
const { ignoreMinimumStakeTime } = require('../utils/staking');

function itCanMintAndBurn({ ctx }) {
	describe('staking', () => {
		const SNXAmount = ethers.utils.parseEther('100');
		const sUSDamount = ethers.utils.parseEther('1');

		let user;
		let Synthetix, SynthsUSD;
		let balancesUSD;

		before('target contracts and users', () => {
			({ Synthetix, SynthsUSD } = ctx.contracts);

			user = ctx.users.someUser;
		});

		before('ensure the user has enough SNX', async () => {
			await ensureBalance({ ctx, symbol: 'SNX', user, balance: SNXAmount });
		});

		describe('when the user issues sUSD', () => {
			before('record balances', async () => {
				balancesUSD = await SynthsUSD.balanceOf(user.address);
			});

			before('issue sUSD', async () => {
				Synthetix = Synthetix.connect(user);

				const tx = await Synthetix.issueSynths(sUSDamount);
				await tx.wait();
			});

			it('issues the expected amount of sUSD', async () => {
				assert.bnEqual(await SynthsUSD.balanceOf(user.address), balancesUSD.add(sUSDamount));
			});
		});

		describe('when the user burns sUSD', () => {
			ignoreMinimumStakeTime({ ctx });

			before('record values', async () => {
				balancesUSD = await SynthsUSD.balanceOf(user.address);
			});

			before('burn sUSD', async () => {
				Synthetix = Synthetix.connect(user);

				const tx = await Synthetix.burnSynths(sUSDamount);
				await tx.wait();
			});

			it('burnt the expected amount of sUSD', async () => {
				const newBalancesUSD = await SynthsUSD.balanceOf(user.address);
				const expected = balancesUSD.sub(sUSDamount);
				const delta = newBalancesUSD.sub(expected);
				const variance = ethers.utils.parseUnits('2', 'gwei');

				assert.bnLt(delta, variance);
			});
		});
	});
}

module.exports = {
	itCanMintAndBurn,
};
