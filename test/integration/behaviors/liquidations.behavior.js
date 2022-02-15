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
		let Synthetix, Liquidations, SystemSettings, SynthsUSD;

		before('target contracts and users', () => {
			({ Synthetix, Liquidations, SystemSettings, SynthsUSD } = ctx.contracts);

			({ owner, someUser, otherUser } = ctx.users);

			SystemSettings = SystemSettings.connect(owner);
		});

		before('system settings are set', async () => {
			await SystemSettings.setIssuanceRatio(ethers.utils.parseEther('0.25'));
			await SystemSettings.setLiquidationRatio(ethers.utils.parseEther('0.5'));
		});

		before('ensure someUser has MIME', async () => {
			await ensureBalance({
				ctx,
				symbol: 'MIME',
				user: someUser,
				balance: ethers.utils.parseEther('100'),
			});
		});

		before('ensure otherUser has sUSD', async () => {
			await ensureBalance({
				ctx,
				symbol: 'mimicUSD',
				user: otherUser,
				balance: ethers.utils.parseEther('100'),
			});
		});

		before('exchange rate is set', async () => {
			exchangeRate = await getRate({ ctx, symbol: 'MIME' });
			await addAggregatorAndSetRate({
				ctx,
				currencyKey: toBytes32('MIME'),
				rate: '1000000000000000000',
			});
		});

		before('someUser stakes their MIME', async () => {
			await Synthetix.connect(someUser).issueMaxSynths();
		});

		it('cannot be liquidated at this point', async () => {
			assert.equal(await Liquidations.isOpenForLiquidation(someUser.address), false);
		});

		describe('getting marked', () => {
			before('exchange rate changes to allow liquidation', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('MIME'),
					rate: '200000000000000000',
				});
			});

			before('liquidation is marked', async () => {
				await Liquidations.connect(otherUser).flagAccountForLiquidation(someUser.address);
			});

			after('restore exchange rate', async () => {
				await addAggregatorAndSetRate({
					ctx,
					currencyKey: toBytes32('MIME'),
					rate: exchangeRate.toString(),
				});
			});

			it('still not open for liquidation', async () => {
				assert.equal(await Liquidations.isOpenForLiquidation(someUser.address), false);
			});

			it('deadline has not passed yet', async () => {
				assert.equal(await Liquidations.isLiquidationDeadlinePassed(someUser.address), false);
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
							await Synthetix.debtBalanceOf(someUser.address, toBytes32('mimicUSD'))
						).toString();
						beforeDebttedSnx = await Synthetix.balanceOf(someUser.address);
						beforeCredittedSnx = await Synthetix.balanceOf(otherUser.address);
						beforeBalance = await SynthsUSD.balanceOf(otherUser.address);

						await Synthetix.connect(otherUser).liquidateDelinquentAccount(
							someUser.address,
							ethers.utils.parseEther('100')
						);
					});

					it('deducts mimicUSD debt from the liquidated', async () => {
						assert.bnLt(
							await Synthetix.debtBalanceOf(someUser.address, toBytes32('mimicUSD')),
							beforeDebt
						);
					});

					it('burns mimicUSD from otherUser', async () => {
						assert.bnLt(await SynthsUSD.balanceOf(otherUser.address), beforeBalance);
					});

					it('transfers MIME from otherUser', async () => {
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
