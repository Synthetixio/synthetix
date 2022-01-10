const ethers = require('ethers');
const { toBytes32 } = require('../../../index');
const { assert } = require('../../contracts/common');
const { exchangeSomething } = require('../utils/exchanging');
const { ensureBalance } = require('../utils/balances');
const { skipFeePeriod, skipMinimumStakeTime } = require('../utils/skip');

function itCanStake({ ctx }) {
	describe('staking and claiming', () => {
		const SNXAmount = ethers.utils.parseEther('10000');
		const amountToIssueAndBurnsUSD = ethers.utils.parseEther('1');

		let user;
		let Synthetix, SynthsUSD, FeePool;
		let balancesUSD, debtsUSD;

		before('target contracts and users', () => {
			({ Synthetix, SynthsUSD, FeePool } = ctx.contracts);

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

			describe('claiming', () => {
				before('exchange something', async () => {
					await exchangeSomething({ ctx });
				});

				describe('when the fee period closes', () => {
					before('skip fee period', async () => {
						await skipFeePeriod({ ctx });
					});

					before('close the current fee period', async () => {
						FeePool = FeePool.connect(ctx.users.owner);

						const tx = await FeePool.closeCurrentFeePeriod();
						await tx.wait();
					});

					describe('when the user claims rewards', () => {
						before('record balances', async () => {
							balancesUSD = await SynthsUSD.balanceOf(user.address);
						});

						before('claim', async () => {
							FeePool = FeePool.connect(user);

							const tx = await FeePool.claimFees();
							const { gasUsed } = await tx.wait();
							console.log(`claimFees() gas used: ${Math.round(gasUsed / 1000).toString()}k`);
						});

						it('shows a slight increase in the users sUSD balance', async () => {
							assert.bnGt(await SynthsUSD.balanceOf(user.address), balancesUSD);
						});
					});
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
		});
	});
}

module.exports = {
	itCanStake,
};
