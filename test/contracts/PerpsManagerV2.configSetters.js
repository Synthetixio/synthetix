const { contract } = require('hardhat');

const { toBytes32 } = require('../..');
const { toUnit, toBN } = require('../utils')();

const { setupAllContracts } = require('./setup');
const { assert } = require('./common');
const { getDecodedLogs, decodedEventEqual, onlyGivenAddressCanInvoke } = require('./helpers');

const BN = require('bn.js');

contract('PerpsManagerV2 ConfigSettersMixin', accounts => {
	let perpsManager;

	const owner = accounts[1];

	const marketKey = toBytes32('pBTC');
	const asset = toBytes32('BTC');
	const baseFee = toUnit('0.003');
	const baseFeeNextPrice = toUnit('0.0005');
	const nextPriceConfirmWindow = toBN('2');
	const maxLeverage = toUnit('10');
	const maxSingleSideValueUSD = toUnit('100000');

	const maxFundingRate = toUnit('0.1');
	const skewScaleUSD = toUnit('10000');

	before(async () => {
		({ PerpsManagerV2: perpsManager } = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			feeds: ['BTC'],
			contracts: [
				'PerpsManagerV2',
				'FuturesMarketManager',
				'LiquidatorRewards', // needed for Issuer, but can't be in deps b/c of circular dependency
			],
		}));

		// add the market to initialize it
		await perpsManager.addMarkets([marketKey], [asset], { from: owner });
	});

	describe('Parameter setting', () => {
		let params;

		before('init params', async () => {
			params = Object.entries({
				baseFee,
				baseFeeNextPrice,
				nextPriceConfirmWindow,
				maxLeverage,
				maxSingleSideValueUSD,
				maxFundingRate,
				skewScaleUSD,
			}).map(([key, val]) => {
				const capKey = key.charAt(0).toUpperCase() + key.slice(1);
				return [key, val, perpsManager[`set${capKey}`], perpsManager[`${key}`]];
			});
		});

		describe('bounds checking', async () => {
			it('should revert if base fee is greater than 1', async () => {
				await assert.revert(
					perpsManager.setBaseFee(marketKey, toUnit('1').add(new BN(1)), {
						from: owner,
					}),
					'base fee greater than 1'
				);
			});

			it('should revert if base fee next price is greater than 1', async () => {
				await assert.revert(
					perpsManager.setBaseFeeNextPrice(marketKey, toUnit('1').add(new BN(1)), {
						from: owner,
					}),
					'base fee greater than 1'
				);
			});

			it('should revert if setSkewScaleUSD is 0', async () => {
				await assert.revert(
					perpsManager.setSkewScaleUSD(marketKey, 0, {
						from: owner,
					}),
					'cannot set skew scale 0'
				);
			});
		});

		describe('Setting the params', async () => {
			describe('when not invoked by the owner', async () => {
				it('should revert ', async () => {
					for (const p of params) {
						const value = p[1];
						const setter = p[2];

						// Only settable by the owner
						await onlyGivenAddressCanInvoke({
							fnc: setter,
							args: [marketKey, value],
							address: owner,
							accounts,
						});
					}
				});
			});

			describe('when invoked by the owner', async () => {
				describe('Set params independently', async () => {
					it('should set the params accordingly and emit the corresponding events', async () => {
						for (const p of params) {
							const param = toBytes32(p[0]);
							const value = p[1];
							const setter = p[2];
							const getter = p[3];

							const tx = await setter(marketKey, value, { from: owner });

							const decodedLogs = await getDecodedLogs({
								hash: tx.tx,
								contracts: [perpsManager],
							});
							assert.equal(decodedLogs.length, 2);
							decodedEventEqual({
								event: 'ParameterUpdated',
								emittedFrom: perpsManager.address,
								args: [marketKey, param, value],
								log: decodedLogs[1],
							});

							// And the parameter was actually set properly
							assert.bnEqual(await getter(marketKey), value.toString());
						}
					});
				});

				it('setMarketConfig should set the params accordingly and emit the corresponding events', async () => {
					const tx = await perpsManager.setMarketConfig(marketKey, ...params.map(p => p[1]), {
						from: owner,
					});
					const decodedLogs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [perpsManager],
					});
					assert.equal(
						Object.values(decodedLogs).filter(l => l?.name === 'ParameterUpdated').length,
						7
					); // 7 params changes

					const marketConfig = await perpsManager.marketConfig(marketKey);

					// check values
					for (const p of params) {
						const key = p[0];
						const value = p[1];
						const getter = p[3];
						// And the parameter was actually set properly
						// check specific getter
						assert.bnEqual(await getter(marketKey), value.toString());
						// check marketConfig view
						assert.bnEqual(marketConfig[key], value.toString());
					}
				});
			});
		});
	});

	describe('setMinInitialMargin()', () => {
		it('should be able to change min initial margin', async () => {
			const initialMargin = toUnit('200');

			const originalInitialMargin = await perpsManager.minInitialMargin.call();
			await perpsManager.setMinInitialMargin(initialMargin, { from: owner });
			const newInitialMargin = await perpsManager.minInitialMargin.call();
			assert.bnEqual(newInitialMargin, initialMargin);
			assert.bnNotEqual(newInitialMargin, originalInitialMargin);
		});

		it('only owner is permitted to change the initial margin', async () => {
			const initialMargin = toUnit('200');

			await onlyGivenAddressCanInvoke({
				fnc: perpsManager.setMinInitialMargin,
				args: [initialMargin.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should emit event on successful min initial margin change', async () => {
			const initialMargin = toUnit('250');

			const txn = await perpsManager.setMinInitialMargin(initialMargin, {
				from: owner,
			});
			assert.eventEqual(txn, 'MinInitialMarginUpdated', {
				minMargin: initialMargin,
			});
		});
	});

	describe('setMinKeeperFee()', () => {
		let minInitialMargin;
		beforeEach(async () => {
			minInitialMargin = await perpsManager.minInitialMargin.call();
		});
		it('should be able to change liquidation fee', async () => {
			// fee <= minInitialMargin
			const minKeeperFee = minInitialMargin;

			const originalLiquidationFee = await perpsManager.minKeeperFee.call();
			await perpsManager.setMinKeeperFee(minKeeperFee, { from: owner });
			const newLiquidationFee = await perpsManager.minKeeperFee.call();
			assert.bnEqual(newLiquidationFee, minKeeperFee);
			assert.bnNotEqual(newLiquidationFee, originalLiquidationFee);
		});

		it('only owner is permitted to change liquidation fee', async () => {
			const minKeeperFee = toUnit('100');

			await onlyGivenAddressCanInvoke({
				fnc: perpsManager.setMinKeeperFee,
				args: [minKeeperFee.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if the fee is greater than the min initial margin', async () => {
			await assert.revert(
				perpsManager.setMinKeeperFee(minInitialMargin.add(new BN(1)), {
					from: owner,
				}),
				'min margin < liquidation fee'
			);

			const currentLiquidationFee = await perpsManager.minKeeperFee.call();
			await assert.revert(
				perpsManager.setMinInitialMargin(currentLiquidationFee.sub(new BN(1)), {
					from: owner,
				}),
				'min margin < liquidation fee'
			);
		});

		it('should emit event on successful liquidation fee change', async () => {
			// fee <= minInitialMargin
			const minKeeperFee = minInitialMargin.sub(new BN(1));

			const txn = await perpsManager.setMinKeeperFee(minKeeperFee, {
				from: owner,
			});
			assert.eventEqual(txn, 'MinKeeperFeeUpdated', {
				sUSD: minKeeperFee,
			});
		});
	});

	describe('setLiquidationFeeRatio()', () => {
		let liquidationFeeRatio;
		beforeEach(async () => {
			liquidationFeeRatio = await perpsManager.liquidationFeeRatio();
		});
		it('should be able to change liquidationFeeRatio', async () => {
			const originalValue = await perpsManager.liquidationFeeRatio();
			await perpsManager.setLiquidationFeeRatio(originalValue.mul(toUnit(0.0002)), {
				from: owner,
			});
			const newValue = await perpsManager.liquidationFeeRatio.call();
			assert.bnEqual(newValue, originalValue.mul(toUnit(0.0002)));
		});

		it('only owner is permitted to change liquidationFeeRatio', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: perpsManager.setLiquidationFeeRatio,
				args: [liquidationFeeRatio.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should emit event on successful liquidationFeeRatio change', async () => {
			const newValue = toUnit(0.01);
			const txn = await perpsManager.setLiquidationFeeRatio(newValue, {
				from: owner,
			});
			assert.eventEqual(txn, 'LiquidationFeeRatioUpdated', {
				bps: newValue,
			});
		});
	});

	describe('setLiquidationBufferRatio()', () => {
		let liquidationBufferRatio;
		beforeEach(async () => {
			liquidationBufferRatio = await perpsManager.liquidationBufferRatio();
		});
		it('should be able to change liquidationBufferRatio', async () => {
			const originalValue = await perpsManager.liquidationBufferRatio();
			await perpsManager.setLiquidationBufferRatio(originalValue.mul(toUnit(0.0002)), {
				from: owner,
			});
			const newValue = await perpsManager.liquidationBufferRatio.call();
			assert.bnEqual(newValue, originalValue.mul(toUnit(0.0002)));
		});

		it('only owner is permitted to change liquidationBufferRatio', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: perpsManager.setLiquidationBufferRatio,
				args: [liquidationBufferRatio.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should emit event on successful liquidationBufferRatio change', async () => {
			const newValue = toBN(100);
			const txn = await perpsManager.setLiquidationBufferRatio(newValue, {
				from: owner,
			});
			assert.eventEqual(txn, 'LiquidationBufferRatioUpdated', {
				bps: newValue,
			});
		});
	});

	describe('migration scenario: different parameters for two markets for same asset', () => {
		const secondMarketKey = toBytes32('SomethingElse');

		before(async () => {
			// add the market
			await perpsManager.addMarkets([secondMarketKey], [asset], { from: owner });
		});

		it('should be able to change parameters for both markets independently', async () => {
			const val1 = toUnit(0.1);
			const val2 = toUnit(0.5);
			await perpsManager.setMaxFundingRate(marketKey, val1, { from: owner });
			await perpsManager.setMaxFundingRate(secondMarketKey, val2, { from: owner });
			assert.bnEqual(await perpsManager.maxFundingRate(marketKey), val1);
			assert.bnEqual(await perpsManager.maxFundingRate(secondMarketKey), val2);
		});
	});
});
