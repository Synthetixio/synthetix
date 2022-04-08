'use strict';

const { artifacts, contract, web3 } = require('hardhat');
const { smockit } = require('@eth-optimism/smock');
const BN = require('bn.js');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const {
	currentTime,
	fastForward,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	toBN,
} = require('../utils')();

const { setupAllContracts } = require('./setup');

const {
	setExchangeFeeRateForSynths,
	getDecodedLogs,
	decodedEventEqual,
	timeIsClose,
	onlyGivenAddressCanInvoke,
	setStatus,
	convertToAggregatorPrice,
	updateRatesWithDefaults,
	setupPriceAggregators,
	updateAggregatorRates,
} = require('./helpers');

const {
	toBytes32,
	defaults: {
		WAITING_PERIOD_SECS,
		PRICE_DEVIATION_THRESHOLD_FACTOR,
		ATOMIC_MAX_VOLUME_PER_BLOCK,
		EXCHANGE_DYNAMIC_FEE_ROUNDS,
		EXCHANGE_DYNAMIC_FEE_WEIGHT_DECAY,
		EXCHANGE_DYNAMIC_FEE_THRESHOLD,
		EXCHANGE_MAX_DYNAMIC_FEE,
	},
} = require('../..');

const bnCloseVariance = '30';

const MockAggregator = artifacts.require('MockAggregatorV2V3');
const MockDexPriceAggregator = artifacts.require('MockDexPriceAggregator');
const MockToken = artifacts.require('MockToken');

contract('Exchanger (spec tests)', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, sBTC, iBTC, sETH, iETH] = [
		'sUSD',
		'sAUD',
		'sEUR',
		'SNX',
		'sBTC',
		'iBTC',
		'sETH',
		'iETH',
	].map(toBytes32);

	const trackingCode = toBytes32('1INCH');

	const synthKeys = [sUSD, sAUD, sEUR, sBTC, iBTC, sETH, iETH];

	const [, owner, account1, account2, account3] = accounts;

	let synthetix,
		exchangeRates,
		feePool,
		delegateApprovals,
		sUSDContract,
		sAUDContract,
		sEURContract,
		sBTCContract,
		sETHContract,
		exchanger,
		exchangeState,
		exchangeFeeRate,
		amountIssued,
		systemSettings,
		systemStatus,
		resolver,
		debtCache,
		issuer,
		flexibleStorage;

	const itReadsTheWaitingPeriod = () => {
		describe('waitingPeriodSecs', () => {
			it('the default is configured correctly', async () => {
				// Note: this only tests the effectiveness of the setup script, not the deploy script,
				assert.equal(await exchanger.waitingPeriodSecs(), WAITING_PERIOD_SECS);
			});
			describe('given it is configured to 90', () => {
				beforeEach(async () => {
					await systemSettings.setWaitingPeriodSecs('90', { from: owner });
				});
				describe('and there is an exchange', () => {
					beforeEach(async () => {
						await synthetix.exchange(sUSD, toUnit('100'), sEUR, { from: account1 });
					});
					it('then the maxSecsLeftInWaitingPeriod is close to 90', async () => {
						const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
						timeIsClose({ actual: maxSecs, expected: 90, variance: 2 });
					});
					describe('and 87 seconds elapses', () => {
						// Note: timestamp accurancy can't be guaranteed, so provide a few seconds of buffer either way
						beforeEach(async () => {
							await fastForward(87);
						});
						describe('when settle() is called', () => {
							it('then it reverts', async () => {
								await assert.revert(
									synthetix.settle(sEUR, { from: account1 }),
									'Cannot settle during waiting period'
								);
							});
							it('and the maxSecsLeftInWaitingPeriod is close to 1', async () => {
								const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
								timeIsClose({ actual: maxSecs, expected: 1, variance: 2 });
							});
						});
						describe('when a further 5 seconds elapse', () => {
							beforeEach(async () => {
								await fastForward(5);
							});
							describe('when settle() is called', () => {
								it('it successed', async () => {
									await synthetix.settle(sEUR, { from: account1 });
								});
							});
						});
					});
				});
			});
		});
	};

	const itWhenTheWaitingPeriodIsZero = () => {
		describe('When the waiting period is set to 0', () => {
			let initialWaitingPeriod;

			beforeEach(async () => {
				// disable dynamic fee here as it's testing settlement
				await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });

				initialWaitingPeriod = await systemSettings.waitingPeriodSecs();
				await systemSettings.setWaitingPeriodSecs('0', { from: owner });
			});

			it('is set correctly', async () => {
				assert.bnEqual(await systemSettings.waitingPeriodSecs(), '0');
			});

			describe('When exchanging', () => {
				const amountOfSrcExchanged = toUnit('10');

				beforeEach(async () => {
					await updateRatesWithDefaults({ exchangeRates, owner, debtCache });
					await sUSDContract.issue(owner, toUnit('100'));
					await synthetix.exchange(sUSD, toUnit('10'), sETH, { from: owner });
				});

				it('creates no new entries', async () => {
					let { numEntries } = await exchanger.settlementOwing(owner, sETH);
					assert.bnEqual(numEntries, '0');
					numEntries = await exchangeState.getLengthOfEntries(owner, sETH);
					assert.bnEqual(numEntries, '0');
				});

				it('can exchange back without waiting', async () => {
					const { amountReceived } = await exchanger.getAmountsForExchange(
						amountOfSrcExchanged,
						sUSD,
						sETH
					);
					await synthetix.exchange(sETH, amountReceived, sUSD, { from: owner });
					assert.bnEqual(await sETHContract.balanceOf(owner), '0');
				});

				describe('When the waiting period is switched on again', () => {
					beforeEach(async () => {
						await systemSettings.setWaitingPeriodSecs(initialWaitingPeriod, { from: owner });
					});

					it('is set correctly', async () => {
						assert.bnEqual(await systemSettings.waitingPeriodSecs(), initialWaitingPeriod);
					});

					describe('a new exchange takes place', () => {
						let exchangeTransaction;

						beforeEach(async () => {
							await fastForward(await systemSettings.waitingPeriodSecs());
							exchangeTransaction = await synthetix.exchange(sUSD, amountOfSrcExchanged, sETH, {
								from: owner,
							});
						});

						it('creates a new entry', async () => {
							const { numEntries } = await exchanger.settlementOwing(owner, sETH);
							assert.bnEqual(numEntries, '1');
						});

						it('then it emits an ExchangeEntryAppended', async () => {
							const { amountReceived, exchangeFeeRate } = await exchanger.getAmountsForExchange(
								amountOfSrcExchanged,
								sUSD,
								sETH
							);
							const logs = await getDecodedLogs({
								hash: exchangeTransaction.tx,
								contracts: [synthetix, exchanger, sUSDContract, issuer, flexibleStorage, debtCache],
							});
							decodedEventEqual({
								log: logs.find(({ name }) => name === 'ExchangeEntryAppended'),
								event: 'ExchangeEntryAppended',
								emittedFrom: exchanger.address,
								args: [
									owner,
									sUSD,
									amountOfSrcExchanged,
									sETH,
									amountReceived,
									exchangeFeeRate,
									new web3.utils.BN(1),
									new web3.utils.BN(2),
								],
								bnCloseVariance,
							});
						});

						it('reverts if the user tries to settle before the waiting period has expired', async () => {
							await assert.revert(
								synthetix.settle(sETH, {
									from: owner,
								}),
								'Cannot settle during waiting period'
							);
						});

						describe('When the waiting period is set back to 0', () => {
							beforeEach(async () => {
								await systemSettings.setWaitingPeriodSecs('0', { from: owner });
							});

							it('there should be only one sETH entry', async () => {
								let numEntries = await exchangeState.getLengthOfEntries(owner, sETH);
								assert.bnEqual(numEntries, '1');
								numEntries = await exchangeState.getLengthOfEntries(owner, sEUR);
								assert.bnEqual(numEntries, '0');
							});

							describe('new trades take place', () => {
								beforeEach(async () => {
									// await fastForward(await systemSettings.waitingPeriodSecs());
									const sEthBalance = await sETHContract.balanceOf(owner);
									await synthetix.exchange(sETH, sEthBalance, sUSD, { from: owner });
									await synthetix.exchange(sUSD, toUnit('10'), sEUR, { from: owner });
								});

								it('should settle the pending exchanges and remove all entries', async () => {
									assert.bnEqual(await sETHContract.balanceOf(owner), '0');
									const { numEntries } = await exchanger.settlementOwing(owner, sETH);
									assert.bnEqual(numEntries, '0');
								});

								it('should not create any new entries', async () => {
									const { numEntries } = await exchanger.settlementOwing(owner, sEUR);
									assert.bnEqual(numEntries, '0');
								});
							});
						});
					});
				});
			});
		});
	};

	const itDeviatesCorrectly = () => {
		describe('priceDeviationThresholdFactor()', () => {
			it('the default is configured correctly', async () => {
				// Note: this only tests the effectiveness of the setup script, not the deploy script,
				assert.equal(
					await exchanger.priceDeviationThresholdFactor(),
					PRICE_DEVIATION_THRESHOLD_FACTOR
				);
			});
			describe('when a user exchanges into sETH over the default threshold factor', () => {
				beforeEach(async () => {
					await fastForward(10);
					// base rate of sETH is 100 from shared setup above
					await updateRates([sETH], [toUnit('300')]);
					await synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account1 });
				});
				it('then the synth is suspended', async () => {
					const { suspended, reason } = await systemStatus.synthSuspension(sETH);
					assert.ok(suspended);
					assert.equal(reason, '65');
				});
			});
			describe('when a user exchanges into sETH under the default threshold factor', () => {
				beforeEach(async () => {
					await fastForward(10);
					// base rate of sETH is 100 from shared setup above
					await updateRates([sETH], [toUnit('33')]);
					await synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account1 });
				});
				it('then the synth is suspended', async () => {
					const { suspended, reason } = await systemStatus.synthSuspension(sETH);
					assert.ok(suspended);
					assert.equal(reason, '65');
				});
			});
			describe('changing the factor works', () => {
				describe('when the factor is set to 3.1', () => {
					beforeEach(async () => {
						await systemSettings.setPriceDeviationThresholdFactor(toUnit('3.1'), { from: owner });
					});
					describe('when a user exchanges into sETH over the default threshold factor, but under the new one', () => {
						beforeEach(async () => {
							await fastForward(10);
							// base rate of sETH is 100 from shared setup above
							await updateRates([sETH], [toUnit('300')]);
							await synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account1 });
						});
						it('then the synth is not suspended', async () => {
							const { suspended, reason } = await systemStatus.synthSuspension(sETH);
							assert.ok(!suspended);
							assert.equal(reason, '0');
						});
					});
					describe('when a user exchanges into sETH under the default threshold factor, but under the new one', () => {
						beforeEach(async () => {
							await fastForward(10);
							// base rate of sETH is 100 from shared setup above
							await updateRates([sETH], [toUnit('33')]);
							await synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account1 });
						});
						it('then the synth is not suspended', async () => {
							const { suspended, reason } = await systemStatus.synthSuspension(sETH);
							assert.ok(!suspended);
							assert.equal(reason, '0');
						});
					});
				});
			});
		});
	};

	const itCalculatesMaxSecsLeft = () => {
		describe('maxSecsLeftInWaitingPeriod()', () => {
			describe('when the waiting period is configured to 60', () => {
				let waitingPeriodSecs;
				beforeEach(async () => {
					waitingPeriodSecs = '60';
					await systemSettings.setWaitingPeriodSecs(waitingPeriodSecs, { from: owner });
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
					it('reports hasWaitingPeriodOrSettlementOwing', async () => {
						assert.isTrue(await exchanger.hasWaitingPeriodOrSettlementOwing(account1, sEUR));
					});
					it('then fetching maxSecs for that user into sEUR returns 60', async () => {
						const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
						timeIsClose({ actual: maxSecs, expected: 60, variance: 2 });
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
							timeIsClose({ actual: maxSecs, expected: 5, variance: 2 });
						});
						describe('when another user does the same exchange', () => {
							beforeEach(async () => {
								await synthetix.exchange(sUSD, toUnit('100'), sEUR, { from: account2 });
							});
							it('then it still returns 5 for the original user', async () => {
								const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
								timeIsClose({ actual: maxSecs, expected: 5, variance: 3 });
							});
							it('and yet the new user has 60 secs', async () => {
								const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account2, sEUR);
								timeIsClose({ actual: maxSecs, expected: 60, variance: 3 });
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
								timeIsClose({ actual: maxSecs, expected: 60, variance: 2 });
							});
						});
					});
				});
			});
		});
	};

	const itCalculatesFeeRateForExchange = () => {
		describe('Given exchangeFeeRates are configured and when calling feeRateForExchange()', () => {
			it('for two long synths, returns double the regular exchange fee', async () => {
				const actualFeeRate = await exchanger.feeRateForExchange(sEUR, sBTC);
				assert.bnEqual(
					actualFeeRate,
					exchangeFeeRate.mul(toBN('2')),
					'Rate must be the exchange fee rate'
				);
			});
		});
	};

	const itCalculatesFeeRateForExchange2 = () => {
		describe('given exchange fee rates are configured into categories', () => {
			const bipsUSD = toUnit('0');
			const bipsFX = toUnit('0.01');
			const bipsCrypto = toUnit('0.02');
			const bipsInverse = toUnit('0.03');
			beforeEach(async () => {
				await systemSettings.setExchangeFeeRateForSynths(
					[sUSD, sAUD, sEUR, sETH, sBTC, iBTC],
					[bipsUSD, bipsFX, bipsFX, bipsCrypto, bipsCrypto, bipsInverse],
					{
						from: owner,
					}
				);
			});
			describe('when calling getAmountsForExchange', () => {
				describe('and the destination is a crypto synth', () => {
					let received;
					let destinationFee;
					let feeRate;
					beforeEach(async () => {
						await synthetix.exchange(sUSD, amountIssued, sBTC, { from: account1 });
						const { amountReceived, fee, exchangeFeeRate } = await exchanger.getAmountsForExchange(
							amountIssued,
							sUSD,
							sBTC
						);
						received = amountReceived;
						destinationFee = fee;
						feeRate = exchangeFeeRate;
					});
					it('then return the amountReceived', async () => {
						const sBTCBalance = await sBTCContract.balanceOf(account1);
						assert.bnEqual(received, sBTCBalance);
					});
					it('then return the fee', async () => {
						const effectiveValue = await exchangeRates.effectiveValue(sUSD, amountIssued, sBTC);
						assert.bnEqual(destinationFee, exchangeFeeIncurred(effectiveValue, bipsCrypto));
					});
					it('then return the feeRate', async () => {
						const exchangeFeeRate = await exchanger.feeRateForExchange(sUSD, sBTC);
						assert.bnEqual(feeRate, exchangeFeeRate);
					});
				});

				describe('and the destination is a fiat synth', () => {
					let received;
					let destinationFee;
					let feeRate;
					beforeEach(async () => {
						await synthetix.exchange(sUSD, amountIssued, sEUR, { from: account1 });
						const { amountReceived, fee, exchangeFeeRate } = await exchanger.getAmountsForExchange(
							amountIssued,
							sUSD,
							sEUR
						);
						received = amountReceived;
						destinationFee = fee;
						feeRate = exchangeFeeRate;
					});
					it('then return the amountReceived', async () => {
						const sEURBalance = await sEURContract.balanceOf(account1);
						assert.bnEqual(received, sEURBalance);
					});
					it('then return the fee', async () => {
						const effectiveValue = await exchangeRates.effectiveValue(sUSD, amountIssued, sEUR);
						assert.bnEqual(destinationFee, exchangeFeeIncurred(effectiveValue, bipsFX));
					});
					it('then return the feeRate', async () => {
						const exchangeFeeRate = await exchanger.feeRateForExchange(sUSD, sEUR);
						assert.bnEqual(feeRate, exchangeFeeRate);
					});
				});

				describe('when the fees are changed', () => {
					const amount = toUnit('1000');

					it('updates exchange fee amounts appropriately', async () => {
						await systemSettings.setExchangeFeeRateForSynths([sUSD], [toUnit(0)], {
							from: owner,
						});
						await systemSettings.setExchangeFeeRateForSynths([sAUD], [toUnit(0)], {
							from: owner,
						});

						const { exchangeFeeRate: exchangeFeeRate1 } = await exchanger.getAmountsForExchange(
							amount,
							sUSD,
							sAUD
						);
						assert.bnEqual(exchangeFeeRate1, 0);

						await systemSettings.setExchangeFeeRateForSynths([sUSD], [toUnit(0.1)], {
							from: owner,
						});
						const { exchangeFeeRate: exchangeFeeRate2 } = await exchanger.getAmountsForExchange(
							amount,
							sUSD,
							sAUD
						);
						assert.bnEqual(exchangeFeeRate2, toUnit(0.1));

						await systemSettings.setExchangeFeeRateForSynths([sAUD], [toUnit(0.01)], {
							from: owner,
						});
						const { exchangeFeeRate: exchangeFeeRate3 } = await exchanger.getAmountsForExchange(
							amount,
							sUSD,
							sAUD
						);
						assert.bnEqual(exchangeFeeRate3, toUnit(0.11));
					});
				});

				describe('when tripling an exchange rate', () => {
					const amount = toUnit('1000');
					const factor = toUnit('3');

					let orgininalFee;
					let orginalFeeRate;
					beforeEach(async () => {
						const { fee, exchangeFeeRate } = await exchanger.getAmountsForExchange(
							amount,
							sUSD,
							sAUD
						);
						orgininalFee = fee;
						orginalFeeRate = exchangeFeeRate;

						await systemSettings.setExchangeFeeRateForSynths(
							[sAUD],
							[multiplyDecimal(bipsFX, factor)],
							{
								from: owner,
							}
						);
					});
					it('then return the fee tripled', async () => {
						const { fee } = await exchanger.getAmountsForExchange(amount, sUSD, sAUD);
						assert.bnEqual(fee, multiplyDecimal(orgininalFee, factor));
					});
					it('then return the feeRate tripled', async () => {
						const { exchangeFeeRate } = await exchanger.getAmountsForExchange(amount, sUSD, sAUD);
						assert.bnEqual(exchangeFeeRate, multiplyDecimal(orginalFeeRate, factor));
					});
					it('then return the amountReceived less triple the fee', async () => {
						const { amountReceived } = await exchanger.getAmountsForExchange(amount, sUSD, sAUD);
						const tripleFee = multiplyDecimal(orgininalFee, factor);
						const effectiveValue = await exchangeRates.effectiveValue(sUSD, amount, sAUD);
						assert.bnEqual(amountReceived, effectiveValue.sub(tripleFee));
					});
				});

				describe('dynamic fee when rates change', () => {
					const threshold = toBN(EXCHANGE_DYNAMIC_FEE_THRESHOLD);
					const maxDynamicFeeRate = toBN(EXCHANGE_MAX_DYNAMIC_FEE);

					it('initial fee is correct', async () => {
						assert.bnEqual(await exchanger.feeRateForExchange(sUSD, sBTC), bipsCrypto);
						assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sBTC), [0, false]);
					});

					describe('fee is calculated correctly when rates spike or drop', () => {
						it('.3% spike is below threshold', async () => {
							await updateRates([sETH], [toUnit(100.3)]);
							// spike
							assert.bnEqual(await exchanger.feeRateForExchange(sUSD, sETH), bipsCrypto);
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sETH), [0, false]);
							// control
							assert.bnEqual(await exchanger.feeRateForExchange(sUSD, sBTC), bipsCrypto);
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sBTC, sBTC), [0, false]);
						});

						it('.3% drop is below threshold', async () => {
							await updateRates([sETH], [toUnit(99.7)]);
							// spike
							assert.bnEqual(await exchanger.feeRateForExchange(sUSD, sETH), bipsCrypto);
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sETH), [0, false]);
							// control
							assert.bnEqual(await exchanger.feeRateForExchange(sUSD, sBTC), bipsCrypto);
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sBTC, sBTC), [0, false]);
						});

						it('1% spike result in correct dynamic fee', async () => {
							await updateRates([sETH], [toUnit(101)]);
							// price diff ratio (1%)- threshold
							const expectedDynamicFee = toUnit(0.01).sub(threshold);
							assert.bnEqual(
								await exchanger.feeRateForExchange(sUSD, sETH),
								bipsCrypto.add(expectedDynamicFee)
							);
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sETH), [
								expectedDynamicFee,
								false,
							]);
							// control
							assert.bnEqual(await exchanger.feeRateForExchange(sUSD, sBTC), bipsCrypto);
						});

						it('1% drop result in correct dynamic fee', async () => {
							await updateRates([sETH], [toUnit(99)]);
							// price diff ratio (1%)- threshold
							const expectedDynamicFee = toUnit(0.01).sub(threshold);
							assert.bnEqual(
								await exchanger.feeRateForExchange(sUSD, sETH),
								bipsCrypto.add(expectedDynamicFee)
							);
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sETH), [
								expectedDynamicFee,
								false,
							]);
							// control
							assert.bnEqual(await exchanger.feeRateForExchange(sUSD, sBTC), bipsCrypto);
						});

						it('5% spike result in correct dynamic fee', async () => {
							await updateRates([sETH], [toUnit(105)]);
							// price diff ratio (5%)- threshold
							const expectedDynamicFee = toUnit(0.05).sub(threshold);
							assert.bnEqual(
								await exchanger.feeRateForExchange(sUSD, sETH),
								bipsCrypto.add(expectedDynamicFee)
							);
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sETH), [
								expectedDynamicFee,
								false,
							]);
							// control
							assert.bnEqual(await exchanger.feeRateForExchange(sUSD, sBTC), bipsCrypto);
						});

						it('5% drop result in correct dynamic fee', async () => {
							await updateRates([sETH], [toUnit(95)]);
							// price diff ratio (5%)- threshold
							const expectedDynamicFee = toUnit(0.05).sub(threshold);
							assert.bnEqual(
								await exchanger.feeRateForExchange(sUSD, sETH),
								bipsCrypto.add(expectedDynamicFee)
							);
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sETH), [
								expectedDynamicFee,
								false,
							]);
							// control
							assert.bnEqual(await exchanger.feeRateForExchange(sUSD, sBTC), bipsCrypto);
						});

						it('10% spike is over the max and is too volatile', async () => {
							await updateRates([sETH], [toUnit(110)]);
							await assert.revert(exchanger.feeRateForExchange(sUSD, sETH), 'too volatile');
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sETH), [
								maxDynamicFeeRate,
								true,
							]);

							// control
							assert.bnEqual(await exchanger.feeRateForExchange(sUSD, sBTC), bipsCrypto);
						});

						it('10% drop result in correct dynamic fee', async () => {
							await updateRates([sETH], [toUnit(90)]);
							await assert.revert(exchanger.feeRateForExchange(sUSD, sETH), 'too volatile');
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sETH), [
								maxDynamicFeeRate,
								true,
							]);
							// view reverts
							await assert.revert(
								exchanger.getAmountsForExchange(toUnit('1'), sUSD, sETH),
								'too volatile'
							);
							// control
							assert.bnEqual(await exchanger.feeRateForExchange(sUSD, sBTC), bipsCrypto);
						});

						it('trading between two spiked rates is correctly calculated ', async () => {
							await updateRates([sETH, sBTC], [toUnit(102), toUnit(5100)]);
							// base fee + (price diff ratio (2%)- threshold) * 2
							const expectedDynamicFee = toUnit(0.02)
								.sub(threshold)
								.mul(toBN(2));

							assert.bnEqual(
								await exchanger.feeRateForExchange(sBTC, sETH),
								bipsCrypto.add(bipsCrypto).add(expectedDynamicFee)
							);
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sBTC, sETH), [
								expectedDynamicFee,
								false,
							]);
							// reverse direction is the same
							assert.bnEqual(
								await exchanger.feeRateForExchange(sETH, sBTC),
								bipsCrypto.add(bipsCrypto).add(expectedDynamicFee)
							);
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sETH, sBTC), [
								expectedDynamicFee,
								false,
							]);
						});

						it('trading between two spiked respects max fee and volatility flag', async () => {
							// spike each 3% so that total dynamic fee is 6% which is more than the max
							await updateRates([sETH, sBTC], [toUnit(103), toUnit(5150)]);
							await assert.revert(exchanger.feeRateForExchange(sBTC, sETH), 'too volatile');
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sBTC, sETH), [
								maxDynamicFeeRate,
								true,
							]);
							// reverse direction is the same
							await assert.revert(exchanger.feeRateForExchange(sETH, sBTC), 'too volatile');
							assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sETH, sBTC), [
								maxDynamicFeeRate,
								true,
							]);
							// view reverts
							await assert.revert(
								exchanger.getAmountsForExchange(toUnit('1'), sETH, sBTC),
								'too volatile'
							);
							await assert.revert(
								exchanger.getAmountsForExchange(toUnit('1'), sBTC, sETH),
								'too volatile'
							);
						});
					});

					it('no exchange happens when dynamic fee is too high', async () => {
						await sETHContract.issue(account1, toUnit('10'));

						async function echangeSuccessful() {
							// this should work
							const txn = await synthetix.exchange(sETH, toUnit('1'), sUSD, { from: account1 });
							const logs = await getDecodedLogs({
								hash: txn.tx,
								contracts: [synthetix, exchanger, systemStatus],
							});
							// some exchange took place (this is just to control for correct assertion)
							return logs.some(({ name } = {}) => name === 'SynthExchange');
						}

						// should work for no change
						assert.ok(await echangeSuccessful());
						// view doesn't revert
						await exchanger.getAmountsForExchange(toUnit('1'), sETH, sUSD);

						// spike the rate a little
						await updateRates([sETH], [toUnit(103)]);
						// should still work
						assert.ok(await echangeSuccessful());
						// view doesn't revert
						await exchanger.getAmountsForExchange(toUnit('1'), sETH, sUSD);

						// spike the rate too much
						await updateRates([sETH], [toUnit(110)]);
						// should not work now
						assert.notOk(await echangeSuccessful());
						// view reverts
						await assert.revert(
							exchanger.getAmountsForExchange(toUnit('1'), sETH, sUSD),
							'too volatile'
						);
					});

					it('dynamic fee decays with time', async () => {
						await updateRates([sETH], [toUnit(105)]);
						// (price diff ratio (5%)- threshold)
						let expectedDynamicFee = toUnit(0.05).sub(threshold);
						assert.bnEqual(
							await exchanger.feeRateForExchange(sUSD, sETH),
							bipsCrypto.add(expectedDynamicFee)
						);
						assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sETH), [
							expectedDynamicFee,
							false,
						]);

						const decay = toBN(EXCHANGE_DYNAMIC_FEE_WEIGHT_DECAY);

						// next round
						await updateRates([sETH], [toUnit(105)]);
						expectedDynamicFee = multiplyDecimal(expectedDynamicFee, decay);
						assert.bnEqual(
							await exchanger.feeRateForExchange(sUSD, sETH),
							bipsCrypto.add(expectedDynamicFee)
						);
						assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sETH), [
							expectedDynamicFee,
							false,
						]);

						// another round
						await updateRates([sETH], [toUnit(105)]);
						expectedDynamicFee = multiplyDecimal(expectedDynamicFee, decay);
						assert.bnEqual(
							await exchanger.feeRateForExchange(sUSD, sETH),
							bipsCrypto.add(expectedDynamicFee)
						);
						assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sETH), [
							expectedDynamicFee,
							false,
						]);

						// EXCHANGE_DYNAMIC_FEE_ROUNDS after spike dynamic fee is 0
						for (let i = 0; i < EXCHANGE_DYNAMIC_FEE_ROUNDS - 3; i++) {
							await updateRates([sETH], [toUnit(105)]);
						}
						assert.bnEqual(await exchanger.feeRateForExchange(sUSD, sETH), bipsCrypto);
						assert.deepEqual(await exchanger.dynamicFeeRateForExchange(sUSD, sETH), [0, false]);
					});
				});
			});
		});
	};

	const exchangeFeeIncurred = (amountToExchange, exchangeFeeRate) => {
		return multiplyDecimal(amountToExchange, exchangeFeeRate);
	};

	const amountAfterExchangeFee = ({ amount }) => {
		// exchange fee is applied twice, because we assume it is the same one used for both synths in the exchange
		return multiplyDecimal(
			amount,
			toUnit('1')
				.sub(exchangeFeeRate)
				.sub(exchangeFeeRate)
		);
	};

	const calculateExpectedSettlementAmount = ({ amount, oldRate, newRate }) => {
		// Note: exchangeFeeRate is in a parent scope. Tests may mutate it in beforeEach and
		// be assured that this function, when called in a test, will use that mutated value
		const result = multiplyDecimal(amountAfterExchangeFee({ amount }), oldRate.sub(newRate));
		return {
			reclaimAmount: result.isNeg() ? new web3.utils.BN(0) : result,
			rebateAmount: result.isNeg() ? result.abs() : new web3.utils.BN(0),
		};
	};

	/**
	 * Ensure a settle() transaction emits the expected events
	 */
	const ensureTxnEmitsSettlementEvents = async ({ hash, synth, expected }) => {
		// Get receipt to collect all transaction events
		const logs = await getDecodedLogs({ hash, contracts: [synthetix, exchanger, sUSDContract] });

		const currencyKey = await synth.currencyKey();
		// Can only either be reclaim or rebate - not both
		const isReclaim = !expected.reclaimAmount.isZero();
		const expectedAmount = isReclaim ? expected.reclaimAmount : expected.rebateAmount;

		const eventName = `Exchange${isReclaim ? 'Reclaim' : 'Rebate'}`;
		decodedEventEqual({
			log: logs.find(({ name }) => name === eventName), // logs[0] is individual reclaim/rebate events, logs[1] is either an Issued or Burned event
			event: eventName,
			emittedFrom: await synthetix.proxy(),
			args: [account1, currencyKey, expectedAmount],
			bnCloseVariance,
		});

		// return all logs for any other usage
		return logs;
	};

	const itSettles = () => {
		describe('settlement', () => {
			describe('suspension conditions', () => {
				const synth = sETH;
				['System', 'Synth'].forEach(section => {
					describe(`when ${section} is suspended`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: true, synth });
							// Disable Dynamic Fee here as settlement is L1 and Dynamic fee is on L2
							await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });
						});
						it('then calling settle() reverts', async () => {
							await assert.revert(
								synthetix.settle(sETH, { from: account1 }),
								'Operation prohibited'
							);
						});
						describe(`when ${section} is resumed`, () => {
							beforeEach(async () => {
								await setStatus({ owner, systemStatus, section, suspend: false, synth });
							});
							it('then calling exchange() succeeds', async () => {
								await synthetix.settle(sETH, { from: account1 });
							});
						});
					});
				});
				describe('when Synth(sBTC) is suspended', () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section: 'Synth', suspend: true, synth: sBTC });
					});
					it('then settling other synths still works', async () => {
						await synthetix.settle(sETH, { from: account1 });
						await synthetix.settle(sAUD, { from: account2 });
					});
				});
				describe('when Synth(sBTC) is suspended for exchanging', () => {
					beforeEach(async () => {
						await setStatus({
							owner,
							systemStatus,
							section: 'SynthExchange',
							suspend: true,
							synth: sBTC,
						});
					});
					it('then settling it still works', async () => {
						await synthetix.settle(sBTC, { from: account1 });
					});
				});
			});
			describe('given the sEUR rate is 2, and sETH is 100, sBTC is 9000', () => {
				beforeEach(async () => {
					// set sUSD:sEUR as 2:1, sUSD:sETH at 100:1, sUSD:sBTC at 9000:1
					await updateRates([sEUR, sETH, sBTC], ['2', '100', '9000'].map(toUnit));
					// Disable Dynamic Fee by setting rounds to 0
					await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });
				});
				describe('and the exchange fee rate is 1% for easier human consumption', () => {
					beforeEach(async () => {
						// Warning: this is mutating the global exchangeFeeRate for this test block and will be reset when out of scope
						exchangeFeeRate = toUnit('0.01');
						await setExchangeFeeRateForSynths({
							owner,
							systemSettings,
							synthKeys,
							exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
						});
					});
					describe('and the waitingPeriodSecs is set to 60', () => {
						beforeEach(async () => {
							await systemSettings.setWaitingPeriodSecs('60', { from: owner });
						});
						describe('various rebate & reclaim scenarios', () => {
							describe('when the debt cache is replaced with a spy', () => {
								let debtCacheSpy;
								beforeEach(async () => {
									// populate with a mocked DebtCache so we can inspect it
									debtCacheSpy = await smockit(artifacts.require('DebtCache').abi);
									await resolver.importAddresses([toBytes32('DebtCache')], [debtCacheSpy.address], {
										from: owner,
									});
									await exchanger.rebuildCache();
								});
								describe('and the priceDeviationThresholdFactor is set to a factor of 2.5', () => {
									beforeEach(async () => {
										// prevent circuit breaker from firing for doubling or halving rates by upping the threshold difference to 2.5
										await systemSettings.setPriceDeviationThresholdFactor(toUnit('2.5'), {
											from: owner,
										});
									});
									describe('when the first user exchanges 100 sUSD into sUSD:sEUR at 2:1', () => {
										let amountOfSrcExchanged;
										let exchangeTime;
										let exchangeTransaction;
										beforeEach(async () => {
											amountOfSrcExchanged = toUnit('100');
											exchangeTime = await currentTime();
											exchangeTransaction = await synthetix.exchange(
												sUSD,
												amountOfSrcExchanged,
												sEUR,
												{
													from: account1,
												}
											);

											const {
												amountReceived,
												exchangeFeeRate,
											} = await exchanger.getAmountsForExchange(amountOfSrcExchanged, sUSD, sEUR);

											const logs = await getDecodedLogs({
												hash: exchangeTransaction.tx,
												contracts: [
													synthetix,
													exchanger,
													sUSDContract,
													issuer,
													flexibleStorage,
													debtCache,
												],
											});

											// ExchangeEntryAppended is emitted for exchange
											decodedEventEqual({
												log: logs.find(({ name }) => name === 'ExchangeEntryAppended'),
												event: 'ExchangeEntryAppended',
												emittedFrom: exchanger.address,
												args: [
													account1,
													sUSD,
													amountOfSrcExchanged,
													sEUR,
													amountReceived,
													exchangeFeeRate,
													new web3.utils.BN(1),
													new web3.utils.BN(2),
												],
												bnCloseVariance,
											});
										});
										it('then settlement reclaimAmount shows 0 reclaim and 0 refund', async () => {
											const settlement = await exchanger.settlementOwing(account1, sEUR);
											assert.equal(settlement.reclaimAmount, '0', 'Nothing can be reclaimAmount');
											assert.equal(settlement.rebateAmount, '0', 'Nothing can be rebateAmount');
											assert.equal(
												settlement.numEntries,
												'1',
												'Must be one entry in the settlement queue'
											);
										});
										describe('when settle() is invoked on sEUR', () => {
											it('then it reverts as the waiting period has not ended', async () => {
												await assert.revert(
													synthetix.settle(sEUR, { from: account1 }),
													'Cannot settle during waiting period'
												);
											});
										});

										describe('when the waiting period elapses', () => {
											beforeEach(async () => {
												await fastForward(60);
											});
											describe('when settle() is invoked on sEUR', () => {
												let txn;
												beforeEach(async () => {
													txn = await synthetix.settle(sEUR, {
														from: account1,
													});
												});
												it('then it completes with one settlement', async () => {
													const logs = await getDecodedLogs({
														hash: txn.tx,
														contracts: [synthetix, exchanger, sUSDContract],
													});

													assert.equal(
														logs.filter(({ name }) => name === 'ExchangeEntrySettled').length,
														1
													);

													decodedEventEqual({
														log: logs.find(({ name }) => name === 'ExchangeEntrySettled'),
														event: 'ExchangeEntrySettled',
														emittedFrom: exchanger.address,
														args: [
															account1,
															sUSD,
															amountOfSrcExchanged,
															sEUR,
															'0',
															'0',
															new web3.utils.BN(1),
															new web3.utils.BN(3),
															exchangeTime + 1,
														],
														bnCloseVariance,
													});
												});
												it('and the debt cache sync is not called', async () => {
													assert.equal(debtCacheSpy.smocked.updateCachedSynthDebts.calls.length, 0);
												});
											});
										});
										it('when sEUR is attempted to be exchanged away by the user, it reverts', async () => {
											await assert.revert(
												synthetix.exchange(sEUR, toUnit('1'), sBTC, { from: account1 }),
												'Cannot settle during waiting period'
											);
										});

										describe('when settle() is invoked on the src synth - sUSD', () => {
											it('then it completes with no reclaim or rebate', async () => {
												const txn = await synthetix.settle(sUSD, {
													from: account1,
												});
												assert.equal(
													txn.logs.length,
													0,
													'Must not emit any events as no settlement required'
												);
											});
										});
										describe('when settle() is invoked on sEUR by another user', () => {
											it('then it completes with no reclaim or rebate', async () => {
												const txn = await synthetix.settle(sEUR, {
													from: account2,
												});
												assert.equal(
													txn.logs.length,
													0,
													'Must not emit any events as no settlement required'
												);
											});
										});
										describe('when the price doubles for sUSD:sEUR to 4:1', () => {
											beforeEach(async () => {
												await fastForward(5);
												await updateRates([sEUR], ['4'].map(toUnit));
											});
											it('then settlement reclaimAmount shows a reclaim of half the entire balance of sEUR', async () => {
												const expected = calculateExpectedSettlementAmount({
													amount: amountOfSrcExchanged,
													oldRate: divideDecimal(1, 2),
													newRate: divideDecimal(1, 4),
												});

												const { reclaimAmount, rebateAmount } = await exchanger.settlementOwing(
													account1,
													sEUR
												);

												assert.bnEqual(rebateAmount, expected.rebateAmount);
												assert.bnEqual(reclaimAmount, expected.reclaimAmount);
											});
											describe('when settle() is invoked', () => {
												it('then it reverts as the waiting period has not ended', async () => {
													await assert.revert(
														synthetix.settle(sEUR, { from: account1 }),
														'Cannot settle during waiting period'
													);
												});
											});
											describe('when another minute passes', () => {
												let expectedSettlement;
												let srcBalanceBeforeExchange;

												beforeEach(async () => {
													await fastForward(60);
													srcBalanceBeforeExchange = await sEURContract.balanceOf(account1);

													expectedSettlement = calculateExpectedSettlementAmount({
														amount: amountOfSrcExchanged,
														oldRate: divideDecimal(1, 2),
														newRate: divideDecimal(1, 4),
													});
												});
												describe('when settle() is invoked', () => {
													let transaction;
													beforeEach(async () => {
														transaction = await synthetix.settle(sEUR, {
															from: account1,
														});
													});
													it('then it settles with a reclaim', async () => {
														await ensureTxnEmitsSettlementEvents({
															hash: transaction.tx,
															synth: sEURContract,
															expected: expectedSettlement,
														});
													});
													it('then it settles with a ExchangeEntrySettled event with reclaim', async () => {
														const logs = await getDecodedLogs({
															hash: transaction.tx,
															contracts: [synthetix, exchanger, sUSDContract],
														});

														decodedEventEqual({
															log: logs.find(({ name }) => name === 'ExchangeEntrySettled'),
															event: 'ExchangeEntrySettled',
															emittedFrom: exchanger.address,
															args: [
																account1,
																sUSD,
																amountOfSrcExchanged,
																sEUR,
																expectedSettlement.reclaimAmount,
																new web3.utils.BN(0),
																new web3.utils.BN(1),
																new web3.utils.BN(3),
																exchangeTime + 1,
															],
															bnCloseVariance,
														});
													});
													it('and the debt cache is called', async () => {
														assert.equal(
															debtCacheSpy.smocked.updateCachedSynthDebts.calls.length,
															1
														);
														assert.equal(
															debtCacheSpy.smocked.updateCachedSynthDebts.calls[0][0],
															sEUR
														);
													});
												});
												describe('when settle() is invoked and the exchange fee rate has changed', () => {
													beforeEach(async () => {
														systemSettings.setExchangeFeeRateForSynths([sBTC], [toUnit('0.1')], {
															from: owner,
														});
													});
													it('then it settles with a reclaim', async () => {
														const { tx: hash } = await synthetix.settle(sEUR, {
															from: account1,
														});
														await ensureTxnEmitsSettlementEvents({
															hash,
															synth: sEURContract,
															expected: expectedSettlement,
														});
													});
												});

												// The user has ~49.5 sEUR and has a reclaim of ~24.75 - so 24.75 after settlement
												describe(
													'when an exchange out of sEUR for more than the balance after settlement,' +
														'but less than the total initially',
													() => {
														let txn;
														beforeEach(async () => {
															txn = await synthetix.exchange(sEUR, toUnit('30'), sBTC, {
																from: account1,
															});
														});
														it('then it succeeds, exchanging the entire amount after settlement', async () => {
															const srcBalanceAfterExchange = await sEURContract.balanceOf(
																account1
															);
															assert.equal(srcBalanceAfterExchange, '0');

															const decodedLogs = await ensureTxnEmitsSettlementEvents({
																hash: txn.tx,
																synth: sEURContract,
																expected: expectedSettlement,
															});

															decodedEventEqual({
																log: decodedLogs.find(({ name }) => name === 'SynthExchange'),
																event: 'SynthExchange',
																emittedFrom: await synthetix.proxy(),
																args: [
																	account1,
																	sEUR,
																	srcBalanceBeforeExchange.sub(expectedSettlement.reclaimAmount),
																	sBTC,
																],
															});
														});
													}
												);

												describe(
													'when an exchange out of sEUR for more than the balance after settlement,' +
														'and more than the total initially and the exchangefee rate changed',
													() => {
														let txn;
														beforeEach(async () => {
															txn = await synthetix.exchange(sEUR, toUnit('50'), sBTC, {
																from: account1,
															});
															systemSettings.setExchangeFeeRateForSynths([sBTC], [toUnit('0.1')], {
																from: owner,
															});
														});
														it('then it succeeds, exchanging the entire amount after settlement', async () => {
															const srcBalanceAfterExchange = await sEURContract.balanceOf(
																account1
															);
															assert.equal(srcBalanceAfterExchange, '0');

															const decodedLogs = await ensureTxnEmitsSettlementEvents({
																hash: txn.tx,
																synth: sEURContract,
																expected: expectedSettlement,
															});

															decodedEventEqual({
																log: decodedLogs.find(({ name }) => name === 'SynthExchange'),
																event: 'SynthExchange',
																emittedFrom: await synthetix.proxy(),
																args: [
																	account1,
																	sEUR,
																	srcBalanceBeforeExchange.sub(expectedSettlement.reclaimAmount),
																	sBTC,
																],
															});
														});
													}
												);

												describe('when an exchange out of sEUR for less than the balance after settlement', () => {
													let newAmountToExchange;
													let txn;
													beforeEach(async () => {
														newAmountToExchange = toUnit('10');
														txn = await synthetix.exchange(sEUR, newAmountToExchange, sBTC, {
															from: account1,
														});
													});
													it('then it succeeds, exchanging the amount given', async () => {
														const srcBalanceAfterExchange = await sEURContract.balanceOf(account1);

														assert.bnClose(
															srcBalanceAfterExchange,
															srcBalanceBeforeExchange
																.sub(expectedSettlement.reclaimAmount)
																.sub(newAmountToExchange)
														);

														const decodedLogs = await ensureTxnEmitsSettlementEvents({
															hash: txn.tx,
															synth: sEURContract,
															expected: expectedSettlement,
														});

														decodedEventEqual({
															log: decodedLogs.find(({ name }) => name === 'SynthExchange'),
															event: 'SynthExchange',
															emittedFrom: await synthetix.proxy(),
															args: [account1, sEUR, newAmountToExchange, sBTC], // amount to exchange must be the reclaim amount
														});
													});
												});
											});
										});
										describe('when the price halves for sUSD:sEUR to 1:1', () => {
											beforeEach(async () => {
												await fastForward(5);
												await updateRates([sEUR], ['1'].map(toUnit));
											});
											it('then settlement rebateAmount shows a rebate of half the entire balance of sEUR', async () => {
												const expected = calculateExpectedSettlementAmount({
													amount: amountOfSrcExchanged,
													oldRate: divideDecimal(1, 2),
													newRate: divideDecimal(1, 1),
												});

												const { reclaimAmount, rebateAmount } = await exchanger.settlementOwing(
													account1,
													sEUR
												);

												assert.bnEqual(rebateAmount, expected.rebateAmount);
												assert.bnEqual(reclaimAmount, expected.reclaimAmount);
											});
											describe('when the user makes a 2nd exchange of 100 sUSD into sUSD:sEUR at 1:1', () => {
												beforeEach(async () => {
													// fast forward 60 seconds so 1st exchange is using first rate
													await fastForward(60);

													await synthetix.exchange(sUSD, amountOfSrcExchanged, sEUR, {
														from: account1,
													});
												});
												describe('and then the price increases for sUSD:sEUR to 2:1', () => {
													beforeEach(async () => {
														await fastForward(5);
														await updateRates([sEUR], ['2'].map(toUnit));
													});
													describe('when settlement is invoked', () => {
														describe('when another minute passes', () => {
															let expectedSettlementReclaim;
															let expectedSettlementRebate;
															beforeEach(async () => {
																await fastForward(60);

																expectedSettlementRebate = calculateExpectedSettlementAmount({
																	amount: amountOfSrcExchanged,
																	oldRate: divideDecimal(1, 2),
																	newRate: divideDecimal(1, 1),
																});

																expectedSettlementReclaim = calculateExpectedSettlementAmount({
																	amount: amountOfSrcExchanged,
																	oldRate: divideDecimal(1, 1),
																	newRate: divideDecimal(1, 2),
																});
															});

															describe('when settle() is invoked', () => {
																let transaction;
																beforeEach(async () => {
																	transaction = await synthetix.settle(sEUR, {
																		from: account1,
																	});
																});
																it('then it settles with two ExchangeEntrySettled events one for reclaim and one for rebate', async () => {
																	const logs = await getDecodedLogs({
																		hash: transaction.tx,
																		contracts: [synthetix, exchanger, sUSDContract],
																	});

																	// check the rebate event first
																	decodedEventEqual({
																		log: logs.filter(
																			({ name }) => name === 'ExchangeEntrySettled'
																		)[0],
																		event: 'ExchangeEntrySettled',
																		emittedFrom: exchanger.address,
																		args: [
																			account1,
																			sUSD,
																			amountOfSrcExchanged,
																			sEUR,
																			new web3.utils.BN(0),
																			expectedSettlementRebate.rebateAmount,
																			new web3.utils.BN(1),
																			new web3.utils.BN(2),
																			exchangeTime + 1,
																		],
																		bnCloseVariance,
																	});

																	// check the reclaim event
																	decodedEventEqual({
																		log: logs.filter(
																			({ name }) => name === 'ExchangeEntrySettled'
																		)[1],
																		event: 'ExchangeEntrySettled',
																		emittedFrom: exchanger.address,
																		args: [
																			account1,
																			sUSD,
																			amountOfSrcExchanged,
																			sEUR,
																			expectedSettlementReclaim.reclaimAmount,
																			new web3.utils.BN(0),
																			new web3.utils.BN(1),
																			new web3.utils.BN(2),
																		],
																		bnCloseVariance,
																	});
																});
															});
														});
													});
												});
											});
											describe('when settlement is invoked', () => {
												it('then it reverts as the waiting period has not ended', async () => {
													await assert.revert(
														synthetix.settle(sEUR, { from: account1 }),
														'Cannot settle during waiting period'
													);
												});
												describe('when another minute passes', () => {
													let expectedSettlement;
													let srcBalanceBeforeExchange;

													beforeEach(async () => {
														await fastForward(60);
														srcBalanceBeforeExchange = await sEURContract.balanceOf(account1);

														expectedSettlement = calculateExpectedSettlementAmount({
															amount: amountOfSrcExchanged,
															oldRate: divideDecimal(1, 2),
															newRate: divideDecimal(1, 1),
														});
													});

													describe('when settle() is invoked', () => {
														let transaction;
														beforeEach(async () => {
															transaction = await synthetix.settle(sEUR, {
																from: account1,
															});
														});
														it('then it settles with a rebate', async () => {
															await ensureTxnEmitsSettlementEvents({
																hash: transaction.tx,
																synth: sEURContract,
																expected: expectedSettlement,
															});
														});
														it('then it settles with a ExchangeEntrySettled event with rebate', async () => {
															const logs = await getDecodedLogs({
																hash: transaction.tx,
																contracts: [synthetix, exchanger, sUSDContract],
															});

															decodedEventEqual({
																log: logs.find(({ name }) => name === 'ExchangeEntrySettled'),
																event: 'ExchangeEntrySettled',
																emittedFrom: exchanger.address,
																args: [
																	account1,
																	sUSD,
																	amountOfSrcExchanged,
																	sEUR,
																	new web3.utils.BN(0),
																	expectedSettlement.rebateAmount,
																	new web3.utils.BN(1),
																	new web3.utils.BN(2),
																	exchangeTime + 1,
																],
																bnCloseVariance,
															});
														});
													});

													// The user has 49 sEUR and has a rebate of 49 - so 98 after settlement
													describe('when an exchange out of sEUR for their expected balance before exchange', () => {
														let txn;
														beforeEach(async () => {
															txn = await synthetix.exchange(sEUR, toUnit('49'), sBTC, {
																from: account1,
															});
														});
														it('then it succeeds, exchanging the entire amount plus the rebate', async () => {
															const srcBalanceAfterExchange = await sEURContract.balanceOf(
																account1
															);
															assert.equal(srcBalanceAfterExchange, '0');

															const decodedLogs = await ensureTxnEmitsSettlementEvents({
																hash: txn.tx,
																synth: sEURContract,
																expected: expectedSettlement,
															});

															decodedEventEqual({
																log: decodedLogs.find(({ name }) => name === 'SynthExchange'),
																event: 'SynthExchange',
																emittedFrom: await synthetix.proxy(),
																args: [
																	account1,
																	sEUR,
																	srcBalanceBeforeExchange.add(expectedSettlement.rebateAmount),
																	sBTC,
																],
															});
														});
													});

													describe('when an exchange out of sEUR for some amount less than their balance before exchange', () => {
														let txn;
														beforeEach(async () => {
															txn = await synthetix.exchange(sEUR, toUnit('10'), sBTC, {
																from: account1,
															});
														});
														it('then it succeeds, exchanging the amount plus the rebate', async () => {
															const decodedLogs = await ensureTxnEmitsSettlementEvents({
																hash: txn.tx,
																synth: sEURContract,
																expected: expectedSettlement,
															});

															decodedEventEqual({
																log: decodedLogs.find(({ name }) => name === 'SynthExchange'),
																event: 'SynthExchange',
																emittedFrom: await synthetix.proxy(),
																args: [
																	account1,
																	sEUR,
																	toUnit('10').add(expectedSettlement.rebateAmount),
																	sBTC,
																],
															});
														});
													});
												});
											});
											describe('when the price returns to sUSD:sEUR to 2:1', () => {
												beforeEach(async () => {
													await fastForward(12);
													await updateRates([sEUR], ['2'].map(toUnit));
												});
												it('then settlement reclaimAmount shows 0 reclaim and 0 refund', async () => {
													const settlement = await exchanger.settlementOwing(account1, sEUR);
													assert.equal(
														settlement.reclaimAmount,
														'0',
														'Nothing can be reclaimAmount'
													);
													assert.equal(settlement.rebateAmount, '0', 'Nothing can be rebateAmount');
												});
												describe('when another minute elapses and the sETH price changes', () => {
													beforeEach(async () => {
														await fastForward(60);
														await updateRates([sEUR], ['3'].map(toUnit));
													});
													it('then settlement reclaimAmount still shows 0 reclaim and 0 refund as the timeout period ended', async () => {
														const settlement = await exchanger.settlementOwing(account1, sEUR);
														assert.equal(
															settlement.reclaimAmount,
															'0',
															'Nothing can be reclaimAmount'
														);
														assert.equal(
															settlement.rebateAmount,
															'0',
															'Nothing can be rebateAmount'
														);
													});
													describe('when settle() is invoked', () => {
														it('then it settles with no reclaim or rebate', async () => {
															const txn = await synthetix.settle(sEUR, {
																from: account1,
															});
															assert.equal(
																txn.logs.length,
																0,
																'Must not emit any events as no settlement required'
															);
														});
													});
												});
											});
										});
									});
									describe('given the first user has 1000 sEUR', () => {
										beforeEach(async () => {
											await sEURContract.issue(account1, toUnit('1000'));
										});
										describe('when the first user exchanges 100 sEUR into sEUR:sBTC at 9000:2', () => {
											let amountOfSrcExchanged;
											beforeEach(async () => {
												amountOfSrcExchanged = toUnit('100');
												await synthetix.exchange(sEUR, amountOfSrcExchanged, sBTC, {
													from: account1,
												});
											});
											it('then settlement reclaimAmount shows 0 reclaim and 0 refund', async () => {
												const settlement = await exchanger.settlementOwing(account1, sBTC);
												assert.equal(settlement.reclaimAmount, '0', 'Nothing can be reclaimAmount');
												assert.equal(settlement.rebateAmount, '0', 'Nothing can be rebateAmount');
												assert.equal(
													settlement.numEntries,
													'1',
													'Must be one entry in the settlement queue'
												);
											});
											describe('when the price doubles for sUSD:sEUR to 4:1', () => {
												beforeEach(async () => {
													await fastForward(5);
													await updateRates([sEUR], ['4'].map(toUnit));
												});
												it('then settlement shows a rebate rebateAmount', async () => {
													const { reclaimAmount, rebateAmount } = await exchanger.settlementOwing(
														account1,
														sBTC
													);

													const expected = calculateExpectedSettlementAmount({
														amount: amountOfSrcExchanged,
														oldRate: divideDecimal(2, 9000),
														newRate: divideDecimal(4, 9000),
													});

													assert.bnClose(rebateAmount, expected.rebateAmount, bnCloseVariance);
													assert.bnEqual(reclaimAmount, expected.reclaimAmount);
												});
												describe('when settlement is invoked', () => {
													it('then it reverts as the waiting period has not ended', async () => {
														await assert.revert(
															synthetix.settle(sBTC, { from: account1 }),
															'Cannot settle during waiting period'
														);
													});
												});
												describe('when the price gains for sBTC more than the loss of the sEUR change', () => {
													beforeEach(async () => {
														await updateRates([sBTC], ['20000'].map(toUnit));
													});
													it('then the reclaimAmount is whats left when subtracting the rebate', async () => {
														const { reclaimAmount, rebateAmount } = await exchanger.settlementOwing(
															account1,
															sBTC
														);

														const expected = calculateExpectedSettlementAmount({
															amount: amountOfSrcExchanged,
															oldRate: divideDecimal(2, 9000),
															newRate: divideDecimal(4, 20000),
														});

														assert.bnEqual(rebateAmount, expected.rebateAmount);
														assert.bnClose(reclaimAmount, expected.reclaimAmount, bnCloseVariance);
													});
													describe('when the same user exchanges some sUSD into sBTC - the same destination', () => {
														let amountOfSrcExchangedSecondary;
														beforeEach(async () => {
															amountOfSrcExchangedSecondary = toUnit('10');
															await synthetix.exchange(sUSD, amountOfSrcExchangedSecondary, sBTC, {
																from: account1,
															});
														});
														it('then the reclaimAmount is unchanged', async () => {
															const {
																reclaimAmount,
																rebateAmount,
																numEntries,
															} = await exchanger.settlementOwing(account1, sBTC);

															const expected = calculateExpectedSettlementAmount({
																amount: amountOfSrcExchanged,
																oldRate: divideDecimal(2, 9000),
																newRate: divideDecimal(4, 20000),
															});

															assert.bnEqual(rebateAmount, expected.rebateAmount);
															assert.bnClose(
																reclaimAmount,
																expected.reclaimAmount,
																bnCloseVariance
															);
															assert.equal(
																numEntries,
																'2',
																'Must be two entries in the settlement queue'
															);
														});
														describe('when the price of sBTC lowers, turning the profit to a loss', () => {
															let expectedFromFirst;
															let expectedFromSecond;
															beforeEach(async () => {
																await fastForward(5);

																await updateRates([sBTC], ['10000'].map(toUnit));

																expectedFromFirst = calculateExpectedSettlementAmount({
																	amount: amountOfSrcExchanged,
																	oldRate: divideDecimal(2, 9000),
																	newRate: divideDecimal(4, 10000),
																});
																expectedFromSecond = calculateExpectedSettlementAmount({
																	amount: amountOfSrcExchangedSecondary,
																	oldRate: divideDecimal(1, 20000),
																	newRate: divideDecimal(1, 10000),
																});
															});
															it('then the rebateAmount calculation of settlementOwing on sBTC includes both exchanges', async () => {
																const {
																	reclaimAmount,
																	rebateAmount,
																} = await exchanger.settlementOwing(account1, sBTC);

																assert.equal(reclaimAmount, '0');

																assert.bnClose(
																	rebateAmount,
																	expectedFromFirst.rebateAmount.add(
																		expectedFromSecond.rebateAmount
																	),
																	bnCloseVariance
																);
															});
															describe('when another minute passes', () => {
																beforeEach(async () => {
																	await fastForward(60);
																});
																describe('when settle() is invoked for sBTC', () => {
																	it('then it settles with a rebate @gasprofile', async () => {
																		const txn = await synthetix.settle(sBTC, {
																			from: account1,
																		});

																		await ensureTxnEmitsSettlementEvents({
																			hash: txn.tx,
																			synth: sBTCContract,
																			expected: {
																				reclaimAmount: new web3.utils.BN(0),
																				rebateAmount: expectedFromFirst.rebateAmount.add(
																					expectedFromSecond.rebateAmount
																				),
																			},
																		});
																	});
																});
															});
															describe('when another minute passes and the exchange fee rate has increased', () => {
																beforeEach(async () => {
																	await fastForward(60);
																	systemSettings.setExchangeFeeRateForSynths(
																		[sBTC],
																		[toUnit('0.1')],
																		{
																			from: owner,
																		}
																	);
																});
																describe('when settle() is invoked for sBTC', () => {
																	it('then it settles with a rebate using the exchange fee rate at time of trade', async () => {
																		const { tx: hash } = await synthetix.settle(sBTC, {
																			from: account1,
																		});

																		await ensureTxnEmitsSettlementEvents({
																			hash,
																			synth: sBTCContract,
																			expected: {
																				reclaimAmount: new web3.utils.BN(0),
																				rebateAmount: expectedFromFirst.rebateAmount.add(
																					expectedFromSecond.rebateAmount
																				),
																			},
																		});
																	});
																});
															});
														});
													});
												});
											});
										});

										describe('and the max number of exchange entries is 5', () => {
											beforeEach(async () => {
												await exchangeState.setMaxEntriesInQueue('5', { from: owner });
											});
											describe('when a user tries to exchange 100 sEUR into sBTC 5 times', () => {
												beforeEach(async () => {
													const txns = [];
													for (let i = 0; i < 5; i++) {
														txns.push(
															await synthetix.exchange(sEUR, toUnit('100'), sBTC, {
																from: account1,
															})
														);
													}
												});
												it('then all succeed', () => {});
												it('when one more is tried, then if fails', async () => {
													await assert.revert(
														synthetix.exchange(sEUR, toUnit('100'), sBTC, { from: account1 }),
														'Max queue length reached'
													);
												});
												describe('when more than 60s elapses', () => {
													beforeEach(async () => {
														await fastForward(70);
													});
													describe('and the user invokes settle() on the dest synth', () => {
														beforeEach(async () => {
															await synthetix.settle(sBTC, { from: account1 });
														});
														it('then when the user performs 5 more exchanges into the same synth, it succeeds', async () => {
															for (let i = 0; i < 5; i++) {
																await synthetix.exchange(sEUR, toUnit('100'), sBTC, {
																	from: account1,
																});
															}
														});
													});
												});
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	};

	const itCalculatesAmountAfterSettlement = () => {
		describe('calculateAmountAfterSettlement()', () => {
			describe('given a user has 1000 sEUR', () => {
				beforeEach(async () => {
					await sEURContract.issue(account1, toUnit('1000'));
				});
				describe('when calculatAmountAfterSettlement is invoked with and amount < 1000 and no refund', () => {
					let response;
					beforeEach(async () => {
						response = await exchanger.calculateAmountAfterSettlement(
							account1,
							sEUR,
							toUnit('500'),
							'0'
						);
					});
					it('then the response is the given amount of 500', () => {
						assert.bnEqual(response, toUnit('500'));
					});
				});
				describe('when calculatAmountAfterSettlement is invoked with and amount < 1000 and a refund', () => {
					let response;
					beforeEach(async () => {
						response = await exchanger.calculateAmountAfterSettlement(
							account1,
							sEUR,
							toUnit('500'),
							toUnit('25')
						);
					});
					it('then the response is the given amount of 500 plus the refund', () => {
						assert.bnEqual(response, toUnit('525'));
					});
				});
				describe('when calculatAmountAfterSettlement is invoked with and amount > 1000 and no refund', () => {
					let response;
					beforeEach(async () => {
						response = await exchanger.calculateAmountAfterSettlement(
							account1,
							sEUR,
							toUnit('1200'),
							'0'
						);
					});
					it('then the response is the balance of 1000', () => {
						assert.bnEqual(response, toUnit('1000'));
					});
				});
				describe('when calculatAmountAfterSettlement is invoked with and amount > 1000 and a refund', () => {
					let response;
					beforeEach(async () => {
						response = await exchanger.calculateAmountAfterSettlement(
							account1,
							sEUR,
							toUnit('1200'),
							toUnit('50')
						);
					});
					it('then the response is the given amount of 1000 plus the refund', () => {
						assert.bnEqual(response, toUnit('1050'));
					});
				});
			});
		});
	};

	const itExchanges = () => {
		describe('exchange()', () => {
			it('exchange() cannot be invoked directly by any account', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: exchanger.exchange,
					accounts,
					args: [
						account1,
						account1,
						sUSD,
						toUnit('100'),
						sAUD,
						account1,
						false,
						account1,
						toBytes32(''),
					],
					reason: 'Only synthetix or a synth contract can perform this action',
				});
			});

			describe('suspension conditions on Synthetix.exchange()', () => {
				const synth = sETH;
				['System', 'Exchange', 'SynthExchange', 'Synth'].forEach(section => {
					describe(`when ${section} is suspended`, () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section, suspend: true, synth });
						});
						it('then calling exchange() reverts', async () => {
							await assert.revert(
								synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account1 }),
								'Operation prohibited'
							);
						});
						describe(`when ${section} is resumed`, () => {
							beforeEach(async () => {
								await setStatus({ owner, systemStatus, section, suspend: false, synth });
							});
							it('then calling exchange() succeeds', async () => {
								await synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account1 });
							});
						});
					});
				});
				describe('when Synth(sBTC) is suspended', () => {
					beforeEach(async () => {
						// issue sAUD to test non-sUSD exchanges
						await sAUDContract.issue(account2, toUnit('100'));

						await setStatus({ owner, systemStatus, section: 'Synth', suspend: true, synth: sBTC });
					});
					it('then exchanging other synths still works', async () => {
						await synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account1 });
						await synthetix.exchange(sAUD, toUnit('1'), sETH, { from: account2 });
					});
				});
			});

			describe('various exchange scenarios', () => {
				describe('when a user has 1000 sUSD', () => {
					// already issued in the top-level beforeEach

					it('should allow a user to exchange the synths they hold in one flavour for another', async () => {
						// Exchange sUSD to sAUD
						await synthetix.exchange(sUSD, amountIssued, sAUD, { from: account1 });

						// Get the exchange amounts
						const {
							amountReceived,
							fee,
							exchangeFeeRate: feeRate,
						} = await exchanger.getAmountsForExchange(amountIssued, sUSD, sAUD);

						// Assert we have the correct AUD value - exchange fee
						const sAUDBalance = await sAUDContract.balanceOf(account1);
						assert.bnEqual(amountReceived, sAUDBalance);

						// Assert we have the exchange fee to distribute
						const feePeriodZero = await feePool.recentFeePeriods(0);
						const usdFeeAmount = await exchangeRates.effectiveValue(sAUD, fee, sUSD);
						assert.bnEqual(usdFeeAmount, feePeriodZero.feesToDistribute);

						// Double the exchange fee rate (once for sUSD, once for sAUD)
						assert.bnEqual(feeRate, exchangeFeeRate.add(exchangeFeeRate));
					});

					it('should emit a SynthExchange event @gasprofile', async () => {
						// Exchange sUSD to sAUD
						const txn = await synthetix.exchange(sUSD, amountIssued, sAUD, {
							from: account1,
						});

						const sAUDBalance = await sAUDContract.balanceOf(account1);

						const synthExchangeEvent = txn.logs.find(log => log.event === 'SynthExchange');
						assert.eventEqual(synthExchangeEvent, 'SynthExchange', {
							account: account1,
							fromCurrencyKey: toBytes32('sUSD'),
							fromAmount: amountIssued,
							toCurrencyKey: toBytes32('sAUD'),
							toAmount: sAUDBalance,
							toAddress: account1,
						});
					});

					it('should emit an ExchangeTracking event @gasprofile', async () => {
						// Exchange sUSD to sAUD
						const txn = await synthetix.exchangeWithTracking(
							sUSD,
							amountIssued,
							sAUD,
							account1,
							trackingCode,
							{
								from: account1,
							}
						);

						const { fee } = await exchanger.getAmountsForExchange(amountIssued, sUSD, sAUD);
						const usdFeeAmount = await exchangeRates.effectiveValue(sAUD, fee, sUSD);

						const sAUDBalance = await sAUDContract.balanceOf(account1);

						const synthExchangeEvent = txn.logs.find(log => log.event === 'SynthExchange');
						assert.eventEqual(synthExchangeEvent, 'SynthExchange', {
							account: account1,
							fromCurrencyKey: toBytes32('sUSD'),
							fromAmount: amountIssued,
							toCurrencyKey: toBytes32('sAUD'),
							toAmount: sAUDBalance,
							toAddress: account1,
						});

						const trackingEvent = txn.logs.find(log => log.event === 'ExchangeTracking');
						assert.eventEqual(trackingEvent, 'ExchangeTracking', {
							trackingCode,
							toCurrencyKey: toBytes32('sAUD'),
							toAmount: sAUDBalance,
							fee: usdFeeAmount,
						});
					});

					it('when a user tries to exchange more than they have, then it fails', async () => {
						await assert.revert(
							synthetix.exchange(sAUD, toUnit('1'), sUSD, {
								from: account1,
							}),
							'SafeMath: subtraction overflow'
						);
					});

					it('when a user tries to exchange more than they have, then it fails', async () => {
						await assert.revert(
							synthetix.exchange(sUSD, toUnit('1001'), sAUD, {
								from: account1,
							}),
							'SafeMath: subtraction overflow'
						);
					});

					[
						'exchange',
						'exchangeOnBehalf',
						'exchangeWithTracking',
						'exchangeOnBehalfWithTracking',
					].forEach(type => {
						describe(`rate stale scenarios for ${type}`, () => {
							const exchange = ({ from, to, amount }) => {
								if (type === 'exchange')
									return synthetix.exchange(from, amount, to, { from: account1 });
								else if (type === 'exchangeOnBehalf')
									return synthetix.exchangeOnBehalf(account1, from, amount, to, { from: account2 });
								if (type === 'exchangeWithTracking')
									return synthetix.exchangeWithTracking(from, amount, to, account1, trackingCode, {
										from: account1,
									});
								else if (type === 'exchangeOnBehalfWithTracking')
									return synthetix.exchangeOnBehalfWithTracking(
										account1,
										from,
										amount,
										to,
										account2,
										trackingCode,
										{ from: account2 }
									);
							};

							beforeEach(async () => {
								await delegateApprovals.approveExchangeOnBehalf(account2, { from: account1 });
							});
							describe('when rates have gone stale for all synths', () => {
								beforeEach(async () => {
									await fastForward(
										(await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300'))
									);
								});
								it(`attempting to ${type} from sUSD into sAUD reverts with dest stale`, async () => {
									await assert.revert(
										exchange({ from: sUSD, amount: amountIssued, to: sAUD }),
										'src/dest rate stale or flagged'
									);
									// view reverts
									await assert.revert(
										exchanger.getAmountsForExchange(toUnit('1'), sUSD, sAUD),
										'invalid'
									);
								});
								it('settling still works ', async () => {
									await synthetix.settle(sAUD, { from: account1 });
								});
								describe('when that synth has a fresh rate', () => {
									beforeEach(async () => {
										await updateRates([sAUD], ['0.75'].map(toUnit));
									});
									describe(`when the user ${type} into that synth`, () => {
										beforeEach(async () => {
											await exchange({ from: sUSD, amount: amountIssued, to: sAUD });
										});
										describe('after the waiting period expires and the synth has gone stale', () => {
											beforeEach(async () => {
												await fastForward(
													(await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300'))
												);
											});
											it(`${type} back to sUSD fails as the source has no rate`, async () => {
												await assert.revert(
													exchange({ from: sAUD, amount: amountIssued, to: sUSD }),
													'src/dest rate stale or flagged'
												);
											});
										});
									});
								});
							});
						});
					});

					describe('exchanging on behalf', async () => {
						const authoriser = account1;
						const delegate = account2;
						describe('when not approved it should revert on', async () => {
							it('exchangeOnBehalf', async () => {
								await assert.revert(
									synthetix.exchangeOnBehalf(authoriser, sAUD, toUnit('1'), sUSD, {
										from: delegate,
									}),
									'Not approved to act on behalf'
								);
							});
						});
						describe('when delegate address approved to exchangeOnBehalf', async () => {
							// (sUSD amount issued earlier in top-level beforeEach)
							beforeEach(async () => {
								await delegateApprovals.approveExchangeOnBehalf(delegate, { from: authoriser });
							});
							describe('suspension conditions on Synthetix.exchangeOnBehalf()', () => {
								const synth = sAUD;
								['System', 'Exchange', 'SynthExchange', 'Synth'].forEach(section => {
									describe(`when ${section} is suspended`, () => {
										beforeEach(async () => {
											await setStatus({ owner, systemStatus, section, suspend: true, synth });
										});
										it('then calling exchange() reverts', async () => {
											await assert.revert(
												synthetix.exchangeOnBehalf(authoriser, sUSD, amountIssued, sAUD, {
													from: delegate,
												}),
												'Operation prohibited'
											);
										});
										describe(`when ${section} is resumed`, () => {
											beforeEach(async () => {
												await setStatus({ owner, systemStatus, section, suspend: false, synth });
											});
											it('then calling exchange() succeeds', async () => {
												await synthetix.exchangeOnBehalf(authoriser, sUSD, amountIssued, sAUD, {
													from: delegate,
												});
											});
										});
									});
								});
								describe('when Synth(sBTC) is suspended', () => {
									beforeEach(async () => {
										await setStatus({
											owner,
											systemStatus,
											section: 'Synth',
											suspend: true,
											synth: sBTC,
										});
									});
									it('then exchanging other synths on behalf still works', async () => {
										await synthetix.exchangeOnBehalf(authoriser, sUSD, amountIssued, sAUD, {
											from: delegate,
										});
									});
								});
							});

							it('should revert if non-delegate invokes exchangeOnBehalf', async () => {
								await onlyGivenAddressCanInvoke({
									fnc: synthetix.exchangeOnBehalf,
									args: [authoriser, sUSD, amountIssued, sAUD],
									// We cannot test the revert condition with the authoriser as the recipient
									// because this will lead to a regular exchange, not one on behalf
									accounts: accounts.filter(a => a !== authoriser),
									address: delegate,
									reason: 'Not approved to act on behalf',
								});
							});
							it('should exchangeOnBehalf and authoriser recieves the destSynth', async () => {
								// Exchange sUSD to sAUD
								await synthetix.exchangeOnBehalf(authoriser, sUSD, amountIssued, sAUD, {
									from: delegate,
								});

								const { amountReceived, fee } = await exchanger.getAmountsForExchange(
									amountIssued,
									sUSD,
									sAUD
								);

								// Assert we have the correct AUD value - exchange fee
								const sAUDBalance = await sAUDContract.balanceOf(authoriser);
								assert.bnEqual(amountReceived, sAUDBalance);

								// Assert we have the exchange fee to distribute
								const feePeriodZero = await feePool.recentFeePeriods(0);
								const usdFeeAmount = await exchangeRates.effectiveValue(sAUD, fee, sUSD);
								assert.bnEqual(usdFeeAmount, feePeriodZero.feesToDistribute);
							});
						});
					});

					describe('exchanging on behalf with tracking', async () => {
						const authoriser = account1;
						const delegate = account2;

						describe('when not approved it should revert on', async () => {
							it('exchangeOnBehalfWithTracking', async () => {
								await assert.revert(
									synthetix.exchangeOnBehalfWithTracking(
										authoriser,
										sAUD,
										toUnit('1'),
										sUSD,
										authoriser,
										trackingCode,
										{ from: delegate }
									),
									'Not approved to act on behalf'
								);
							});
						});
						describe('when delegate address approved to exchangeOnBehalf', async () => {
							// (sUSD amount issued earlier in top-level beforeEach)
							beforeEach(async () => {
								await delegateApprovals.approveExchangeOnBehalf(delegate, { from: authoriser });
							});
							describe('suspension conditions on Synthetix.exchangeOnBehalfWithTracking()', () => {
								const synth = sAUD;
								['System', 'Exchange', 'SynthExchange', 'Synth'].forEach(section => {
									describe(`when ${section} is suspended`, () => {
										beforeEach(async () => {
											await setStatus({ owner, systemStatus, section, suspend: true, synth });
										});
										it('then calling exchange() reverts', async () => {
											await assert.revert(
												synthetix.exchangeOnBehalfWithTracking(
													authoriser,
													sUSD,
													amountIssued,
													sAUD,
													authoriser,
													trackingCode,
													{
														from: delegate,
													}
												),
												'Operation prohibited'
											);
										});
										describe(`when ${section} is resumed`, () => {
											beforeEach(async () => {
												await setStatus({ owner, systemStatus, section, suspend: false, synth });
											});
											it('then calling exchange() succeeds', async () => {
												await synthetix.exchangeOnBehalfWithTracking(
													authoriser,
													sUSD,
													amountIssued,
													sAUD,
													authoriser,
													trackingCode,
													{
														from: delegate,
													}
												);
											});
										});
									});
								});
								describe('when Synth(sBTC) is suspended', () => {
									beforeEach(async () => {
										await setStatus({
											owner,
											systemStatus,
											section: 'Synth',
											suspend: true,
											synth: sBTC,
										});
									});
									it('then exchanging other synths on behalf still works', async () => {
										await synthetix.exchangeOnBehalfWithTracking(
											authoriser,
											sUSD,
											amountIssued,
											sAUD,
											authoriser,
											trackingCode,
											{
												from: delegate,
											}
										);
									});
								});
							});

							it('should revert if non-delegate invokes exchangeOnBehalf', async () => {
								await onlyGivenAddressCanInvoke({
									fnc: synthetix.exchangeOnBehalfWithTracking,
									args: [authoriser, sUSD, amountIssued, sAUD, authoriser, trackingCode],
									// We cannot test the revert condition with the authoriser as the recipient
									// because this will lead to a regular exchange, not one on behalf
									accounts: accounts.filter(a => a !== authoriser),
									address: delegate,
									reason: 'Not approved to act on behalf',
								});
							});
							it('should exchangeOnBehalf and authoriser recieves the destSynth', async () => {
								// Exchange sUSD to sAUD
								const txn = await synthetix.exchangeOnBehalfWithTracking(
									authoriser,
									sUSD,
									amountIssued,
									sAUD,
									authoriser,
									trackingCode,
									{
										from: delegate,
									}
								);

								const { amountReceived, fee } = await exchanger.getAmountsForExchange(
									amountIssued,
									sUSD,
									sAUD
								);

								// Assert we have the correct AUD value - exchange fee
								const sAUDBalance = await sAUDContract.balanceOf(authoriser);
								assert.bnEqual(amountReceived, sAUDBalance);

								// Assert we have the exchange fee to distribute
								const feePeriodZero = await feePool.recentFeePeriods(0);
								const usdFeeAmount = await exchangeRates.effectiveValue(sAUD, fee, sUSD);
								assert.bnEqual(usdFeeAmount, feePeriodZero.feesToDistribute);

								// Assert the tracking event is fired.
								const trackingEvent = txn.logs.find(log => log.event === 'ExchangeTracking');
								assert.eventEqual(trackingEvent, 'ExchangeTracking', {
									trackingCode,
									toCurrencyKey: toBytes32('sAUD'),
									toAmount: sAUDBalance,
									fee: usdFeeAmount,
								});
							});
						});
					});
				});
			});

			describe('edge case: when an aggregator has a 0 rate', () => {
				describe('when an aggregator is added to the exchangeRates', () => {
					let aggregator;

					beforeEach(async () => {
						aggregator = await MockAggregator.new({ from: owner });
						await exchangeRates.addAggregator(sETH, aggregator.address, { from: owner });
						// set a 0 rate to prevent invalid rate from causing a revert on exchange
						await aggregator.setLatestAnswer('0', await currentTime());
					});

					describe('when exchanging into that synth', () => {
						it('getAmountsForExchange reverts due to invalid rate', async () => {
							await assert.revert(
								exchanger.getAmountsForExchange(toUnit('1'), sUSD, sETH),
								'synth rate invalid'
							);
						});

						it('then it causes a suspension from price deviation as the price is 9', async () => {
							const { tx: hash } = await synthetix.exchange(sUSD, toUnit('1'), sETH, {
								from: account1,
							});

							const logs = await getDecodedLogs({
								hash,
								contracts: [synthetix, exchanger, systemStatus],
							});

							// assert no exchange
							assert.ok(!logs.some(({ name } = {}) => name === 'SynthExchange'));

							// assert suspension
							const { suspended, reason } = await systemStatus.synthSuspension(sETH);
							assert.ok(suspended);
							assert.equal(reason, '65');

							// check view reverts since synth is now suspended
							await assert.revert(
								exchanger.getAmountsForExchange(toUnit('1'), sUSD, sETH),
								'suspended'
							);
						});
					});
					describe('when exchanging out of that synth', () => {
						beforeEach(async () => {
							// give the user some sETH
							await sETHContract.issue(account1, toUnit('1'));
						});
						it('getAmountsForExchange reverts due to invalid rate', async () => {
							await assert.revert(
								exchanger.getAmountsForExchange(toUnit('1'), sETH, sUSD),
								'synth rate invalid'
							);
						});
						it('then it causes a suspension from price deviation', async () => {
							// await assert.revert(
							const { tx: hash } = await synthetix.exchange(sETH, toUnit('1'), sUSD, {
								from: account1,
							});

							const logs = await getDecodedLogs({
								hash,
								contracts: [synthetix, exchanger, systemStatus],
							});

							// assert no exchange
							assert.ok(!logs.some(({ name } = {}) => name === 'SynthExchange'));

							// assert suspension
							const { suspended, reason } = await systemStatus.synthSuspension(sETH);
							assert.ok(suspended);
							assert.equal(reason, '65');

							// check view reverts since synth is now suspended
							await assert.revert(
								exchanger.getAmountsForExchange(toUnit('1'), sETH, sUSD),
								'suspended'
							);
						});
					});
				});
			});
		});
	};

	const itExchangesWithVirtual = () => {
		describe('exchangeWithVirtual()', () => {
			describe('when a user has 1000 sUSD', () => {
				describe('when the waiting period is set to 60s', () => {
					beforeEach(async () => {
						await systemSettings.setWaitingPeriodSecs('60', { from: owner });
					});
					describe('when a user exchanges into sAUD using virtual synths with a tracking code', () => {
						let logs;
						let amountReceived;
						let exchangeFeeRate;
						let findNamedEventValue;
						let vSynthAddress;

						beforeEach(async () => {
							const txn = await synthetix.exchangeWithVirtual(
								sUSD,
								amountIssued,
								sAUD,
								toBytes32('AGGREGATOR'),
								{
									from: account1,
								}
							);

							({ amountReceived, exchangeFeeRate } = await exchanger.getAmountsForExchange(
								amountIssued,
								sUSD,
								sAUD
							));

							logs = await getDecodedLogs({
								hash: txn.tx,
								contracts: [synthetix, exchanger, sUSDContract, issuer, flexibleStorage, debtCache],
							});
							const vSynthCreatedEvent = logs.find(({ name }) => name === 'VirtualSynthCreated');
							assert.ok(vSynthCreatedEvent, 'Found VirtualSynthCreated event');
							findNamedEventValue = param =>
								vSynthCreatedEvent.events.find(({ name }) => name === param);
							vSynthAddress = findNamedEventValue('vSynth').value;
						});

						it('then it emits an ExchangeEntryAppended for the new Virtual Synth', async () => {
							decodedEventEqual({
								log: logs.find(({ name }) => name === 'ExchangeEntryAppended'),
								event: 'ExchangeEntryAppended',
								emittedFrom: exchanger.address,
								args: [
									vSynthAddress,
									sUSD,
									amountIssued,
									sAUD,
									amountReceived,
									exchangeFeeRate,
									new web3.utils.BN(1),
									new web3.utils.BN(2),
								],
								bnCloseVariance,
							});
						});

						it('then it emits an SynthExchange into the new Virtual Synth', async () => {
							decodedEventEqual({
								log: logs.find(({ name }) => name === 'SynthExchange'),
								event: 'SynthExchange',
								emittedFrom: await synthetix.proxy(),
								args: [account1, sUSD, amountIssued, sAUD, amountReceived, vSynthAddress],
								bnCloseVariance: '0',
							});
						});

						it('then an ExchangeTracking is emitted with the correct code', async () => {
							const evt = logs.find(({ name }) => name === 'ExchangeTracking');
							assert.equal(
								evt.events.find(({ name }) => name === 'trackingCode').value,
								toBytes32('AGGREGATOR')
							);
						});

						it('and it emits the VirtualSynthCreated event', async () => {
							assert.equal(
								findNamedEventValue('synth').value,
								(await sAUDContract.proxy()).toLowerCase()
							);
							assert.equal(findNamedEventValue('currencyKey').value, sAUD);
							assert.equal(findNamedEventValue('amount').value, amountReceived);
							assert.equal(findNamedEventValue('recipient').value, account1.toLowerCase());
						});
						it('and the balance of the user is nothing', async () => {
							assert.bnEqual(await sAUDContract.balanceOf(account1), '0');
						});
						it('and the user has no fee reclamation entries', async () => {
							const { reclaimAmount, rebateAmount, numEntries } = await exchanger.settlementOwing(
								account1,
								sAUD
							);
							assert.equal(reclaimAmount, '0');
							assert.equal(rebateAmount, '0');
							assert.equal(numEntries, '0');
						});

						describe('with the new virtual synth', () => {
							let vSynth;
							beforeEach(async () => {
								vSynth = await artifacts.require('VirtualSynth').at(vSynthAddress);
							});
							it('and the balance of the vSynth is the whole amount', async () => {
								assert.bnEqual(await sAUDContract.balanceOf(vSynth.address), amountReceived);
							});
							it('then it is created with the correct parameters', async () => {
								assert.equal(await vSynth.resolver(), resolver.address);
								assert.equal(await vSynth.synth(), await sAUDContract.proxy());
								assert.equal(await vSynth.currencyKey(), sAUD);
								assert.bnEqual(await vSynth.totalSupply(), amountReceived);
								assert.bnEqual(await vSynth.balanceOf(account1), amountReceived);
								assert.notOk(await vSynth.settled());
							});
							it('and the vSynth has 1 fee reclamation entries', async () => {
								const { reclaimAmount, rebateAmount, numEntries } = await exchanger.settlementOwing(
									vSynth.address,
									sAUD
								);
								assert.equal(reclaimAmount, '0');
								assert.equal(rebateAmount, '0');
								assert.equal(numEntries, '1');
							});
							it('and the secsLeftInWaitingPeriod() returns the waitingPeriodSecs', async () => {
								const maxSecs = await vSynth.secsLeftInWaitingPeriod();
								timeIsClose({ actual: maxSecs, expected: 60, variance: 2 });
							});

							describe('when the waiting period expires', () => {
								beforeEach(async () => {
									// end waiting period
									await fastForward(await systemSettings.waitingPeriodSecs());
								});

								it('and the secsLeftInWaitingPeriod() returns 0', async () => {
									assert.equal(await vSynth.secsLeftInWaitingPeriod(), '0');
								});

								it('and readyToSettle() is true', async () => {
									assert.equal(await vSynth.readyToSettle(), true);
								});

								describe('when the vSynth is settled for the holder', () => {
									let txn;
									let logs;
									beforeEach(async () => {
										txn = await vSynth.settle(account1);

										logs = await getDecodedLogs({
											hash: txn.tx,
											contracts: [
												synthetix,
												exchanger,
												sUSDContract,
												issuer,
												flexibleStorage,
												debtCache,
											],
										});
									});

									it('then the user has all the synths', async () => {
										assert.bnEqual(await sAUDContract.balanceOf(account1), amountReceived);
									});

									it('and the vSynth is settled', async () => {
										assert.equal(await vSynth.settled(), true);
									});

									it('and ExchangeEntrySettled is emitted', async () => {
										const evt = logs.find(({ name }) => name === 'ExchangeEntrySettled');

										const findEvt = param => evt.events.find(({ name }) => name === param);

										assert.equal(findEvt('from').value, vSynth.address.toLowerCase());
									});

									it('and the entry is settled for the vSynth', async () => {
										const {
											reclaimAmount,
											rebateAmount,
											numEntries,
										} = await exchanger.settlementOwing(vSynth.address, sAUD);
										assert.equal(reclaimAmount, '0');
										assert.equal(rebateAmount, '0');
										assert.equal(numEntries, '0');
									});

									it('and the user still has no fee reclamation entries', async () => {
										const {
											reclaimAmount,
											rebateAmount,
											numEntries,
										} = await exchanger.settlementOwing(account1, sAUD);
										assert.equal(reclaimAmount, '0');
										assert.equal(rebateAmount, '0');
										assert.equal(numEntries, '0');
									});

									it('and no more supply exists in the vSynth', async () => {
										assert.equal(await vSynth.totalSupply(), '0');
									});
								});
							});
						});
					});

					describe('when a user exchanges without a tracking code', () => {
						let logs;
						beforeEach(async () => {
							const txn = await synthetix.exchangeWithVirtual(
								sUSD,
								amountIssued,
								sAUD,
								toBytes32(),
								{
									from: account1,
								}
							);

							logs = await getDecodedLogs({
								hash: txn.tx,
								contracts: [synthetix, exchanger, sUSDContract, issuer, flexibleStorage, debtCache],
							});
						});
						it('then no ExchangeTracking is emitted (as no tracking code supplied)', async () => {
							assert.notOk(logs.find(({ name }) => name === 'ExchangeTracking'));
						});
					});
				});
			});
		});
	};

	const itFailsToExchangeWithVirtual = () => {
		describe('it cannot use exchangeWithVirtual()', () => {
			it('errors with not implemented when attempted to exchange', async () => {
				await assert.revert(
					synthetix.exchangeWithVirtual(sUSD, amountIssued, sAUD, toBytes32(), {
						from: account1,
					}),
					'Cannot be run on this layer'
				);
			});
		});
	};

	const itExchangesAtomically = () => {
		describe('exchangeAtomically()', () => {
			describe('atomicMaxVolumePerBlock()', () => {
				it('the default is configured correctly', async () => {
					// Note: this only tests the effectiveness of the setup script, not the deploy script,
					assert.equal(await exchanger.atomicMaxVolumePerBlock(), ATOMIC_MAX_VOLUME_PER_BLOCK);
				});

				describe('when atomic max volume per block is changed in the system settings', () => {
					const maxVolumePerBlock = new BN(ATOMIC_MAX_VOLUME_PER_BLOCK).add(new BN('100'));
					beforeEach(async () => {
						await systemSettings.setAtomicMaxVolumePerBlock(maxVolumePerBlock, { from: owner });
					});
					it('then atomicMaxVolumePerBlock() is correctly updated', async () => {
						assert.bnEqual(await exchanger.atomicMaxVolumePerBlock(), maxVolumePerBlock);
					});
				});
			});

			describe('when a user has 1000 sUSD', () => {
				describe('when the necessary configuration been set', () => {
					const ethOnDex = toUnit('0.005'); // this should be chosen over the 100 (0.01) specified by default
					const ethOnCL = toUnit('200'); // 1 over the ethOnDex

					beforeEach(async () => {
						// CL aggregator with past price data
						const aggregator = await MockAggregator.new({ from: owner });
						await exchangeRates.addAggregator(sETH, aggregator.address, { from: owner });
						// set prices with no volatility over the course of last 20 minutes
						for (let i = 4; i > 0; i--) {
							await aggregator.setLatestAnswer(ethOnCL, (await currentTime()) - i * 5 * 60);
						}

						// DexPriceAggregator
						const dexPriceAggregator = await MockDexPriceAggregator.new();
						await dexPriceAggregator.setAssetToAssetRate(ethOnDex);
						await exchangeRates.setDexPriceAggregator(dexPriceAggregator.address, { from: owner });

						// Synth equivalents (needs ability to read into decimals)
						const susdDexEquivalentToken = await MockToken.new('esUSD equivalent', 'esUSD', '18');
						const sethDexEquivalentToken = await MockToken.new('esETH equivalent', 'esETH', '18');
						await systemSettings.setAtomicEquivalentForDexPricing(
							sUSD,
							susdDexEquivalentToken.address,
							{
								from: owner,
							}
						);
						await systemSettings.setAtomicEquivalentForDexPricing(
							sETH,
							sethDexEquivalentToken.address,
							{
								from: owner,
							}
						);
						await systemSettings.setAtomicVolatilityConsiderationWindow(
							sETH,
							web3.utils.toBN(600), // 10 minutes
							{
								from: owner,
							}
						);
						await systemSettings.setAtomicVolatilityUpdateThreshold(sETH, web3.utils.toBN(2), {
							from: owner,
						});
					});

					describe('when the user exchanges into sETH using an atomic exchange with a tracking code', () => {
						const amountIn = toUnit('100');
						const atomicTrackingCode = toBytes32('ATOMIC_AGGREGATOR');

						let logs;
						let amountReceived;
						let amountFee;
						let exchangeFeeRate;

						beforeEach(async () => {
							const txn = await synthetix.exchangeAtomically(
								sUSD,
								amountIn,
								sETH,
								atomicTrackingCode,
								{
									from: account1,
								}
							);

							({
								amountReceived,
								exchangeFeeRate,
								fee: amountFee,
							} = await exchanger.getAmountsForAtomicExchange(amountIn, sUSD, sETH));

							logs = await getDecodedLogs({
								hash: txn.tx,
								contracts: [synthetix, exchanger, sUSDContract, issuer, flexibleStorage, debtCache],
							});
						});

						it('completed the exchange atomically', async () => {
							assert.bnEqual(await sUSDContract.balanceOf(account1), amountIssued.sub(amountIn));
							assert.bnEqual(await sETHContract.balanceOf(account1), amountReceived);
						});

						it('used the correct atomic exchange rate', async () => {
							const expectedAmountWithoutFees = multiplyDecimal(amountIn, ethOnDex); // should have chosen the dex rate
							const expectedAmount = expectedAmountWithoutFees.sub(amountFee);
							assert.bnEqual(amountReceived, expectedAmount);
						});

						it('used correct fee rate', async () => {
							const expectedFeeRate = await exchanger.feeRateForAtomicExchange(sUSD, sETH);
							assert.bnEqual(exchangeFeeRate, expectedFeeRate);
							assert.bnEqual(
								multiplyDecimal(amountReceived.add(amountFee), exchangeFeeRate),
								amountFee
							);
						});

						it('emits an SynthExchange directly to the user', async () => {
							decodedEventEqual({
								log: logs.find(({ name }) => name === 'SynthExchange'),
								event: 'SynthExchange',
								emittedFrom: await synthetix.proxy(),
								args: [account1, sUSD, amountIn, sETH, amountReceived, account1],
								bnCloseVariance: '0',
							});
						});

						it('emits an AtomicSynthExchange directly to the user', async () => {
							decodedEventEqual({
								log: logs.find(({ name }) => name === 'AtomicSynthExchange'),
								event: 'AtomicSynthExchange',
								emittedFrom: await synthetix.proxy(),
								args: [account1, sUSD, amountIn, sETH, amountReceived, account1],
								bnCloseVariance: '0',
							});
						});

						it('emits an ExchangeTracking event with the correct code', async () => {
							const usdFeeAmount = await exchangeRates.effectiveValue(sETH, amountFee, sUSD);
							decodedEventEqual({
								log: logs.find(({ name }) => name === 'ExchangeTracking'),
								event: 'ExchangeTracking',
								emittedFrom: await synthetix.proxy(),
								args: [atomicTrackingCode, sETH, amountReceived, usdFeeAmount],
								bnCloseVariance: '0',
							});
						});

						it('created no new entries and user has no fee reclamation entires', async () => {
							const {
								reclaimAmount,
								rebateAmount,
								numEntries: settleEntries,
							} = await exchanger.settlementOwing(owner, sETH);
							assert.bnEqual(reclaimAmount, '0');
							assert.bnEqual(rebateAmount, '0');
							assert.bnEqual(settleEntries, '0');

							const stateEntries = await exchangeState.getLengthOfEntries(owner, sETH);
							assert.bnEqual(stateEntries, '0');
						});
					});

					describe('when a fee override has been set for atomic exchanges', () => {
						const amountIn = toUnit('100');
						const feeRateOverride = toUnit('0.01');

						let amountReceived;
						let amountFee;
						let exchangeFeeRate;

						beforeEach(async () => {
							await systemSettings.setAtomicExchangeFeeRate(sETH, feeRateOverride, {
								from: owner,
							});
						});

						beforeEach(async () => {
							await synthetix.exchangeAtomically(sUSD, amountIn, sETH, toBytes32(), {
								from: account1,
							});

							({
								amountReceived,
								exchangeFeeRate,
								fee: amountFee,
							} = await exchanger.getAmountsForAtomicExchange(amountIn, sUSD, sETH));
						});

						it('used correct fee rate', async () => {
							assert.bnEqual(exchangeFeeRate, feeRateOverride);
							assert.bnEqual(
								multiplyDecimal(amountReceived.add(amountFee), exchangeFeeRate),
								amountFee
							);
						});
					});

					describe('when a user exchanges without a tracking code', () => {
						let txn;
						beforeEach(async () => {
							txn = await synthetix.exchangeAtomically(sUSD, toUnit('10'), sETH, toBytes32(), {
								from: account1,
							});
						});
						it('then no ExchangeTracking is emitted (as no tracking code supplied)', async () => {
							const logs = await getDecodedLogs({
								hash: txn.tx,
								contracts: [synthetix, exchanger],
							});
							assert.notOk(logs.find(({ name }) => name === 'ExchangeTracking'));
						});
					});
				});
			});
		});
	};

	const itFailsToExchangeAtomically = () => {
		describe('it cannot exchange atomically', () => {
			it('errors with not implemented when attempted to exchange', async () => {
				await assert.revert(
					synthetix.exchangeAtomically(sUSD, amountIssued, sETH, toBytes32(), {
						from: account1,
					}),
					'Cannot be run on this layer'
				);
			});
		});
	};

	const itPricesSpikeDeviation = () => {
		describe('priceSpikeDeviation', () => {
			const baseRate = 100;

			beforeEach(async () => {
				// disable dynamic fee here as it will not let trades get through at smaller deviations
				// than required for suspension
				await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });
			});

			const updateRate = ({ target, rate }) => {
				beforeEach(async () => {
					await fastForward(10);
					await updateRates([target], [toUnit(rate.toString())]);
				});
			};

			describe(`when the price of sETH is ${baseRate}`, () => {
				updateRate({ target: sETH, rate: baseRate });

				describe('when price spike deviation is set to a factor of 2', () => {
					const baseFactor = 2;
					beforeEach(async () => {
						await systemSettings.setPriceDeviationThresholdFactor(toUnit(baseFactor.toString()), {
							from: owner,
						});
					});

					// lastExchangeRate, used for price deviations (SIP-65)
					describe('lastExchangeRate is persisted during exchanges', () => {
						it('initially has no entries', async () => {
							assert.equal(await exchanger.lastExchangeRate(sETH), '0');
							assert.equal(await exchanger.lastExchangeRate(sEUR), '0');
						});
						describe('when a user exchanges into sETH from sUSD', () => {
							beforeEach(async () => {
								await synthetix.exchange(sUSD, toUnit('100'), sETH, { from: account1 });
							});
							it('and the dest side has a rate persisted', async () => {
								assert.bnEqual(await exchanger.lastExchangeRate(sETH), toUnit(baseRate.toString()));
							});
						});
						describe('when a user exchanges from sETH into another synth', () => {
							beforeEach(async () => {
								await sETHContract.issue(account1, toUnit('1'));
								await synthetix.exchange(sETH, toUnit('1'), sEUR, { from: account1 });
							});
							it('then the source side has a rate persisted', async () => {
								assert.bnEqual(await exchanger.lastExchangeRate(sETH), toUnit(baseRate.toString()));
							});
							it('and the dest side has a rate persisted', async () => {
								// Rate of 2 from shared setup code above
								assert.bnEqual(await exchanger.lastExchangeRate(sEUR), toUnit('2'));
							});
							describe('when the price of sETH changes slightly', () => {
								updateRate({ target: sETH, rate: baseRate * 1.1 });
								describe('and another user exchanges sETH to sUSD', () => {
									beforeEach(async () => {
										await sETHContract.issue(account2, toUnit('1'));
										await synthetix.exchange(sETH, toUnit('1'), sUSD, { from: account2 });
									});
									it('then the source side has a new rate persisted', async () => {
										assert.bnEqual(
											await exchanger.lastExchangeRate(sETH),
											toUnit((baseRate * 1.1).toString())
										);
									});
								});
							});
							describe('when the price of sETH is over a deviation', () => {
								beforeEach(async () => {
									// sETH over deviation and sEUR slight change
									await fastForward(10);
									await updateAggregatorRates(
										exchangeRates,
										[sETH, sEUR],
										[toUnit(baseRate * 3).toString(), toUnit('1.9')]
									);
								});
								describe('and another user exchanges sETH to sEUR', () => {
									beforeEach(async () => {
										await sETHContract.issue(account2, toUnit('1'));
										await synthetix.exchange(sETH, toUnit('1'), sEUR, { from: account2 });
									});
									it('then the source side has not persisted the rate', async () => {
										assert.bnEqual(
											await exchanger.lastExchangeRate(sETH),
											toUnit(baseRate.toString())
										);
									});
									it('then the dest side has persisted the rate', async () => {
										assert.bnEqual(await exchanger.lastExchangeRate(sEUR), toUnit('1.9'));
									});
								});
							});
							describe('when the price of sEUR is over a deviation', () => {
								beforeEach(async () => {
									// sEUR over deviation and sETH slight change
									await fastForward(10);
									await updateAggregatorRates(
										exchangeRates,
										[sETH, sEUR],
										[toUnit(baseRate * 1.1).toString(), toUnit('10')]
									);
								});
								describe('and another user exchanges sEUR to sETH', () => {
									beforeEach(async () => {
										await sETHContract.issue(account2, toUnit('1'));
										await synthetix.exchange(sETH, toUnit('1'), sEUR, { from: account2 });
									});
									it('then the source side has persisted the rate', async () => {
										assert.bnEqual(
											await exchanger.lastExchangeRate(sETH),
											toUnit((baseRate * 1.1).toString())
										);
									});
									it('and the dest side has persisted the rate', async () => {
										assert.bnEqual(await exchanger.lastExchangeRate(sEUR), toUnit('2'));
									});
								});
							});
						});
					});

					describe('the isSynthRateInvalid() view correctly returns status', () => {
						it('when called with a synth with only a single rate, returns false', async () => {
							assert.equal(await exchanger.isSynthRateInvalid(sETH), false);
						});
						it('when called with a synth with no rate (i.e. 0), returns true', async () => {
							assert.equal(await exchanger.isSynthRateInvalid(toBytes32('XYZ')), true);
						});
						describe('when a synth rate changes outside of the range', () => {
							updateRate({ target: sETH, rate: baseRate * 2 });

							it('when called with that synth, returns true', async () => {
								assert.equal(await exchanger.isSynthRateInvalid(sETH), true);
							});

							describe('when the synth rate changes back into the range', () => {
								updateRate({ target: sETH, rate: baseRate });

								it('then when called with the target, still returns true', async () => {
									assert.equal(await exchanger.isSynthRateInvalid(sETH), true);
								});
							});
						});
						describe('when there is a last rate into sETH via an exchange', () => {
							beforeEach(async () => {
								await synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account2 });
							});

							describe('when a synth rate changes outside of the range and then returns to the range', () => {
								updateRate({ target: sETH, rate: baseRate * 2 });
								updateRate({ target: sETH, rate: baseRate * 1.2 });

								it('then when called with the target, returns false', async () => {
									assert.equal(await exchanger.isSynthRateInvalid(sETH), false);
								});
							});
						});

						describe('when there is a last price out of sETH via an exchange', () => {
							beforeEach(async () => {
								await sETHContract.issue(account2, toUnit('1'));
								await synthetix.exchange(sETH, toUnit('0.001'), sUSD, { from: account2 });
							});

							describe('when a synth price changes outside of the range and then returns to the range', () => {
								updateRate({ target: sETH, rate: baseRate * 2 });
								updateRate({ target: sETH, rate: baseRate * 1.2 });

								it('then when called with the target, returns false', async () => {
									assert.equal(await exchanger.isSynthRateInvalid(sETH), false);
								});
							});
						});
					});

					describe('suspension is triggered via exchanging', () => {
						describe('given the user has some sETH', () => {
							beforeEach(async () => {
								await sETHContract.issue(account1, toUnit('1'));
							});

							const assertSpike = ({ from, to, target, factor, spikeExpected }) => {
								const rate = Math.abs(
									(factor > 0 ? baseRate * factor : baseRate / factor).toFixed(2)
								);
								describe(`when the rate of ${web3.utils.hexToAscii(
									target
								)} is ${rate} (factor: ${factor})`, () => {
									updateRate({ target, rate });

									describe(`when a user exchanges`, () => {
										let logs;

										beforeEach(async () => {
											const { tx: hash } = await synthetix.exchange(from, toUnit('0.01'), to, {
												from: account1,
											});
											logs = await getDecodedLogs({
												hash,
												contracts: [synthetix, exchanger, systemStatus],
											});
										});
										if (Math.abs(factor) >= baseFactor || spikeExpected) {
											it('then the synth is suspended', async () => {
												const { suspended, reason } = await systemStatus.synthSuspension(target);
												assert.ok(suspended);
												assert.equal(reason, '65');
											});
											it('and no exchange took place', async () => {
												assert.ok(!logs.some(({ name } = {}) => name === 'SynthExchange'));
											});
										} else {
											it('then neither synth is suspended', async () => {
												const suspensions = await Promise.all([
													systemStatus.synthSuspension(from),
													systemStatus.synthSuspension(to),
												]);
												assert.ok(!suspensions[0].suspended);
												assert.ok(!suspensions[1].suspended);
											});
											it('and an exchange took place', async () => {
												assert.ok(logs.some(({ name } = {}) => name === 'SynthExchange'));
											});
										}
									});
								});
							};

							const assertRange = ({ from, to, target }) => {
								[1, -1].forEach(multiplier => {
									describe(`${multiplier > 0 ? 'upwards' : 'downwards'} movement`, () => {
										// below threshold
										assertSpike({
											from,
											to,
											target,
											factor: 1.99 * multiplier,
										});

										// on threshold
										assertSpike({
											from,
											to,
											target,
											factor: 2 * multiplier,
										});

										// over threshold
										assertSpike({
											from,
											to,
											target,
											factor: 3 * multiplier,
										});
									});
								});
							};

							const assertBothSidesOfTheExchange = () => {
								describe('on the dest side', () => {
									assertRange({ from: sUSD, to: sETH, target: sETH });
								});

								describe('on the src side', () => {
									assertRange({ from: sETH, to: sAUD, target: sETH });
								});
							};

							describe('with no prior exchange history', () => {
								assertBothSidesOfTheExchange();

								describe('when a recent price rate is set way outside of the threshold', () => {
									beforeEach(async () => {
										await fastForward(10);
										await updateRates([sETH], [toUnit('1000')]);
									});
									describe('and then put back to normal', () => {
										beforeEach(async () => {
											await fastForward(10);
											await updateRates([sETH], [baseRate.toString()]);
										});
										assertSpike({
											from: sUSD,
											to: sETH,
											target: sETH,
											factor: 1,
											spikeExpected: true,
										});
									});
								});
							});

							describe('with a prior exchange from another user into the source', () => {
								beforeEach(async () => {
									await synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account2 });
								});

								assertBothSidesOfTheExchange();
							});

							describe('with a prior exchange from another user out of the source', () => {
								beforeEach(async () => {
									await sETHContract.issue(account2, toUnit('1'));
									await synthetix.exchange(sETH, toUnit('1'), sAUD, { from: account2 });
								});

								assertBothSidesOfTheExchange();
							});
						});
					});

					describe('suspension invoked by anyone via suspendSynthWithInvalidRate()', () => {
						// sTRX relies on the fact that sTRX is a valid synth but never given a rate in the setup code
						// above
						const synthWithNoRate = toBytes32('sTRX');
						it('when called with invalid synth, then reverts', async () => {
							await assert.revert(
								exchanger.suspendSynthWithInvalidRate(toBytes32('XYZ')),
								'No such synth'
							);
						});
						describe('when called with a synth with no price', () => {
							let logs;
							beforeEach(async () => {
								const { tx: hash } = await exchanger.suspendSynthWithInvalidRate(synthWithNoRate);
								logs = await getDecodedLogs({
									hash,
									contracts: [synthetix, exchanger, systemStatus],
								});
							});
							it('then suspension works as expected', async () => {
								const { suspended, reason } = await systemStatus.synthSuspension(synthWithNoRate);
								assert.ok(suspended);
								assert.equal(reason, '65');
								assert.ok(logs.some(({ name }) => name === 'SynthSuspended'));
							});
						});

						describe('when the system is suspended', () => {
							beforeEach(async () => {
								await setStatus({ owner, systemStatus, section: 'System', suspend: true });
							});
							it('then suspended a synth fails', async () => {
								await assert.revert(
									exchanger.suspendSynthWithInvalidRate(synthWithNoRate),
									'Operation prohibited'
								);
							});
							describe(`when system is resumed`, () => {
								beforeEach(async () => {
									await setStatus({ owner, systemStatus, section: 'System', suspend: false });
								});
								it('then suspension works as expected', async () => {
									await exchanger.suspendSynthWithInvalidRate(synthWithNoRate);
									const { suspended, reason } = await systemStatus.synthSuspension(synthWithNoRate);
									assert.ok(suspended);
									assert.equal(reason, '65');
								});
							});
						});
					});

					describe('settlement ignores deviations', () => {
						describe('when a user exchange 100 sUSD into sETH', () => {
							beforeEach(async () => {
								// Disable Dynamic Fee in settlement by setting rounds to 0
								await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });
								await synthetix.exchange(sUSD, toUnit('100'), sETH, { from: account1 });
							});
							describe('and the sETH rate moves up by a factor of 2 to 200', () => {
								updateRate({ target: sETH, rate: baseRate * 2 });

								it('then settlementOwing is 0 for rebate and reclaim, with 1 entry', async () => {
									const {
										reclaimAmount,
										rebateAmount,
										numEntries,
									} = await exchanger.settlementOwing(account1, sETH);
									assert.equal(reclaimAmount, '0');
									assert.equal(rebateAmount, '0');
									assert.equal(numEntries, '1');
								});
							});

							describe('multiple entries to settle', () => {
								describe('when the sETH rate moves down by 20%', () => {
									updateRate({ target: sETH, rate: baseRate * 0.8 });

									describe('and the waiting period expires', () => {
										beforeEach(async () => {
											// end waiting period
											await fastForward(await systemSettings.waitingPeriodSecs());
										});

										it('then settlementOwing is existing rebate with 0 reclaim, with 1 entries', async () => {
											const {
												reclaimAmount,
												rebateAmount,
												numEntries,
											} = await exchanger.settlementOwing(account1, sETH);
											assert.equal(reclaimAmount, '0');
											// some amount close to the 0.25 rebate (after fees)
											assert.bnClose(rebateAmount, toUnit('0.25'), (1e16).toString());
											assert.equal(numEntries, '1');
										});

										describe('and the user makes another exchange into sETH', () => {
											beforeEach(async () => {
												await synthetix.exchange(sUSD, toUnit('100'), sETH, { from: account1 });
											});
											describe('and the sETH rate moves up by a factor of 2 to 200, causing the second entry to be skipped', () => {
												updateRate({ target: sETH, rate: baseRate * 2 });

												it('then settlementOwing is existing rebate with 0 reclaim, with 2 entries', async () => {
													const {
														reclaimAmount,
														rebateAmount,
														numEntries,
													} = await exchanger.settlementOwing(account1, sETH);
													assert.equal(reclaimAmount, '0');
													assert.bnClose(rebateAmount, toUnit('0.25'), (1e16).toString());
													assert.equal(numEntries, '2');
												});
											});

											describe('and the sETH rate goes back up 25% (from 80 to 100)', () => {
												updateRate({ target: sETH, rate: baseRate });
												describe('and the waiting period expires', () => {
													beforeEach(async () => {
														// end waiting period
														await fastForward(await systemSettings.waitingPeriodSecs());
													});
													it('then settlementOwing is existing rebate, existing reclaim, and 2 entries', async () => {
														const {
															reclaimAmount,
															rebateAmount,
															numEntries,
														} = await exchanger.settlementOwing(account1, sETH);
														assert.bnClose(reclaimAmount, toUnit('0.25'), (1e16).toString());
														assert.bnClose(rebateAmount, toUnit('0.25'), (1e16).toString());
														assert.equal(numEntries, '2');
													});
													describe('and the user makes another exchange into sETH', () => {
														beforeEach(async () => {
															await synthetix.exchange(sUSD, toUnit('100'), sETH, {
																from: account1,
															});
														});
														describe('and the sETH rate moves down by a factor of 2 to 50, causing the third entry to be skipped', () => {
															updateRate({ target: sETH, rate: baseRate * 0.5 });

															it('then settlementOwing is existing rebate and reclaim, with 3 entries', async () => {
																const {
																	reclaimAmount,
																	rebateAmount,
																	numEntries,
																} = await exchanger.settlementOwing(account1, sETH);
																assert.bnClose(reclaimAmount, toUnit('0.25'), (1e16).toString());
																assert.bnClose(rebateAmount, toUnit('0.25'), (1e16).toString());
																assert.equal(numEntries, '3');
															});
														});
													});
												});
											});
										});
									});
								});
							});
						});

						describe('edge case: aggregator returns 0 for settlement price', () => {
							describe('when an aggregator is added to the exchangeRates', () => {
								let aggregator;

								beforeEach(async () => {
									aggregator = await MockAggregator.new({ from: owner });
									await exchangeRates.addAggregator(sETH, aggregator.address, { from: owner });
								});

								describe('and the aggregator has a rate (so the exchange succeeds)', () => {
									beforeEach(async () => {
										await aggregator.setLatestAnswer(
											convertToAggregatorPrice(100),
											await currentTime()
										);
									});
									describe('when a user exchanges out of the aggregated rate into sUSD', () => {
										beforeEach(async () => {
											// give the user some sETH
											await sETHContract.issue(account1, toUnit('1'));
											await synthetix.exchange(sETH, toUnit('1'), sUSD, { from: account1 });
										});
										describe('and the aggregated rate becomes 0', () => {
											beforeEach(async () => {
												await aggregator.setLatestAnswer('0', await currentTime());
											});

											it('then settlementOwing is 0 for rebate and reclaim, with 1 entry', async () => {
												const {
													reclaimAmount,
													rebateAmount,
													numEntries,
												} = await exchanger.settlementOwing(account1, sUSD);
												assert.equal(reclaimAmount, '0');
												assert.equal(rebateAmount, '0');
												assert.equal(numEntries, '1');
											});
											describe('and the waiting period expires', () => {
												beforeEach(async () => {
													// end waiting period
													await fastForward(await systemSettings.waitingPeriodSecs());
												});
												it('then the user can settle with no impact', async () => {
													const txn = await exchanger.settle(account1, sUSD, { from: account1 });
													// Note: no need to decode the logs as they are emitted off the target contract Exchanger
													assert.equal(txn.logs.length, 1); // one settlement entry
													assert.eventEqual(txn, 'ExchangeEntrySettled', {
														reclaim: '0',
														rebate: '0',
													}); // with no reclaim or rebate
												});
											});
										});
										describe('and the aggregated rate is received but for a much higher roundId, leaving a large gap in roundIds', () => {
											beforeEach(async () => {
												await aggregator.setLatestAnswerWithRound(
													convertToAggregatorPrice(110),
													await currentTime(),
													'9999'
												);
											});

											it('then settlementOwing is 0 for rebate and reclaim, with 1 entry', async () => {
												const {
													reclaimAmount,
													rebateAmount,
													numEntries,
												} = await exchanger.settlementOwing(account1, sUSD);
												assert.equal(reclaimAmount, '0');
												assert.equal(rebateAmount, '0');
												assert.equal(numEntries, '1');
											});

											describe('and the waiting period expires', () => {
												beforeEach(async () => {
													// end waiting period
													await fastForward(await systemSettings.waitingPeriodSecs());
												});
												it('then the user can settle with no impact', async () => {
													const txn = await exchanger.settle(account1, sUSD, { from: account1 });
													// Note: no need to decode the logs as they are emitted off the target contract Exchanger
													assert.equal(txn.logs.length, 1); // one settlement entry
													assert.eventEqual(txn, 'ExchangeEntrySettled', {
														reclaim: '0',
														rebate: '0',
													}); // with no reclaim or rebate
												});
											});
										});
									});
									describe('when a user exchanges into the aggregated rate from sUSD', () => {
										beforeEach(async () => {
											await synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account1 });
										});
										describe('and the aggregated rate becomes 0', () => {
											beforeEach(async () => {
												await aggregator.setLatestAnswer('0', await currentTime());
											});

											it('then settlementOwing is 0 for rebate and reclaim, with 1 entry', async () => {
												const {
													reclaimAmount,
													rebateAmount,
													numEntries,
												} = await exchanger.settlementOwing(account1, sETH);
												assert.equal(reclaimAmount, '0');
												assert.equal(rebateAmount, '0');
												assert.equal(numEntries, '1');
											});
											describe('and the waiting period expires', () => {
												beforeEach(async () => {
													// end waiting period
													await fastForward(await systemSettings.waitingPeriodSecs());
												});
												it('then the user can settle with no impact', async () => {
													const txn = await exchanger.settle(account1, sETH, { from: account1 });
													// Note: no need to decode the logs as they are emitted off the target contract Exchanger
													assert.equal(txn.logs.length, 1); // one settlement entry
													assert.eventEqual(txn, 'ExchangeEntrySettled', {
														reclaim: '0',
														rebate: '0',
													}); // with no reclaim or rebate
												});
											});
										});
										describe('and the aggregated rate is received but for a much higher roundId, leaving a large gap in roundIds', () => {
											beforeEach(async () => {
												await aggregator.setLatestAnswerWithRound(
													convertToAggregatorPrice(110),
													await currentTime(),
													'9999'
												);
											});

											it('then settlementOwing is 0 for rebate and reclaim, with 1 entry', async () => {
												const {
													reclaimAmount,
													rebateAmount,
													numEntries,
												} = await exchanger.settlementOwing(account1, sETH);
												assert.equal(reclaimAmount, '0');
												assert.equal(rebateAmount, '0');
												assert.equal(numEntries, '1');
											});

											describe('and the waiting period expires', () => {
												beforeEach(async () => {
													// end waiting period
													await fastForward(await systemSettings.waitingPeriodSecs());
												});
												it('then the user can settle with no impact', async () => {
													const txn = await exchanger.settle(account1, sETH, { from: account1 });
													// Note: no need to decode the logs as they are emitted off the target contract Exchanger
													assert.equal(txn.logs.length, 1); // one settlement entry
													assert.eventEqual(txn, 'ExchangeEntrySettled', {
														reclaim: '0',
														rebate: '0',
													}); // with no reclaim or rebate
												});
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	};

	const itSetsExchangeFeeRateForSynths = () => {
		describe('Given synth exchange fee rates to set', async () => {
			const fxBIPS = toUnit('0.01');
			const cryptoBIPS = toUnit('0.03');
			const empty = toBytes32('');

			describe('Given synth exchange fee rates to update', async () => {
				const newFxBIPS = toUnit('0.02');
				const newCryptoBIPS = toUnit('0.04');

				beforeEach(async () => {
					// Disable Dynamic Fee here as it's testing for the base exchange fee rate
					await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });

					// Store multiple rates
					await systemSettings.setExchangeFeeRateForSynths(
						[sUSD, sAUD, sBTC, sETH],
						[fxBIPS, fxBIPS, cryptoBIPS, cryptoBIPS],
						{
							from: owner,
						}
					);
				});

				it('when 1 exchange rate to update then overwrite existing rate', async () => {
					await systemSettings.setExchangeFeeRateForSynths([sUSD], [newFxBIPS], {
						from: owner,
					});
					const sUSDRate = await exchanger.feeRateForExchange(empty, sUSD);
					assert.bnEqual(sUSDRate, newFxBIPS);
				});

				it('when multiple exchange rates then store them to be readable', async () => {
					// Update multiple rates
					await systemSettings.setExchangeFeeRateForSynths(
						[sUSD, sAUD, sBTC, sETH],
						[newFxBIPS, newFxBIPS, newCryptoBIPS, newCryptoBIPS],
						{
							from: owner,
						}
					);
					// Read all rates
					const sAUDRate = await exchanger.feeRateForExchange(empty, sAUD);
					assert.bnEqual(sAUDRate, newFxBIPS);
					const sUSDRate = await exchanger.feeRateForExchange(empty, sUSD);
					assert.bnEqual(sUSDRate, newFxBIPS);
					const sBTCRate = await exchanger.feeRateForExchange(empty, sBTC);
					assert.bnEqual(sBTCRate, newCryptoBIPS);
					const sETHRate = await exchanger.feeRateForExchange(empty, sETH);
					assert.bnEqual(sETHRate, newCryptoBIPS);
				});
			});
		});
	};

	async function updateRates(keys, rates) {
		await updateAggregatorRates(exchangeRates, keys, rates);
	}

	describe('With L1 configuration (Synthetix, ExchangerWithFeeRecAlternatives, ExchangeRatesWithDexPricing)', () => {
		before(async () => {
			const VirtualSynthMastercopy = artifacts.require('VirtualSynthMastercopy');
			const synths = ['sUSD', 'sETH', 'sEUR', 'sAUD', 'sBTC', 'iBTC', 'sTRX'];

			({
				Exchanger: exchanger,
				Synthetix: synthetix,
				ExchangeRates: exchangeRates,
				ExchangeState: exchangeState,
				FeePool: feePool,
				SystemStatus: systemStatus,
				SynthsUSD: sUSDContract,
				SynthsBTC: sBTCContract,
				SynthsEUR: sEURContract,
				SynthsAUD: sAUDContract,
				SynthsETH: sETHContract,
				SystemSettings: systemSettings,
				DelegateApprovals: delegateApprovals,
				AddressResolver: resolver,
				DebtCache: debtCache,
				Issuer: issuer,
				FlexibleStorage: flexibleStorage,
			} = await setupAllContracts({
				accounts,
				synths: synths,
				contracts: [
					// L1 specific
					'Synthetix',
					'ExchangerWithFeeRecAlternatives',
					'ExchangeRatesWithDexPricing',
					// Same between L1 and L2
					'ExchangeState',
					'DebtCache',
					'Issuer', // necessary for synthetix transfers to succeed
					'FeePool',
					'FeePoolEternalStorage',
					'SystemStatus',
					'SystemSettings',
					'DelegateApprovals',
					'FlexibleStorage',
					'CollateralManager',
				],
				mocks: {
					// Use a real VirtualSynthMastercopy so the spec tests can interrogate deployed vSynths
					VirtualSynthMastercopy: await VirtualSynthMastercopy.new(),
				},
			}));

			await setupPriceAggregators(exchangeRates, owner, synths.map(toBytes32));

			amountIssued = toUnit('1000');

			// give the first two accounts 1000 sUSD each
			await sUSDContract.issue(account1, amountIssued);
			await sUSDContract.issue(account2, amountIssued);
		});

		addSnapshotBeforeRestoreAfterEach();

		beforeEach(async () => {
			const keys = [sAUD, sEUR, SNX, sETH, sBTC, iBTC];
			const rates = ['0.5', '2', '1', '100', '5000', '5000'].map(toUnit);
			await setupPriceAggregators(exchangeRates, owner, keys);
			await updateRates(keys, rates);

			exchangeFeeRate = toUnit('0.005');
			await setExchangeFeeRateForSynths({
				owner,
				systemSettings,
				synthKeys,
				exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
			});
		});

		itReadsTheWaitingPeriod();

		itWhenTheWaitingPeriodIsZero();

		itDeviatesCorrectly();

		itCalculatesMaxSecsLeft();

		itCalculatesFeeRateForExchange();

		itCalculatesFeeRateForExchange2();

		itSettles();

		itCalculatesAmountAfterSettlement();

		itExchanges();

		itExchangesWithVirtual();

		itExchangesAtomically();

		itPricesSpikeDeviation();

		itSetsExchangeFeeRateForSynths();
	});

	describe('With L2 configuration (MintableSynthetix, Exchanger, ExchangeRates)', () => {
		before(async () => {
			const synths = ['sUSD', 'sETH', 'sEUR', 'sAUD', 'sBTC', 'iBTC', 'sTRX'];
			({
				Exchanger: exchanger,
				Synthetix: synthetix,
				ExchangeRates: exchangeRates,
				ExchangeState: exchangeState,
				FeePool: feePool,
				SystemStatus: systemStatus,
				SynthsUSD: sUSDContract,
				SynthsBTC: sBTCContract,
				SynthsEUR: sEURContract,
				SynthsAUD: sAUDContract,
				SynthsETH: sETHContract,
				SystemSettings: systemSettings,
				DelegateApprovals: delegateApprovals,
				AddressResolver: resolver,
				DebtCache: debtCache,
				Issuer: issuer,
				FlexibleStorage: flexibleStorage,
			} = await setupAllContracts({
				accounts,
				synths: synths,
				contracts: [
					// L2 specific
					'MintableSynthetix',
					'Exchanger',
					'ExchangeRates',
					// Same between L1 and L2
					'ExchangeState',
					'DebtCache',
					'Issuer', // necessary for synthetix transfers to succeed
					'FeePool',
					'FeePoolEternalStorage',
					'SystemStatus',
					'SystemSettings',
					'DelegateApprovals',
					'FlexibleStorage',
					'CollateralManager',
				],
			}));

			await setupPriceAggregators(exchangeRates, owner, synths.map(toBytes32));

			amountIssued = toUnit('1000');

			// give the first two accounts 1000 sUSD each
			await sUSDContract.issue(account1, amountIssued);
			await sUSDContract.issue(account2, amountIssued);
		});

		addSnapshotBeforeRestoreAfterEach();

		beforeEach(async () => {
			const keys = [sAUD, sEUR, SNX, sETH, sBTC, iBTC];
			const rates = ['0.5', '2', '1', '100', '5000', '5000'].map(toUnit);
			await setupPriceAggregators(exchangeRates, owner, keys);
			await updateRates(keys, rates);

			// set a 0.5% exchange fee rate (1/200)
			exchangeFeeRate = toUnit('0.005');
			await setExchangeFeeRateForSynths({
				owner,
				systemSettings,
				synthKeys,
				exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
			});
		});

		itReadsTheWaitingPeriod();

		itWhenTheWaitingPeriodIsZero();

		itDeviatesCorrectly();

		itCalculatesMaxSecsLeft();

		itCalculatesFeeRateForExchange();

		itCalculatesFeeRateForExchange2();

		itSettles();

		itCalculatesAmountAfterSettlement();

		itExchanges();

		itFailsToExchangeWithVirtual();

		itFailsToExchangeAtomically();

		itPricesSpikeDeviation();

		itSetsExchangeFeeRateForSynths();
	});
});
