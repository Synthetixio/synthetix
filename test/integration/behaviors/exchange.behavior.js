const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { toBytes32 } = require('../../../index');
const { ensureBalance } = require('../utils/balances');
const { wait, sendDummyTx } = require('../utils/rpc');

function itCanPerformExchanges({ ctx }) {
	const sUSDAmount = ethers.utils.parseEther('100');

	let owner;
	let balancesETH, balancesUSD;
	let Synthetix, Exchanger, SynthsETH, SynthsUSD, SystemSettings;
	let originalWaitingPeriod;

	before('target contracts and users', () => {
		({ Synthetix, Exchanger, SynthsETH, SynthsUSD, SystemSettings } = ctx.contracts);

		owner = ctx.owner;
	});

	before('ensure the owner has sUSD', async () => {
		await ensureBalance({ ctx, symbol: 'sUSD', user: owner, balance: sUSDAmount });
	});

	before('record and reduce waiting period', async () => {
		SystemSettings = SystemSettings.connect(ctx.owner);

		originalWaitingPeriod = await SystemSettings.waitingPeriodSecs();

		const tx = await SystemSettings.setWaitingPeriodSecs(1);
		await tx.wait();
	});

	after('restore waiting period', async () => {
		const tx = await SystemSettings.setWaitingPeriodSecs(originalWaitingPeriod);
		await tx.wait();
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

		// TODO: Disabled until we understand more about the time granularity of the
		// L2 chain on the ops tool.
		describe.skip('when the owner exchanges sETH to sUSD', () => {
			before('ensure the waiting period has passed', async () => {
				await sendDummyTx({ ctx });
				await wait({ seconds: 60 });
				await sendDummyTx({ ctx });
			});

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
}

module.exports = {
	itCanPerformExchanges,
};
