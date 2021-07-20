const { artifacts, contract } = require('hardhat');

const { toBytes32 } = require('../..');
const { toUnit } = require('../utils')();

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

	const baseAsset = toBytes32('sBTC');
	const takerFee = toUnit('0.003');
	const makerFee = toUnit('0.001');
	const maxLeverage = toUnit('10');
	const maxMarketValue = toUnit('100000');

	const maxFundingRate = toUnit('0.1');
	const maxFundingRateSkew = toUnit('1');
	const maxFundingRateDelta = toUnit('0.0125');

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
				'ProxyFuturesMarketManager',
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

		mockGenericContractFnc({
			instance: mockFuturesMarketBTC,
			mock: 'FuturesMarket',
			fncName: 'recomputeFunding',
			returns: ['0'],
		});

		mockGenericContractFnc({
			instance: mockFuturesMarketBTC,
			mock: 'FuturesMarket',
			fncName: 'baseAsset',
			returns: [toBytes32('sBTC')],
		});

		// add the market
		futuresMarketManager.addMarkets([mockFuturesMarketBTC.address], { from: owner });
	});

	it('Only expected functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: futuresMarketSettings.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'setTakerFee',
				'setMakerFee',
				'setMaxLeverage',
				'setMaxMarketValue',
				'setMaxFundingRate',
				'setMaxFundingRateSkew',
				'setMaxFundingRateDelta',
				'setParameters',
				'setLiquidationFee',
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
				maxLeverage,
				maxMarketValue,
				maxFundingRate,
				maxFundingRateSkew,
				maxFundingRateDelta,
			}).map(([key, val]) => {
				const capKey = key.charAt(0).toUpperCase() + key.slice(1);
				return [key, val, futuresMarketSettings[`set${capKey}`], futuresMarketSettings[`${key}`]];
			});
		});

		describe('bounds checking', async () => {
			it('should revert if maker fee is greater than 1', async () => {
				await assert.revert(
					futuresMarketSettings.setMakerFee(baseAsset, toUnit('1').add(new BN(1)), {
						from: owner,
					}),
					'maker fee greater than 1'
				);
			});
			it('should revert if taker fee is greater than 1', async () => {
				await assert.revert(
					futuresMarketSettings.setTakerFee(baseAsset, toUnit('1').add(new BN(1)), {
						from: owner,
					}),
					'taker fee greater than 1'
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
							args: [baseAsset, value],
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

							const tx = await setter(baseAsset, value, { from: owner });

							const decodedLogs = await getDecodedLogs({
								hash: tx.tx,
								contracts: [futuresMarketSettings],
							});
							assert.equal(decodedLogs.length, 2);
							decodedEventEqual({
								event: 'ParameterUpdated',
								emittedFrom: futuresMarketSettings.address,
								args: [baseAsset, param, value],
								log: decodedLogs[1],
							});

							// And the parameter was actually set properly
							assert.bnEqual(await getter(baseAsset), value.toString());
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

	describe('setLiquidationFee()', () => {
		let minInitialMargin;
		beforeEach(async () => {
			minInitialMargin = await futuresMarketSettings.minInitialMargin.call();
		});
		it('should be able to change the futures liquidation fee', async () => {
			// fee <= minInitialMargin
			const liquidationFee = minInitialMargin;

			const originalLiquidationFee = await futuresMarketSettings.liquidationFee.call();
			await futuresMarketSettings.setLiquidationFee(liquidationFee, { from: owner });
			const newLiquidationFee = await futuresMarketSettings.liquidationFee.call();
			assert.bnEqual(newLiquidationFee, liquidationFee);
			assert.bnNotEqual(newLiquidationFee, originalLiquidationFee);
		});

		it('only owner is permitted to change the futures liquidation fee', async () => {
			const liquidationFee = toUnit('100');

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketSettings.setLiquidationFee,
				args: [liquidationFee.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if the fee is greater than the min initial margin', async () => {
			await assert.revert(
				futuresMarketSettings.setLiquidationFee(minInitialMargin.add(new BN(1)), {
					from: owner,
				}),
				'min margin < liquidation fee'
			);

			const currentLiquidationFee = await futuresMarketSettings.liquidationFee.call();
			await assert.revert(
				futuresMarketSettings.setMinInitialMargin(currentLiquidationFee.sub(new BN(1)), {
					from: owner,
				}),
				'min margin < liquidation fee'
			);
		});

		it('should emit event on successful liquidation fee change', async () => {
			// fee <= minInitialMargin
			const liquidationFee = minInitialMargin.sub(new BN(1));

			const txn = await futuresMarketSettings.setLiquidationFee(liquidationFee, {
				from: owner,
			});
			assert.eventEqual(txn, 'LiquidationFeeUpdated', {
				sUSD: liquidationFee,
			});
		});
	});
});
