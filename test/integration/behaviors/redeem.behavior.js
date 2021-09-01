const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../../../index');
const { ensureBalance } = require('../utils/balances');
const { skipWaitingPeriod } = require('../utils/skip');

function itCanRedeem({ ctx }) {
	describe('redemption of deprecated synths', () => {
		let owner;
		let someUser;
		// let balancesETH, originialPendingSettlements;
		let Synthetix, Issuer, SynthsETH, SynthsUSD, ProxysETH, SynthRedeemer;
		let totalDebtBeforeRemoval;

		before('target contracts and users', () => {
			({ Synthetix, Issuer, SynthsETH, SynthsUSD, ProxysETH, SynthRedeemer } = ctx.contracts);

			({ owner, someUser } = ctx.users);
		});

		before('ensure the user has sUSD', async () => {
			await ensureBalance({
				ctx,
				symbol: 'sUSD',
				user: someUser,
				balance: ethers.utils.parseEther('100000'),
			});
		});

		before('ensure the user has some sETH', async () => {
			Synthetix = Synthetix.connect(someUser);
			const tx = await Synthetix.exchange(
				toBytes32('sUSD'),
				ethers.utils.parseEther('5000'),
				toBytes32('sETH')
			);
			await tx.wait();
		});

		before('skip waiting period', async () => {
			await skipWaitingPeriod({ ctx });
		});

		before('record total system debt', async () => {
			totalDebtBeforeRemoval = await Synthetix.totalIssuedSynthsExcludeOtherCollateral(
				toBytes32('sUSD')
			);
		});

		describe('deprecating sETH', () => {
			before('when the owner removes sETH', async () => {
				Issuer = Issuer.connect(owner);
				// note: this sets sETH as redeemed and cannot be undone without
				// redeploying locally or restarting a fork
				const tx = await Issuer.removeSynth(toBytes32('sETH'));
				await tx.wait();
			});

			it('then the total system debt is unchanged', async () => {
				assert.bnEqual(
					await Synthetix.totalIssuedSynthsExcludeOtherCollateral(toBytes32('sUSD')),
					totalDebtBeforeRemoval
				);
			});
			it('and sETH is removed from the system', async () => {
				assert.equal(await Synthetix.synths(toBytes32('sETH')), ZERO_ADDRESS);
			});
			describe('user redemption', () => {
				let sUSDBeforeRedemption;
				before(async () => {
					sUSDBeforeRedemption = await SynthsUSD.balanceOf(someUser.address);
				});

				before('when the user redeems their sETH', async () => {
					SynthRedeemer = SynthRedeemer.connect(someUser);
					const tx = await SynthRedeemer.redeem(ProxysETH.address);
					await tx.wait();
				});

				it('then the user has no more sETH', async () => {
					assert.equal(await SynthsETH.balanceOf(someUser.address), '0');
				});

				it('and they have more sUSD again', async () => {
					assert.bnGt(await SynthsUSD.balanceOf(someUser.address), sUSDBeforeRedemption);
				});
			});
			after(async () => {
				// put sETH back in to prevent issues for the rest of the tests
				const tx = await Issuer.addSynth(SynthsETH.address);
				await tx.wait();
			});
		});
	});
}

module.exports = {
	itCanRedeem,
};
