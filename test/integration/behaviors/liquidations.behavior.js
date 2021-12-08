const ethers = require('ethers');
const { toBytes32 } = require('../../../index');
const { assert } = require('../../contracts/common');
const { updateExchangeRatesIfNeeded } = require('../utils/rates');
const { ensureBalance } = require('../utils/balances');
const { skipLiquidationDelay } = require('../utils/skip');

function itCanLiquidate({ ctx }) {
	describe('liquidating', () => {
		let owner;
		let someUser;
		let otherUser;
		let Synthetix, ExchangeRates, Liquidations, SystemSettings;

		before('target contracts and users', () => {
			({ Synthetix, ExchangeRates, Liquidations, SystemSettings } = ctx.contracts);

			({ owner, someUser, otherUser } = ctx.users);

			ExchangeRates = ExchangeRates.connect(owner);
			SystemSettings = SystemSettings.connect(owner);
		});

		before('system settings are set', async () => {
			await SystemSettings.setIssuanceRatio(ethers.utils.parseEther('0.25'));
			await SystemSettings.setLiquidationRatio(ethers.utils.parseEther('0.5'));
		});

		before('ensure someUser has SNX', async () => {
			await ensureBalance({
				ctx,
				symbol: 'SNX',
				user: someUser,
				balance: ethers.utils.parseEther('100'),
			});
		});

		before('ensure otherUser has sUSD', async () => {
			await ensureBalance({
				ctx,
				symbol: 'sUSD',
				user: otherUser,
				balance: ethers.utils.parseEther('100'),
			});
		});

		before('exchange rates are correct', async () => {
			const { timestamp } = await ctx.provider.getBlock();
			await ExchangeRates.updateRates(
				[toBytes32('SNX')],
				[ethers.utils.parseEther('1')],
				timestamp
			);

			await updateExchangeRatesIfNeeded({ ctx });
		});

		before('someUser stakes their SNX', async () => {
			await Synthetix.connect(someUser).issueSynths(ethers.utils.parseEther('10'));
		});

		it('cannot be liquidated at this point', async () => {
			assert.equal(await Liquidations.isOpenForLiquidation(someUser.address), false);
		});

		describe('getting marked', () => {
			before('exchange rate changes to allow liquidation', async () => {
				const { timestamp } = await ctx.provider.getBlock();
				await ExchangeRates.updateRates(
					[toBytes32('SNX')],
					[ethers.utils.parseEther('0.2')],
					timestamp
				);

				await updateExchangeRatesIfNeeded({ ctx });
			});

			before('liquidation is marked', async () => {
				await Liquidations.connect(otherUser).flagAccountForLiquidation(someUser.address);
			});

			it('still not open for liquidation', async () => {
				assert.equal(await Liquidations.isOpenForLiquidation(someUser.address), false);
			});

			it('deadline hasn not passed yet', async () => {
				assert.equal(await Liquidations.isLiquidationDeadlinePassed(someUser.address), false);
			});

			describe('getting liquidated', () => {
				before('otherUser calls liquidateDelinquentAccount', async () => {
					await skipLiquidationDelay({ ctx });
					await updateExchangeRatesIfNeeded({ ctx });
					await Synthetix.connect(otherUser).liquidateDelinquentAccount(
						someUser.address,
						ethers.utils.parseEther('100')
					);
				});

				it('is liquidated', async () => {
					// = sUSD liquidated / SNX Price * 1.1
					assert.equal(await Synthetix.balanceOf(someUser.address), '62068965517241379313');
				});
			});
		});
	});
}

module.exports = {
	itCanLiquidate,
};
