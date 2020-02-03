require('.'); // import common test scaffolding

const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const Synth = artifacts.require('Synth');
const Exchanger = artifacts.require('Exchanger');

const {
	currentTime,
	fastForward,
	multiplyDecimal,
	divideDecimal,
	toUnit,
} = require('../utils/testUtils');

const { toBytes32 } = require('../..');

const timeIsClose = (actual, expected, variance = 1) => {
	assert.ok(
		Math.abs(Number(actual) - Number(expected)) <= variance,
		`Time is not within variance of ${variance}. Actual: ${Number(actual)}, Expected ${expected}`
	);
};

contract('Exchanger', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, sBTC, iBTC, sETH] = [
		'sUSD',
		'sAUD',
		'sEUR',
		'SNX',
		'sBTC',
		'iBTC',
		'sETH',
	].map(toBytes32);

	const [deployerAccount, owner, account1, account2, account3, account4] = accounts;

	let synthetix,
		exchangeRates,
		feePool,
		sUSDContract,
		sAUDContract,
		oracle,
		timestamp,
		exchanger,
		initialAmountOfsUSDInAccount,
		exchangeFeeRate;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();

		synthetix = await Synthetix.deployed();
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));

		exchanger = await Exchanger.deployed();

		// Send a price update to guarantee we're not stale.
		oracle = await exchangeRates.oracle();
		timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sETH, sBTC, iBTC],
			['0.5', '2', '1', '100', '5000', '5000'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);

		// ensure owner (who holds all the SNX) has sUSD it can send to others
		await synthetix.issueMaxSynths({ from: owner });

		initialAmountOfsUSDInAccount = toUnit('1000');
		// give sUSD to account 1, 2 and 3
		await sUSDContract.transfer(account1, initialAmountOfsUSDInAccount, {
			from: owner,
		});
		await sUSDContract.transfer(account2, initialAmountOfsUSDInAccount, {
			from: owner,
		});
		await sUSDContract.transfer(account3, initialAmountOfsUSDInAccount, {
			from: owner,
		});

		// set a 0.5% exchange fee rate (1/200)
		exchangeFeeRate = toUnit('0.005');
		await feePool.setExchangeFeeRate(exchangeFeeRate, {
			from: owner,
		});
	});

	describe('setExchangeEnabled()', () => {
		it('should disallow non owners to call exchangeEnabled', async () => {
			await assert.revert(exchanger.setExchangeEnabled(false, { from: account1 }));
			await assert.revert(exchanger.setExchangeEnabled(false, { from: account2 }));
			await assert.revert(exchanger.setExchangeEnabled(false, { from: account3 }));
			await assert.revert(exchanger.setExchangeEnabled(false, { from: account4 }));
		});

		it('should only allow Owner to call exchangeEnabled', async () => {
			// Set false
			await exchanger.setExchangeEnabled(false, { from: owner });
			const exchangeEnabled = await exchanger.exchangeEnabled();
			assert.equal(exchangeEnabled, false);

			// Set true
			await exchanger.setExchangeEnabled(true, { from: owner });
			const exchangeEnabledTrue = await exchanger.exchangeEnabled();
			assert.equal(exchangeEnabledTrue, true);
		});

		it('should not exchange when exchangeEnabled is false', async () => {
			const amountToExchange = toUnit('100');

			// Disable exchange
			await exchanger.setExchangeEnabled(false, { from: owner });

			// Exchange sUSD to sAUD
			await assert.revert(synthetix.exchange(sUSD, amountToExchange, sAUD, { from: account1 }));

			// Enable exchange
			await exchanger.setExchangeEnabled(true, { from: owner });

			// Exchange sUSD to sAUD
			const txn = await synthetix.exchange(sUSD, amountToExchange, sAUD, { from: account1 });

			const sAUDBalance = await sAUDContract.balanceOf(account1);

			const synthExchangeEvent = txn.logs.find(log => log.event === 'SynthExchange');
			assert.eventEqual(synthExchangeEvent, 'SynthExchange', {
				account: account1,
				fromCurrencyKey: toBytes32('sUSD'),
				fromAmount: amountToExchange,
				toCurrencyKey: toBytes32('sAUD'),
				toAmount: sAUDBalance,
				toAddress: account1,
			});
		});
	});

	describe('setWaitingPeriodSecs()', () => {
		it('only owner can invoke', async () => {
			await assert.revert(exchanger.setWaitingPeriodSecs('60', { from: account1 }));
			await assert.revert(exchanger.setWaitingPeriodSecs('60', { from: account2 }));
			await assert.revert(exchanger.setWaitingPeriodSecs('60', { from: account3 }));
			await assert.revert(exchanger.setWaitingPeriodSecs('60', { from: deployerAccount }));
		});
		it('owner can invoke and replace', async () => {
			const newPeriod = '90';
			await exchanger.setWaitingPeriodSecs(newPeriod, { from: owner });
			const actual = await exchanger.waitingPeriodSecs();
			assert.equal(actual, newPeriod, 'Configured waiting period is set correctly');
		});
		xdescribe('when configured to 60', () => {
			describe('when an exchange occurs', () => {
				describe('then it takes 60 seconds for a successive exchange to be allowed', () => {});
			});
		});
	});

	describe('maxSecsLeftInWaitingPeriod()', () => {
		describe('when the waiting period is configured to 60', () => {
			let waitingPeriodSecs;
			beforeEach(async () => {
				waitingPeriodSecs = '60';
				await exchanger.setWaitingPeriodSecs(waitingPeriodSecs, { from: owner });
			});
			describe('when there are no exchanges', () => {
				it('then it returns 0', async () => {
					const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
					assert.equal(maxSecs, '0', 'No seconds remaining for exchange');
				});
			});
			describe('when a user with sUSD has performed an exchange into sEUR', () => {
				beforeEach(async () => {
					await synthetix.exchange(sUSD, toUnit('100'), sEUR, { from: account1 });
				});
				it('then fetching maxSecs for that user into sEUR returns 60', async () => {
					const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
					timeIsClose(maxSecs, '60');
				});
				it('and fetching maxSecs for that user into the source synth returns 0', async () => {
					const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sUSD);
					assert.equal(maxSecs, '0', 'No waiting period for src synth');
				});
				it('and fetching maxSecs for that user into other synths returns 0', async () => {
					let maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sBTC);
					assert.equal(maxSecs, '0', 'No waiting period for other synth sBTC');
					maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, iBTC);
					assert.equal(maxSecs, '0', 'No waiting period for other synth iBTC');
				});
				it('and fetching maxSec for other users into that synth are unaffected', async () => {
					let maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account2, sEUR);
					assert.equal(
						maxSecs,
						'0',
						'Other user: account2 has no waiting period on dest synth of account 1'
					);
					maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account2, sUSD);
					assert.equal(
						maxSecs,
						'0',
						'Other user: account2 has no waiting period on src synth of account 1'
					);
					maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account3, sEUR);
					assert.equal(
						maxSecs,
						'0',
						'Other user: account3 has no waiting period on dest synth of acccount 1'
					);
				});

				describe('when 55 seconds has elapsed', () => {
					beforeEach(async () => {
						await fastForward(55);
					});
					it('then it returns 5', async () => {
						const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
						timeIsClose(maxSecs, 5);
					});
					describe('when another user does the same exchange', () => {
						beforeEach(async () => {
							await synthetix.exchange(sUSD, toUnit('100'), sEUR, { from: account2 });
						});
						it('then it still returns 5 for the original user', async () => {
							const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
							timeIsClose(maxSecs, 5);
						});
						it('and yet the new user has 60 secs', async () => {
							const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account2, sEUR);
							timeIsClose(maxSecs, 60);
						});
					});
					describe('when another 5 seconds elapses', () => {
						beforeEach(async () => {
							await fastForward(5);
						});
						it('then it returns 0', async () => {
							const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
							assert.equal(maxSecs, '0', 'No time left in waiting period');
						});
						describe('when another 10 seconds elapses', () => {
							beforeEach(async () => {
								await fastForward(10);
							});
							it('then it still returns 0', async () => {
								const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
								assert.equal(maxSecs, '0', 'No time left in waiting period');
							});
						});
					});
					describe('when the same user exchanges into the new synth', () => {
						beforeEach(async () => {
							await synthetix.exchange(sUSD, toUnit('100'), sEUR, { from: account1 });
						});
						it('then the secs remaining returns 60 again', async () => {
							const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
							timeIsClose(maxSecs, '60');
						});
					});
				});
			});
		});
	});

	describe('feeRateForExchange()', () => {
		let exchangeFeeRate;
		let doubleExchangeFeeRate;
		beforeEach(async () => {
			exchangeFeeRate = await feePool.exchangeFeeRate();
			doubleExchangeFeeRate = multiplyDecimal(exchangeFeeRate, 2);
		});
		it('for two long synths, returns the regular exchange fee', async () => {
			const actualFeeRate = await exchanger.feeRateForExchange(sEUR, sBTC);
			assert.bnEqual(actualFeeRate, exchangeFeeRate, 'Rate must be the exchange fee rate');
		});
		it('for two inverse synths, returns the regular exchange fee', async () => {
			const actualFeeRate = await exchanger.feeRateForExchange(iBTC, toBytes32('iETH'));
			assert.bnEqual(actualFeeRate, exchangeFeeRate, 'Rate must be the exchange fee rate');
		});
		it('for an inverse synth and sUSD, returns the regular exchange fee', async () => {
			let actualFeeRate = await exchanger.feeRateForExchange(iBTC, sUSD);
			assert.bnEqual(actualFeeRate, exchangeFeeRate, 'Rate must be the exchange fee rate');
			actualFeeRate = await exchanger.feeRateForExchange(sUSD, iBTC);
			assert.bnEqual(actualFeeRate, exchangeFeeRate, 'Rate must be the exchange fee rate');
		});
		it('for an inverse synth and a long synth, returns double regular exchange fee', async () => {
			let actualFeeRate = await exchanger.feeRateForExchange(iBTC, sEUR);
			assert.bnEqual(
				actualFeeRate,
				doubleExchangeFeeRate,
				'Rate must be double the exchange fee rate'
			);
			actualFeeRate = await exchanger.feeRateForExchange(sEUR, iBTC);
			assert.bnEqual(
				actualFeeRate,
				doubleExchangeFeeRate,
				'Rate must be double the exchange fee rate'
			);
			actualFeeRate = await exchanger.feeRateForExchange(sBTC, iBTC);
			assert.bnEqual(
				actualFeeRate,
				doubleExchangeFeeRate,
				'Rate must be double the exchange fee rate'
			);
			actualFeeRate = await exchanger.feeRateForExchange(iBTC, sBTC);
			assert.bnEqual(
				actualFeeRate,
				doubleExchangeFeeRate,
				'Rate must be double the exchange fee rate'
			);
		});
	});

	const calculateExpectedAmount = ({ amount, oldRate, newRate }) => {
		return multiplyDecimal(
			multiplyDecimal(amount, toUnit('1').sub(exchangeFeeRate)),
			oldRate.sub(newRate)
		);
	};

	describe('settlementOwing()', () => {
		describe('when waitingPeriodSecs is set to 60', () => {
			beforeEach(async () => {
				await exchanger.setWaitingPeriodSecs('60', { from: owner });
			});
			describe('when the first user exchanges 100 sUSD into sUSD:sEUR at 2:1', () => {
				let amountOfSrcExchanged;
				beforeEach(async () => {
					amountOfSrcExchanged = toUnit('100');
					await synthetix.exchange(sUSD, amountOfSrcExchanged, sEUR, { from: account1 });
				});
				it('then settlement owing shows 0 reclaim and 0 refund', async () => {
					const settlement = await exchanger.settlementOwing(account1, sEUR);
					assert.equal(settlement.owing, '0', 'Nothing can be owing');
					assert.equal(settlement.owed, '0', 'Nothing can be owed');
				});
				describe('when the price doubles for sUSD:sEUR to 4:1', () => {
					beforeEach(async () => {
						timestamp = await currentTime();

						await exchangeRates.updateRates([sEUR], ['4'].map(toUnit), timestamp, {
							from: oracle,
						});
					});
					it('then settlement owing shows a reclaim of half the entire balance of sEUR', async () => {
						const { owing, owed } = await exchanger.settlementOwing(account1, sEUR);

						assert.equal(owed, '0', 'Nothing can be owed');

						assert.bnEqual(
							owing,
							calculateExpectedAmount({
								amount: amountOfSrcExchanged,
								oldRate: divideDecimal(1, 2),
								newRate: divideDecimal(1, 4),
							}),
							'Must owe the profit made'
						);
					});
				});
			});
		});
	});

	describe('exchange()', () => {
		// TODO
		// port over Synthetix exchanges here
	});

	describe('settle()', () => {
		// TODO
	});
});
