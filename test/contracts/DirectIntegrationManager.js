'use strict';

const { contract } = require('hardhat');

const ethers = require('ethers');

const { toUnit } = require('../utils')();

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');

const { setupAllContracts } = require('./setup');

const ZERO_BYTES32 = ethers.utils.formatBytes32String('');

const sETH = ethers.utils.formatBytes32String('sETH');
const sBTC = ethers.utils.formatBytes32String('sBTC');

contract('DirectIntegrationManager', async accounts => {
	let systemSettings, directIntegration, exchangeRates, resolver;

	const [, owner, , address1, fakeAddress] = accounts;

	before(async () => {
		({
			AddressResolver: resolver,
			DirectIntegrationManager: directIntegration,
			ExchangeRates: exchangeRates,
			SystemSettings: systemSettings,
		} = await setupAllContracts({
			accounts,
			contracts: ['DirectIntegrationManager', 'ExchangeRatesWithDexPricing', 'SystemSettings'],
		}));
	});

	before('apply systemsettings', async () => {
		await exchangeRates.setDexPriceAggregator(fakeAddress, { from: owner });
		await systemSettings.setAtomicEquivalentForDexPricing(sETH, fakeAddress, { from: owner });
		await systemSettings.setAtomicExchangeFeeRate(sETH, 100, { from: owner });
		await systemSettings.setAtomicTwapWindow(200, { from: owner });
		await systemSettings.setAtomicMaxVolumePerBlock(400, { from: owner });
		await systemSettings.setAtomicVolatilityConsiderationWindow(sETH, 500, { from: owner });
		await systemSettings.setAtomicVolatilityUpdateThreshold(sETH, 700, { from: owner });
		await systemSettings.setExchangeFeeRateForSynths([sETH], [800], { from: owner });
		await systemSettings.setExchangeMaxDynamicFee(900, { from: owner });
		await systemSettings.setExchangeDynamicFeeRounds(1000, { from: owner });
		await systemSettings.setExchangeDynamicFeeThreshold(1100, { from: owner });
		await systemSettings.setExchangeDynamicFeeWeightDecay(1200, { from: owner });
	});

	addSnapshotBeforeRestoreAfterEach();

	it('should set constructor params on deployment', async () => {
		assert.equal(await directIntegration.owner(), owner);
		assert.equal(await directIntegration.resolver(), resolver.address);
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: directIntegration.abi,
			hasFallback: false,
			ignoreParents: ['MixinSystemSettings', 'Owned'],
			expected: ['setExchangeParameters'],
		});
	});

	describe('setExchangeParameters', () => {
		it('is only callable by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: directIntegration.setExchangeParameters,
				args: [
					address1,
					[sETH],
					[sETH, address1, address1, 123, 1234, 2345, 3456, 4567, 5678, 6789, 7890, 8901, 9012],
				],
				accounts,
				address: owner,
			});
		});

		it('reverts when currency keys dont match', async () => {
			await assert.revert(
				directIntegration.setExchangeParameters(
					address1,
					[sETH],
					[
						sBTC,
						ethers.constants.AddressZero,
						ethers.constants.AddressZero,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
					],
					{ from: owner }
				),
				'Currency key mismatch'
			);
		});

		describe('when overriding no parameters', () => {
			it('reverts at the first validation check', async () => {
				await assert.revert(
					directIntegration.setExchangeParameters(
						address1,
						[ZERO_BYTES32],
						[
							ZERO_BYTES32,
							ethers.constants.AddressZero,
							ethers.constants.AddressZero,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
							0,
						],
						{ from: owner }
					),
					'Atomic equivalent is 0 address'
				);
			});

			it('applies no overrides', async () => {
				const params = await directIntegration.getExchangeParameters(address1, sETH);

				assert.deepEqual(params, [
					sETH,
					fakeAddress,
					fakeAddress,
					'100',
					'200',
					'400',
					'500',
					'700',
					'800',
					'900',
					'1000',
					'1100',
					'1200',
				]);
			});
		});

		describe('when overriding some parameters', () => {
			before('override', async () => {
				await directIntegration.setExchangeParameters(
					address1,
					[sETH],
					[
						sETH,
						address1,
						fakeAddress,
						123,
						60,
						0,
						0,
						0,
						0,
						toUnit('0.01'),
						0,
						toUnit('0.05'),
						toUnit('1'),
					],
					{ from: owner }
				);
			});

			it('applies some overrides', async () => {
				const params = await directIntegration.getExchangeParameters(address1, sETH);

				assert.deepEqual(params, [
					sETH,
					address1, // applied
					fakeAddress,
					'123', // applied
					'60',
					'400',
					'500',
					'700',
					'800',
					toUnit('0.01'),
					'1000',
					toUnit('0.05'),
					toUnit('1'),
				]);
			});
		});

		describe('when overriding all parameters', () => {
			before('override', async () => {
				await directIntegration.setExchangeParameters(
					address1,
					[sETH],
					[sETH, address1, address1, 123, 1234, 2345, 3456, 4567, 5678, 6789, 7890, 8901, 9012],
					{ from: owner }
				);
			});

			it('applies no overrides', async () => {
				const params = await directIntegration.getExchangeParameters(address1, sETH);

				assert.deepEqual(params, [
					sETH,
					address1,
					address1,
					'123',
					'1234',
					'2345',
					'3456',
					'4567',
					'5678',
					'6789',
					'7890',
					'8901',
					'9012',
				]);
			});
		});
	});
});
