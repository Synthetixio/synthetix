const ethers = require('ethers');
const { toBytes32 } = require('../../../index');
const { assert } = require('../../contracts/common');
const { ensureBalance } = require('../utils/balances');
const { skipMinimumStakeTime } = require('../utils/skip');
// const { createMockAggregatorFactory } = require('../../utils/index')();

function itCanStake({ ctx }) {
	describe('staking and claiming', () => {
		const SNXAmount = ethers.utils.parseEther('1000');
		const amountToIssueAndBurnsUSD = ethers.utils.parseEther('1');

		// let user, owner;
		let user;
		// let AddressResolver, Synthetix, SynthetixDebtShare, SynthsUSD;
		let Synthetix, SynthsUSD;
		let balancesUSD, debtsUSD;

		before('target contracts and users', () => {
			({ Synthetix, SynthsUSD } = ctx.contracts);
			// ({ AddressResolver, Synthetix, SynthetixDebtShare, SynthsUSD } = ctx.contracts);

			user = ctx.users.someUser;
			// owner = ctx.users.owner;
		});

		// before('setup mock debt ratio aggregator', async () => {
		// 	const MockAggregatorFactory = await createMockAggregatorFactory(owner);
		// 	const aggregator = (await MockAggregatorFactory.deploy()).connect(owner);

		// 	await (await aggregator.setDecimals(27)).wait();
		// 	const { timestamp } = await ctx.provider.getBlock();
		// 	// debt share ratio of 0.5
		// 	await (
		// 		await aggregator.setLatestAnswer(ethers.utils.parseUnits('0.5', 27), timestamp)
		// 	).wait();

		// 	AddressResolver = AddressResolver.connect(owner);
		// 	AddressResolver.importAddresses([toBytes32('ext:AggregatorDebtRatio')], [aggregator.address]);
		// });

		before('ensure the user has enough SNX', async () => {
			await ensureBalance({ ctx, symbol: 'SNX', user, balance: SNXAmount });
		});

		describe('when the user issues sUSD', () => {
			before('record balances', async () => {
				balancesUSD = await SynthsUSD.balanceOf(user.address);
			});

			before('issue sUSD', async () => {
				Synthetix = Synthetix.connect(user);

				const tx = await Synthetix.issueSynths(amountToIssueAndBurnsUSD);
				const { gasUsed } = await tx.wait();
				console.log(`issueSynths() gas used: ${Math.round(gasUsed / 1000).toString()}k`);
			});

			it('issues the expected amount of sUSD', async () => {
				assert.bnEqual(
					await SynthsUSD.balanceOf(user.address),
					balancesUSD.add(amountToIssueAndBurnsUSD)
				);
			});

			it('issues the expected amount of debt shares'); // pending

			describe('when the user issues sUSD again', () => {
				before('issue sUSD', async () => {
					// const tx = await Synthetix.issueSynths(amountToIssueAndBurnsUSD);
					// await tx.wait();
				});

				it('issues the expected amount of sUSD'); // pending

				it('issues half the amount of sUSD'); // pending

				describe('when the user burns this new amount of sUSD', () => {
					it('debt should decrease'); // pending

					it('debt share should decrease correctly'); // pending
				});
			});
		});

		describe('when the user burns sUSD', () => {
			before('skip min stake time', async () => {
				await skipMinimumStakeTime({ ctx });
			});

			before('record debt', async () => {
				debtsUSD = await Synthetix.debtBalanceOf(user.address, toBytes32('sUSD'));
			});

			before('burn sUSD', async () => {
				Synthetix = Synthetix.connect(user);

				const tx = await Synthetix.burnSynths(amountToIssueAndBurnsUSD);
				const { gasUsed } = await tx.wait();
				console.log(`burnSynths() gas used: ${Math.round(gasUsed / 1000).toString()}k`);
			});

			it('reduced the expected amount of debt', async () => {
				const newDebtsUSD = await Synthetix.debtBalanceOf(user.address, toBytes32('sUSD'));
				const debtReduction = debtsUSD.sub(newDebtsUSD);

				const tolerance = ethers.utils.parseUnits('0.01', 'ether');
				assert.bnClose(
					debtReduction.toString(),
					amountToIssueAndBurnsUSD.toString(),
					tolerance.toString()
				);
			});

			it('reduces the expected amount of debt shares'); // pending
		});
	});
}

module.exports = {
	itCanStake,
};
