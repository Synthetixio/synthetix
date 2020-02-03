require('.'); // import common test scaffolding

const ExchangeRates = artifacts.require('ExchangeRates');
const ExchangeState = artifacts.require('ExchangeState');
const Issuer = artifacts.require('Issuer');
const Escrow = artifacts.require('SynthetixEscrow');
const RewardEscrow = artifacts.require('RewardEscrow');
const FeePool = artifacts.require('FeePool');
const SupplySchedule = artifacts.require('SupplySchedule');
const Synthetix = artifacts.require('Synthetix');
const SynthetixState = artifacts.require('SynthetixState');
const Synth = artifacts.require('Synth');
const AddressResolver = artifacts.require('AddressResolver');
const Exchanger = artifacts.require('Exchanger');

const {
	currentTime,
	fastForward,
	fastForwardTo,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	fromUnit,
	ZERO_ADDRESS,
} = require('../utils/testUtils');

const { toBytes32 } = require('../..');

contract('Exchanger', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, sBTC, iBTC] = ['sUSD', 'sAUD', 'sEUR', 'SNX', 'sBTC', 'iBTC'].map(
		toBytes32
	);

	const [deployerAccount, owner, account1, account2, account3, account4, account6] = accounts;

	let synthetix,
		synthetixState,
		exchangeRates,
		issuer,
		exchangeState,
		feePool,
		supplySchedule,
		sUSDContract,
		sAUDContract,
		sBTCContract,
		escrow,
		rewardEscrow,
		sEURContract,
		oracle,
		timestamp,
		addressResolver,
		exchanger,
		initialAmountOfsUSDInAccount;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		issuer = await Issuer.deployed();
		exchangeState = await ExchangeState.deployed();
		feePool = await FeePool.deployed();
		supplySchedule = await SupplySchedule.deployed();
		escrow = await Escrow.deployed();
		rewardEscrow = await RewardEscrow.deployed();

		synthetix = await Synthetix.deployed();
		synthetixState = await SynthetixState.deployed();
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		sEURContract = await Synth.at(await synthetix.synths(sEUR));
		sBTCContract = await Synth.at(await synthetix.synths(sBTC));

		addressResolver = await AddressResolver.deployed();
		exchanger = await Exchanger.deployed();

		// Send a price update to guarantee we're not stale.
		oracle = await exchangeRates.oracle();
		timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC, iBTC],
			['0.5', '1.25', '0.1', '5000', '4000'].map(toUnit),
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
	});

	describe('setWaitingPeriodSecs', () => {
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
			describe('when a user with sUSD has started an exchange', () => {
				beforeEach(async () => {
					await synthetix.exchange(sUSD, toUnit('100'), sEUR, { from: account1 });
				});
				it('then it returns 60', async () => {
					const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
					assert.equal(maxSecs, '60', 'Full seconds remaining in waiting period');
				});
				describe('when 59 seconds has elapsed', () => {
					beforeEach(async () => {
						await fastForward(59);
					});
					it('then it returns 1', async () => {
						const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
						assert.equal(maxSecs, '1', 'Some time left in waiting period');
					});
					describe('when another second elapses', () => {
						beforeEach(async () => {
							await fastForward(1);
						});
						it('then it returns 0', async () => {
							const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
							assert.equal(maxSecs, '0', 'No time left in waiting period');
						});
					});
				});
			});
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

	describe('calculateExchangeAmountMinusFees()', () => {});

	describe('feeRateForExchange()', () => {});

	describe('settlementOwing()', () => {});

	describe('exchange()', () => {});

	describe('settle()', () => {});
});
