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
		let user4;
		let user5;
		let user6;
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

			({ owner, user4, user5, user6 } = ctx.users);

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
			await SystemSettings.setFlagReward(ethers.utils.parseEther('10')); // 10 SNX
			await SystemSettings.setLiquidateReward(ethers.utils.parseEther('20')); // 20 SNX
		});

		before('ensure user4 has SNX', async () => {
			await ensureBalance({
				ctx,
				symbol: 'SNX',
				user: user4,
				balance: ethers.utils.parseEther('100'),
			});
		});

		before('exchange rate is set', async () => {
			exchangeRate = await getRate({ ctx, symbol: 'SNX' });
			await addAggregatorAndSetRate({
				ctx,
				currencyKey: toBytes32('SNX'),
				rate: '1000000000000000000',
			});
		});

		before('user4 stakes their SNX', async () => {
			await Synthetix.connect(user4).issueMaxSynths();
		});

		it('cannot be liquidated at this point', async () => {
			assert.equal(await Liquidator.isForcedLiquidationOpen(user4.address), false);
		});

		describe('getting marked', () => {
			before('exchange rate changes to allow liquidation', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('SNX'),
					rate: '200000000000000000',
				});
			});

			before('liquidation is marked', async () => {
				await Liquidator.connect(user5).flagAccountForLiquidation(user4.address);
			});

			after('restore exchange rate', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('SNX'),
					rate: exchangeRate.toString(),
				});
			});

			it('still not open for liquidation', async () => {
				assert.equal(await Liquidator.isForcedLiquidationOpen(user4.address), false);
			});

			it('deadline has not passed yet', async () => {
				assert.equal(await Liquidator.isLiquidationDeadlinePassed(user4.address), false);
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

					before('user6 calls liquidateDelinquentAccount', async () => {
						beforeDebt = (await SynthetixDebtShare.balanceOf(user4.address)).toString();
						beforeSupply = await SynthetixDebtShare.totalSupply();
						beforeDebttedSnx = await Synthetix.balanceOf(user4.address);
						beforeFlagRewardCredittedSnx = await Synthetix.balanceOf(user5.address);
						beforeLiquidateRewardCredittedSnx = await Synthetix.balanceOf(user6.address);
						beforeRemainingRewardCredittedSnx = await Synthetix.balanceOf(Liquidator.address);

						await Synthetix.connect(user6).liquidateDelinquentAccount(
							user4.address,
							ethers.utils.parseEther('100')
						);
					});

					it('reduces the debt share balance of the liquidated', async () => {
						assert.bnLt(await SynthetixDebtShare.balanceOf(user4.address), beforeDebt);
					});

					it('reduces the total supply of debt shares', async () => {
						assert.bnLt(await SynthetixDebtShare.totalSupply(), beforeSupply);
					});

					it('transfers the flag reward to user5', async () => {
						const flagReward = await Liquidator.flagReward();
						assert.bnNotEqual(flagReward, '0');
						assert.bnEqual(
							await Synthetix.balanceOf(user5.address),
							beforeFlagRewardCredittedSnx.add(flagReward)
						);
					});

					it('transfers the liquidate reward to user6', async () => {
						const liquidateReward = await Liquidator.liquidateReward();
						assert.bnNotEqual(liquidateReward, '0');
						assert.bnEqual(
							await Synthetix.balanceOf(user6.address),
							beforeLiquidateRewardCredittedSnx.add(liquidateReward)
						);
					});

					it('transfers the remaining SNX to LiquidatorRewards', async () => {
						const remainingReward = beforeDebttedSnx
							.sub(await Synthetix.balanceOf(user5.address))
							.sub(await Synthetix.balanceOf(user6.address));
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
