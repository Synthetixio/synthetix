'use strict';

const { contract } = require('hardhat');

const { assert } = require('./common');

const { toUnit, divideDecimal, multiplyDecimal } = require('../utils')();

const { setupAllContracts } = require('./setup');

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../../');
const { toBN } = require('web3-utils');

contract('SystemSettings', async accounts => {
	const [, owner, account1] = accounts;
	const oneWeek = toBN(7 * 24 * 60 * 60);
	const ONE = toBN('1');

	let short, synths, systemSettings;

	const setupSettings = async () => {
		synths = ['sUSD', 'sBTC', 'sETH'];
		({ SystemSettings: systemSettings, CollateralShort: short } = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'FeePool',
				'AddressResolver',
				'Exchanger',
				'ExchangeRates',
				'SystemStatus',
				'Issuer',
				'DebtCache',
				'SystemSettings',
				'CollateralUtil',
				'CollateralShort',
				'CollateralManager',
				'CollateralManagerState',
			],
		}));
	};

	before(async () => {
		await setupSettings();
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: systemSettings.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'setAggregatorWarningFlags',
				'setAtomicEquivalentForDexPricing',
				'setAtomicExchangeFeeRate',
				'setAtomicMaxVolumePerBlock',
				'setAtomicPriceBuffer',
				'setAtomicTwapWindow',
				'setAtomicVolatilityConsiderationWindow',
				'setAtomicVolatilityUpdateThreshold',
				'setCollapseFeeRate',
				'setCrossDomainMessageGasLimit',
				'setDebtSnapshotStaleTime',
				'setEtherWrapperBurnFeeRate',
				'setEtherWrapperMaxETH',
				'setEtherWrapperMintFeeRate',
				'setExchangeFeeRateForSynths',
				'setFeePeriodDuration',
				'setInteractionDelay',
				'setIssuanceRatio',
				'setLiquidationDelay',
				'setLiquidationPenalty',
				'setLiquidationRatio',
				'setMinimumStakeTime',
				'setPriceDeviationThresholdFactor',
				'setRateStalePeriod',
				'setTargetThreshold',
				'setTradingRewardsEnabled',
				'setWaitingPeriodSecs',
				'setWrapperBurnFeeRate',
				'setWrapperMaxTokenAmount',
				'setWrapperMintFeeRate',
				'setExchangeDynamicFeeThreshold',
				'setExchangeDynamicFeeWeightDecay',
				'setExchangeDynamicFeeRounds',
				'setExchangeMaxDynamicFee',
			],
		});
	});

	it('ensure contract name method using the library return correct value', async () => {
		assert.equal(await systemSettings.CONTRACT_NAME(), toBytes32('SystemSettings'));
	});

	describe('setCrossDomainMessageGasLimit()', () => {
		it('only owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setCrossDomainMessageGasLimit,
				args: [0, 4e6],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});
		it('cannot exceed the maximum ovm gas limit', async () => {
			const newLimit = 8.000001e6;
			const gasLimitType = 0;
			await assert.revert(
				systemSettings.setCrossDomainMessageGasLimit(gasLimitType, newLimit, {
					from: owner,
				}),
				'Out of range xDomain gasLimit'
			);
		});
		it('cannot be set below the minimum ovm gas limit', async () => {
			const newLimit = 2e6;
			const gasLimitType = 1;
			await assert.revert(
				systemSettings.setCrossDomainMessageGasLimit(gasLimitType, newLimit, {
					from: owner,
				}),
				'Out of range xDomain gasLimit'
			);
		});

		function itCanSetCrossDomainGasLimitOfType({ gasLimitType }) {
			it(`the owner a crossDomainMessageGasLimit of type ${gasLimitType} with emitted event`, async () => {
				const newLimit = 4e6;
				const txn = await systemSettings.setCrossDomainMessageGasLimit(gasLimitType, newLimit, {
					from: owner,
				});
				const actual = await systemSettings.crossDomainMessageGasLimit(gasLimitType);
				assert.equal(actual, newLimit, 'Configured cross domain gas limit is set correctly');
				assert.eventEqual(txn, 'CrossDomainMessageGasLimitChanged', [gasLimitType, newLimit]);
			});
		}

		itCanSetCrossDomainGasLimitOfType({ gasLimitType: 0 });
		itCanSetCrossDomainGasLimitOfType({ gasLimitType: 1 });
		itCanSetCrossDomainGasLimitOfType({ gasLimitType: 2 });
		itCanSetCrossDomainGasLimitOfType({ gasLimitType: 3 });
		itCanSetCrossDomainGasLimitOfType({ gasLimitType: 4 });
	});

	describe('setTradingRewardsEnabled()', () => {
		it('only owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setTradingRewardsEnabled,
				args: [true],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});
		it('the owner can invoke and replace with emitted event', async () => {
			const enabled = true;
			const txn = await systemSettings.setTradingRewardsEnabled(enabled, { from: owner });
			const actual = await systemSettings.tradingRewardsEnabled();
			assert.equal(actual, enabled, 'Configured trading rewards enabled is set correctly');
			assert.eventEqual(txn, 'TradingRewardsEnabled', [enabled]);
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
			const ratio = toBN('0');

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
				systemSettings.setIssuanceRatio(toBN(max).add(toBN('1')), {
					from: owner,
				}),
				'New issuance ratio cannot exceed MAX_ISSUANCE_RATIO'
			);
		});
	});

	describe('setFeePeriodDuration()', () => {
		// Assert that we're starting with the state we expect
		const twoWeeks = oneWeek.mul(toBN('2'));
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
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const minimum = toBN('86400'); // 1 day

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
				systemSettings.setFeePeriodDuration(minimum.sub(toBN('1')), {
					from: owner,
				}),
				'value < MIN_FEE_PERIOD_DURATION'
			);
		});

		it('should disallow the owner from setting the fee period duration above maximum', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const maximum = toBN('5184000'); // 60 days

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
				systemSettings.setFeePeriodDuration(maximum.add(toBN('1')), {
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

		it('reverts when owner sets the Target threshold above the max allowed value', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const thresholdPercent = toBN('50').add(toBN('1'));
			await assert.revert(
				systemSettings.setTargetThreshold(thresholdPercent, { from: owner }),
				'Threshold too high'
			);
		});
	});

	describe('setCollapseFeeRate', async () => {
		describe('revert condtions', async () => {
			it('should fail if not called by the owner', async () => {
				await assert.revert(
					systemSettings.setCollapseFeeRate(short.address, toUnit(1), { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
		});
		describe('when it succeeds', async () => {
			beforeEach(async () => {
				await systemSettings.setCollapseFeeRate(short.address, toUnit(0.15), { from: owner });
			});
			it('should update the collapse service fee', async () => {
				assert.bnEqual(await systemSettings.collapseFeeRate(short.address), toUnit(0.15));
			});
			it('should allow the collapse fee rate to be 0', async () => {
				await systemSettings.setCollapseFeeRate(short.address, toUnit(0), { from: owner });
				assert.bnEqual(await systemSettings.collapseFeeRate(short.address), toUnit(0));
			});
		});
	});

	describe('setInteractionDelay', async () => {
		describe('revert condtions', async () => {
			it('should fail if not called by the owner', async () => {
				await assert.revert(
					systemSettings.setInteractionDelay(short.address, toUnit(1), { from: account1 }),
					'Only the contract owner may perform this action'
				);
			});
			it('should fail if the owner passes to big of a value', async () => {
				await assert.revert(
					systemSettings.setInteractionDelay(short.address, toUnit(3601), { from: owner }),
					'Max 1 hour'
				);
			});
		});
		describe('when it succeeds', async () => {
			beforeEach(async () => {
				await systemSettings.setInteractionDelay(short.address, toUnit(50), { from: owner });
			});
			it('should update the interaction delay', async () => {
				assert.bnEqual(await systemSettings.interactionDelay(short.address), toUnit(50));
			});
		});
	});

	describe('setLiquidationDelay()', () => {
		const day = 3600 * 24;

		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setLiquidationDelay,
				args: [oneWeek],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});
		it('when setLiquidationDelay is set to 0 then revert', async () => {
			await assert.revert(
				systemSettings.setLiquidationDelay(0, {
					from: owner,
				}),
				'Must be greater than 1 day'
			);
		});
		it('when setLiquidationDelay is set above 30 days then revert', async () => {
			await assert.revert(
				systemSettings.setLiquidationDelay(31 * day, {
					from: owner,
				}),
				'Must be less than 30 days'
			);
		});
		it('owner can set liquidationDelay to 1 day', async () => {
			await systemSettings.setLiquidationDelay(day, { from: owner });
			const liquidationDelay = await systemSettings.liquidationDelay();
			assert.bnEqual(liquidationDelay, day);
		});
		it('owner can set liquidationDelay to 30 days', async () => {
			await systemSettings.setLiquidationDelay(30 * day, { from: owner });
			const liquidationDelay = await systemSettings.liquidationDelay();
			assert.bnEqual(liquidationDelay, 30 * day);
		});
	});

	describe('setLiquidationRatio()', () => {
		before(async () => {
			await setupSettings();
		});
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setLiquidationRatio,
				args: [toUnit('.5')],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});
		describe('given liquidation penalty is 10%', () => {
			beforeEach(async () => {
				await systemSettings.setLiquidationPenalty(toUnit('0.1'), { from: owner });
			});
			it('owner can change liquidationRatio to 300%', async () => {
				const ratio = divideDecimal(toUnit('1'), toUnit('3'));
				await systemSettings.setLiquidationRatio(ratio, {
					from: owner,
				});
				assert.bnClose(await systemSettings.liquidationRatio(), ratio);
			});
			it('owner can change liquidationRatio to 200%', async () => {
				const ratio = toUnit('.5');
				await systemSettings.setLiquidationRatio(ratio, { from: owner });
				assert.bnEqual(await systemSettings.liquidationRatio(), ratio);
			});
			it('owner can change liquidationRatio up to 110%', async () => {
				const ratio = divideDecimal(toUnit('1'), toUnit('1.1'));
				await systemSettings.setLiquidationRatio(ratio, {
					from: owner,
				});
				assert.bnClose(await systemSettings.liquidationRatio(), ratio);
			});
			it('reverts when changing liquidationCollateralRatio to 109%', async () => {
				await assert.revert(
					systemSettings.setLiquidationRatio(divideDecimal(toUnit('1'), toUnit('1.09')), {
						from: owner,
					}),
					'liquidationRatio > MAX_LIQUIDATION_RATIO / (1 + penalty)'
				);
			});
			it('reverts when changing liquidationCollateralRatio to 100%', async () => {
				await assert.revert(
					systemSettings.setLiquidationRatio(toUnit('1'), { from: owner }),
					'liquidationRatio > MAX_LIQUIDATION_RATIO / (1 + penalty)'
				);
			});
			describe('minimum liquidation ratio - given issuanceRatio is 800% at 0.125', () => {
				let RATIO_FROM_TARGET_BUFFER;
				let MIN_LIQUIDATION_RATIO;
				let issuanceRatio;
				beforeEach(async () => {
					await systemSettings.setIssuanceRatio(toUnit('0.125'), { from: owner });

					issuanceRatio = await systemSettings.issuanceRatio();

					// Have to hardcode here due to public const not available in Solidity V5
					// https://ethereum.stackexchange.com/a/102633/33908
					RATIO_FROM_TARGET_BUFFER = toUnit('2');

					// min liquidation ratio is how much the collateral ratio can drop from the issuance ratio before liquidation's can be started.
					MIN_LIQUIDATION_RATIO = multiplyDecimal(RATIO_FROM_TARGET_BUFFER, issuanceRatio);
				});

				it('then MIN_LIQUIDATION_RATIO is equal double issuance ratio (400%)', () => {
					// minimum liquidation ratio should be 0.125 * 2 = 0.25 (CRatio 800% -> 400%)
					assert.bnEqual(RATIO_FROM_TARGET_BUFFER, toUnit('2'));
					assert.bnEqual(MIN_LIQUIDATION_RATIO, toUnit('0.25'));
				});

				it('when setLiquidationRatio is set above MAX_LIQUIDATION_RATIO then revert', async () => {
					// Have to hardcode here due to public const not available in Solidity V5
					// https://ethereum.stackexchange.com/a/102633/33908
					const MAX_LIQUIDATION_RATIO = toUnit('1');
					const newLiquidationRatio = MAX_LIQUIDATION_RATIO.add(toUnit('1'));

					await assert.revert(
						systemSettings.setLiquidationRatio(newLiquidationRatio, {
							from: owner,
						}),
						'liquidationRatio > MAX_LIQUIDATION_RATIO'
					);
				});
				it('when owner sets liquidationCollateralRatio below the MIN_LIQUIDATION_RATIO, then should revert', async () => {
					await assert.revert(
						systemSettings.setLiquidationRatio(MIN_LIQUIDATION_RATIO.sub(toUnit('.1')), {
							from: owner,
						}),
						'liquidationRatio < MIN_LIQUIDATION_RATIO'
					);
				});

				it('when owner sets liquidationCollateralRatio above the MIN_LIQUIDATION_RATIO, then it should be allowed', async () => {
					const expectedLiquidationRatio = MIN_LIQUIDATION_RATIO.add(toUnit('.1'));
					await systemSettings.setLiquidationRatio(expectedLiquidationRatio, {
						from: owner,
					});

					assert.bnEqual(await systemSettings.liquidationRatio(), expectedLiquidationRatio);
				});
				it('when owner sets liquidationCollateralRatio equal to MIN_LIQUIDATION_RATIO, then it should be allowed', async () => {
					const expectedLiquidationRatio = MIN_LIQUIDATION_RATIO;
					await systemSettings.setLiquidationRatio(expectedLiquidationRatio, {
						from: owner,
					});
					assert.bnEqual(await systemSettings.liquidationRatio(), expectedLiquidationRatio);
				});
			});
		});
	});

	describe('setLiquidationPenalty()', () => {
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setLiquidationPenalty,
				args: [toUnit('.1')],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('when setLiquidationPenalty is set above MAX_LIQUIDATION_PENALTY then revert', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const MAX_LIQUIDATION_PENALTY = toUnit('0.25');
			const newLiquidationPenalty = MAX_LIQUIDATION_PENALTY.add(toUnit('1'));
			await assert.revert(
				systemSettings.setLiquidationPenalty(newLiquidationPenalty, {
					from: owner,
				}),
				'penalty > MAX_LIQUIDATION_PENALTY'
			);
		});

		it('owner can set liquidationPenalty to 25%', async () => {
			await systemSettings.setLiquidationPenalty(toUnit('.25'), { from: owner });
			assert.bnEqual(await systemSettings.liquidationPenalty(), toUnit('.25'));
		});
		it('owner can set liquidationPenalty to 1%', async () => {
			await systemSettings.setLiquidationPenalty(toUnit('.01'), { from: owner });
			assert.bnEqual(await systemSettings.liquidationPenalty(), toUnit('.01'));
		});
		it('owner can set liquidationPenalty to 0%', async () => {
			await systemSettings.setLiquidationPenalty(toUnit('0'), { from: owner });
			assert.bnEqual(await systemSettings.liquidationPenalty(), toUnit('0'));
		});
	});

	describe('liquidations constants', () => {
		it('MAX_LIQUIDATION_RATIO is 100%', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const MAX_LIQUIDATION_RATIO = toUnit('1');
			assert.bnEqual(MAX_LIQUIDATION_RATIO, toUnit('1'));
		});
		it('MAX_LIQUIDATION_PENALTY is 25%', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const MAX_LIQUIDATION_PENALTY = toUnit('0.25');
			assert.bnEqual(MAX_LIQUIDATION_PENALTY, toUnit('.25'));
		});
	});

	describe('setRateStalePeriod()', () => {
		it('should be able to change the rate stale period', async () => {
			const rateStalePeriod = 2010 * 2 * 60;

			const originalRateStalePeriod = await systemSettings.rateStalePeriod.call();
			await systemSettings.setRateStalePeriod(rateStalePeriod, { from: owner });
			const newRateStalePeriod = await systemSettings.rateStalePeriod.call();
			assert.equal(newRateStalePeriod, rateStalePeriod);
			assert.notEqual(newRateStalePeriod, originalRateStalePeriod);
		});

		it('only owner is permitted to change the rate stale period', async () => {
			const rateStalePeriod = 2010 * 2 * 60;

			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setRateStalePeriod,
				args: [rateStalePeriod.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should emit event on successful rate stale period change', async () => {
			const rateStalePeriod = 2010 * 2 * 60;

			// Ensure oracle is set to oracle address originally
			const txn = await systemSettings.setRateStalePeriod(rateStalePeriod, { from: owner });
			assert.eventEqual(txn, 'RateStalePeriodUpdated', {
				rateStalePeriod,
			});
		});
	});

	describe('setDebtSnapshotStaleTime()', () => {
		it('should be able to change the debt snapshot stale time', async () => {
			const staleTime = 2010 * 2 * 60;

			const originalStaleTime = await systemSettings.debtSnapshotStaleTime.call();
			await systemSettings.setDebtSnapshotStaleTime(staleTime, { from: owner });
			const newStaleTime = await systemSettings.debtSnapshotStaleTime.call();
			assert.equal(newStaleTime, staleTime);
			assert.notEqual(newStaleTime, originalStaleTime);
		});

		it('only owner is permitted to change the debt snapshot stale time', async () => {
			const staleTime = 2010 * 2 * 60;

			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setDebtSnapshotStaleTime,
				args: [staleTime.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should emit event on successful rate stale period change', async () => {
			const staleTime = 2010 * 2 * 60;

			// Ensure oracle is set to oracle address originally
			const txn = await systemSettings.setDebtSnapshotStaleTime(staleTime, { from: owner });
			assert.eventEqual(txn, 'DebtSnapshotStaleTimeUpdated', {
				debtSnapshotStaleTime: staleTime,
			});
		});
	});

	describe('setExchangeFeeRateForSynths()', () => {
		describe('Given synth exchange fee rates to set', async () => {
			const [sUSD, sETH, sAUD, sBTC] = ['sUSD', 'sETH', 'sAUD', 'sBTC'].map(toBytes32);
			const fxBIPS = toUnit('0.01');
			const cryptoBIPS = toUnit('0.03');

			it('when a non owner calls then revert', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: systemSettings.setExchangeFeeRateForSynths,
					args: [[sUSD], [toUnit('0.1')]],
					accounts,
					address: owner,
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('when input array lengths dont match then revert ', async () => {
				await assert.revert(
					systemSettings.setExchangeFeeRateForSynths([sUSD, sAUD], [toUnit('0.1')], {
						from: owner,
					}),
					'Array lengths dont match'
				);
			});
			it('when owner sets an exchange fee rate larger than MAX_EXCHANGE_FEE_RATE then revert', async () => {
				await assert.revert(
					systemSettings.setExchangeFeeRateForSynths([sUSD], [toUnit('11')], {
						from: owner,
					}),
					'MAX_EXCHANGE_FEE_RATE exceeded'
				);
			});

			describe('Given new synth exchange fee rates to store', async () => {
				it('when 1 exchange rate then store it to be readable', async () => {
					await systemSettings.setExchangeFeeRateForSynths([sUSD], [fxBIPS], {
						from: owner,
					});
					let sUSDRate = await systemSettings.exchangeFeeRate(sUSD);
					assert.bnEqual(sUSDRate, fxBIPS);

					sUSDRate = await systemSettings.exchangeFeeRate(sUSD);
					assert.bnEqual(sUSDRate, fxBIPS);
				});
				it('when 1 exchange rate then emits update event', async () => {
					const transaction = await systemSettings.setExchangeFeeRateForSynths([sUSD], [fxBIPS], {
						from: owner,
					});
					assert.eventEqual(transaction, 'ExchangeFeeUpdated', {
						synthKey: sUSD,
						newExchangeFeeRate: fxBIPS,
					});
				});
				it('when multiple exchange rates then store them to be readable', async () => {
					// Store multiple rates
					await systemSettings.setExchangeFeeRateForSynths(
						[sUSD, sAUD, sBTC, sETH],
						[fxBIPS, fxBIPS, cryptoBIPS, cryptoBIPS],
						{
							from: owner,
						}
					);
					// Read all rates
					const sAUDRate = await systemSettings.exchangeFeeRate(sAUD);
					assert.bnEqual(sAUDRate, fxBIPS);
					const sUSDRate = await systemSettings.exchangeFeeRate(sUSD);
					assert.bnEqual(sUSDRate, fxBIPS);
					const sBTCRate = await systemSettings.exchangeFeeRate(sBTC);
					assert.bnEqual(sBTCRate, cryptoBIPS);
					const sETHRate = await systemSettings.exchangeFeeRate(sETH);
					assert.bnEqual(sETHRate, cryptoBIPS);
				});
				it('when multiple exchange rates then each update event is emitted', async () => {
					// Update multiple rates
					const transaction = await systemSettings.setExchangeFeeRateForSynths(
						[sUSD, sAUD, sBTC, sETH],
						[fxBIPS, fxBIPS, cryptoBIPS, cryptoBIPS],
						{
							from: owner,
						}
					);
					// Emit multiple update events
					assert.eventsEqual(
						transaction,
						'ExchangeFeeUpdated',
						{
							synthKey: sUSD,
							newExchangeFeeRate: fxBIPS,
						},
						'ExchangeFeeUpdated',
						{
							synthKey: sAUD,
							newExchangeFeeRate: fxBIPS,
						},
						'ExchangeFeeUpdated',
						{
							synthKey: sBTC,
							newExchangeFeeRate: cryptoBIPS,
						},
						'ExchangeFeeUpdated',
						{
							synthKey: sETH,
							newExchangeFeeRate: cryptoBIPS,
						}
					);
				});
			});
		});
	});

	describe('setMinimumStakeTime()', () => {
		const week = 604800;
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setMinimumStakeTime,
				args: [1],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if setMinimumStakeTime > than 1 week', async () => {
			await assert.revert(
				systemSettings.setMinimumStakeTime(week + 1, { from: owner }),
				'stake time exceed maximum 1 week'
			);
		});

		it('should allow setMinimumStakeTime less than equal 1 week', async () => {
			for (const amount of [week / 14, week / 7, week]) {
				await systemSettings.setMinimumStakeTime(amount, { from: owner });
				assert.bnEqual(await systemSettings.minimumStakeTime(), amount.toString());
			}
		});

		it('setting minimum stake time emits the correct event', async () => {
			const txn = await systemSettings.setMinimumStakeTime('1000', { from: owner });
			assert.eventEqual(txn, 'MinimumStakeTimeUpdated', ['1000']);
		});
	});

	describe('setAggregatorWarningFlags()', () => {
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setAggregatorWarningFlags,
				args: [owner],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if given the zero address', async () => {
			await assert.revert(
				systemSettings.setAggregatorWarningFlags(ZERO_ADDRESS, { from: owner }),
				'Valid address must be given'
			);
		});

		describe('when successfully invoked', () => {
			let txn;
			beforeEach(async () => {
				txn = await systemSettings.setAggregatorWarningFlags(owner, { from: owner });
			});
			it('then it changes the value as expected', async () => {
				assert.equal(await systemSettings.aggregatorWarningFlags(), owner);
			});

			it('and emits an AggregatorWarningFlagsUpdated event', async () => {
				assert.eventEqual(txn, 'AggregatorWarningFlagsUpdated', [owner]);
			});
		});
	});

	describe('setEtherWrapperMaxETH()', () => {
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setEtherWrapperMaxETH,
				args: [owner],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		describe('when successfully invoked', () => {
			let txn;
			const newValue = toUnit('6000');
			beforeEach(async () => {
				txn = await systemSettings.setEtherWrapperMaxETH(newValue, { from: owner });
			});
			it('then it changes the value as expected', async () => {
				assert.bnEqual(await systemSettings.etherWrapperMaxETH(), newValue);
			});

			it('and emits an EtherWrapperMaxETHUpdated event', async () => {
				assert.eventEqual(txn, 'EtherWrapperMaxETHUpdated', [newValue]);
			});
		});
	});

	describe('setEtherWrapperMintFeeRate()', () => {
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setEtherWrapperMintFeeRate,
				args: [1],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if the rate exceeds MAX_WRAPPER_MINT_FEE_RATE', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const newValue = toUnit('1').add(ONE);
			await assert.revert(
				systemSettings.setEtherWrapperMintFeeRate(newValue, { from: owner }),
				'rate > MAX_WRAPPER_MINT_FEE_RATE'
			);
		});

		describe('when successfully invoked', () => {
			let txn;
			const newValue = toUnit('0.06');
			beforeEach(async () => {
				txn = await systemSettings.setEtherWrapperMintFeeRate(newValue, { from: owner });
			});
			it('then it changes the value as expected', async () => {
				assert.bnEqual(await systemSettings.etherWrapperMintFeeRate(), newValue);
			});

			it('and emits an EtherWrapperMintFeeRateUpdated event', async () => {
				assert.eventEqual(txn, 'EtherWrapperMintFeeRateUpdated', [newValue]);
			});
		});
	});

	describe('setEtherWrapperBurnFeeRate()', () => {
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setEtherWrapperBurnFeeRate,
				args: [1],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if the rate exceeds MAX_WRAPPER_BURN_FEE_RATE', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const newValue = toUnit('1').add(ONE);
			await assert.revert(
				systemSettings.setEtherWrapperBurnFeeRate(newValue, { from: owner }),
				'rate > MAX_WRAPPER_BURN_FEE_RATE'
			);
		});

		describe('when successfully invoked', () => {
			let txn;
			const newValue = toUnit('0.06');
			beforeEach(async () => {
				txn = await systemSettings.setEtherWrapperBurnFeeRate(newValue, { from: owner });
			});
			it('then it changes the value as expected', async () => {
				assert.bnEqual(await systemSettings.etherWrapperBurnFeeRate(), newValue);
			});

			it('and emits an EtherWrapperBurnFeeRateUpdated event', async () => {
				assert.eventEqual(txn, 'EtherWrapperBurnFeeRateUpdated', [newValue]);
			});
		});
	});

	describe('setAtomicMaxVolumePerBlock', () => {
		const limit = toUnit('1000000');
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setAtomicMaxVolumePerBlock,
				args: [limit],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if limit exceeds uint192', async () => {
			const aboveUint192 = toBN('2').pow(toBN('192'));
			await assert.revert(
				systemSettings.setAtomicMaxVolumePerBlock(aboveUint192, { from: owner }),
				'Atomic max volume exceed maximum uint192'
			);
		});

		describe('when successfully invoked', () => {
			let txn;
			beforeEach(async () => {
				txn = await systemSettings.setAtomicMaxVolumePerBlock(limit, { from: owner });
			});

			it('then it changes the value as expected', async () => {
				assert.bnEqual(await systemSettings.atomicMaxVolumePerBlock(), limit);
			});

			it('and emits an AtomicMaxVolumePerBlockUpdated event', async () => {
				assert.eventEqual(txn, 'AtomicMaxVolumePerBlockUpdated', [limit]);
			});

			it('allows to be changed', async () => {
				const newLimit = limit.mul(toBN('2'));
				await systemSettings.setAtomicMaxVolumePerBlock(newLimit, { from: owner });
				assert.bnEqual(await systemSettings.atomicMaxVolumePerBlock(), newLimit);
			});

			it('allows to be reset to zero', async () => {
				await systemSettings.setAtomicMaxVolumePerBlock(0, { from: owner });
				assert.bnEqual(await systemSettings.atomicMaxVolumePerBlock(), 0);
			});
		});
	});

	describe('setAtomicTwapWindow', () => {
		const twapWindow = toBN('3600'); // 1 hour
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setAtomicTwapWindow,
				args: [twapWindow],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if window is below minimum', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const minimum = toBN('60');
			await assert.revert(
				systemSettings.setAtomicTwapWindow(minimum.sub(toBN('1')), { from: owner }),
				'Atomic twap window under minimum 1 min'
			);
		});

		it('should revert if window is above maximum', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const maximum = toBN('86400');
			await assert.revert(
				systemSettings.setAtomicTwapWindow(maximum.add(toBN('1')), { from: owner }),
				'Atomic twap window exceed maximum 1 day'
			);
		});

		describe('when successfully invoked', () => {
			let txn;
			beforeEach(async () => {
				txn = await systemSettings.setAtomicTwapWindow(twapWindow, { from: owner });
			});

			it('then it changes the value as expected', async () => {
				assert.bnEqual(await systemSettings.atomicTwapWindow(), twapWindow);
			});

			it('and emits an AtomicTwapWindowUpdated event', async () => {
				assert.eventEqual(txn, 'AtomicTwapWindowUpdated', [twapWindow]);
			});

			it('allows to be changed', async () => {
				const newTwapWindow = twapWindow.add(toBN('1'));
				await systemSettings.setAtomicTwapWindow(newTwapWindow, { from: owner });
				assert.bnEqual(await systemSettings.atomicTwapWindow(), newTwapWindow);
			});
		});
	});

	describe('setAtomicEquivalentForDexPricing', () => {
		const sETH = toBytes32('sETH');
		const [equivalentAsset, secondEquivalentAsset] = accounts.slice(accounts.length - 2);
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setAtomicEquivalentForDexPricing,
				args: [sETH, equivalentAsset],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		describe('when successfully invoked', () => {
			let txn;
			beforeEach(async () => {
				txn = await systemSettings.setAtomicEquivalentForDexPricing(sETH, equivalentAsset, {
					from: owner,
				});
			});

			it('then it changes the value as expected', async () => {
				assert.equal(await systemSettings.atomicEquivalentForDexPricing(sETH), equivalentAsset);
			});

			it('and emits an AtomicEquivalentForDexPricingUpdated event', async () => {
				assert.eventEqual(txn, 'AtomicEquivalentForDexPricingUpdated', [sETH, equivalentAsset]);
			});

			it('allows equivalent to be changed', async () => {
				await systemSettings.setAtomicEquivalentForDexPricing(sETH, secondEquivalentAsset, {
					from: owner,
				});
				assert.equal(
					await systemSettings.atomicEquivalentForDexPricing(sETH),
					secondEquivalentAsset
				);
			});

			it('cannot be set to 0 address', async () => {
				await assert.revert(
					systemSettings.setAtomicEquivalentForDexPricing(sETH, ZERO_ADDRESS, { from: owner }),
					'Atomic equivalent is 0 address'
				);
			});

			it('allows to be reset', async () => {
				// using account1 (although it's EOA) for simplicity
				await systemSettings.setAtomicEquivalentForDexPricing(sETH, account1, { from: owner });
				assert.equal(await systemSettings.atomicEquivalentForDexPricing(sETH), account1);
			});
		});
	});

	describe('setAtomicExchangeFeeRate', () => {
		const sETH = toBytes32('sETH');
		const feeBips = toUnit('0.03');
		const secondFeeBips = toUnit('0.05');
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setAtomicExchangeFeeRate,
				args: [sETH, feeBips],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if fee is above maximum', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const maximum = toUnit('0.1');
			await assert.revert(
				systemSettings.setAtomicExchangeFeeRate(sETH, maximum.add(toBN('1')), { from: owner }),
				'MAX_EXCHANGE_FEE_RATE exceeded'
			);
		});

		describe('when successfully invoked', () => {
			let txn;
			beforeEach(async () => {
				txn = await systemSettings.setAtomicExchangeFeeRate(sETH, feeBips, {
					from: owner,
				});
			});

			it('then it changes the value as expected', async () => {
				assert.bnEqual(await systemSettings.atomicExchangeFeeRate(sETH), feeBips);
			});

			it('and emits an AtomicExchangeFeeUpdated event', async () => {
				assert.eventEqual(txn, 'AtomicExchangeFeeUpdated', [sETH, feeBips]);
			});

			it('allows fee to be changed', async () => {
				await systemSettings.setAtomicExchangeFeeRate(sETH, secondFeeBips, {
					from: owner,
				});
				assert.bnEqual(await systemSettings.atomicExchangeFeeRate(sETH), secondFeeBips);
			});

			it('allows to be reset', async () => {
				await systemSettings.setAtomicExchangeFeeRate(sETH, 0, { from: owner });
				assert.bnEqual(await systemSettings.atomicExchangeFeeRate(sETH), 0);
			});
		});
	});

	describe('setAtomicPriceBuffer', () => {
		const sETH = toBytes32('sETH');
		const buffer = toUnit('0.5');
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setAtomicPriceBuffer,
				args: [sETH, buffer],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		describe('when successfully invoked', () => {
			let txn;
			beforeEach(async () => {
				txn = await systemSettings.setAtomicPriceBuffer(sETH, buffer, { from: owner });
			});

			it('then it changes the value as expected', async () => {
				assert.bnEqual(await systemSettings.atomicPriceBuffer(sETH), buffer);
			});

			it('and emits an AtomicPriceBufferUpdated event', async () => {
				assert.eventEqual(txn, 'AtomicPriceBufferUpdated', [sETH, buffer]);
			});

			it('allows to be changed', async () => {
				const newBuffer = buffer.div(toBN('2'));
				await systemSettings.setAtomicPriceBuffer(sETH, newBuffer, { from: owner });
				assert.bnEqual(await systemSettings.atomicPriceBuffer(sETH), newBuffer);
			});

			it('allows to be reset to zero', async () => {
				await systemSettings.setAtomicPriceBuffer(sETH, 0, { from: owner });
				assert.bnEqual(await systemSettings.atomicPriceBuffer(sETH), 0);
			});
		});
	});

	describe('setAtomicVolatilityConsiderationWindow', () => {
		const sETH = toBytes32('sETH');
		const considerationWindow = toBN('600'); // 10 min
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setAtomicVolatilityConsiderationWindow,
				args: [sETH, considerationWindow],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if window is below minimum', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const minimum = toBN('60');
			await assert.revert(
				systemSettings.setAtomicVolatilityConsiderationWindow(sETH, minimum.sub(toBN('1')), {
					from: owner,
				}),
				'Atomic volatility consideration window under minimum 1 min'
			);
		});

		it('should revert if window is above maximum', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const maximum = toBN('86400');
			await assert.revert(
				systemSettings.setAtomicVolatilityConsiderationWindow(sETH, maximum.add(toBN('1')), {
					from: owner,
				}),
				'Atomic volatility consideration window exceed maximum 1 day'
			);
		});

		describe('when successfully invoked', () => {
			let txn;
			beforeEach(async () => {
				txn = await systemSettings.setAtomicVolatilityConsiderationWindow(
					sETH,
					considerationWindow,
					{
						from: owner,
					}
				);
			});

			it('then it changes the value as expected', async () => {
				assert.bnEqual(
					await systemSettings.atomicVolatilityConsiderationWindow(sETH),
					considerationWindow
				);
			});

			it('and emits a AtomicVolatilityConsiderationWindowUpdated event', async () => {
				assert.eventEqual(txn, 'AtomicVolatilityConsiderationWindowUpdated', [
					sETH,
					considerationWindow,
				]);
			});

			it('allows to be changed', async () => {
				const newConsiderationWindow = considerationWindow.add(toBN('1'));
				await systemSettings.setAtomicVolatilityConsiderationWindow(sETH, newConsiderationWindow, {
					from: owner,
				});
				assert.bnEqual(
					await systemSettings.atomicVolatilityConsiderationWindow(sETH),
					newConsiderationWindow
				);
			});

			it('allows to be reset to zero', async () => {
				await systemSettings.setAtomicVolatilityConsiderationWindow(sETH, 0, { from: owner });
				assert.bnEqual(await systemSettings.atomicVolatilityConsiderationWindow(sETH), 0);
			});
		});
	});

	describe('setAtomicVolatilityUpdateThreshold', () => {
		const sETH = toBytes32('sETH');
		const threshold = toBN('3');
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setAtomicVolatilityUpdateThreshold,
				args: [sETH, threshold],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		describe('when successfully invoked', () => {
			let txn;
			beforeEach(async () => {
				txn = await systemSettings.setAtomicVolatilityUpdateThreshold(sETH, threshold, {
					from: owner,
				});
			});

			it('then it changes the value as expected', async () => {
				assert.bnEqual(await systemSettings.atomicVolatilityUpdateThreshold(sETH), threshold);
			});

			it('and emits an AtomicVolatilityUpdateThresholdUpdated event', async () => {
				assert.eventEqual(txn, 'AtomicVolatilityUpdateThresholdUpdated', [sETH, threshold]);
			});

			it('allows to be changed', async () => {
				const newThreshold = threshold.add(ONE);
				await systemSettings.setAtomicVolatilityUpdateThreshold(sETH, newThreshold, {
					from: owner,
				});
				assert.bnEqual(await systemSettings.atomicVolatilityUpdateThreshold(sETH), newThreshold);
			});

			it('allows to be reset to zero', async () => {
				await systemSettings.setAtomicVolatilityUpdateThreshold(sETH, 0, { from: owner });
				assert.bnEqual(await systemSettings.atomicVolatilityUpdateThreshold(sETH), 0);
			});
		});
	});

	const testWrapperAddress = ZERO_ADDRESS;

	describe('setWrapperMaxTokenAmount()', () => {
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setWrapperMaxTokenAmount,
				args: [testWrapperAddress, 1],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		describe('when successfully invoked', () => {
			let txn;
			const newValue = toUnit('6000');
			beforeEach(async () => {
				txn = await systemSettings.setWrapperMaxTokenAmount(testWrapperAddress, newValue, {
					from: owner,
				});
			});
			it('then it changes the value as expected', async () => {
				assert.bnEqual(await systemSettings.wrapperMaxTokenAmount(testWrapperAddress), newValue);
			});
			it('does not change value for different address', async () => {
				assert.bnEqual(await systemSettings.wrapperMaxTokenAmount(systemSettings.address), 0);
			});
			it('and emits a WrapperMaxTokenAmountUpdated event', async () => {
				assert.eventEqual(txn, 'WrapperMaxTokenAmountUpdated', [testWrapperAddress, newValue]);
			});
		});
	});

	describe('setWrapperMintFeeRate()', () => {
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setWrapperMintFeeRate,
				args: [testWrapperAddress, 1],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if the rate exceeds MAX_WRAPPER_MINT_FEE_RATE', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const newValue = toUnit('1').add(ONE);
			await assert.revert(
				systemSettings.setWrapperMintFeeRate(testWrapperAddress, newValue, { from: owner }),
				'rate > MAX_WRAPPER_MINT_FEE_RATE'
			);
		});

		it('should revert if the fee is negative and burn fee is not at least positive and greater in magnitude', async () => {
			const newValue = toUnit('-0.06');
			await assert.revert(
				systemSettings.setWrapperMintFeeRate(testWrapperAddress, newValue, { from: owner }),
				'-rate > wrapperBurnFeeRate'
			);
		});

		describe('when successfully invoked', () => {
			let txn;
			const newValue = toUnit('-0.02');
			beforeEach(async () => {
				await systemSettings.setWrapperBurnFeeRate(
					testWrapperAddress,
					newValue.mul(toBN(2)).neg(),
					{
						from: owner,
					}
				);

				txn = await systemSettings.setWrapperMintFeeRate(testWrapperAddress, newValue, {
					from: owner,
				});
			});
			it('then it changes the value as expected', async () => {
				assert.bnEqual(await systemSettings.wrapperMintFeeRate(testWrapperAddress), newValue);
			});
			it('does not change value for different address', async () => {
				assert.bnEqual(await systemSettings.wrapperMintFeeRate(systemSettings.address), 0);
			});
			it('and emits an WrapperMintFeeRateUpdated event', async () => {
				assert.eventEqual(txn, 'WrapperMintFeeRateUpdated', [testWrapperAddress, newValue]);
			});
		});
	});

	describe('setWrapperBurnFeeRate()', () => {
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setWrapperBurnFeeRate,
				args: [testWrapperAddress, 1],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});
		it('should revert if the rate exceeds MAX_WRAPPER_BURN_FEE_RATE', async () => {
			// Have to hardcode here due to public const not available in Solidity V5
			// https://ethereum.stackexchange.com/a/102633/33908
			const newValue = toUnit('1').add(ONE);
			await assert.revert(
				systemSettings.setWrapperBurnFeeRate(testWrapperAddress, newValue, { from: owner }),
				'rate > MAX_WRAPPER_BURN_FEE_RATE'
			);
		});

		it('should revert if the fee is negative and burn fee is not at least positive and greater in magnitude', async () => {
			const newValue = toUnit('-0.06');
			await assert.revert(
				systemSettings.setWrapperBurnFeeRate(testWrapperAddress, newValue, { from: owner }),
				'-rate > wrapperMintFeeRate'
			);
		});

		describe('when successfully invoked', () => {
			let txn;
			const newValue = toUnit('-0.02');
			beforeEach(async () => {
				await systemSettings.setWrapperMintFeeRate(
					testWrapperAddress,
					newValue.mul(toBN(2)).neg(),
					{
						from: owner,
					}
				);

				txn = await systemSettings.setWrapperBurnFeeRate(testWrapperAddress, newValue, {
					from: owner,
				});
			});
			it('then it changes the value as expected', async () => {
				assert.bnEqual(await systemSettings.wrapperBurnFeeRate(testWrapperAddress), newValue);
			});
			it('does not change value for different address', async () => {
				assert.bnEqual(await systemSettings.wrapperBurnFeeRate(systemSettings.address), 0);
			});
			it('and emits an EtherWrapperBurnFeeRateUpdated event', async () => {
				assert.eventEqual(txn, 'WrapperBurnFeeRateUpdated', [testWrapperAddress, newValue]);
			});
		});
	});

	describe('setExchangeDynamicFeeThreshold()', () => {
		const threshold = toUnit('0.004');
		it('only owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setExchangeDynamicFeeThreshold,
				args: [threshold],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});
		it('the owner can invoke and replace with emitted event', async () => {
			const txn = await systemSettings.setExchangeDynamicFeeThreshold(threshold, { from: owner });
			const actual = await systemSettings.exchangeDynamicFeeThreshold();
			assert.bnEqual(
				actual,
				threshold,
				'Configured exchange dynamic fee threshold is set correctly'
			);
			assert.eventEqual(txn, 'ExchangeDynamicFeeThresholdUpdated', [threshold]);
		});
	});

	describe('setExchangeDynamicFeeWeightDecay()', () => {
		const weightDecay = toUnit('0.9');
		it('only owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setExchangeDynamicFeeWeightDecay,
				args: [weightDecay],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});
		it('the owner can invoke and replace with emitted event', async () => {
			const txn = await systemSettings.setExchangeDynamicFeeWeightDecay(weightDecay, {
				from: owner,
			});
			const actual = await systemSettings.exchangeDynamicFeeWeightDecay();
			assert.bnEqual(
				actual,
				weightDecay,
				'Configured exchange dynamic fee weight decay is set correctly'
			);
			assert.eventEqual(txn, 'ExchangeDynamicFeeWeightDecayUpdated', [weightDecay]);
		});
	});

	describe('setExchangeDynamicFeeRounds()', () => {
		const rounds = '10';
		it('only owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setExchangeDynamicFeeRounds,
				args: [rounds],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});
		it('the owner can invoke and replace with emitted event', async () => {
			const txn = await systemSettings.setExchangeDynamicFeeRounds(rounds, { from: owner });
			const actual = await systemSettings.exchangeDynamicFeeRounds();
			assert.equal(actual, rounds, 'Configured exchange dynamic fee rounds is set correctly');
			assert.eventEqual(txn, 'ExchangeDynamicFeeRoundsUpdated', [rounds]);
		});
	});

	describe('setExchangeMaxDynamicFee()', () => {
		const maxDynamicFee = toUnit('1');
		it('only owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setExchangeMaxDynamicFee,
				args: [maxDynamicFee],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});
		it('the owner can invoke and replace with emitted event', async () => {
			const txn = await systemSettings.setExchangeMaxDynamicFee(maxDynamicFee, { from: owner });
			const actual = await systemSettings.exchangeMaxDynamicFee();
			assert.bnEqual(actual, maxDynamicFee, 'Configured exchange max dynamic fee is set correctly');
			assert.eventEqual(txn, 'ExchangeMaxDynamicFeeUpdated', [maxDynamicFee]);
		});
	});
});
