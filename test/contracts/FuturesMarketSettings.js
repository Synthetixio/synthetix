const { artifacts, contract } = require('hardhat');

const { toBytes32 } = require('../..');
const { toUnit, toBN } = require('../utils')();

const { mockGenericContractFnc, setupAllContracts } = require('./setup');
const { assert } = require('./common');
const {
	getDecodedLogs,
	decodedEventEqual,
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
} = require('./helpers');

const BN = require('bn.js');

contract('FuturesMarketSettings', accounts => {
	let futuresMarketManager, futuresMarketSettings;

	let mockFuturesMarketBTC;

	const owner = accounts[1];

	const marketKey = toBytes32('sBTC');
	const takerFee = toUnit('0.003');
	const makerFee = toUnit('0.001');
	const takerFeeNextPrice = toUnit('0.0005');
	const makerFeeNextPrice = toUnit('0.0001');
	const nextPriceConfirmWindow = toBN('2');
	const maxLeverage = toUnit('10');
	const maxMarketValueUSD = toUnit('100000');

	const maxFundingRate = toUnit('0.1');
	const skewScaleUSD = toUnit('10000');

	before(async () => {
		({
			FuturesMarketSettings: futuresMarketSettings,
			FuturesMarketManager: futuresMarketManager,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'FuturesMarketSettings',
				'FuturesMarketManager',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'SystemStatus',
				'SystemSettings',
				'Synthetix',
				'DebtCache',
				'CollateralManager',
			],
		}));

		mockFuturesMarketBTC = await artifacts.require('GenericMock').new();

		await mockGenericContractFnc({
			instance: mockFuturesMarketBTC,
			mock: 'FuturesMarket',
			fncName: 'recomputeFunding',
			returns: ['0'],
		});

		await mockGenericContractFnc({
			instance: mockFuturesMarketBTC,
			mock: 'FuturesMarket',
			fncName: 'marketSize',
			returns: ['1'],
		});

		await mockGenericContractFnc({
			instance: mockFuturesMarketBTC,
			mock: 'FuturesMarket',
			fncName: 'baseAsset',
			returns: [toBytes32('sBTC')],
		});

		await mockGenericContractFnc({
			instance: mockFuturesMarketBTC,
			mock: 'FuturesMarket',
			fncName: 'marketKey',
			returns: [toBytes32('sBTC')],
		});

		// add the market
		await futuresMarketManager.addMarkets([mockFuturesMarketBTC.address], { from: owner });
	});

	it('Only expected functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: futuresMarketSettings.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'setTakerFee',
				'setMakerFee',
				'setTakerFeeNextPrice',
				'setMakerFeeNextPrice',
				'setNextPriceConfirmWindow',
				'setMaxLeverage',
				'setMaxMarketValueUSD',
				'setMaxFundingRate',
				'setSkewScaleUSD',
				'setParameters',
				'setMinKeeperFee',
				'setLiquidationFeeRatio',
				'setLiquidationBufferRatio',
				'setMinInitialMargin',
			],
		});
	});

	describe('Parameter setting', () => {
		let params;

		before('init params', async () => {
			params = Object.entries({
				takerFee,
				makerFee,
				takerFeeNextPrice,
				makerFeeNextPrice,
				nextPriceConfirmWindow,
				maxLeverage,
				maxMarketValueUSD,
				maxFundingRate,
				skewScaleUSD,
			}).map(([key, val]) => {
				const capKey = key.charAt(0).toUpperCase() + key.slice(1);
				return [key, val, futuresMarketSettings[`set${capKey}`], futuresMarketSettings[`${key}`]];
			});
		});

		describe('bounds checking', async () => {
			it('should revert if maker fee is greater than 1', async () => {
				await assert.revert(
					futuresMarketSettings.setMakerFee(marketKey, toUnit('1').add(new BN(1)), {
						from: owner,
					}),
					'maker fee greater than 1'
				);
			});

			it('should revert if taker fee is greater than 1', async () => {
				await assert.revert(
					futuresMarketSettings.setTakerFee(marketKey, toUnit('1').add(new BN(1)), {
						from: owner,
					}),
					'taker fee greater than 1'
				);
			});

			it('should revert if maker fee next price is greater than 1', async () => {
				await assert.revert(
					futuresMarketSettings.setMakerFeeNextPrice(marketKey, toUnit('1').add(new BN(1)), {
						from: owner,
					}),
					'maker fee greater than 1'
				);
			});

			it('should revert if taker fee next price is greater than 1', async () => {
				await assert.revert(
					futuresMarketSettings.setTakerFeeNextPrice(marketKey, toUnit('1').add(new BN(1)), {
						from: owner,
					}),
					'taker fee greater than 1'
				);
			});

			it('should revert if setSkewScaleUSD is 0', async () => {
				await assert.revert(
					futuresMarketSettings.setSkewScaleUSD(marketKey, 0, {
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
								contracts: [futuresMarketSettings],
							});
							assert.equal(decodedLogs.length, 2);
							decodedEventEqual({
								event: 'ParameterUpdated',
								emittedFrom: futuresMarketSettings.address,
								args: [marketKey, param, value],
								log: decodedLogs[1],
							});

							// And the parameter was actually set properly
							assert.bnEqual(await getter(marketKey), value.toString());
						}
					});
				});
			});
		});
	});

	describe('setMinInitialMargin()', () => {
		it('should be able to change the futures min initial margin', async () => {
			const initialMargin = toUnit('200');

			const originalInitialMargin = await futuresMarketSettings.minInitialMargin.call();
			await futuresMarketSettings.setMinInitialMargin(initialMargin, { from: owner });
			const newInitialMargin = await futuresMarketSettings.minInitialMargin.call();
			assert.bnEqual(newInitialMargin, initialMargin);
			assert.bnNotEqual(newInitialMargin, originalInitialMargin);
		});

		it('only owner is permitted to change the futures min initial margin', async () => {
			const initialMargin = toUnit('200');

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketSettings.setMinInitialMargin,
				args: [initialMargin.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should emit event on successful min initial margin change', async () => {
			const initialMargin = toUnit('250');

			const txn = await futuresMarketSettings.setMinInitialMargin(initialMargin, {
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
			minInitialMargin = await futuresMarketSettings.minInitialMargin.call();
		});
		it('should be able to change the futures liquidation fee', async () => {
			// fee <= minInitialMargin
			const minKeeperFee = minInitialMargin;

			const originalLiquidationFee = await futuresMarketSettings.minKeeperFee.call();
			await futuresMarketSettings.setMinKeeperFee(minKeeperFee, { from: owner });
			const newLiquidationFee = await futuresMarketSettings.minKeeperFee.call();
			assert.bnEqual(newLiquidationFee, minKeeperFee);
			assert.bnNotEqual(newLiquidationFee, originalLiquidationFee);
		});

		it('only owner is permitted to change the futures liquidation fee', async () => {
			const minKeeperFee = toUnit('100');

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketSettings.setMinKeeperFee,
				args: [minKeeperFee.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if the fee is greater than the min initial margin', async () => {
			await assert.revert(
				futuresMarketSettings.setMinKeeperFee(minInitialMargin.add(new BN(1)), {
					from: owner,
				}),
				'min margin < liquidation fee'
			);

			const currentLiquidationFee = await futuresMarketSettings.minKeeperFee.call();
			await assert.revert(
				futuresMarketSettings.setMinInitialMargin(currentLiquidationFee.sub(new BN(1)), {
					from: owner,
				}),
				'min margin < liquidation fee'
			);
		});

		it('should emit event on successful liquidation fee change', async () => {
			// fee <= minInitialMargin
			const minKeeperFee = minInitialMargin.sub(new BN(1));

			const txn = await futuresMarketSettings.setMinKeeperFee(minKeeperFee, {
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
			liquidationFeeRatio = await futuresMarketSettings.liquidationFeeRatio();
		});
		it('should be able to change liquidationFeeRatio', async () => {
			const originalValue = await futuresMarketSettings.liquidationFeeRatio();
			await futuresMarketSettings.setLiquidationFeeRatio(originalValue.mul(toUnit(0.0002)), {
				from: owner,
			});
			const newValue = await futuresMarketSettings.liquidationFeeRatio.call();
			assert.bnEqual(newValue, originalValue.mul(toUnit(0.0002)));
		});

		it('only owner is permitted to change liquidationFeeRatio', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketSettings.setLiquidationFeeRatio,
				args: [liquidationFeeRatio.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should emit event on successful liquidationFeeRatio change', async () => {
			const newValue = toUnit(0.01);
			const txn = await futuresMarketSettings.setLiquidationFeeRatio(newValue, {
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
			liquidationBufferRatio = await futuresMarketSettings.liquidationBufferRatio();
		});
		it('should be able to change liquidationBufferRatio', async () => {
			const originalValue = await futuresMarketSettings.liquidationBufferRatio();
			await futuresMarketSettings.setLiquidationBufferRatio(originalValue.mul(toUnit(0.0002)), {
				from: owner,
			});
			const newValue = await futuresMarketSettings.liquidationBufferRatio.call();
			assert.bnEqual(newValue, originalValue.mul(toUnit(0.0002)));
		});

		it('only owner is permitted to change liquidationBufferRatio', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketSettings.setLiquidationBufferRatio,
				args: [liquidationBufferRatio.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should emit event on successful liquidationBufferRatio change', async () => {
			const newValue = toBN(100);
			const txn = await futuresMarketSettings.setLiquidationBufferRatio(newValue, {
				from: owner,
			});
			assert.eventEqual(txn, 'LiquidationBufferRatioUpdated', {
				bps: newValue,
			});
		});
	});

	describe('migration scenario: different parameters for two markets for same asset', () => {
		const firstMarketKey = toBytes32('sBTC');
		const secondMarketKey = toBytes32('SomethingElse');

		let secondBTCMarket;

		before(async () => {
			// add a second BTC market
			secondBTCMarket = await artifacts.require('GenericMock').new();

			await mockGenericContractFnc({
				instance: secondBTCMarket,
				mock: 'FuturesMarket',
				fncName: 'recomputeFunding',
				returns: ['0'],
			});

			await mockGenericContractFnc({
				instance: secondBTCMarket,
				mock: 'FuturesMarket',
				fncName: 'marketSize',
				returns: ['1'],
			});

			await mockGenericContractFnc({
				instance: secondBTCMarket,
				mock: 'FuturesMarket',
				fncName: 'baseAsset',
				returns: [toBytes32('sBTC')],
			});

			await mockGenericContractFnc({
				instance: secondBTCMarket,
				mock: 'FuturesMarket',
				fncName: 'marketKey',
				returns: [secondMarketKey],
			});

			// add the market
			await futuresMarketManager.addMarkets([secondBTCMarket.address], { from: owner });
		});

		it('should be able to change parameters for both markets independently', async () => {
			const val1 = toUnit(0.1);
			const val2 = toUnit(0.5);
			await futuresMarketSettings.setMaxFundingRate(firstMarketKey, val1, { from: owner });
			await futuresMarketSettings.setMaxFundingRate(secondMarketKey, val2, { from: owner });
			assert.bnEqual(await futuresMarketSettings.maxFundingRate(firstMarketKey), val1);
			assert.bnEqual(await futuresMarketSettings.maxFundingRate(secondMarketKey), val2);
		});
	});
});
