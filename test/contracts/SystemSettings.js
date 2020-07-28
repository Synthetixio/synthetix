'use strict';

const { contract } = require('@nomiclabs/buidler');

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
			expected: ['setWaitingPeriodSecs', 'setPriceDeviationThresholdFactor'],
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
});
