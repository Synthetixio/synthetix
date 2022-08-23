const ethers = require('ethers');
const { toBytes32 } = require('../../../index');
const { assert } = require('../../contracts/common');
const { getRate, addAggregatorAndSetRate } = require('../utils/rates');
const { ensureBalance } = require('../utils/balances');
const { skipLiquidationDelay } = require('../utils/skip');

// convenience methods
const toUnit = v => ethers.utils.parseUnits(v.toString());

function itCanLiquidate({ ctx }) {
	describe('liquidating', () => {
		let user7, user8;
		let owner;
		let someUser;
		let liquidatedUser;
		let liquidatorUser;
		let flaggerUser;
		let exchangeRate;
		let Liquidator,
			LiquidatorRewards,
			RewardEscrowV2,
			Synthetix,
			SynthetixDebtShare,
			SystemSettings;

		before('target contracts and users', () => {
			({
				Liquidator,
				LiquidatorRewards,
				RewardEscrowV2,
				Synthetix,
				SynthetixDebtShare,
				SystemSettings,
			} = ctx.contracts);

			({ owner, someUser, liquidatedUser, flaggerUser, liquidatorUser, user7, user8 } = ctx.users);

			RewardEscrowV2 = RewardEscrowV2.connect(owner);
			SystemSettings = SystemSettings.connect(owner);
		});

		before('system settings are set', async () => {
			await SystemSettings.setIssuanceRatio(ethers.utils.parseEther('0.25')); // 400% c-ratio
			await SystemSettings.setLiquidationRatio(ethers.utils.parseEther('0.5')); // 200% c-ratio
			await SystemSettings.setSnxLiquidationPenalty(ethers.utils.parseEther('0.3')); // 30% penalty
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

		before('ensure user8 has SNX', async () => {
			await ensureBalance({
				ctx,
				symbol: 'SNX',
				user: user8,
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

		it('cannot be liquidated at this point', async () => {
			assert.equal(await Liquidator.isLiquidationOpen(liquidatedUser.address, false), false);
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
					let beforeCRatio;
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

						beforeCRatio = await Synthetix.collateralisationRatio(liquidatedUser.address);

						tx = await Synthetix.connect(liquidatorUser).liquidateDelinquentAccount(
							liquidatedUser.address
						);

						const { gasUsed } = await tx.wait();
						console.log(
							`liquidateDelinquentAccount() with no escrow entries gas used: ${Math.round(
								gasUsed / 1000
							).toString()}k`
						);
					});

					it('fixes the c-ratio of the partially liquidatedUser', async () => {
						const cratio = await Synthetix.collateralisationRatio(liquidatedUser.address);
						// Check that the ratio is repaired
						assert.bnLt(cratio, beforeCRatio);
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

		describe('getting marked and completely liquidated', () => {
			before('exchange rate is set', async () => {
				exchangeRate = await getRate({ ctx, symbol: 'SNX' });
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('SNX'),
					rate: '6000000000000000000', // $6
				});
			});

			before('user7 stakes their SNX', async () => {
				await Synthetix.connect(user7).issueMaxSynths();
			});

			before('exchange rate changes to allow liquidation', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('SNX'),
					rate: '1000000000000000000', // $1.00
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
					let tx, viewResults;
					let collateralBefore;
					let beforeDebtShares, beforeSharesSupply, beforeDebtBalance;
					let beforeFlagRewardCredittedSnx,
						beforeLiquidateRewardCredittedSnx,
						beforeRemainingRewardCredittedSnx;

					before('liquidatorUser calls liquidateDelinquentAccount', async () => {
						collateralBefore = await Synthetix.collateral(user7.address);
						beforeDebtShares = await SynthetixDebtShare.balanceOf(user7.address);
						beforeSharesSupply = await SynthetixDebtShare.totalSupply();
						beforeFlagRewardCredittedSnx = await Synthetix.balanceOf(flaggerUser.address);
						beforeLiquidateRewardCredittedSnx = await Synthetix.balanceOf(liquidatorUser.address);
						beforeRemainingRewardCredittedSnx = await Synthetix.balanceOf(
							LiquidatorRewards.address
						);
						beforeDebtBalance = await Synthetix.debtBalanceOf(user7.address, toBytes32('sUSD'));

						viewResults = await Liquidator.liquidationAmounts(user7.address, false);
						tx = await Synthetix.connect(liquidatorUser).liquidateDelinquentAccount(user7.address);
					});

					it('results correspond to view before liquidation', async () => {
						assert.bnEqual(viewResults.totalRedeemed, collateralBefore);
						assert.bnEqual(viewResults.escrowToLiquidate, 0);
						assert.bnEqual(viewResults.initialDebtBalance, beforeDebtBalance);
						// debt per debt share changes a bit
						assert.bnEqual(viewResults.debtToRemove.toString(), beforeDebtBalance.toString());
					});

					it('removes all transferable collateral from the liquidated user', async () => {
						const collateralAfter = await Synthetix.collateral(user7.address);
						assert.bnLt(collateralAfter, collateralBefore);
						assert.bnEqual(await Synthetix.balanceOf(user7.address), '0');
						assert.bnEqual(viewResults.totalRedeemed, collateralBefore);
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

		describe('full liquidation with a majority of collateral in escrow', () => {
			let tx, viewResults;
			let beforeEscrowBalance, beforeDebtBalance;
			let beforeDebtShares, beforeSharesSupply;
			let beforeSnxBalance, beforeRewardsCredittedSnx;
			const snxRate = toUnit(0.3); // 30 cents

			before('ensure user8 has alot of escrowed SNX', async () => {
				await Synthetix.connect(owner).approve(RewardEscrowV2.address, ethers.constants.MaxUint256);

				// 100 entries is a somewhat realistic estimate for an account which as been escrowing for a while and
				// hasnt claimed
				for (let i = 0; i < 100; i++) {
					await RewardEscrowV2.createEscrowEntry(
						user8.address,
						ethers.utils.parseEther('100'), // total 10000
						86400 * 365
					);
				}
			});

			before('user8 stakes their SNX', async () => {
				await Synthetix.connect(user8).issueMaxSynths();
			});

			before('exchange rate changes to allow liquidation', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('SNX'),
					rate: snxRate,
				});
			});

			it('still not open for liquidation because not flagged', async () => {
				assert.equal(await Liquidator.isLiquidationOpen(user8.address, false), false);
			});

			before('liquidatorUser flags user8', async () => {
				await (
					await Liquidator.connect(liquidatorUser).flagAccountForLiquidation(user8.address)
				).wait();
				await skipLiquidationDelay({ ctx });
			});

			it('user8 cannot self liquidate', async () => {
				// because collateral is in escrow
				await assert.revert(
					Synthetix.connect(user8.address).liquidateSelf(),
					'Not open for liquidation'
				);
			});

			before('liquidatorUser calls liquidateDelinquentAccount', async () => {
				beforeSnxBalance = await Synthetix.balanceOf(user8.address);
				beforeEscrowBalance = await RewardEscrowV2.totalEscrowedAccountBalance(user8.address);
				beforeDebtShares = await SynthetixDebtShare.balanceOf(user8.address);
				beforeSharesSupply = await SynthetixDebtShare.totalSupply();
				beforeDebtBalance = await Synthetix.debtBalanceOf(user8.address, toBytes32('sUSD'));
				beforeRewardsCredittedSnx = await Synthetix.balanceOf(LiquidatorRewards.address);

				viewResults = await Liquidator.liquidationAmounts(user8.address, false);
				tx = await Synthetix.connect(liquidatorUser).liquidateDelinquentAccount(user8.address);

				const { gasUsed } = await tx.wait();
				console.log(
					`liquidateDelinquentAccount() with 100 escrow entries gas used: ${Math.round(
						gasUsed / 1000
					).toString()}k`
				);
			});

			after('restore exchange rate', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('SNX'),
					rate: exchangeRate.toString(),
				});
			});

			it('should remove all transferable collateral', async () => {
				const afterSnxBalance = await Synthetix.balanceOf(user8.address);
				assert.bnEqual(afterSnxBalance, '0');
			});

			it('should remove all escrow', async () => {
				const afterEscrowBalance = await RewardEscrowV2.totalEscrowedAccountBalance(user8.address);
				assert.bnEqual(afterEscrowBalance, '0');
			});

			it('should remove all debt', async () => {
				const afterDebtBalance = await Synthetix.debtBalanceOf(user8.address, toBytes32('sUSD'));
				assert.bnEqual(afterDebtBalance, '0');
			});

			it('results correspond to view before liquidation', async () => {
				assert.bnEqual(viewResults.totalRedeemed, beforeSnxBalance.add(beforeEscrowBalance));
				assert.bnEqual(viewResults.escrowToLiquidate, beforeEscrowBalance);
				assert.bnEqual(viewResults.initialDebtBalance, beforeDebtBalance);
				// debt per debt share changes a bit
				assert.bnEqual(viewResults.debtToRemove.toString(), beforeDebtBalance.toString());
			});

			it('should liquidate all debt and redeem all SNX', async () => {
				// Get event data.
				const { events } = await tx.wait();
				const liqEvent = events.find(l => l.event === 'AccountLiquidated');
				const amountLiquidated = liqEvent.args.amountLiquidated;
				const snxRedeemed = liqEvent.args.snxRedeemed;

				assert.bnEqual(snxRedeemed, beforeSnxBalance.add(beforeEscrowBalance));
				assert.bnEqual(amountLiquidated.toString(), beforeDebtBalance.toString()); // the variance is due to a rounding error as a result of multiplication of the SNX rate
			});

			it('reduces the total supply of debt shares by the amount of liquidated debt shares', async () => {
				const afterDebtShares = await SynthetixDebtShare.balanceOf(user8.address);
				const liquidatedDebtShares = beforeDebtShares.sub(afterDebtShares);
				const afterSupply = beforeSharesSupply.sub(liquidatedDebtShares);

				assert.bnEqual(await SynthetixDebtShare.totalSupply(), afterSupply);
			});

			it('should not be open for liquidation anymore', async () => {
				assert.isFalse(await Liquidator.isLiquidationOpen(user8.address, false));
				assert.bnEqual(await Liquidator.getLiquidationDeadlineForAccount(user8.address), 0);
			});

			it('transfers the remaining SNX + escrow to LiquidatorRewards', async () => {
				const { events } = await tx.wait();
				const liqEvent = events.find(l => l.event === 'AccountLiquidated');
				const snxRedeemed = liqEvent.args.snxRedeemed;

				const flagReward = await Liquidator.flagReward();
				const liquidateReward = await Liquidator.liquidateReward();
				const remainingReward = snxRedeemed.sub(flagReward.add(liquidateReward));
				assert.bnNotEqual(remainingReward, '0');
				assert.bnEqual(
					await Synthetix.balanceOf(LiquidatorRewards.address),
					beforeRewardsCredittedSnx.add(remainingReward)
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
}

module.exports = {
	itCanLiquidate,
};
