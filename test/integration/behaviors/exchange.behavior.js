const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { toBytes32 } = require('../../../index');
const { ensureBalance } = require('../utils/balances');
const { ignoreMinimumStakeTime } = require('../utils/stakeTime');

function itCanExchange({ ctx }) {
	describe('exchanging', () => {
		const sUSDAmount = ethers.utils.parseEther('100');

		let owner;
		let balancesETH, balancesUSD;
		let Synthetix, Exchanger, SynthsETH, SynthsUSD;

		before('target contracts and users', () => {
			({ Synthetix, Exchanger, SynthsETH, SynthsUSD } = ctx.contracts);

			owner = ctx.owner;
		});

		before('ensure the owner has sUSD', async () => {
			await ensureBalance({ ctx, symbol: 'sUSD', user: owner, balance: sUSDAmount });
		});

		describe('when the owner exchanges sUSD to sETH', () => {
			before('record balances', async () => {
				balancesETH = await SynthsETH.balanceOf(owner.address);
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

			// TODO: Disabled until we understand time granularity in the ops tool L2 chain
			describe.skip('when the owner exchanges sETH to sUSD', () => {
				ignoreMinimumStakeTime({ ctx });

				before('record balances', async () => {
					balancesUSD = await SynthsUSD.balanceOf(owner.address);
					balancesETH = await SynthsETH.balanceOf(owner.address);
				});

				before('perform the exchange', async () => {
					Synthetix = Synthetix.connect(owner);

					const tx = await Synthetix.exchange(toBytes32('sETH'), balancesETH, toBytes32('sUSD'));
					await tx.wait();
				});

				it('receives the expected amount of sUSD', async () => {
					const [expectedAmount, ,] = await Exchanger.getAmountsForExchange(
						balancesETH,
						toBytes32('sETH'),
						toBytes32('sUSD')
					);

					assert.bnEqual(await SynthsUSD.balanceOf(owner.address), balancesUSD.add(expectedAmount));
				});
			});
		});
	});
}

module.exports = {
	itCanExchange,
};
