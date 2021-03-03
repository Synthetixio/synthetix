'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const { toBytes32 } = require('../..');
const { toUnit } = require('../utils')();
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { isBN } = require('web3-utils');

const ExchangeState = artifacts.require('ExchangeState');

contract('ExchangeState @ovm-skip', accounts => {
	const [
		deployerAccount,
		owner, // Oracle next, is not needed
		simulatedAssociatedContract,
		,
		account1,
		account2,
	] = accounts;
	const [sUSD, sBTC, sAUD] = ['sUSD', 'sBTC', 'sAUD'].map(toBytes32);

	let exchangeState;
	beforeEach(async () => {
		// the owner is the associated contract, so we can simulate
		exchangeState = await ExchangeState.new(owner, simulatedAssociatedContract, {
			from: deployerAccount,
		});
	});

	const addExchangeEntry = ({
		user = account1,
		src = sUSD,
		amount = toUnit('100'),
		dest = sBTC,
		amountReceived = toUnit('99'),
		exchangeFeeRate = toUnit('0.01'),
		timestamp = '0',
		roundIdForSrc = '0',
		roundIdForDest = '0',
	} = {}) =>
		exchangeState.appendExchangeEntry(
			user,
			src,
			amount,
			dest,
			amountReceived,
			exchangeFeeRate,
			timestamp,
			roundIdForSrc,
			roundIdForDest,
			{ from: simulatedAssociatedContract }
		);

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: ExchangeState.abi,
			ignoreParents: ['State'],
			expected: ['appendExchangeEntry', 'removeEntries', 'setMaxEntriesInQueue'],
		});
	});

	describe('setMaxEntriesInQueue()', () => {
		it('can only be invoked by the owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: exchangeState.setMaxEntriesInQueue,
				args: ['5'],
				address: owner,
				accounts,
			});
		});
		describe('when an owner invokes the function with 3', () => {
			beforeEach(async () => {
				await exchangeState.setMaxEntriesInQueue('3', { from: owner });
			});
			it('then 3 is the max number of entries possible', async () => {
				await addExchangeEntry();
				await addExchangeEntry();
				await addExchangeEntry();
				// after 3, the max has been reached
				await assert.revert(addExchangeEntry, 'Max queue length reached');
			});
		});
	});

	describe('adding, removing, selecting and length of entries', () => {
		it('the length is 0 by default', async () => {
			const length = await exchangeState.getLengthOfEntries(account1, sBTC);
			assert.equal(length, '0');
		});
		it('only the associated contract can invoke appendExchangeEntry()', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: exchangeState.appendExchangeEntry,
				args: [account1, sUSD, toUnit('1'), sBTC, toUnit('1'), toUnit('0.01'), '0', '0', '0'],
				address: simulatedAssociatedContract,
				accounts,
			});
		});
		it('only the associated contract can invoke removeEntries()', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: exchangeState.removeEntries,
				args: [account1, sUSD],
				address: simulatedAssociatedContract,
				accounts,
			});
		});
		describe('when an entry is added to sBTC for the first user', () => {
			let expectedFirstEntryAdded;
			beforeEach(async () => {
				expectedFirstEntryAdded = {
					user: account1,
					src: sAUD,
					amount: toUnit('50'),
					dest: sBTC,
					amountReceived: toUnit('40'),
					exchangeFeeRate: toUnit('0.01'),
					roundIdForSrc: '5',
					roundIdForDest: '10',
				};
				await addExchangeEntry(expectedFirstEntryAdded);
			});
			it('then the length is 1 for that user and synth', async () => {
				assert.equal((await exchangeState.getLengthOfEntries(account1, sBTC)).toString(), '1');
			});
			it('and the length is 0 for other conditions', async () => {
				assert.equal((await exchangeState.getLengthOfEntries(account1, sUSD)).toString(), '0');
				assert.equal((await exchangeState.getLengthOfEntries(account2, sBTC)).toString(), '0');
			});
			describe('when the entry is fetch by index 0', () => {
				let result;
				beforeEach(async () => {
					result = await exchangeState.getEntryAt(account1, sBTC, '0');
				});
				it('then it returns as expected', () => {
					Object.entries(expectedFirstEntryAdded)
						.filter(([key]) => key !== 'user') // user field not returned from request
						.forEach(([key, value]) => {
							assert[isBN(value) ? 'bnEqual' : 'equal'](result[key], value);
						});
				});
			});
			describe('when another entry is added for the same user and synth', () => {
				let expectedSecondEntryAdded;
				beforeEach(async () => {
					expectedSecondEntryAdded = {
						user: account1,
						src: sUSD,
						amount: toUnit('5'),
						dest: sBTC,
						amountReceived: toUnit('4'),
						exchangeFeeRate: toUnit('0.01'),
						roundIdForSrc: '3',
						roundIdForDest: '66',
					};
					await addExchangeEntry(expectedSecondEntryAdded);
				});
				it('then the length is 2 for that user and synth', async () => {
					assert.equal((await exchangeState.getLengthOfEntries(account1, sBTC)).toString(), '2');
				});
				describe('when the entry is fetch by index 0 again', () => {
					let result;
					beforeEach(async () => {
						result = await exchangeState.getEntryAt(account1, sBTC, '0');
					});
					it('then it returns as expected', () => {
						Object.entries(expectedFirstEntryAdded)
							.filter(([key]) => key !== 'user') // user field not returned from request
							.forEach(([key, value]) => {
								assert[isBN(value) ? 'bnEqual' : 'equal'](result[key], value);
							});
					});
				});
				describe('when the entry is fetch by index 1', () => {
					let result;
					beforeEach(async () => {
						result = await exchangeState.getEntryAt(account1, sBTC, '1');
					});
					it('then it returns the new entry as expected', () => {
						Object.entries(expectedSecondEntryAdded)
							.filter(([key]) => key !== 'user') // user field not returned from request
							.forEach(([key, value]) => {
								assert[isBN(value) ? 'bnEqual' : 'equal'](result[key], value);
							});
					});
				});
				describe('when all entries are removed for that user and synth', () => {
					beforeEach(async () => {
						await exchangeState.removeEntries(account1, sBTC, {
							from: simulatedAssociatedContract,
						});
					});
					it('then the length is 0 for that user and synth', async () => {
						assert.equal((await exchangeState.getLengthOfEntries(account1, sBTC)).toString(), '0');
					});
				});
			});
		});
	});

	describe('getMaxTimestamp()', () => {
		it('returns 0 when no entries', async () => {
			assert.equal((await exchangeState.getMaxTimestamp(account1, sAUD)).toString(), '0');
		});
		describe('when there is a single entry with timestamp 100', () => {
			beforeEach(async () => {
				await addExchangeEntry({ user: account1, dest: sAUD, timestamp: '100' });
			});
			it('then getMaxTimestamp() must return 100', async () => {
				assert.equal((await exchangeState.getMaxTimestamp(account1, sAUD)).toString(), '100');
			});
			describe('when there is another entry with a different src and with timestamp 101', () => {
				beforeEach(async () => {
					await addExchangeEntry({ user: account1, src: sBTC, dest: sAUD, timestamp: '101' });
				});
				it('then getMaxTimestamp() must return 101', async () => {
					assert.equal((await exchangeState.getMaxTimestamp(account1, sAUD)).toString(), '101');
				});
				describe('when there is a another entry with timestamp 50', () => {
					beforeEach(async () => {
						await addExchangeEntry({ user: account1, dest: sAUD, timestamp: '50' });
					});
					it('then getMaxTimestamp() must return 101', async () => {
						assert.equal((await exchangeState.getMaxTimestamp(account1, sAUD)).toString(), '101');
					});
					describe('when there are unrelated entries at higher timestamps than 101', () => {
						beforeEach(async () => {
							await addExchangeEntry({ user: account1, dest: sBTC, timestamp: '500' });
							await addExchangeEntry({ user: account2, dest: sAUD, timestamp: '600' });
						});
						it('then getMaxTimestamp() must still return 101', async () => {
							assert.equal((await exchangeState.getMaxTimestamp(account1, sAUD)).toString(), '101');
						});
					});
				});
			});
		});
	});
});
