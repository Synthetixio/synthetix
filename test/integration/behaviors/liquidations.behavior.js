const ethers = require('ethers');
const chalk = require('chalk');
const { toBytes32 } = require('../../../index');
const { assert } = require('../../contracts/common');
const { getRate, addAggregatorAndSetRate } = require('../utils/rates');
const { ensureBalance } = require('../utils/balances');
const { skipLiquidationDelay } = require('../utils/skip');

function itCanLiquidate({ ctx }) {
	describe('liquidating', () => {
		let user7;
		let owner;
		let someUser;
		let liquidatedUser;
		let liquidatorUser;
		let flaggerUser;
		let exchangeRate;
		let Liquidator, LiquidatorRewards, Synthetix, SynthetixDebtShare, SystemSettings;

		before('target contracts and users', () => {
			({
				Liquidator,
				LiquidatorRewards,
				Synthetix,
				SynthetixDebtShare,
				SystemSettings,
			} = ctx.contracts);

			({ owner, someUser, liquidatedUser, flaggerUser, liquidatorUser, user7 } = ctx.users);

			SystemSettings = SystemSettings.connect(owner);
		});

		before(async function() {
			if (!SystemSettings.flagReward) {
				console.log(chalk.yellow('> Skipping since SIP-148 is not implemented'));
				this.skip();
			}
		});

		before('system settings are set', async () => {
			await SystemSettings.setIssuanceRatio(ethers.utils.parseEther('0.25')); // 400% c-ratio
			await SystemSettings.setLiquidationRatio(ethers.utils.parseEther('0.5')); // 200% c-ratio
			await SystemSettings.setLiquidationPenalty(ethers.utils.parseEther('0.3')); // 30% penalty
			await SystemSettings.setSelfLiquidationPenalty(ethers.utils.parseEther('0.2')); // 20% penalty
			await SystemSettings.setFlagReward(ethers.utils.parseEther('1')); // 1 SNX
			await SystemSettings.setLiquidateReward(ethers.utils.parseEther('2')); // 2 SNX
		});

		before('ensure liquidatedUser has SNX', async () => {
			await ensureBalance({
				ctx,
				symbol: 'SNX',
				user: liquidatedUser,
				balance: ethers.utils.parseEther('800'),
			});
		});

		before('ensure someUser has SNX', async () => {
			await ensureBalance({
				ctx,
				symbol: 'SNX',
				user: someUser,
				balance: ethers.utils.parseEther('8000'),
			});
		});

		before('ensure user7 has SNX', async () => {
			await ensureBalance({
				ctx,
				symbol: 'SNX',
				user: user7,
				balance: ethers.utils.parseEther('800'),
			});
		});

		before('exchange rate is set', async () => {
			exchangeRate = await getRate({ ctx, symbol: 'SNX' });
			await addAggregatorAndSetRate({
				ctx,
				currencyKey: toBytes32('SNX'),
				rate: '6000000000000000000', // $6
			});
		});

		before('liquidatedUser stakes their SNX', async () => {
			await Synthetix.connect(liquidatedUser).issueMaxSynths();
		});

		before('someUser stakes their SNX', async () => {
			await Synthetix.connect(someUser).issueMaxSynths();
		});

		before('user7 stakes their SNX', async () => {
			await Synthetix.connect(user7).issueMaxSynths();
		});

		it('cannot be liquidated at this point', async () => {
			assert.equal(await Liquidator.isLiquidationOpen(liquidatedUser.address, false), false);
		});

		describe('getting marked and completely liquidated', () => {
			before('exchange rate changes to allow liquidation', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('SNX'),
					rate: '200000000000000', // $0.02
				});
			});

			before('liquidation is marked', async () => {
				await Liquidator.connect(flaggerUser).flagAccountForLiquidation(user7.address);
			});

			after('restore exchange rate', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('SNX'),
					rate: exchangeRate.toString(),
				});
			});

			it('still not open for liquidation', async () => {
				assert.equal(await Liquidator.isLiquidationOpen(user7.address, false), false);
			});

			it('deadline has not passed yet', async () => {
				assert.equal(await Liquidator.isLiquidationDeadlinePassed(user7.address), false);
			});

			describe('when the liquidation delay passes', () => {
				before(async () => {
					await skipLiquidationDelay({ ctx });
				});

				describe('getting liquidated', () => {
					let tx;
					let beforeDebtShares, beforeSharesSupply;
					let beforeFlagRewardCredittedSnx,
						beforeLiquidateRewardCredittedSnx,
						beforeRemainingRewardCredittedSnx;

					before('liquidatorUser calls liquidateDelinquentAccount', async () => {
						beforeDebtShares = await SynthetixDebtShare.balanceOf(user7.address);
						beforeSharesSupply = await SynthetixDebtShare.totalSupply();
						beforeFlagRewardCredittedSnx = await Synthetix.balanceOf(flaggerUser.address);
						beforeLiquidateRewardCredittedSnx = await Synthetix.balanceOf(liquidatorUser.address);
						beforeRemainingRewardCredittedSnx = await Synthetix.balanceOf(
							LiquidatorRewards.address
						);

						tx = await Synthetix.connect(liquidatorUser).liquidateDelinquentAccount(user7.address);
					});

					it('fixes the c-ratio of the completely liquidated user7', async () => {
						assert.bnEqual(await SynthetixDebtShare.balanceOf(user7.address), '0');
					});

					it('reduces the total supply of debt shares by the amount of liquidated debt shares', async () => {
						const afterDebtShares = await SynthetixDebtShare.balanceOf(user7.address);
						const liquidatedDebtShares = beforeDebtShares.sub(afterDebtShares);
						const afterSupply = beforeSharesSupply.sub(liquidatedDebtShares);

						assert.bnEqual(await SynthetixDebtShare.totalSupply(), afterSupply);
					});

					it('should remove the liquidation entry for the user7', async () => {
						assert.isFalse(await Liquidator.isLiquidationOpen(user7.address, false));
						assert.bnEqual(await Liquidator.getLiquidationDeadlineForAccount(user7.address), 0);
					});

					it('transfers the flag reward to flaggerUser', async () => {
						const flagReward = await Liquidator.flagReward();
						assert.bnEqual(
							await Synthetix.balanceOf(flaggerUser.address),
							beforeFlagRewardCredittedSnx.add(flagReward)
						);
					});

					it('transfers the liquidate reward to liquidatorUser', async () => {
						const liquidateReward = await Liquidator.liquidateReward();
						assert.bnEqual(
							await Synthetix.balanceOf(liquidatorUser.address),
							beforeLiquidateRewardCredittedSnx.add(liquidateReward)
						);
					});

					it('transfers the remaining SNX to LiquidatorRewards', async () => {
						const { events } = await tx.wait();
						const liqEvent = events.find(l => l.event === 'AccountLiquidated');
						const snxRedeemed = liqEvent.args.snxRedeemed;

						const flagReward = await Liquidator.flagReward();
						const liquidateReward = await Liquidator.liquidateReward();
						const remainingReward = snxRedeemed.sub(flagReward.add(liquidateReward));
						assert.bnNotEqual(remainingReward, '0');
						assert.bnEqual(
							await Synthetix.balanceOf(LiquidatorRewards.address),
							beforeRemainingRewardCredittedSnx.add(remainingReward)
						);
					});

					it('should allow someUser to claim their share of the liquidation rewards', async () => {
						const earnedReward = await LiquidatorRewards.earned(someUser.address);

						const tx = await LiquidatorRewards.connect(someUser).getReward(someUser.address);

						const { events } = await tx.wait();

						const event = events.find(l => l.event === 'RewardPaid');
						const payee = event.args.user;
						const reward = event.args.reward;

						assert.equal(payee, someUser.address);
						assert.bnEqual(reward, earnedReward);

						const earnedRewardAfterClaiming = await LiquidatorRewards.earned(someUser.address);
						assert.bnEqual(earnedRewardAfterClaiming, '0');
					});
				});
			});
		});

		describe('getting marked and partially liquidated', () => {
			before('exchange rate changes to allow liquidation', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('SNX'),
					rate: '2500000000000000000', // $2.50
				});
			});

			before('liquidation is marked', async () => {
				await Liquidator.connect(flaggerUser).flagAccountForLiquidation(liquidatedUser.address);
			});

			after('restore exchange rate', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('SNX'),
					rate: exchangeRate.toString(),
				});
			});

			it('still not open for liquidation', async () => {
				assert.equal(await Liquidator.isLiquidationOpen(liquidatedUser.address, false), false);
			});

			it('deadline has not passed yet', async () => {
				assert.equal(await Liquidator.isLiquidationDeadlinePassed(liquidatedUser.address), false);
			});

			describe('when the liquidation delay passes', () => {
				before(async () => {
					await skipLiquidationDelay({ ctx });
				});

				describe('getting liquidated', () => {
					let tx;
					let cratioBefore;
					let beforeDebtShares, beforeSharesSupply;
					let beforeFlagRewardCredittedSnx,
						beforeLiquidateRewardCredittedSnx,
						beforeRemainingRewardCredittedSnx;

					before('liquidatorUser calls liquidateDelinquentAccount', async () => {
						beforeDebtShares = await SynthetixDebtShare.balanceOf(liquidatedUser.address);
						beforeSharesSupply = await SynthetixDebtShare.totalSupply();
						beforeFlagRewardCredittedSnx = await Synthetix.balanceOf(flaggerUser.address);
						beforeLiquidateRewardCredittedSnx = await Synthetix.balanceOf(liquidatorUser.address);
						beforeRemainingRewardCredittedSnx = await Synthetix.balanceOf(
							LiquidatorRewards.address
						);

						cratioBefore = await Synthetix.collateralisationRatio(liquidatedUser.address);

						tx = await Synthetix.connect(liquidatorUser).liquidateDelinquentAccount(
							liquidatedUser.address
						);
					});

					it('fixes the c-ratio of the partially liquidatedUser', async () => {
						const cratio = await Synthetix.collateralisationRatio(liquidatedUser.address);
						// Check that the ratio is repaired
						assert.bnLt(cratio, cratioBefore);
					});

					it('reduces the total supply of debt shares by the amount of liquidated debt shares', async () => {
						const afterDebtShares = await SynthetixDebtShare.balanceOf(liquidatedUser.address);
						const liquidatedDebtShares = beforeDebtShares.sub(afterDebtShares);
						const afterSupply = beforeSharesSupply.sub(liquidatedDebtShares);

						assert.bnEqual(await SynthetixDebtShare.totalSupply(), afterSupply);
					});

					it('should remove the liquidation entry for the liquidatedUser', async () => {
						assert.isFalse(await Liquidator.isLiquidationOpen(liquidatedUser.address, false));
						assert.bnEqual(
							await Liquidator.getLiquidationDeadlineForAccount(liquidatedUser.address),
							0
						);
					});

					it('transfers the flag reward to flaggerUser', async () => {
						const flagReward = await Liquidator.flagReward();
						assert.bnEqual(
							await Synthetix.balanceOf(flaggerUser.address),
							beforeFlagRewardCredittedSnx.add(flagReward)
						);
					});

					it('transfers the liquidate reward to liquidatorUser', async () => {
						const liquidateReward = await Liquidator.liquidateReward();
						assert.bnEqual(
							await Synthetix.balanceOf(liquidatorUser.address),
							beforeLiquidateRewardCredittedSnx.add(liquidateReward)
						);
					});

					it('transfers the remaining SNX to LiquidatorRewards', async () => {
						const { events } = await tx.wait();
						const liqEvent = events.find(l => l.event === 'AccountLiquidated');
						const snxRedeemed = liqEvent.args.snxRedeemed;

						const flagReward = await Liquidator.flagReward();
						const liquidateReward = await Liquidator.liquidateReward();
						const remainingReward = snxRedeemed.sub(flagReward.add(liquidateReward));
						assert.bnNotEqual(remainingReward, '0');
						assert.bnEqual(
							await Synthetix.balanceOf(LiquidatorRewards.address),
							beforeRemainingRewardCredittedSnx.add(remainingReward)
						);
					});

					it('should allow someUser to claim their share of the liquidation rewards', async () => {
						const earnedReward = await LiquidatorRewards.earned(someUser.address);

						const tx = await LiquidatorRewards.connect(someUser).getReward(someUser.address);

						const { events } = await tx.wait();

						const event = events.find(l => l.event === 'RewardPaid');
						const payee = event.args.user;
						const reward = event.args.reward;

						assert.equal(payee, someUser.address);
						assert.bnEqual(reward, earnedReward);

						const earnedRewardAfterClaiming = await LiquidatorRewards.earned(someUser.address);
						assert.bnEqual(earnedRewardAfterClaiming, '0');
					});
				});
			});
		});
	});
}

module.exports = {
	itCanLiquidate,
};
