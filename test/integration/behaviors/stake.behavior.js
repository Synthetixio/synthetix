const ethers = require('ethers');
const { toBytes32 } = require('../../../index');
const { assert } = require('../../contracts/common');
const { ensureBalance } = require('../utils/balances');
const { skipMinimumStakeTime } = require('../utils/skip');
const { resumeIssuance } = require('../utils/status');
const { createMockAggregatorFactory } = require('../../utils/index')();

function itCanStake({ ctx }) {
	describe('staking and claiming', () => {
		const SNXAmount = ethers.utils.parseEther('1000');
		const amountToIssueAndBurnsUSD = ethers.utils.parseEther('1');

		let user, owner;
		let AddressResolver, Synthetix, SynthetixDebtShare, SynthsUSD, Issuer;
		let balancesUSD, debtsUSD;

		before('target contracts and users', () => {
			({ AddressResolver, Synthetix, SynthetixDebtShare, SynthsUSD, Issuer } = ctx.contracts);

			user = ctx.users.someUser;
			owner = ctx.users.owner;
		});

		beforeEach('resume issuance', async () => {
			if (ctx.fork) {
				// in case issuance is suspended in a fork, resume it
				// (note: bootstrap should fix this - not sure why it's necessary here strictly
				// also not sure why it's necessary as "beforeEach" rather than a single before) - JJ
				await resumeIssuance({ ctx });
			}
		});

		before('setup mock debt ratio aggregator', async () => {
			const MockAggregatorFactory = await createMockAggregatorFactory(owner);
			const aggregator = (await MockAggregatorFactory.deploy()).connect(owner);

			await (await aggregator.setDecimals(27)).wait();
			const { timestamp } = await ctx.provider.getBlock();
			// debt share ratio of 0.5
			await (
				await aggregator.setLatestAnswer(ethers.utils.parseUnits('0.5', 27), timestamp)
			).wait();

			AddressResolver = AddressResolver.connect(owner);
			await (
				await AddressResolver.importAddresses(
					[toBytes32('ext:AggregatorDebtRatio')],
					[aggregator.address]
				)
			).wait();
			await (await Issuer.connect(owner).rebuildCache()).wait();
		});

		before('ensure the user has enough SNX', async () => {
			await ensureBalance({ ctx, symbol: 'SNX', user, balance: SNXAmount });
		});

		describe('when the user issues sUSD', () => {
			before('record balances', async () => {
				// balances are zero
				balancesUSD = await SynthsUSD.balanceOf(user.address); // 0 sUSD
				debtsUSD = await SynthetixDebtShare.balanceOf(user.address); // 0 SDS
			});

			before('issue sUSD', async () => {
				Synthetix = Synthetix.connect(user);

				const tx = await Synthetix.issueSynths(amountToIssueAndBurnsUSD);
				const { gasUsed } = await tx.wait();
				console.log(`issueSynths() gas used: ${Math.round(gasUsed / 1000).toString()}k`);
			});

			it('issues the expected amount of sUSD', async () => {
				// issued 1 sUSD
				// sUSD balance is now 1
				assert.bnEqual(
					await SynthsUSD.balanceOf(user.address),
					balancesUSD.add(amountToIssueAndBurnsUSD)
				);
			});

			it('issues the expected amount of debt shares', async () => {
				// first time it adds 1 debt share (equal to amount minted)
				// SDS balance is now 1
				assert.bnEqual(
					await SynthetixDebtShare.balanceOf(user.address),
					debtsUSD.add(amountToIssueAndBurnsUSD)
				);
			});

			describe('when the user issues sUSD again', () => {
				before('record balances', async () => {
					balancesUSD = await SynthsUSD.balanceOf(user.address); // 1 sUSD
					debtsUSD = await SynthetixDebtShare.balanceOf(user.address); // 1 SDS
				});

				before('issue sUSD', async () => {
					const tx = await Synthetix.issueSynths(amountToIssueAndBurnsUSD.mul(2));
					await tx.wait();
				});

				it('issues the expected amount of sUSD', async () => {
					// issued 2 sUSD
					// sUSD balance is now 4
					assert.bnEqual(
						await SynthsUSD.balanceOf(user.address),
						balancesUSD.add(amountToIssueAndBurnsUSD.mul(2))
					);
				});

				it('issues the expected amount of debt shares', async () => {
					// adds (2 sUSD / 0.5) = 4 debt shares
					// SDS balance is now 5
					assert.bnEqual(
						await SynthetixDebtShare.balanceOf(user.address),
						debtsUSD.add(amountToIssueAndBurnsUSD.mul(4))
					);
				});

				describe('when the user burns this new amount of sUSD', () => {
					before('record balances', async () => {
						balancesUSD = await SynthsUSD.balanceOf(user.address); // 4 sUSD
						debtsUSD = await SynthetixDebtShare.balanceOf(user.address); // 5 SDS
					});

					before('skip min stake time', async () => {
						await skipMinimumStakeTime({ ctx });
					});

					before('burn sUSD', async () => {
						const tx = await Synthetix.burnSynths(amountToIssueAndBurnsUSD);
						await tx.wait();
					});

					it('debt should decrease', async () => {
						// burnt 1 sUSD
						// sUSD balance is now 3
						assert.bnEqual(
							await SynthsUSD.balanceOf(user.address),
							balancesUSD.sub(amountToIssueAndBurnsUSD)
						);
					});

					it('debt share should decrease correctly', async () => {
						// burns (1 sUSD / 0.5) = 2 debt shares
						// SDS balance is now 3
						assert.bnEqual(
							await SynthetixDebtShare.balanceOf(user.address),
							debtsUSD.sub(amountToIssueAndBurnsUSD.mul(2))
						);
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

			it('reduces the expected amount of debt', async () => {
				const newDebtsUSD = await Synthetix.debtBalanceOf(user.address, toBytes32('sUSD'));
				const debtReduction = debtsUSD.sub(newDebtsUSD);

				const tolerance = ethers.utils.parseUnits('0.01', 'ether');
				assert.bnClose(
					debtReduction.toString(),
					amountToIssueAndBurnsUSD.toString(),
					tolerance.toString()
				);
			});

			it('reduces the expected amount of debt shares', async () => {
				// burns (1 sUSD / 0.5) = 2 debt shares
				// SDS balance is now 1
				assert.bnEqual(await SynthetixDebtShare.balanceOf(user.address), amountToIssueAndBurnsUSD);
			});

			describe('when the user burns sUSD again', () => {
				before('record balances', async () => {
					balancesUSD = await SynthsUSD.balanceOf(user.address); // 1 sUSD
					debtsUSD = await SynthetixDebtShare.balanceOf(user.address); // 1 SDS
				});

				before('burn sUSD', async () => {
					const tx = await Synthetix.burnSynths(amountToIssueAndBurnsUSD);
					await tx.wait();
				});

				it('burned the expected amount of sUSD', async () => {
					// burned 1 sUSD
					// sUSD balance is now 0.5
					assert.bnEqual(
						await SynthsUSD.balanceOf(user.address),
						balancesUSD.sub(amountToIssueAndBurnsUSD.div(2))
					);
				});

				it('burns the expected amount of debt shares', async () => {
					// burned (1 sUSD / 0.5) = 2 debt shares
					// SDS balance is now 0.5
					assert.bnEqual(
						await SynthetixDebtShare.balanceOf(user.address),
						debtsUSD.sub(amountToIssueAndBurnsUSD)
					);
				});
			});
		});
	});
}

module.exports = {
	itCanStake,
};
