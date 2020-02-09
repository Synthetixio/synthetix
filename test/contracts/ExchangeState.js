require('.'); // import common test scaffolding

const { toBytes32 } = require('../../.');
const { toUnit } = require('../utils/testUtils');
const { onlyGivenAddressCanInvoke } = require('../utils/setupUtils');

const ExchangeState = artifacts.require('ExchangeState');

contract('ExchangeState', accounts => {
	const [
		deployerAccount,
		owner, // Oracle next, is not needed
		simulatedAssociatedContract,
		,
		account1,
	] = accounts;
	const [sUSD, sBTC] = ['sUSD', 'sBTC'].map(toBytes32);

	let exchangeState;
	beforeEach(async () => {
		// the owner is the associated contract, so we can simulate
		exchangeState = await ExchangeState.new(owner, simulatedAssociatedContract, {
			from: deployerAccount,
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
		describe('when an owner invokes the function', () => {
			beforeEach(async () => {
				await exchangeState.setMaxEntriesInQueue('3', { from: owner });
			});
			it('then this number is the limit of entries possible', async () => {
				const addDummyEntry = () =>
					exchangeState.appendExchangeEntry(
						account1,
						sUSD,
						toUnit('100'),
						sBTC,
						toUnit('100'),
						'0',
						'0',
						'0',
						{ from: simulatedAssociatedContract }
					);
				await addDummyEntry();
				await addDummyEntry();
				await addDummyEntry();
				// after 3, the max has been reached
				await assert.revert(addDummyEntry, 'Max queue length reached');
			});
		});
	});

	describe('appendExchangeEntry()', () => {
		describe('when a non-associated contract tries to invoke', () => {
			it('then it reverts', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: exchangeState.appendExchangeEntry,
					args: [account1, sUSD, toUnit('1'), sBTC, toUnit('1'), '0', '0', '0'],
					address: simulatedAssociatedContract,
					accounts,
				});
			});
		});
	});
});
