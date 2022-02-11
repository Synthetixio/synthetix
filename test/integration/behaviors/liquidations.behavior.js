const ethers = require('ethers');
const { toBytes32 } = require('../../../index');
const { assert } = require('../../contracts/common');
const { getRate, addAggregatorAndSetRate } = require('../utils/rates');
const { ensureBalance } = require('../utils/balances');
const { skipLiquidationDelay } = require('../utils/skip');

function itCanLiquidate({ ctx }) {
	describe('liquidating', () => {
		let owner;
		let someUser;
		let otherUser;
		let exchangeRate;
		let Synthetix, Liquidator, LiquidatorRewards, SystemSettings, SynthsUSD;

		before('target contracts and users', () => {
			({ Synthetix, Liquidator, LiquidatorRewards, SystemSettings, SynthsUSD } = ctx.contracts);

			({ owner, someUser, otherUser } = ctx.users);

			SystemSettings = SystemSettings.connect(owner);
		});

		before('system settings are set', async () => {
			await SystemSettings.setIssuanceRatio(ethers.utils.parseEther('0.25')); // 400% c-ratio
			await SystemSettings.setLiquidationRatio(ethers.utils.parseEther('0.5')); // 200% c-ratio
			await SystemSettings.setLiquidationPenalty(ethers.utils.parseEther('0.3')); // 30% penalty
			await SystemSettings.setSelfLiquidationPenalty(ethers.utils.parseEther('0.2')); // 20% penalty
			await SystemSettings.setFlagReward(ethers.utils.parseEther('10')); // 10 SNX
			await SystemSettings.setLiquidateReward(ethers.utils.parseEther('20')); // 20 SNX
		});

		before('ensure someUser has SNX', async () => {
			await ensureBalance({
				ctx,
				symbol: 'SNX',
				user: someUser,
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

		before('someUser stakes their SNX', async () => {
			await Synthetix.connect(someUser).issueMaxSynths();
		});

		it('cannot be liquidated at this point', async () => {
			assert.equal(await Liquidator.isForcedLiquidationOpen(someUser.address), false);
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
				await Liquidator.connect(otherUser).flagAccountForLiquidation(someUser.address);
			});

			after('restore exchange rate', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('SNX'),
					rate: exchangeRate.toString(),
				});
			});

			it('still not open for liquidation', async () => {
				assert.equal(await Liquidator.isForcedLiquidationOpen(someUser.address), false);
			});

			it('deadline has not passed yet', async () => {
				assert.equal(await Liquidator.isLiquidationDeadlinePassed(someUser.address), false);
			});

			describe('when the liquidation delay passes', () => {
				before(async () => {
					await skipLiquidationDelay({ ctx });
				});

				describe('getting liquidated', () => {
					let beforeDebt, beforeDebttedSnx;
					let beforeBalance, beforeCredittedSnx;

					before('otherUser calls liquidateDelinquentAccount', async () => {
						beforeDebt = (
							await Synthetix.debtBalanceOf(someUser.address, toBytes32('sUSD'))
						).toString();
						beforeDebttedSnx = await Synthetix.balanceOf(someUser.address);
						beforeCredittedSnx = await Synthetix.balanceOf(otherUser.address);
						beforeBalance = await SynthsUSD.balanceOf(otherUser.address);

						await Synthetix.connect(otherUser).liquidateDelinquentAccount(
							someUser.address,
							ethers.utils.parseEther('100')
						);
					});

					it('deducts sUSD debt from the liquidated', async () => {
						assert.bnLt(
							await Synthetix.debtBalanceOf(someUser.address, toBytes32('sUSD')),
							beforeDebt
						);
					});

					it('burns sUSD from otherUser', async () => {
						assert.bnLt(await SynthsUSD.balanceOf(otherUser.address), beforeBalance);
					});

					it('transfers SNX from otherUser', async () => {
						const amountSent = beforeDebttedSnx.sub(await Synthetix.balanceOf(someUser.address));

						assert.bnNotEqual(amountSent, '0');
						assert.bnEqual(
							await Synthetix.balanceOf(otherUser.address),
							beforeCredittedSnx.add(amountSent)
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
