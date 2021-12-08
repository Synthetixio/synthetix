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
		let synth;

		before('target contracts and users', () => {
			const { addedSynths } = ctx;
			// when no added synths, then just use sDEFI for testing (useful for the simulation)
			synth = addedSynths.length ? addedSynths[0].name : 'sDEFI';

			({
				Synthetix,
				ExchangeRates,
				Liquidations,
				SynthsUSD,
				SystemSettings
			} = ctx.contracts);

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
        })

        describe('getting marked', () => {
            before('exchange rate changes to allow liquidation', async () => {
                const { timestamp } = await ctx.provider.getBlock();
                await ExchangeRates.updateRates(
                    [toBytes32('SNX')], 
                    [ethers.utils.parseEther('0.01')], 
                    timestamp
                );

                await updateExchangeRatesIfNeeded({ ctx });
            });

			before('liquidation is marked', async () => {
                await Liquidations.connect(otherUser).flagAccountForLiquidation(someUser.address);
			});

            describe('getting liquidated', () => {
                before('otherUser calls liquidateDelinquentAccount', async () => {
                    await skipLiquidationDelay({ ctx });
                    await updateExchangeRatesIfNeeded({ ctx });
                    await Synthetix.connect(otherUser).liquidateDelinquentAccount(someUser.address, ethers.utils.parseEther('100'));
                });

                it('is liquidated', async () => {
					assert.equal(await Synthetix.balanceOf(someUser.address), '0');
                });
            });
        })
	});
}

module.exports = {
	itCanLiquidate,
};
