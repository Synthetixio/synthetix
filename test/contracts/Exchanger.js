require('.'); // import common test scaffolding

const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const Synth = artifacts.require('Synth');
const Exchanger = artifacts.require('Exchanger');
const ExchangeState = artifacts.require('ExchangeState');
const DelegateApprovals = artifacts.require('DelegateApprovals');

const {
	currentTime,
	fastForward,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	ZERO_ADDRESS,
} = require('../utils/testUtils');

const {
	issueSynthsToUser,
	setExchangeFee,
	getDecodedLogs,
	decodedEventEqual,
	timeIsClose,
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	setStatus,
} = require('../utils/setupUtils');

const { toBytes32 } = require('../..');

const bnCloseVariance = '30';

contract('Exchanger (via Synthetix)', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, sBTC, iBTC, sETH] = [
		'sUSD',
		'sAUD',
		'sEUR',
		'SNX',
		'sBTC',
		'iBTC',
		'sETH',
	].map(toBytes32);

	const [, owner, account1, account2, account3] = accounts;

	let synthetix,
		exchangeRates,
		feePool,
		delegateApprovals,
		sUSDContract,
		sAUDContract,
		sEURContract,
		sBTCContract,
		oracle,
		timestamp,
		exchanger,
		exchangeState,
		exchangeFeeRate,
		amountIssued;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();

		synthetix = await Synthetix.deployed();
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		sEURContract = await Synth.at(await synthetix.synths(sEUR));
		sBTCContract = await Synth.at(await synthetix.synths(sBTC));

		exchanger = await Exchanger.deployed();
		exchangeState = await ExchangeState.deployed();

		delegateApprovals = await DelegateApprovals.deployed();

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

		// set a 0.5% exchange fee rate (1/200)
		exchangeFeeRate = toUnit('0.005');
		await setExchangeFee({ owner, exchangeFeeRate });

		amountIssued = toUnit('1000');
		// give the first two accounts 1000 sUSD each
		await issueSynthsToUser({ owner, user: account1, amount: amountIssued, synth: sUSD });
		await issueSynthsToUser({ owner, user: account2, amount: amountIssued, synth: sUSD });
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: exchanger.abi,
			ignoreParents: ['MixinResolver'],
			expected: ['settle', 'setWaitingPeriodSecs', 'exchange', 'exchangeOnBehalf'],
		});
	});

	describe('setWaitingPeriodSecs()', () => {
		it('only owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: exchanger.setWaitingPeriodSecs,
				args: ['60'],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});
		it('owner can invoke and replace', async () => {
			const newPeriod = '90';
			await exchanger.setWaitingPeriodSecs(newPeriod, { from: owner });
			const actual = await exchanger.waitingPeriodSecs();
			assert.equal(actual, newPeriod, 'Configured waiting period is set correctly');
		});
		describe('given it is configured to 90', () => {
			beforeEach(async () => {
				await exchanger.setWaitingPeriodSecs('90', { from: owner });
			});
			describe('and there is an exchange', () => {
				beforeEach(async () => {
					await synthetix.exchange(sUSD, toUnit('100'), sEUR, { from: account1 });
				});
				it('then the maxSecsLeftInWaitingPeriod is close to 90', async () => {
					const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
					timeIsClose({ actual: maxSecs, expected: 90, variance: 2 });
				});
				describe('and 88 seconds elapses', () => {
					// Note: timestamp accurancy can't be guaranteed, so provide a few seconds of buffer either way
					beforeEach(async () => {
						fastForward(88);
					});
					describe('when settle() is called', () => {
						it('then it reverts', async () => {
							await assert.revert(synthetix.settle(sEUR, { from: account1 }));
						});
						it('and the maxSecsLeftInWaitingPeriod is close to 1', async () => {
							const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
							timeIsClose({ actual: maxSecs, expected: 1, variance: 2 });
						});
					});
					describe('when a further 4 seconds elapse', () => {
						beforeEach(async () => {
							fastForward(4);
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
							timeIsClose({ actual: maxSecs, expected: 5, variance: 2 });
						});
						it('and yet the new user has 60 secs', async () => {
							const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account2, sEUR);
							timeIsClose({ actual: maxSecs, expected: 60, variance: 2 });
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

	describe('feeRateForExchange()', () => {
		let exchangeFeeRate;
		beforeEach(async () => {
			exchangeFeeRate = await feePool.exchangeFeeRate();
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
		it('for an inverse synth and a long synth, returns regular exchange fee', async () => {
			let actualFeeRate = await exchanger.feeRateForExchange(iBTC, sEUR);
			assert.bnEqual(actualFeeRate, exchangeFeeRate, 'Rate must be the exchange fee rate');
			actualFeeRate = await exchanger.feeRateForExchange(sEUR, iBTC);
			assert.bnEqual(actualFeeRate, exchangeFeeRate, 'Rate must be the exchange fee rate');
			actualFeeRate = await exchanger.feeRateForExchange(sBTC, iBTC);
			assert.bnEqual(actualFeeRate, exchangeFeeRate, 'Rate must be the exchange fee rate');
			actualFeeRate = await exchanger.feeRateForExchange(iBTC, sBTC);
			assert.bnEqual(actualFeeRate, exchangeFeeRate, 'Rate must be the exchange fee rate');
		});
	});

	const amountAfterExchageFee = ({ amount }) => {
		return multiplyDecimal(amount, toUnit('1').sub(exchangeFeeRate));
	};

	const calculateExpectedSettlementAmount = ({ amount, oldRate, newRate }) => {
		// Note: exchangeFeeRate is in a parent scope. Tests may mutate it in beforeEach and
		// be assured that this function, when called in a test, will use that mutated value
		const result = multiplyDecimal(amountAfterExchageFee({ amount }), oldRate.sub(newRate));

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
		const logs = await getDecodedLogs({ hash });

		const currencyKey = await synth.currencyKey();
		// Can only either be reclaim or rebate - not both
		const isReclaim = !expected.reclaimAmount.isZero();
		const expectedAmount = isReclaim ? expected.reclaimAmount : expected.rebateAmount;

		const synthProxyAddress = await synth.proxy();

		decodedEventEqual({
			log: logs[0],
			event: 'Transfer',
			emittedFrom: synthProxyAddress,
			args: [
				isReclaim ? account1 : ZERO_ADDRESS,
				isReclaim ? ZERO_ADDRESS : account1,
				expectedAmount,
			],
			bnCloseVariance,
		});

		decodedEventEqual({
			log: logs[1],
			event: isReclaim ? 'Burned' : 'Issued',
			emittedFrom: synthProxyAddress,
			args: [account1, expectedAmount],
			bnCloseVariance,
		});

		decodedEventEqual({
			log: logs[2],
			event: `Exchange${isReclaim ? 'Reclaim' : 'Rebate'}`,
			emittedFrom: await synthetix.proxy(),
			args: [account1, currencyKey, expectedAmount],
			bnCloseVariance,
		});

		// return all logs for any other usage
		return logs;
	};

	describe('settlement', () => {
		describe('suspension conditions', () => {
			const synth = sETH;
			['System', 'Exchange', 'Synth'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, section, suspend: true, synth });
					});
					it('then calling settle() reverts', async () => {
						await assert.revert(synthetix.settle(sETH, { from: account1 }), 'Operation prohibited');
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, section, suspend: false, synth });
						});
						it('then calling exchange() succeeds', async () => {
							await synthetix.settle(sETH, { from: account1 });
						});
					});
				});
			});
			describe('when Synth(sBTC) is suspended', () => {
				beforeEach(async () => {
					await setStatus({ owner, section: 'Synth', suspend: true, synth: sBTC });
				});
				it('then settling other synths still works', async () => {
					await synthetix.settle(sETH, { from: account1 });
					await synthetix.settle(sAUD, { from: account2 });
				});
			});
		});
		describe('given the sEUR rate is 2, and sETH is 100, sBTC is 9000', () => {
			beforeEach(async () => {
				// set sUSD:sEUR as 2:1, sUSD:sETH at 100:1, sUSD:sBTC at 9000:1
				await exchangeRates.updateRates(
					[sEUR, sETH, sBTC],
					['2', '100', '9000'].map(toUnit),
					timestamp,
					{
						from: oracle,
					}
				);
			});
			describe('and the exchange fee rate is 1% for easier human consumption', () => {
				beforeEach(async () => {
					exchangeFeeRate = toUnit('0.01');
					await setExchangeFee({ owner, exchangeFeeRate });
				});
				describe('and the waitingPeriodSecs is set to 60', () => {
					beforeEach(async () => {
						await exchanger.setWaitingPeriodSecs('60', { from: owner });
					});
					describe('when the first user exchanges 100 sUSD into sUSD:sEUR at 2:1', () => {
						let amountOfSrcExchanged;
						beforeEach(async () => {
							amountOfSrcExchanged = toUnit('100');
							await synthetix.exchange(sUSD, amountOfSrcExchanged, sEUR, { from: account1 });
						});
						it('then settlement reclaimAmount shows 0 reclaim and 0 refund', async () => {
							const settlement = await exchanger.settlementOwing(account1, sEUR);
							assert.equal(settlement.reclaimAmount, '0', 'Nothing can be reclaimAmount');
							assert.equal(settlement.rebateAmount, '0', 'Nothing can be rebateAmount');
							assert.equal(settlement.numEntries, '1', 'Must be one entry in the settlement queue');
						});
						describe('when settle() is invoked on sEUR', () => {
							it('then it reverts as the waiting period has not ended', async () => {
								await assert.revert(synthetix.settle(sEUR, { from: account1 }));
							});
						});
						it('when sEUR is attempted to be exchanged away by the user, it reverts', async () => {
							await assert.revert(
								synthetix.exchange(sEUR, toUnit('1'), sBTC, { from: account1 }),
								'Cannot settle during waiting period'
							);
						});
						it('when sEUR is attempted to be transferred away by the user, it reverts', async () => {
							await assert.revert(
								sEURContract.transfer(account2, toUnit('1'), { from: account1 }),
								'Cannot transfer during waiting period'
							);
						});
						it('when sEUR is attempted to be transferFrom away by another user, it reverts', async () => {
							await assert.revert(
								sEURContract.transferFrom(account1, account2, toUnit('1'), { from: account1 }),
								'Cannot transfer during waiting period'
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
								fastForward(5);
								timestamp = await currentTime();

								await exchangeRates.updateRates([sEUR], ['4'].map(toUnit), timestamp, {
									from: oracle,
								});
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
									await assert.revert(synthetix.settle(sEUR, { from: account1 }));
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
											const srcBalanceAfterExchange = await sEURContract.balanceOf(account1);
											assert.equal(srcBalanceAfterExchange, '0');

											const decodedLogs = await ensureTxnEmitsSettlementEvents({
												hash: txn.tx,
												synth: sEURContract,
												expected: expectedSettlement,
											});

											decodedEventEqual({
												log: decodedLogs.slice(-1)[0],
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
										'and more than the total initially',
									() => {
										let txn;
										beforeEach(async () => {
											txn = await synthetix.exchange(sEUR, toUnit('50'), sBTC, {
												from: account1,
											});
										});
										it('then it succeeds, exchanging the entire amount after settlement', async () => {
											const srcBalanceAfterExchange = await sEURContract.balanceOf(account1);
											assert.equal(srcBalanceAfterExchange, '0');

											const decodedLogs = await ensureTxnEmitsSettlementEvents({
												hash: txn.tx,
												synth: sEURContract,
												expected: expectedSettlement,
											});

											decodedEventEqual({
												log: decodedLogs.slice(-1)[0],
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
											log: decodedLogs.slice(-1)[0],
											event: 'SynthExchange',
											emittedFrom: await synthetix.proxy(),
											args: [account1, sEUR, newAmountToExchange, sBTC], // amount to exchange must be the reclaim amount
										});
									});
								});

								['transfer', 'transferFrom'].forEach(type => {
									it(`when all of the original sEUR is attempted to be ${type} away by the user, it reverts`, async () => {
										const sEURBalance = await sEURContract.balanceOf(account1);

										let from = account1;
										let optionalFirstArg = [];
										if (type === 'transferFrom') {
											await sEURContract.approve(account2, sEURBalance, { from: account1 });
											optionalFirstArg = account1;
											from = account2;
										}
										const args = [].concat(optionalFirstArg).concat([
											account3,
											sEURBalance,
											{
												from,
											},
										]);

										await assert.revert(
											sEURContract[type](...args),
											'Insufficient balance after any settlement owing'
										);
									});
									it(`when less than the reclaim amount of sEUR is attempted to be ${type} away by the user, it succeeds`, async () => {
										const sEURBalance = await sEURContract.balanceOf(account1);

										let from = account1;
										let optionalFirstArg = [];
										if (type === 'transferFrom') {
											await sEURContract.approve(account2, sEURBalance, { from: account1 });
											optionalFirstArg = account1;
											from = account2;
										}

										const args = [].concat(optionalFirstArg).concat([
											account3,
											// this is less than the reclaim amount
											toUnit('1'),
											{
												from,
											},
										]);
										await sEURContract[type](...args);
									});
								});
							});
						});
						describe('when the price halves for sUSD:sEUR to 1:1', () => {
							beforeEach(async () => {
								await fastForward(5);

								timestamp = await currentTime();

								await exchangeRates.updateRates([sEUR], ['1'].map(toUnit), timestamp, {
									from: oracle,
								});
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
							describe('when settlement is invoked', () => {
								it('then it reverts as the waiting period has not ended', async () => {
									await assert.revert(synthetix.settle(sEUR, { from: account1 }));
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
										it('then it settles with a rebate', async () => {
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

									// The user has 49.5 sEUR and has a rebate of 49.5 - so 99 after settlement
									describe('when an exchange out of sEUR for their expected balance before exchange', () => {
										let txn;
										beforeEach(async () => {
											txn = await synthetix.exchange(sEUR, toUnit('49.5'), sBTC, {
												from: account1,
											});
										});
										it('then it succeeds, exchanging the entire amount plus the rebate', async () => {
											const srcBalanceAfterExchange = await sEURContract.balanceOf(account1);
											assert.equal(srcBalanceAfterExchange, '0');

											const decodedLogs = await ensureTxnEmitsSettlementEvents({
												hash: txn.tx,
												synth: sEURContract,
												expected: expectedSettlement,
											});

											decodedEventEqual({
												log: decodedLogs.slice(-1)[0],
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
												log: decodedLogs.slice(-1)[0],
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

									timestamp = await currentTime();

									await exchangeRates.updateRates([sEUR], ['2'].map(toUnit), timestamp, {
										from: oracle,
									});
								});
								it('then settlement reclaimAmount shows 0 reclaim and 0 refund', async () => {
									const settlement = await exchanger.settlementOwing(account1, sEUR);
									assert.equal(settlement.reclaimAmount, '0', 'Nothing can be reclaimAmount');
									assert.equal(settlement.rebateAmount, '0', 'Nothing can be rebateAmount');
								});
								describe('when another minute elapses and the sETH price changes', () => {
									beforeEach(async () => {
										await fastForward(60);
										timestamp = await currentTime();

										await exchangeRates.updateRates([sEUR], ['3'].map(toUnit), timestamp, {
											from: oracle,
										});
									});
									it('then settlement reclaimAmount still shows 0 reclaim and 0 refund as the timeout period ended', async () => {
										const settlement = await exchanger.settlementOwing(account1, sEUR);
										assert.equal(settlement.reclaimAmount, '0', 'Nothing can be reclaimAmount');
										assert.equal(settlement.rebateAmount, '0', 'Nothing can be rebateAmount');
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
							await issueSynthsToUser({
								owner,
								user: account1,
								amount: toUnit('1000'),
								synth: sEUR,
							});
						});
						describe('when the first user exchanges 100 sEUR into sEUR:sBTC at 9000:2', () => {
							let amountOfSrcExchanged;
							beforeEach(async () => {
								amountOfSrcExchanged = toUnit('100');
								await synthetix.exchange(sEUR, amountOfSrcExchanged, sBTC, { from: account1 });
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
									fastForward(5);
									timestamp = await currentTime();

									await exchangeRates.updateRates([sEUR], ['4'].map(toUnit), timestamp, {
										from: oracle,
									});
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
										await assert.revert(synthetix.settle(sBTC, { from: account1 }));
									});
								});
								describe('when the price gains for sBTC more than the loss of the sEUR change', () => {
									beforeEach(async () => {
										await exchangeRates.updateRates([sBTC], ['20000'].map(toUnit), timestamp, {
											from: oracle,
										});
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
											assert.bnClose(reclaimAmount, expected.reclaimAmount, bnCloseVariance);
											assert.equal(numEntries, '2', 'Must be two entries in the settlement queue');
										});
										describe('when the price of sBTC lowers, turning the profit to a loss', () => {
											let expectedFromFirst;
											let expectedFromSecond;
											beforeEach(async () => {
												fastForward(5);
												timestamp = await currentTime();

												await exchangeRates.updateRates([sBTC], ['10000'].map(toUnit), timestamp, {
													from: oracle,
												});

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
											it('then the reclaimAmount calculation of settlementOwing on sBTC includes both exchanges', async () => {
												const { reclaimAmount, rebateAmount } = await exchanger.settlementOwing(
													account1,
													sBTC
												);

												assert.equal(reclaimAmount, '0');

												assert.bnClose(
													rebateAmount,
													expectedFromFirst.rebateAmount.add(expectedFromSecond.rebateAmount),
													bnCloseVariance
												);
											});
											describe('when another minute passes', () => {
												beforeEach(async () => {
													await fastForward(60);
												});
												describe('when settle() is invoked for sBTC', () => {
													it('then it settles with a rebate', async () => {
														const { tx: hash } = await synthetix.settle(sBTC, {
															from: account1,
														});
														const sBTCContract = await Synth.at(await synthetix.synths(sBTC));
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
											await synthetix.exchange(sEUR, toUnit('100'), sBTC, { from: account1 })
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
												await synthetix.exchange(sEUR, toUnit('100'), sBTC, { from: account1 });
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

	describe('calculateAmountAfterSettlement()', () => {
		describe('given a user has 1000 sEUR', () => {
			beforeEach(async () => {
				await issueSynthsToUser({ owner, user: account1, amount: toUnit('1000'), synth: sEUR });
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

	describe('exchange()', () => {
		it('exchange() cannot be invoked directly by any account', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: exchanger.exchange,
				accounts,
				args: [account1, sUSD, toUnit('100'), sAUD, account1],
				reason: 'Only synthetix or a synth contract can perform this action',
			});
		});

		describe('suspension conditions on Synthetix.exchange()', () => {
			const synth = sETH;
			['System', 'Exchange', 'Synth'].forEach(section => {
				describe(`when ${section} is suspended`, () => {
					beforeEach(async () => {
						await setStatus({ owner, section, suspend: true, synth });
					});
					it('then calling exchange() reverts', async () => {
						await assert.revert(
							synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account1 }),
							'Operation prohibited'
						);
					});
					describe(`when ${section} is resumed`, () => {
						beforeEach(async () => {
							await setStatus({ owner, section, suspend: false, synth });
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
					await issueSynthsToUser({ owner, user: account2, amount: toUnit('100'), synth: sAUD });

					await setStatus({ owner, section: 'Synth', suspend: true, synth: sBTC });
				});
				it('then exchanging other synths still works', async () => {
					await synthetix.exchange(sUSD, toUnit('1'), sETH, { from: account1 });
					await synthetix.exchange(sAUD, toUnit('1'), sETH, { from: account2 });
				});
			});
		});

		describe('when a user has 1000 sUSD', () => {
			// already issued in the top-level beforeEach

			it('should allow a user to exchange the synths they hold in one flavour for another', async () => {
				// Exchange sUSD to sAUD
				await synthetix.exchange(sUSD, amountIssued, sAUD, { from: account1 });

				// Get the exchange fee in USD
				const exchangeFeeUSD = await feePool.exchangeFeeIncurred(amountIssued);

				// how much sAUD the user is supposed to get
				const effectiveValue = await exchangeRates.effectiveValue(sUSD, amountIssued, sAUD);

				// chargeFee = true so we need to minus the fees for this exchange
				const effectiveValueMinusFees = await feePool.amountReceivedFromExchange(effectiveValue);

				// Assert we have the correct AUD value - exchange fee
				const sAUDBalance = await sAUDContract.balanceOf(account1);
				assert.bnEqual(effectiveValueMinusFees, sAUDBalance);

				// Assert we have the exchange fee to distribute
				const feePeriodZero = await feePool.recentFeePeriods(0);
				assert.bnEqual(exchangeFeeUSD, feePeriodZero.feesToDistribute);
			});

			it('should emit a SynthExchange event', async () => {
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

			it('when a user tries to exchange more than they have, then it fails', async () => {
				await assert.revert(
					synthetix.exchange(sAUD, toUnit('1'), sUSD, {
						from: account1,
					})
					// no reason cause it's from SafeMath.sub which has no reason string in our version
				);
			});

			it('when a user tries to exchange more than they have, then it fails', async () => {
				await assert.revert(
					synthetix.exchange(sUSD, toUnit('1001'), sAUD, {
						from: account1,
					})
					// no reason cause it's from SafeMath.sub which has no reason string in our version
				);
			});

			describe('exchanging on behalf', async () => {
				const authoriser = account1;
				const delegate = account2;

				it('exchangeOnBehalf() cannot be invoked directly by any account via Exchanger', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: exchanger.exchangeOnBehalf,
						accounts,
						args: [authoriser, delegate, sUSD, toUnit('100'), sAUD],
						reason: 'Only synthetix or a synth contract can perform this action',
					});
				});

				describe('when not approved it should revert on', async () => {
					it('exchangeOnBehalf', async () => {
						await assert.revert(
							synthetix.exchangeOnBehalf(authoriser, sAUD, toUnit('1'), sUSD, { from: delegate })
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
						['System', 'Exchange', 'Synth'].forEach(section => {
							describe(`when ${section} is suspended`, () => {
								beforeEach(async () => {
									await setStatus({ owner, section, suspend: true, synth });
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
										await setStatus({ owner, section, suspend: false, synth });
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
								await setStatus({ owner, section: 'Synth', suspend: true, synth: sBTC });
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
							accounts,
							address: delegate,
							reason: 'Not approved to act on behalf',
						});
					});
					it('should exchangeOnBehalf and authoriser recieves the destSynth', async () => {
						// Exchange sUSD to sAUD
						await synthetix.exchangeOnBehalf(authoriser, sUSD, amountIssued, sAUD, {
							from: delegate,
						});

						// Get the exchange fee in USD
						const exchangeFeeUSD = await feePool.exchangeFeeIncurred(amountIssued);

						// how much sAUD the user is supposed to get
						const effectiveValue = await exchangeRates.effectiveValue(sUSD, amountIssued, sAUD);

						// chargeFee = true so we need to minus the fees for this exchange
						const effectiveValueMinusFees = await feePool.amountReceivedFromExchange(
							effectiveValue
						);

						// Assert we have the correct AUD value - exchange fee
						const sAUDBalance = await sAUDContract.balanceOf(authoriser);
						assert.bnEqual(effectiveValueMinusFees, sAUDBalance);

						// Assert we have the exchange fee to distribute
						const feePeriodZero = await feePool.recentFeePeriods(0);
						assert.bnEqual(exchangeFeeUSD, feePeriodZero.feesToDistribute);
					});
				});
			});
		});

		describe('when dealing with inverted synths', () => {
			let iBTCContract;
			beforeEach(async () => {
				iBTCContract = await Synth.at(await synthetix.synths(iBTC));
			});
			describe('when the iBTC synth is set with inverse pricing', () => {
				const iBTCEntryPoint = toUnit(4000);
				beforeEach(async () => {
					exchangeRates.setInversePricing(
						iBTC,
						iBTCEntryPoint,
						toUnit(6500),
						toUnit(1000),
						false,
						false,
						{
							from: owner,
						}
					);
				});
				describe('when a user holds holds 100,000 SNX', () => {
					beforeEach(async () => {
						await synthetix.transfer(account1, toUnit(1e5), {
							from: owner,
						});
					});

					describe('when a price within bounds for iBTC is received', () => {
						const iBTCPrice = toUnit(6000);
						beforeEach(async () => {
							await exchangeRates.updateRates([iBTC], [iBTCPrice], timestamp, {
								from: oracle,
							});
						});
						describe('when the user tries to mint 1% of their SNX value', () => {
							const amountIssued = toUnit(1e3);
							beforeEach(async () => {
								// Issue
								await synthetix.issueSynths(amountIssued, { from: account1 });
							});
							describe('when the user tries to exchange some sUSD into iBTC', () => {
								const assertExchangeSucceeded = async ({
									amountExchanged,
									txn,
									exchangeFeeRateMultiplier = 1,
									from = sUSD,
									to = iBTC,
									toContract = iBTCContract,
									prevBalance,
								}) => {
									// Note: this presumes balance was empty before the exchange - won't work when
									// exchanging into sUSD as there is an existing sUSD balance from minting
									const exchangeFeeRate = await feePool.exchangeFeeRate();
									const actualExchangeFee = multiplyDecimal(
										exchangeFeeRate,
										toUnit(exchangeFeeRateMultiplier)
									);
									const balance = await toContract.balanceOf(account1);
									const effectiveValue = await exchangeRates.effectiveValue(
										from,
										amountExchanged,
										to
									);
									const effectiveValueMinusFees = effectiveValue.sub(
										multiplyDecimal(effectiveValue, actualExchangeFee)
									);

									const balanceFromExchange = prevBalance ? balance.sub(prevBalance) : balance;

									assert.bnEqual(balanceFromExchange, effectiveValueMinusFees);

									// check logs
									const synthExchangeEvent = txn.logs.find(log => log.event === 'SynthExchange');

									assert.eventEqual(synthExchangeEvent, 'SynthExchange', {
										fromCurrencyKey: from,
										fromAmount: amountExchanged,
										toCurrencyKey: to,
										toAmount: effectiveValueMinusFees,
										toAddress: account1,
									});
								};
								let exchangeTxns;
								const amountExchanged = toUnit(1e2);
								beforeEach(async () => {
									exchangeTxns = [];
									exchangeTxns.push(
										await synthetix.exchange(sUSD, amountExchanged, iBTC, {
											from: account1,
										})
									);
								});
								it('then it exchanges correctly into iBTC', async () => {
									await assertExchangeSucceeded({
										amountExchanged,
										txn: exchangeTxns[0],
										from: sUSD,
										to: iBTC,
										toContract: iBTCContract,
									});
								});
								describe('when the user tries to exchange some iBTC into another synth', () => {
									const newAmountExchanged = toUnit(0.003); // current iBTC balance is a bit under 0.05

									beforeEach(async () => {
										fastForward(500); // fast forward through waiting period
										exchangeTxns.push(
											await synthetix.exchange(iBTC, newAmountExchanged, sAUD, {
												from: account1,
											})
										);
									});
									it('then it exchanges correctly out of iBTC', async () => {
										await assertExchangeSucceeded({
											amountExchanged: newAmountExchanged,
											txn: exchangeTxns[1],
											from: iBTC,
											to: sAUD,
											toContract: sAUDContract,
											exchangeFeeRateMultiplier: 1,
										});
									});

									describe('when a price outside of bounds for iBTC is received', () => {
										const newiBTCPrice = toUnit(7500);
										beforeEach(async () => {
											const newTimestamp = await currentTime();
											await exchangeRates.updateRates([iBTC], [newiBTCPrice], newTimestamp, {
												from: oracle,
											});
										});
										describe('when the user tries to exchange some iBTC again', () => {
											beforeEach(async () => {
												fastForward(500); // fast forward through waiting period

												exchangeTxns.push(
													await synthetix.exchange(iBTC, toUnit(0.001), sEUR, {
														from: account1,
													})
												);
											});
											it('then it still exchanges correctly into iBTC even when frozen', async () => {
												await assertExchangeSucceeded({
													amountExchanged: toUnit(0.001),
													txn: exchangeTxns[2],
													from: iBTC,
													to: sEUR,
													toContract: sEURContract,
													exchangeFeeRateMultiplier: 1,
												});
											});
										});
										describe('when the user tries to exchange iBTC into another synth', () => {
											beforeEach(async () => {
												fastForward(500); // fast forward through waiting period

												exchangeTxns.push(
													await synthetix.exchange(iBTC, newAmountExchanged, sEUR, {
														from: account1,
													})
												);
											});
											it('then it exchanges correctly out of iBTC, even while frozen', async () => {
												await assertExchangeSucceeded({
													amountExchanged: newAmountExchanged,
													txn: exchangeTxns[2],
													from: iBTC,
													to: sEUR,
													toContract: sEURContract,
													exchangeFeeRateMultiplier: 1,
												});
											});
										});
									});
								});
								describe('doubling of fees for swing trades', () => {
									const iBTCexchangeAmount = toUnit(0.002); // current iBTC balance is a bit under 0.05
									let txn;
									describe('when the user tries to exchange some short iBTC into long sBTC', () => {
										beforeEach(async () => {
											fastForward(500); // fast forward through waiting period

											txn = await synthetix.exchange(iBTC, iBTCexchangeAmount, sBTC, {
												from: account1,
											});
										});
										it('then it exchanges correctly from iBTC to sBTC, not doubling the fee', async () => {
											await assertExchangeSucceeded({
												amountExchanged: iBTCexchangeAmount,
												txn,
												exchangeFeeRateMultiplier: 1,
												from: iBTC,
												to: sBTC,
												toContract: sBTCContract,
											});
										});
										describe('when the user tries to exchange some short iBTC into sEUR', () => {
											beforeEach(async () => {
												fastForward(500); // fast forward through waiting period

												txn = await synthetix.exchange(iBTC, iBTCexchangeAmount, sEUR, {
													from: account1,
												});
											});
											it('then it exchanges correctly from iBTC to sEUR, not doubling the fee', async () => {
												await assertExchangeSucceeded({
													amountExchanged: iBTCexchangeAmount,
													txn,
													exchangeFeeRateMultiplier: 1,
													from: iBTC,
													to: sEUR,
													toContract: sEURContract,
												});
											});
											describe('when the user tries to exchange some sEUR for iBTC', () => {
												const sEURExchangeAmount = toUnit(0.001);
												let prevBalance;
												beforeEach(async () => {
													fastForward(500); // fast forward through waiting period

													prevBalance = await iBTCContract.balanceOf(account1);
													txn = await synthetix.exchange(sEUR, sEURExchangeAmount, iBTC, {
														from: account1,
													});
												});
												it('then it exchanges correctly from sEUR to iBTC, not doubling the fee', async () => {
													await assertExchangeSucceeded({
														amountExchanged: sEURExchangeAmount,
														txn,
														exchangeFeeRateMultiplier: 1,
														from: sEUR,
														to: iBTC,
														toContract: iBTCContract,
														prevBalance,
													});
												});
											});
										});
									});
									describe('when the user tries to exchange some short iBTC for sUSD', () => {
										let prevBalance;

										beforeEach(async () => {
											fastForward(500); // fast forward through waiting period

											prevBalance = await sUSDContract.balanceOf(account1);
											txn = await synthetix.exchange(iBTC, iBTCexchangeAmount, sUSD, {
												from: account1,
											});
										});
										it('then it exchanges correctly out of iBTC, with the regular fee', async () => {
											await assertExchangeSucceeded({
												amountExchanged: iBTCexchangeAmount,
												txn,
												from: iBTC,
												to: sUSD,
												toContract: sUSDContract,
												prevBalance,
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
