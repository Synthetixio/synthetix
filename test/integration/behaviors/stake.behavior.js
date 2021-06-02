const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { exchangeSomething, ignoreFeePeriodDuration } = require('../utils/exchanging');
const { ensureBalance } = require('../utils/balances');
const { ignoreMinimumStakeTime } = require('../utils/staking');
const { skipIfL2 } = require('../utils/l2');

function itCanStake({ ctx }) {
	describe('staking and claiming', () => {
		const SNXAmount = ethers.utils.parseEther('100');
		const sUSDamount = ethers.utils.parseEther('1');

		let user;
		let Synthetix, SynthsUSD, FeePool;
		let balancesUSD;

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

				const tx = await Synthetix.issueSynths(sUSDamount);
				await tx.wait();
			});

			it('issues the expected amount of sUSD', async () => {
				assert.bnEqual(await SynthsUSD.balanceOf(user.address), balancesUSD.add(sUSDamount));
			});

			describe('claiming', () => {
				// TODO: Disabled until Optimism supports 5s time granularity.
				// We can set fee period duration to 5s, but we dont want this test
				// to wait 3m, which is the current time granularity.
				skipIfL2({
					ctx,
					reason:
						'ops L2 time granularity needs to be less than 3m, so we cant close the fee period',
				});

				before('exchange something', async () => {
					await exchangeSomething({ ctx });
				});

				describe('when the fee period closes', () => {
					ignoreFeePeriodDuration({ ctx });

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
							await tx.wait();
						});

						it('shows a slight increase in the users sUSD balance', async () => {
							assert.bnGt(await SynthsUSD.balanceOf(user.address), balancesUSD);
						});
					});
				});
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
	itCanStake,
};
