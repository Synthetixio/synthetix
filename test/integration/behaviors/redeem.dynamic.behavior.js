const ethers = require('ethers');
const {
	utils: { parseEther },
} = ethers;
const { assert } = require('../../contracts/common');
const { ensureBalance } = require('../utils/balances');
const { skipWaitingPeriod } = require('../utils/skip');
const { increaseStalePeriodAndCheckRatesAndCache } = require('../utils/rates');
const { toBytes32 } = require('../../..');

function itCanRedeem({ ctx }) {
	describe('dynamic redemption of synths', () => {
		const UNIT = parseEther('1');

		let owner;
		let someUser;
		let DynamicSynthRedeemer,
			DebtCache,
			Issuer,
			SynthsUSD,
			SynthToRedeem1,
			SynthToRedeemProxy1,
			SynthToRedeem2,
			SynthToRedeemProxy2;
		let totalDebtBeforeRedemption, totalIssuedSynthsBeforeRedemption;
		let synth1, synth2;

		before('target contracts and users', () => {
			synth1 = 'sETH';
			synth2 = 'sETHBTC';
			({
				DynamicSynthRedeemer,
				DebtCache,
				Issuer,
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
				balance: parseEther('1'),
			});
		});

		before('ensure the user has sETHBTC', async () => {
			await ensureBalance({
				ctx,
				symbol: synth2,
				user: someUser,
				balance: parseEther('100'),
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
			totalIssuedSynthsBeforeRedemption = await Issuer.totalIssuedSynths(toBytes32('sUSD'), true);
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
				let synth1Balance, synth2Balance;

				before(async () => {
					sUSDBeforeRedemption = await SynthsUSD.balanceOf(someUser.address);
					synth1Balance = await SynthToRedeem1.balanceOf(someUser.address);
					synth2Balance = await SynthToRedeem2.balanceOf(someUser.address);
				});

				before('when the user redeems all of their synths', async () => {
					const currencyKeys = [toBytes32(synth1), toBytes32(synth2)];

					DynamicSynthRedeemer = DynamicSynthRedeemer.connect(someUser);
					txn = await DynamicSynthRedeemer.redeemAll(currencyKeys);
					await txn.wait();
				});

				it('then the total system debt is unchanged', async () => {
					/// use bnClose for slight variance in fork test
					assert.bnClose(
						(await DebtCache.currentDebt()).debt.toString(),
						totalDebtBeforeRedemption.toString()
					);
					assert.bnClose(
						(await Issuer.totalIssuedSynths(toBytes32('sUSD'), true)).toString(),
						totalIssuedSynthsBeforeRedemption.toString()
					);
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

					let totalValueRedeemedInsUSD = ethers.BigNumber.from(0);
					const sUSDBalanceAfter = await SynthsUSD.balanceOf(someUser.address);
					const expectedAmountofsUSD = sUSDBalanceAfter.sub(sUSDBeforeRedemption);

					const synthBalances = [synth1Balance, synth2Balance];
					const synthProxies = [SynthToRedeemProxy1.address, SynthToRedeemProxy2.address];

					synthRedeemedEvents.forEach((event, index) => {
						const synth = event.args.synth;
						const account = event.args.account;
						const amountOfSynth = event.args.amountOfSynth;
						const amountInsUSD = event.args.amountInsUSD;

						assert.equal(synth, synthProxies[index]);
						assert.equal(account, someUser.address);
						assert.bnEqual(amountOfSynth, synthBalances[index]);

						totalValueRedeemedInsUSD = totalValueRedeemedInsUSD.add(amountInsUSD);
					});

					assert.bnEqual(expectedAmountofsUSD, totalValueRedeemedInsUSD);
					assert.bnEqual(sUSDBalanceAfter, sUSDBeforeRedemption.add(totalValueRedeemedInsUSD));
				});
			});
		});
	});
}

module.exports = {
	itCanRedeem,
};
