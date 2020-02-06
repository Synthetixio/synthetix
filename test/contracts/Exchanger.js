require('.'); // import common test scaffolding

const abiDecoder = require('abi-decoder');

const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const Synth = artifacts.require('Synth');
const Exchanger = artifacts.require('Exchanger');
const AddressResolver = artifacts.require('AddressResolver');

const {
	currentTime,
	fastForward,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	ZERO_ADDRESS,
} = require('../utils/testUtils');

const { toBytes32 } = require('../..');

const bnCloseVariance = '30';
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
		sEURContract,
		oracle,
		timestamp,
		exchanger,
		addressResolver,
		exchangeFeeRate;

	// Helper function that can issue synths directly to a user without having to have them exchange anything
	const issueSynthsToUser = async ({ user, amount, synth }) => {
		// First override the resolver to make it seem the owner is the Synthetix contract
		await addressResolver.importAddresses(['Synthetix'].map(toBytes32), [owner], { from: owner });
		await synth.issue(user, amount, {
			from: owner,
		});
		await addressResolver.importAddresses(['Synthetix'].map(toBytes32), [synthetix.address], {
			from: owner,
		});
	};

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
		addressResolver = await AddressResolver.deployed();
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

		// set a 0.5% exchange fee rate (1/200)
		exchangeFeeRate = toUnit('0.005');
		await feePool.setExchangeFeeRate(exchangeFeeRate, {
			from: owner,
		});

		// give the first two accounts 1000 sUSD each
		await issueSynthsToUser({ user: account1, amount: toUnit('1000'), synth: sUSDContract });
		await issueSynthsToUser({ user: account2, amount: toUnit('1000'), synth: sUSDContract });
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
					timeIsClose(maxSecs, '90');
				});
				describe('and 89 seconds elapses', () => {
					beforeEach(async () => {
						fastForward(89);
					});
					describe('when settle() is called', () => {
						it('then it reverts', async () => {
							await assert.revert(synthetix.settle(sEUR, { from: account1 }));
						});
						it('and the maxSecsLeftInWaitingPeriod is close to 1', async () => {
							const maxSecs = await exchanger.maxSecsLeftInWaitingPeriod(account1, sEUR);
							timeIsClose(maxSecs, '1');
						});
					});
					describe('when a further two seconds elapse', () => {
						beforeEach(async () => {
							fastForward(2);
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
			doubleExchangeFeeRate = exchangeFeeRate.mul(web3.utils.toBN(2));
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

	const calculateExpectedSettlementAmount = ({ amount, oldRate, newRate }) => {
		const result = multiplyDecimal(
			multiplyDecimal(amount, toUnit('1').sub(exchangeFeeRate)),
			oldRate.sub(newRate)
		);

		return {
			reclaimAmount: result.isNeg() ? new web3.utils.BN(0) : result,
			rebateAmount: result.isNeg() ? result.abs() : new web3.utils.BN(0),
		};
	};

	const ensureTxnEmitsSettlementEvents = async ({ hash, synth, expected }) => {
		// Get receipt to collect all transaction events
		const receipt = await web3.eth.getTransactionReceipt(hash);

		// And add ABIs to fully decode them
		abiDecoder.addABI(synthetix.abi);
		abiDecoder.addABI(synth.abi);

		// Note: the truffle transaction does not return all events logged
		// (see https://github.com/trufflesuite/truffle/issues/555), so we
		// decode the logs with the ABIs we are using specifically and check
		// the output
		const logs = abiDecoder.decodeLogs(receipt.logs);

		const decodedEventEqual = ({ event, emittedFrom, args, log }) => {
			assert.equal(log.name, event);
			assert.equal(log.address, emittedFrom);
			args.forEach((arg, i) => {
				const { type, value } = log.events[i];
				if (type === 'address') {
					assert.equal(web3.utils.toChecksumAddress(value), arg);
				} else if (/^u?int/.test(type)) {
					assert.bnClose(new web3.utils.BN(value), arg, bnCloseVariance);
				} else {
					assert.equal(value, arg);
				}
			});
		};

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
		});

		decodedEventEqual({
			log: logs[1],
			event: isReclaim ? 'Burned' : 'Issued',
			emittedFrom: synthProxyAddress,
			args: [account1, expectedAmount],
		});

		decodedEventEqual({
			log: logs[2],
			event: `Exchange${isReclaim ? 'Reclaim' : 'Rebate'}`,
			emittedFrom: await synthetix.proxy(),
			args: [account1, currencyKey, expectedAmount],
		});
	};

	describe('settlement', () => {
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
						describe('when settlement is invoked', () => {
							it('then it reverts as the waiting period has not ended', async () => {
								await assert.revert(synthetix.settle(sEUR, { from: account1 }));
							});
						});
						describe('when another minute passes', () => {
							beforeEach(async () => {
								await fastForward(60);
							});
							describe('when settle() is invoked', () => {
								it('then it settles with a reclaim', async () => {
									const expected = calculateExpectedSettlementAmount({
										amount: amountOfSrcExchanged,
										oldRate: divideDecimal(1, 2),
										newRate: divideDecimal(1, 4),
									});
									const { tx: hash } = await synthetix.settle(sEUR, {
										from: account1,
									});
									await ensureTxnEmitsSettlementEvents({
										hash,
										synth: sEURContract,
										expected,
									});
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
								beforeEach(async () => {
									await fastForward(60);
								});
								describe('when settle() is invoked', () => {
									it('then it settles with a rebate', async () => {
										const expected = calculateExpectedSettlementAmount({
											amount: amountOfSrcExchanged,
											oldRate: divideDecimal(1, 2),
											newRate: divideDecimal(1, 1),
										});
										const { tx: hash } = await synthetix.settle(sEUR, {
											from: account1,
										});
										await ensureTxnEmitsSettlementEvents({
											hash,
											synth: sEURContract,
											expected,
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
							user: account1,
							amount: toUnit('1000'),
							synth: sEURContract,
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
