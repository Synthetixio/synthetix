const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { toBytes32 } = require('../../../index');
const { ensureBalance } = require('../utils/balances');
const { skipWaitingPeriod } = require('../../test-utils/skip');

function itCanExchange({ ctx }) {
	describe('exchanging and settling', () => {
		const sUSDAmount = ethers.utils.parseEther('100');

		let owner;
		let balancesETH, originialPendingSettlements;
		let Synthetix, Exchanger, SynthsETH;

		before('target contracts and users', () => {
			({ Synthetix, Exchanger, SynthsETH } = ctx.contracts);

			owner = ctx.users.owner;
		});

		before('ensure the owner has sUSD', async () => {
			await ensureBalance({ ctx, symbol: 'sUSD', user: owner, balance: sUSDAmount });
		});

		describe('when the owner exchanges sUSD to sETH', () => {
			before('record balances', async () => {
				balancesETH = await SynthsETH.balanceOf(owner.address);
			});

			before('record pending settlements', async () => {
				const { numEntries } = await Exchanger.settlementOwing(owner.address, toBytes32('sETH'));

				originialPendingSettlements = numEntries;
			});

			before('perform the exchange', async () => {
				Synthetix = Synthetix.connect(owner);

				const tx = await Synthetix.exchange(toBytes32('sUSD'), sUSDAmount, toBytes32('sETH'));
				await tx.wait();
			});

			it('receives the expected amount of sETH', async () => {
				const [expectedAmount, ,] = await Exchanger.getAmountsForExchange(
					sUSDAmount,
					toBytes32('sUSD'),
					toBytes32('sETH')
				);

				assert.bnEqual(await SynthsETH.balanceOf(owner.address), balancesETH.add(expectedAmount));
			});

			it('shows that the user now has pending settlements', async () => {
				const { numEntries } = await Exchanger.settlementOwing(owner.address, toBytes32('sETH'));

				assert.bnEqual(numEntries, originialPendingSettlements.add(ethers.constants.One));
			});

			describe('when settle is called', () => {
				before('skip waiting period', async () => {
					await skipWaitingPeriod({ ctx });
				});

				before('settle', async () => {
					const tx = await Synthetix.settle(toBytes32('sETH'));
					await tx.wait();
				});

				it('shows that the user no longer has pending settlements', async () => {
					const { numEntries } = await Exchanger.settlementOwing(owner.address, toBytes32('sETH'));

					assert.bnEqual(numEntries, ethers.constants.Zero);
				});
			});
		});
	});
}

module.exports = {
	itCanExchange,
};
