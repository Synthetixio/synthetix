const ethers = require('ethers');
const chalk = require('chalk');
const { toBytes32 } = require('../../../index');
const { assert } = require('../../contracts/common');
const { getRate, addAggregatorAndSetRate } = require('../utils/rates');
const { ensureBalance } = require('../utils/balances');
const { skipLiquidationDelay } = require('../utils/skip');

function itCanLiquidate({ ctx }) {
	describe('liquidating', () => {
		let owner;
		let liquidatedUser;
		let liquidatorUser;
		let flaggerUser;
		let exchangeRate;
		let Synthetix, SynthetixDebtShare, Liquidator, LiquidatorRewards, SystemSettings;

		before('target contracts and users', () => {
			({
				Synthetix,
				SynthetixDebtShare,
				Liquidator,
				LiquidatorRewards,
				SystemSettings,
			} = ctx.contracts);

			({ owner, liquidatedUser, flaggerUser, liquidatorUser } = ctx.users);

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

		before('exchange rate is set', async () => {
			exchangeRate = await getRate({ ctx, symbol: 'SNX' });
			await addAggregatorAndSetRate({
				ctx,
				currencyKey: toBytes32('SNX'),
				rate: '6000000000000000000',
			});
		});

		before('liquidatedUser stakes their SNX', async () => {
			await Synthetix.connect(liquidatedUser).issueMaxSynths();
		});

		it('cannot be liquidated at this point', async () => {
			assert.equal(await Liquidator.isLiquidationOpen(liquidatedUser.address, false), false);
		});

		describe('getting marked', () => {
			before('exchange rate changes to allow liquidation', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('SNX'),
					rate: '100000000000000000',
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
					let beforeDebt, beforeSupply;
					let beforeDebttedSnx,
						beforeFlagRewardCredittedSnx,
						beforeLiquidateRewardCredittedSnx,
						beforeRemainingRewardCredittedSnx;

					before('liquidatorUser calls liquidateDelinquentAccount', async () => {
						beforeDebt = (await SynthetixDebtShare.balanceOf(liquidatedUser.address)).toString();
						beforeSupply = await SynthetixDebtShare.totalSupply();
						beforeDebttedSnx = await Synthetix.balanceOf(liquidatedUser.address);
						beforeFlagRewardCredittedSnx = await Synthetix.balanceOf(flaggerUser.address);
						beforeLiquidateRewardCredittedSnx = await Synthetix.balanceOf(liquidatorUser.address);
						beforeRemainingRewardCredittedSnx = await Synthetix.balanceOf(Liquidator.address);

						await Synthetix.connect(liquidatorUser).liquidateDelinquentAccount(
							liquidatedUser.address
						);
					});

					it('reduces the debt share balance of the liquidated', async () => {
						assert.bnLt(await SynthetixDebtShare.balanceOf(liquidatedUser.address), beforeDebt);
					});

					it('reduces the total supply of debt shares', async () => {
						assert.bnLt(await SynthetixDebtShare.totalSupply(), beforeSupply);
					});

					it('transfers the flag reward to flaggerUser', async () => {
						const flagReward = await Liquidator.flagReward();
						assert.bnNotEqual(flagReward, '0');
						assert.bnEqual(
							await Synthetix.balanceOf(flaggerUser.address),
							beforeFlagRewardCredittedSnx.add(flagReward)
						);
					});

					it('transfers the liquidate reward to liquidatorUser', async () => {
						const liquidateReward = await Liquidator.liquidateReward();
						assert.bnNotEqual(liquidateReward, '0');
						assert.bnEqual(
							await Synthetix.balanceOf(liquidatorUser.address),
							beforeLiquidateRewardCredittedSnx.add(liquidateReward)
						);
					});

					it('transfers the remaining SNX to LiquidatorRewards', async () => {
						const remainingReward = beforeDebttedSnx
							.sub(await Synthetix.balanceOf(flaggerUser.address))
							.sub(await Synthetix.balanceOf(liquidatorUser.address));
						assert.bnNotEqual(remainingReward, '0');
						assert.bnEqual(
							await Synthetix.balanceOf(LiquidatorRewards.address),
							beforeRemainingRewardCredittedSnx.add(remainingReward)
						);
					});
				});
			});
		});
	});
}

module.exports = {
	itCanLiquidate,
};
