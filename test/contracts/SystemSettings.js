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
			expected: [
				'setWaitingPeriodSecs',
				'setPriceDeviationThresholdFactor',
				'setIssuanceRatio',
				'setTargetThreshold',
				'setFeePeriodDuration',
			],
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

	describe('setFeePeriodDuration()', () => {
		// Assert that we're starting with the state we expect
		const oneWeek = web3.utils.toBN(7 * 24 * 60 * 60);
		const twoWeeks = oneWeek.mul(web3.utils.toBN(2));
		it('only owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setFeePeriodDuration,
				args: [twoWeeks],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		describe('when updated by the owner', () => {
			let txn;
			beforeEach(async () => {
				txn = await systemSettings.setFeePeriodDuration(twoWeeks, {
					from: owner,
				});
			});
			it('then the value is set', async () => {
				assert.bnEqual(await systemSettings.feePeriodDuration(), twoWeeks);
			});

			it('and an event is emitted for that change', async () => {
				assert.eventEqual(txn, 'FeePeriodDurationUpdated', [twoWeeks]);
			});
		});

		it('reverts when setting the fee period duration below minimum', async () => {
			const minimum = await systemSettings.MIN_FEE_PERIOD_DURATION();

			// Owner should be able to set minimum
			const transaction = await systemSettings.setFeePeriodDuration(minimum, {
				from: owner,
			});

			assert.eventEqual(transaction, 'FeePeriodDurationUpdated', {
				newFeePeriodDuration: minimum,
			});
			assert.bnEqual(await systemSettings.feePeriodDuration(), minimum);

			// But no smaller
			await assert.revert(
				systemSettings.setFeePeriodDuration(minimum.sub(web3.utils.toBN(1)), {
					from: owner,
				}),
				'value < MIN_FEE_PERIOD_DURATION'
			);
		});

		it('should disallow the owner from setting the fee period duration above maximum', async () => {
			const maximum = await systemSettings.MAX_FEE_PERIOD_DURATION();

			// Owner should be able to set maximum
			const transaction = await systemSettings.setFeePeriodDuration(maximum, {
				from: owner,
			});

			assert.eventEqual(transaction, 'FeePeriodDurationUpdated', {
				newFeePeriodDuration: maximum,
			});
			assert.bnEqual(await systemSettings.feePeriodDuration(), maximum);

			// But no larger
			await assert.revert(
				systemSettings.setFeePeriodDuration(maximum.add(web3.utils.toBN(1)), {
					from: owner,
				}),
				'value > MAX_FEE_PERIOD_DURATION'
			);
		});
	});

	describe('setTargetThreshold()', () => {
		it('only owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setTargetThreshold,
				args: ['5'],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		describe('when updated by the owner', () => {
			let txn;
			const newThresholdPercent = '5';
			beforeEach(async () => {
				txn = await systemSettings.setTargetThreshold(newThresholdPercent, {
					from: owner,
				});
			});
			it('then the value is converted to a decimal representing the percentage', async () => {
				assert.bnEqual(await systemSettings.targetThreshold(), toUnit(newThresholdPercent / 100));
			});

			it('and an event is emitted for that change', async () => {
				assert.eventEqual(txn, 'TargetThresholdUpdated', [toUnit('0.05')]);
			});
		});

		it('reverts when owner set the Target threshold to negative', async () => {
			const thresholdPercent = -1;
			await assert.revert(
				systemSettings.setTargetThreshold(thresholdPercent, { from: owner }),
				'Threshold too high'
			);
		});
		it('reverts when owner set the Target threshold to above 50%', async () => {
			const thresholdPercent = 51;
			await assert.revert(
				systemSettings.setTargetThreshold(thresholdPercent, { from: owner }),
				'Threshold too high'
			);
		});
	});
});
