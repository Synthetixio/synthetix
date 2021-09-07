const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../../../index');
const { ensureBalance } = require('../utils/balances');
const { skipWaitingPeriod } = require('../utils/skip');
const { updateExchangeRatesIfNeeded } = require('../utils/rates');

function itCanRedeem({ ctx, synth }) {
	describe('redemption of deprecated synths', () => {
		let owner;
		let someUser;
		let Synthetix, Issuer, NewSynthToRedeem, NewSynthToRedeemProxy, SynthsUSD, SynthRedeemer;
		let totalDebtBeforeRemoval;

		before('target contracts and users', () => {
			({
				Synthetix,
				Issuer,
				[`Synth${synth}`]: NewSynthToRedeem,
				SynthsUSD,
				[`Proxy${synth}`]: NewSynthToRedeemProxy,
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

		before(`ensure the user has some of ${synth}`, async () => {
			Synthetix = Synthetix.connect(someUser);
			const tx = await Synthetix.exchange(
				toBytes32('sUSD'),
				ethers.utils.parseEther('50'),
				toBytes32(synth)
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

		describe(`deprecating ${synth}`, () => {
			before(`when the owner removes ${synth}`, async () => {
				Issuer = Issuer.connect(owner);
				// note: this sets synth as redeemed and cannot be undone without
				// redeploying locally or restarting a fork
				const tx = await Issuer.removeSynth(toBytes32(synth));
				await tx.wait();
			});

			it('then the total system debt is unchanged', async () => {
				assert.bnEqual(
					await Issuer.totalIssuedSynths(toBytes32('sUSD'), true),
					totalDebtBeforeRemoval
				);
			});
			it(`and ${synth} is removed from the system`, async () => {
				assert.equal(await Synthetix.synths(toBytes32(synth)), ZERO_ADDRESS);
			});
			describe('user redemption', () => {
				let sUSDBeforeRedemption;
				before(async () => {
					sUSDBeforeRedemption = await SynthsUSD.balanceOf(someUser.address);
				});

				before(`when the user redeems their ${synth}`, async () => {
					SynthRedeemer = SynthRedeemer.connect(someUser);
					const tx = await SynthRedeemer.redeem(NewSynthToRedeemProxy.address);
					await tx.wait();
				});

				it(`then the user has no more ${synth}`, async () => {
					assert.equal(await NewSynthToRedeem.balanceOf(someUser.address), '0');
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
