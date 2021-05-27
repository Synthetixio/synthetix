const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { ensureBalance } = require('../utils/balances');

function itCanPerformIssuance({ ctx }) {
	const SNXAmount = ethers.utils.parseEther('10000');
	const sUSDamount = ethers.utils.parseEther('10');

	let user, owner;

	let Synthetix, SynthsUSD, SystemSettings;

	before('target contracts and users', () => {
		({ Synthetix, SynthsUSD, SystemSettings } = ctx.contracts);

		user = ctx.user;
		owner = ctx.owner;
	});

	before('ensure the user has SNX', async () => {
		await ensureBalance({ ctx, symbol: 'SNX', user, balance: SNXAmount });
	});

	describe('when the user issues sUSD', () => {
		let balancesUSD;

		before('record balances', async () => {
			balancesUSD = await SynthsUSD.balanceOf(user.address);
		});

		before('perform the issuance', async () => {
			Synthetix = Synthetix.connect(user);

			const tx = await Synthetix.issueSynths(sUSDamount);
			await tx.wait();
		});

		it('issues the expected amount of sUSD', async () => {
			assert.bnEqual(await SynthsUSD.balanceOf(user.address), balancesUSD.add(sUSDamount));
		});
	});

	describe('when the user burns sUSD', () => {
		let balancesUSD;
		let minimumStakeTime;

		before('record values', async () => {
			balancesUSD = await SynthsUSD.balanceOf(user.address);
			minimumStakeTime = await SystemSettings.minimumStakeTime();
		});

		before('set MinimumStakeTime to 0', async () => {
			SystemSettings = SystemSettings.connect(owner);

			const tx = await SystemSettings.setMinimumStakeTime('0');
			await tx.wait();
		});

		after('set MinimumStakeTime back to its original setting', async () => {
			SystemSettings = SystemSettings.connect(owner);

			const tx = await SystemSettings.setMinimumStakeTime(minimumStakeTime);
			await tx.wait();
		});

		before('perform the burn', async () => {
			Synthetix = Synthetix.connect(user);

			const tx = await Synthetix.burnSynths(sUSDamount);
			await tx.wait();
		});

		it('burns the expected amount of sUSD', async () => {
			assert.bnEqual(await SynthsUSD.balanceOf(user.address), balancesUSD.sub(sUSDamount));
		});
	});
}

module.exports = {
	itCanPerformIssuance,
};
