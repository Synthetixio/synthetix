'use strict';

const { contract, web3 } = require('@nomiclabs/buidler');

const { assert } = require('./common');

const { toUnit } = require('../utils')();

const { setupAllContracts } = require('./setup');

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

contract('SystemSettings', async accounts => {
	const [, owner] = accounts;

	let systemSettings;

	beforeEach(async () => {
		({ SystemSettings: systemSettings } = await setupAllContracts({
			accounts,
			contracts: ['SystemSettings'],
		}));
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: systemSettings.abi,
			ignoreParents: ['MixinResolver'],
			expected: ['setWaitingPeriodSecs', 'setPriceDeviationThresholdFactor', 'setIssuanceRatio'],
		});
	});

	describe('setWaitingPeriodSecs()', () => {
		it('only owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setWaitingPeriodSecs,
				args: ['60'],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});
		it('the owner can invoke and replace with emitted event', async () => {
			const newPeriod = '90';
			const txn = await systemSettings.setWaitingPeriodSecs(newPeriod, { from: owner });
			const actual = await systemSettings.waitingPeriodSecs();
			assert.equal(actual, newPeriod, 'Configured waiting period is set correctly');
			assert.eventEqual(txn, 'WaitingPeriodSecsUpdated', [newPeriod]);
		});
	});

	describe('setPriceDeviationThresholdFactor()', () => {
		it('only owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setPriceDeviationThresholdFactor,
				args: [toUnit('0.5')],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});
		it('the owner can update with emitted event', async () => {
			const newThreshold = toUnit('0.5');
			const txn = await systemSettings.setPriceDeviationThresholdFactor(newThreshold, {
				from: owner,
			});
			assert.bnEqual(await systemSettings.priceDeviationThresholdFactor(), newThreshold);
			assert.eventEqual(txn, 'PriceDeviationThresholdUpdated', [newThreshold]);
		});
		it('the default is factor 3', async () => {
			assert.bnEqual(await systemSettings.priceDeviationThresholdFactor(), toUnit('3'));
		});
	});

	describe('setIssuanceRatio()', () => {
		it('should allow the owner to set the issuance ratio', async () => {
			const ratio = toUnit('0.2');

			const transaction = await systemSettings.setIssuanceRatio(ratio, {
				from: owner,
			});

			assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: ratio });
		});

		it('should allow the owner to set the issuance ratio to zero', async () => {
			const ratio = web3.utils.toBN('0');

			const transaction = await systemSettings.setIssuanceRatio(ratio, {
				from: owner,
			});

			assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: ratio });
		});

		it('should disallow a non-owner from setting the issuance ratio', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setIssuanceRatio,
				args: [toUnit('0.1')],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should disallow setting the issuance ratio above the MAX ratio', async () => {
			const max = toUnit('1');

			// It should succeed when setting it to max
			const transaction = await systemSettings.setIssuanceRatio(max, {
				from: owner,
			});
			assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: max });

			// But max + 1 should fail
			await assert.revert(
				systemSettings.setIssuanceRatio(web3.utils.toBN(max).add(web3.utils.toBN('1')), {
					from: owner,
				}),
				'New issuance ratio cannot exceed MAX_ISSUANCE_RATIO'
			);
		});
	});
});
