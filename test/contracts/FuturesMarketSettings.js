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
			ignoreParents: ['Owned', 'MixinSystemSettings'],
			expected: [
				'setAllParameters',
				'setTakerFee',
				'setMakerFee',
				'setMaxLeverage',
				'setMaxMarketValue',
				'setMaxFundingRate',
				'setMaxFundingRateSkew',
				'setMaxFundingRateDelta',
				'setFuturesLiquidationFee',
				'setFuturesMinInitialMargin',
			],
		});
	});

	describe('Parameter setting', () => {
		let params;

		before('init params', async () => {
			params = [
				[
					'takerFee',
					takerFee,
					futuresMarketSettings.setTakerFee,
					futuresMarketSettings.getTakerFee,
				],
				[
					'makerFee',
					makerFee,
					futuresMarketSettings.setMakerFee,
					futuresMarketSettings.getMakerFee,
				],
				[
					'maxLeverage',
					maxLeverage,
					futuresMarketSettings.setMaxLeverage,
					futuresMarketSettings.getMaxLeverage,
				],
				[
					'maxMarketValue',
					maxMarketValue,
					futuresMarketSettings.setMaxMarketValue,
					futuresMarketSettings.getMaxMarketValue,
				],
				[
					'maxFundingRate',
					maxFundingRate,
					futuresMarketSettings.setMaxFundingRate,
					futuresMarketSettings.getMaxFundingRate,
				],
				[
					'maxFundingRateSkew',
					maxFundingRateSkew,
					futuresMarketSettings.setMaxFundingRateSkew,
					futuresMarketSettings.getMaxFundingRateSkew,
				],
				[
					'maxFundingRateDelta',
					maxFundingRateDelta,
					futuresMarketSettings.setMaxFundingRateDelta,
					futuresMarketSettings.getMaxFundingRateDelta,
				],
			];
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

					await onlyGivenAddressCanInvoke({
						fnc: futuresMarketSettings.setAllParameters,
						args: [
							baseAsset,
							takerFee,
							makerFee,
							maxLeverage,
							maxMarketValue,
							maxFundingRate,
							maxFundingRateSkew,
							maxFundingRateDelta,
						],
						address: owner,
						accounts,
					});
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
							assert.equal(decodedLogs.length, 1);
							decodedEventEqual({
								event: 'ParameterUpdated',
								emittedFrom: futuresMarketSettings.address,
								args: [baseAsset, param, value],
								log: decodedLogs[0],
							});

							// And the parameter was actually set properly
							assert.bnEqual(await getter(baseAsset), value.toString());
						}
					});
				});

				describe('SetAllParameters', async () => {
					const bn2 = new BN(2);
					const newTakerFee = takerFee.mul(bn2);
					const newMakerFee = makerFee.mul(bn2);
					const newMaxLeverage = maxLeverage.mul(bn2);
					const newMaxMarketValue = maxMarketValue.mul(bn2);
					const newMaxFundingRate = maxFundingRate.mul(bn2);
					const newMaxFundingRateSkew = maxFundingRateSkew.mul(bn2);
					const newMaxFundingRateDelta = maxFundingRateDelta.mul(bn2);
					let tx;
					before(
						'should set the params accordingly and emit the corresponding events',
						async () => {
							tx = await futuresMarketSettings.setAllParameters(
								baseAsset,
								newTakerFee,
								newMakerFee,
								newMaxLeverage,
								newMaxMarketValue,
								newMaxFundingRate,
								newMaxFundingRateSkew,
								newMaxFundingRateDelta,
								{ from: owner }
							);
						}
					);
					it('should set the params accordingly and emit the corresponding events', async () => {
						const newParams = await futuresMarketSettings.getAllParameters(baseAsset);

						const decodedLogs = await getDecodedLogs({
							hash: tx.tx,
							contracts: [futuresMarketSettings],
						});
						assert.equal(decodedLogs.length, 7);

						for (const p of params) {
							const param = toBytes32(p[0]);
							const value = p[1].mul(bn2);

							decodedEventEqual({
								event: 'ParameterUpdated',
								emittedFrom: futuresMarketSettings.address,
								args: [baseAsset, param, value],
								log: decodedLogs[params.indexOf(p)],
							});

							assert.bnEqual(await newParams[p[0]], value.toString());
						}
					});
				});
			});
		});
	});

	describe('setFuturesMinInitialMargin()', () => {
		it('should be able to change the futures min initial margin', async () => {
			const initialMargin = toUnit('200');

			const originalInitialMargin = await futuresMarketSettings.futuresMinInitialMargin.call();
			await futuresMarketSettings.setFuturesMinInitialMargin(initialMargin, { from: owner });
			const newInitialMargin = await futuresMarketSettings.futuresMinInitialMargin.call();
			assert.bnEqual(newInitialMargin, initialMargin);
			assert.bnNotEqual(newInitialMargin, originalInitialMargin);
		});

		it('only owner is permitted to change the futures min initial margin', async () => {
			const initialMargin = toUnit('200');

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketSettings.setFuturesMinInitialMargin,
				args: [initialMargin.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should emit event on successful min initial margin change', async () => {
			const initialMargin = toUnit('250');

			const txn = await futuresMarketSettings.setFuturesMinInitialMargin(initialMargin, {
				from: owner,
			});
			assert.eventEqual(txn, 'FuturesMinInitialMarginUpdated', {
				minMargin: initialMargin,
			});
		});
	});

	describe('setFuturesLiquidationFee()', () => {
		let minInitialMargin;
		beforeEach(async () => {
			minInitialMargin = await futuresMarketSettings.futuresMinInitialMargin.call();
		});
		it('should be able to change the futures liquidation fee', async () => {
			// fee <= minInitialMargin
			const liquidationFee = minInitialMargin;

			const originalLiquidationFee = await futuresMarketSettings.futuresLiquidationFee.call();
			await futuresMarketSettings.setFuturesLiquidationFee(liquidationFee, { from: owner });
			const newLiquidationFee = await futuresMarketSettings.futuresLiquidationFee.call();
			assert.bnEqual(newLiquidationFee, liquidationFee);
			assert.bnNotEqual(newLiquidationFee, originalLiquidationFee);
		});

		it('only owner is permitted to change the futures liquidation fee', async () => {
			const liquidationFee = toUnit('100');

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketSettings.setFuturesLiquidationFee,
				args: [liquidationFee.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if the fee is greater than the min initial margin', async () => {
			await assert.revert(
				futuresMarketSettings.setFuturesLiquidationFee(minInitialMargin.add(new BN(1)), {
					from: owner,
				}),
				'fee is greater than min margin'
			);

			const currentLiquidationFee = await futuresMarketSettings.futuresLiquidationFee.call();
			await assert.revert(
				futuresMarketSettings.setFuturesMinInitialMargin(currentLiquidationFee.sub(new BN(1)), {
					from: owner,
				}),
				'fee is greater than min margin'
			);
		});

		it('should emit event on successful liquidation fee change', async () => {
			// fee <= minInitialMargin
			const liquidationFee = minInitialMargin.sub(new BN(1));

			const txn = await futuresMarketSettings.setFuturesLiquidationFee(liquidationFee, {
				from: owner,
			});
			assert.eventEqual(txn, 'FuturesLiquidationFeeUpdated', {
				sUSD: liquidationFee,
			});
		});
	});
});
