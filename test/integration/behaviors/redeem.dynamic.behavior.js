const ethers = require('ethers');
const {
	utils: { parseEther },
} = ethers;
const { assert } = require('../../contracts/common');
const { ensureBalance } = require('../utils/balances');
const { skipWaitingPeriod } = require('../utils/skip');
const { increaseStalePeriodAndCheckRatesAndCache } = require('../utils/rates');

function itCanRedeem({ ctx }) {
	describe('dynamic redemption of synths', () => {
		const UNIT = parseEther('1');

		let owner;
		let someUser;
		let DynamicSynthRedeemer,
			DebtCache,
			SynthsUSD,
			SynthToRedeem1,
			SynthToRedeemProxy1,
			SynthToRedeem2,
			SynthToRedeemProxy2;
		let totalDebtBeforeRedemption;
		let synth1, synth2;

		before('target contracts and users', () => {
			synth1 = 'sETH';
			synth2 = 'sETHBTC';
			({
				DynamicSynthRedeemer,
				DebtCache,
				SynthsUSD,
				[`Synth${synth1}`]: SynthToRedeem1,
				[`Proxy${synth1}`]: SynthToRedeemProxy1,
				[`Synth${synth2}`]: SynthToRedeem2,
				[`Proxy${synth2}`]: SynthToRedeemProxy2,
			} = ctx.contracts);

			({ owner, someUser } = ctx.users);
		});

		before('ensure the user has sETH', async () => {
			await ensureBalance({
				ctx,
				symbol: synth1,
				user: someUser,
				balance: parseEther('100'),
			});
		});

		before('ensure the user has sETHBTC', async () => {
			await ensureBalance({
				ctx,
				symbol: synth2,
				user: someUser,
				balance: parseEther('500'),
			});
		});

		before('skip waiting period', async () => {
			await skipWaitingPeriod({ ctx });
		});

		before('update rates and take snapshot if needed', async () => {
			await increaseStalePeriodAndCheckRatesAndCache({ ctx });
		});

		before('record total system debt', async () => {
			totalDebtBeforeRedemption = (await DebtCache.currentDebt()).debt;
		});

		describe('redeeming the synth', () => {
			before('when the owner activates redemption', async () => {
				DynamicSynthRedeemer = DynamicSynthRedeemer.connect(owner);
				const tx = await DynamicSynthRedeemer.resumeRedemption();
				await tx.wait();
			});

			it('and the discount rate is set to 1', async () => {
				assert.bnEqual(await DynamicSynthRedeemer.getDiscountRate(), UNIT);
			});

			describe('user redemption', () => {
				let txn;
				let sUSDBeforeRedemption;
				before(async () => {
					sUSDBeforeRedemption = await SynthsUSD.balanceOf(someUser.address);
				});

				before('when the user redeems all of their synths', async () => {
					const synthProxies = [SynthToRedeemProxy1.address, SynthToRedeemProxy2.address];

					DynamicSynthRedeemer = DynamicSynthRedeemer.connect(someUser);
					txn = await DynamicSynthRedeemer.redeemAll(synthProxies);
					await txn.wait();
				});

				it('then the total system debt is unchanged', async () => {
					assert.bnEqual((await DebtCache.currentDebt()).debt, totalDebtBeforeRedemption);
				});
				it('then the user has no more synths', async () => {
					assert.equal(await SynthToRedeem1.balanceOf(someUser.address), '0');
					assert.equal(await SynthToRedeem2.balanceOf(someUser.address), '0');
				});

				it('and they have more sUSD again', async () => {
					assert.bnGt(await SynthsUSD.balanceOf(someUser.address), sUSDBeforeRedemption);
				});

				it('emits SynthRedeemed events', async () => {
					const { events } = await txn.wait();
					const synthRedeemedEvents = events.filter(l => l.event === 'SynthRedeemed');

					const expectedAmount = parseEther('990');
					const synthProxies = [SynthToRedeemProxy1.address, SynthToRedeemProxy2.address];

					synthRedeemedEvents.forEach((event, index) => {
						const synth = event.args.synth;
						const account = event.args.account;
						const amountOfSynth = event.args.amountOfSynth;
						const amountInsUSD = event.args.amountInsUSD;

						assert.equal(synth, synthProxies[index]);
						assert.equal(account, someUser.address);
						assert.bnEqual(amountOfSynth, expectedAmount);
						assert.bnEqual(amountInsUSD, expectedAmount);
					});
				});
			});
		});
	});
}

module.exports = {
	itCanRedeem,
};
