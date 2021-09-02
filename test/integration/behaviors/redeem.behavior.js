const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../../../index');
const { ensureBalance } = require('../utils/balances');
const { skipWaitingPeriod } = require('../utils/skip');
const { updateExchangeRatesIfNeeded } = require('../utils/rates');

function itCanRedeem({ ctx }) {
	describe('redemption of deprecated synths', () => {
		let owner;
		let someUser;
		let Synthetix, Issuer, SynthsREDEEMER, SynthsUSD, ProxysREDEEMER, SynthRedeemer;
		let totalDebtBeforeRemoval;

		before('target contracts and users', () => {
			({
				Synthetix,
				Issuer,
				SynthsREDEEMER,
				SynthsUSD,
				ProxysREDEEMER,
				SynthRedeemer,
			} = ctx.contracts);

			({ owner, someUser } = ctx.users);
		});

		before('ensure the user has sUSD', async () => {
			await ensureBalance({
				ctx,
				symbol: 'sUSD',
				user: someUser,
				balance: ethers.utils.parseEther('100'),
			});
		});

		before('ensure the user has some sREDEEMER', async () => {
			Synthetix = Synthetix.connect(someUser);
			const tx = await Synthetix.exchange(
				toBytes32('sUSD'),
				ethers.utils.parseEther('50'),
				toBytes32('sREDEEMER')
			);
			await tx.wait();
		});

		before('skip waiting period', async () => {
			await skipWaitingPeriod({ ctx });
		});

		before('update rates and take snapshot if needed', async () => {
			await updateExchangeRatesIfNeeded({ ctx });
		});

		before('record total system debt', async () => {
			totalDebtBeforeRemoval = await Issuer.totalIssuedSynths(toBytes32('sUSD'), true);
		});

		describe('deprecating sREDEEMER', () => {
			before('when the owner removes sREDEEMER', async () => {
				Issuer = Issuer.connect(owner);
				// note: this sets sREDEEMER as redeemed and cannot be undone without
				// redeploying locally or restarting a fork
				const tx = await Issuer.removeSynth(toBytes32('sREDEEMER'));
				await tx.wait();
			});

			it('then the total system debt is unchanged', async () => {
				assert.bnEqual(
					await Issuer.totalIssuedSynths(toBytes32('sUSD'), true),
					totalDebtBeforeRemoval
				);
			});
			it('and sREDEEMER is removed from the system', async () => {
				assert.equal(await Synthetix.synths(toBytes32('sREDEEMER')), ZERO_ADDRESS);
			});
			describe('user redemption', () => {
				let sUSDBeforeRedemption;
				before(async () => {
					sUSDBeforeRedemption = await SynthsUSD.balanceOf(someUser.address);
				});

				before('when the user redeems their sREDEEMER', async () => {
					SynthRedeemer = SynthRedeemer.connect(someUser);
					const tx = await SynthRedeemer.redeem(ProxysREDEEMER.address);
					await tx.wait();
				});

				it('then the user has no more sREDEEMER', async () => {
					assert.equal(await SynthsREDEEMER.balanceOf(someUser.address), '0');
				});

				it('and they have more sUSD again', async () => {
					assert.bnGt(await SynthsUSD.balanceOf(someUser.address), sUSDBeforeRedemption);
				});
			});
		});
	});
}

module.exports = {
	itCanRedeem,
};
