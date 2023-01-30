const { artifacts, contract } = require('hardhat');

const { toBytes32 } = require('../..');
const { toUnit, toBN } = require('../utils')();

const {
	mockGenericContractFnc,
	setupAllContracts,
	setupContract,
	excludedFunctions,
	getFunctionSignatures,
} = require('./setup');
const { assert } = require('./common');
const {
	getDecodedLogs,
	decodedEventEqual,
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
} = require('./helpers');

const BN = require('bn.js');

contract('PerpsV2MarketSettings', accounts => {
	let futuresMarketManager, perpsV2MarketSettings;

	let mockPerpsV2MarketBTCImpl, mockPerpsV2MarketBTC;

	const owner = accounts[1];

	const marketKey = toBytes32('sBTC');
	const takerFee = toUnit('0.003');
	const makerFee = toUnit('0.001');
	const takerFeeDelayedOrder = toUnit('0.0005');
	const makerFeeDelayedOrder = toUnit('0.0001');
	const takerFeeOffchainDelayedOrder = toUnit('0.00005');
	const makerFeeOffchainDelayedOrder = toUnit('0.00001');
	const overrideCommitFee = toUnit('0');

	const nextPriceConfirmWindow = toBN('2');

	const maxLeverage = toUnit('10');
	const maxMarketValue = toUnit('1000');

	const maxFundingVelocity = toUnit('0.1');
	const skewScale = toUnit('10000');

	const offchainDelayedOrderMinAge = toBN('15');
	const offchainDelayedOrderMaxAge = toBN('60');

	const offchainMarketKey = toBytes32('ocsBTC');
	const offchainPriceDivergence = toUnit('0.05');

	const liquidationPremiumMultiplier = toUnit('1');

	const marketAbi = {
		abi: [
			'function recomputeFunding() view returns (uint)',
			'function marketSize() view returns (uint128)',
			'function marketKey() view returns (bytes32)',
			'function baseAsset() view returns (bytes32)',
		],
	};

	before(async () => {
		({
			PerpsV2MarketSettings: perpsV2MarketSettings,
			FuturesMarketManager: futuresMarketManager,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'PerpsV2MarketSettings',
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

		mockPerpsV2MarketBTCImpl = await artifacts.require('GenericMock').new();

		await mockGenericContractFnc({
			instance: mockPerpsV2MarketBTCImpl,
			mock: 'PerpsV2Market',
			fncName: 'recomputeFunding',
			returns: ['0'],
		});

		await mockGenericContractFnc({
			instance: mockPerpsV2MarketBTCImpl,
			mock: 'PerpsV2MarketViews',
			fncName: 'marketSize',
			returns: ['1'],
		});

		await mockGenericContractFnc({
			instance: mockPerpsV2MarketBTCImpl,
			mock: 'PerpsV2MarketViews',
			fncName: 'baseAsset',
			returns: [toBytes32('sBTC')],
		});

		await mockGenericContractFnc({
			instance: mockPerpsV2MarketBTCImpl,
			mock: 'PerpsV2MarketViews',
			fncName: 'marketKey',
			returns: [toBytes32('sBTC')],
		});

		mockPerpsV2MarketBTC = await setupContract({
			accounts,
			contract: 'ProxyPerpsV2',
			args: [owner],
		});

		const filteredFunctions = getFunctionSignatures(marketAbi, excludedFunctions);

		await Promise.all(
			filteredFunctions.map(e =>
				mockPerpsV2MarketBTC.addRoute(e.signature, mockPerpsV2MarketBTCImpl.address, e.isView, {
					from: owner,
				})
			)
		);

		// add the market
		await futuresMarketManager.addProxiedMarkets([mockPerpsV2MarketBTC.address], { from: owner });
	});

	it('Only expected functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: perpsV2MarketSettings.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'setDelayedOrderConfirmWindow',
				'setLiquidationBufferRatio',
				'setLiquidationFeeRatio',
				'setMakerFee',
				'setMakerFeeDelayedOrder',
				'setMakerFeeOffchainDelayedOrder',
				'setMaxDelayTimeDelta',
				'setMaxFundingVelocity',
				'setMaxLeverage',
				'setMaxMarketValue',
				'setMinDelayTimeDelta',
				'setMinInitialMargin',
				'setMinKeeperFee',
				'setMaxKeeperFee',
				'setNextPriceConfirmWindow',
				'setParameters',
				'setSkewScale',
				'setTakerFee',
				'setTakerFeeDelayedOrder',
				'setTakerFeeOffchainDelayedOrder',
				'setOverrideCommitFee',
				'setOffchainDelayedOrderMinAge',
				'setOffchainDelayedOrderMaxAge',
				'setOffchainMarketKey',
				'setOffchainPriceDivergence',
				'setLiquidationPremiumMultiplier',
			],
		});
	});

	describe('Parameter setting', () => {
		let params;

		before('init params', async () => {
			params = Object.entries({
				takerFee,
				makerFee,
				overrideCommitFee,
				takerFeeDelayedOrder,
				makerFeeDelayedOrder,
				takerFeeOffchainDelayedOrder,
				makerFeeOffchainDelayedOrder,
				maxLeverage,
				maxMarketValue,
				maxFundingVelocity,
				skewScale,
				nextPriceConfirmWindow,
				offchainDelayedOrderMinAge,
				offchainDelayedOrderMaxAge,
				offchainMarketKey,
				offchainPriceDivergence,
				liquidationPremiumMultiplier,
			}).map(([key, val]) => {
				const capKey = key.charAt(0).toUpperCase() + key.slice(1);
				return [key, val, perpsV2MarketSettings[`set${capKey}`], perpsV2MarketSettings[`${key}`]];
			});
		});

		describe('bounds checking', async () => {
			it('should revert if maker fee is greater than 1', async () => {
				await assert.revert(
					perpsV2MarketSettings.setMakerFee(marketKey, toUnit('1').add(new BN(1)), {
						from: owner,
					}),
					'maker fee greater than 1'
				);
			});

			it('should revert if taker fee is greater than 1', async () => {
				await assert.revert(
					perpsV2MarketSettings.setTakerFee(marketKey, toUnit('1').add(new BN(1)), {
						from: owner,
					}),
					'taker fee greater than 1'
				);
			});

			it('should revert if maker fee next price is greater than 1', async () => {
				await assert.revert(
					perpsV2MarketSettings.setMakerFeeDelayedOrder(marketKey, toUnit('1').add(new BN(1)), {
						from: owner,
					}),
					'maker fee greater than 1'
				);
			});

			it('should revert if taker fee next price is greater than 1', async () => {
				await assert.revert(
					perpsV2MarketSettings.setTakerFeeDelayedOrder(marketKey, toUnit('1').add(new BN(1)), {
						from: owner,
					}),
					'taker fee greater than 1'
				);
			});

			it('should revert if setSkewScale is 0', async () => {
				await assert.revert(
					perpsV2MarketSettings.setSkewScale(marketKey, 0, {
						from: owner,
					}),
					'cannot set skew scale 0'
				);
			});

			it('should revert if setLiquidationPremiumMultiplier is 0', async () => {
				await assert.revert(
					perpsV2MarketSettings.setLiquidationPremiumMultiplier(marketKey, 0, {
						from: owner,
					}),
					'cannot set liquidation premium multiplier 0'
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
								contracts: [perpsV2MarketSettings],
							});
							assert.equal(decodedLogs.length, 2);
							if (p[0] === 'offchainMarketKey') {
								// offchainMarketKey value is type bytes32 => uses another event name
								decodedEventEqual({
									event: 'ParameterUpdatedBytes32',
									emittedFrom: perpsV2MarketSettings.address,
									args: [marketKey, param, value],
									log: decodedLogs[1],
								});
							} else {
								decodedEventEqual({
									event: 'ParameterUpdated',
									emittedFrom: perpsV2MarketSettings.address,
									args: [marketKey, param, value],
									log: decodedLogs[1],
								});
							}

							// And the parameter was actually set properly
							assert.bnEqual(await getter(marketKey), value.toString());
						}
					});
				});
			});
		});
	});

	describe('setMinInitialMargin()', () => {
		it('should be able to change the perpsV2 min initial margin', async () => {
			const initialMargin = toUnit('200');

			const originalInitialMargin = await perpsV2MarketSettings.minInitialMargin.call();
			await perpsV2MarketSettings.setMinInitialMargin(initialMargin, { from: owner });
			const newInitialMargin = await perpsV2MarketSettings.minInitialMargin.call();
			assert.bnEqual(newInitialMargin, initialMargin);
			assert.bnNotEqual(newInitialMargin, originalInitialMargin);
		});

		it('only owner is permitted to change the perpsV2 min initial margin', async () => {
			const initialMargin = toUnit('200');

			await onlyGivenAddressCanInvoke({
				fnc: perpsV2MarketSettings.setMinInitialMargin,
				args: [initialMargin.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should emit event on successful min initial margin change', async () => {
			const initialMargin = toUnit('250');

			const txn = await perpsV2MarketSettings.setMinInitialMargin(initialMargin, {
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
			minInitialMargin = await perpsV2MarketSettings.minInitialMargin.call();
		});
		it('should be able to change the perpsV2 liquidation fee', async () => {
			// fee <= minInitialMargin
			const minKeeperFee = minInitialMargin;

			const originalLiquidationFee = await perpsV2MarketSettings.minKeeperFee.call();
			await perpsV2MarketSettings.setMinKeeperFee(minKeeperFee, { from: owner });
			const newLiquidationFee = await perpsV2MarketSettings.minKeeperFee.call();
			assert.bnEqual(newLiquidationFee, minKeeperFee);
			assert.bnNotEqual(newLiquidationFee, originalLiquidationFee);
		});

		it('only owner is permitted to change the perpsV2 liquidation fee', async () => {
			const minKeeperFee = toUnit('100');

			await onlyGivenAddressCanInvoke({
				fnc: perpsV2MarketSettings.setMinKeeperFee,
				args: [minKeeperFee.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if the fee is greater than the min initial margin', async () => {
			await assert.revert(
				perpsV2MarketSettings.setMinKeeperFee(minInitialMargin.add(new BN(1)), {
					from: owner,
				}),
				'min margin < liquidation fee'
			);

			const currentLiquidationFee = await perpsV2MarketSettings.minKeeperFee.call();
			await assert.revert(
				perpsV2MarketSettings.setMinInitialMargin(currentLiquidationFee.sub(new BN(1)), {
					from: owner,
				}),
				'min margin < liquidation fee'
			);
		});

		it('should emit event on successful liquidation fee change', async () => {
			// fee <= minInitialMargin
			const minKeeperFee = minInitialMargin.sub(new BN(1));

			const txn = await perpsV2MarketSettings.setMinKeeperFee(minKeeperFee, {
				from: owner,
			});
			assert.eventEqual(txn, 'MinKeeperFeeUpdated', {
				sUSD: minKeeperFee,
			});
		});
	});

	describe('setMaxKeeperFee()', () => {
		let minKeeperFee;
		beforeEach(async () => {
			minKeeperFee = await perpsV2MarketSettings.minKeeperFee.call();
		});

		it('should be able to change the perpsV2 liquidation fee', async () => {
			// max fee > min fee
			const maxKeeperFee = minKeeperFee.add(new BN(1));

			const originalLiquidationFee = await perpsV2MarketSettings.maxKeeperFee.call();
			await perpsV2MarketSettings.setMaxKeeperFee(maxKeeperFee, { from: owner });
			const newLiquidationFee = await perpsV2MarketSettings.maxKeeperFee.call();
			assert.bnEqual(newLiquidationFee, maxKeeperFee);
			assert.bnNotEqual(newLiquidationFee, originalLiquidationFee);
		});

		it('only owner is permitted to change the perpsV2 liquidation fee', async () => {
			const maxKeeperFee = toUnit('1000');

			await onlyGivenAddressCanInvoke({
				fnc: perpsV2MarketSettings.setMaxKeeperFee,
				args: [maxKeeperFee.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should revert if the fee is lower than the min fee', async () => {
			await assert.revert(
				perpsV2MarketSettings.setMaxKeeperFee(minKeeperFee.sub(new BN(1)), {
					from: owner,
				}),
				'max fee < min fee'
			);
		});

		it('should emit event on successful liquidation fee change', async () => {
			// fee <= minInitialMargin
			const maxKeeperFee = minKeeperFee.add(new BN(1));

			const txn = await perpsV2MarketSettings.setMaxKeeperFee(maxKeeperFee, {
				from: owner,
			});
			assert.eventEqual(txn, 'MaxKeeperFeeUpdated', {
				sUSD: maxKeeperFee,
			});
		});
	});

	describe('setLiquidationFeeRatio()', () => {
		let liquidationFeeRatio;
		beforeEach(async () => {
			liquidationFeeRatio = await perpsV2MarketSettings.liquidationFeeRatio();
		});
		it('should be able to change liquidationFeeRatio', async () => {
			const originalValue = await perpsV2MarketSettings.liquidationFeeRatio();
			await perpsV2MarketSettings.setLiquidationFeeRatio(originalValue.mul(toUnit(0.0002)), {
				from: owner,
			});
			const newValue = await perpsV2MarketSettings.liquidationFeeRatio.call();
			assert.bnEqual(newValue, originalValue.mul(toUnit(0.0002)));
		});

		it('only owner is permitted to change liquidationFeeRatio', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: perpsV2MarketSettings.setLiquidationFeeRatio,
				args: [liquidationFeeRatio.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should emit event on successful liquidationFeeRatio change', async () => {
			const newValue = toUnit(0.01);
			const txn = await perpsV2MarketSettings.setLiquidationFeeRatio(newValue, {
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
			liquidationBufferRatio = await perpsV2MarketSettings.liquidationBufferRatio();
		});
		it('should be able to change liquidationBufferRatio', async () => {
			const originalValue = await perpsV2MarketSettings.liquidationBufferRatio();
			await perpsV2MarketSettings.setLiquidationBufferRatio(originalValue.mul(toUnit(0.0002)), {
				from: owner,
			});
			const newValue = await perpsV2MarketSettings.liquidationBufferRatio.call();
			assert.bnEqual(newValue, originalValue.mul(toUnit(0.0002)));
		});

		it('only owner is permitted to change liquidationBufferRatio', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: perpsV2MarketSettings.setLiquidationBufferRatio,
				args: [liquidationBufferRatio.toString()],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('should emit event on successful liquidationBufferRatio change', async () => {
			const newValue = toBN(100);
			const txn = await perpsV2MarketSettings.setLiquidationBufferRatio(newValue, {
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

		let secondBTCMarket, secondBTCMarketImpl;

		before(async () => {
			// add a second BTC market
			secondBTCMarketImpl = await artifacts.require('GenericMock').new();

			await mockGenericContractFnc({
				instance: secondBTCMarketImpl,
				mock: 'PerpsV2Market',
				fncName: 'recomputeFunding',
				returns: ['0'],
			});

			await mockGenericContractFnc({
				instance: secondBTCMarketImpl,
				mock: 'PerpsV2MarketViews',
				fncName: 'marketSize',
				returns: ['1'],
			});

			await mockGenericContractFnc({
				instance: secondBTCMarketImpl,
				mock: 'PerpsV2MarketViews',
				fncName: 'baseAsset',
				returns: [toBytes32('sBTC')],
			});

			await mockGenericContractFnc({
				instance: secondBTCMarketImpl,
				mock: 'PerpsV2MarketViews',
				fncName: 'marketKey',
				returns: [secondMarketKey],
			});

			secondBTCMarket = await setupContract({
				accounts,
				contract: 'ProxyPerpsV2',
				args: [owner],
			});

			const filteredFunctions = getFunctionSignatures(marketAbi, excludedFunctions);

			await Promise.all(
				filteredFunctions.map(e =>
					secondBTCMarket.addRoute(e.signature, secondBTCMarketImpl.address, e.isView, {
						from: owner,
					})
				)
			);

			// add the market
			await futuresMarketManager.addProxiedMarkets([secondBTCMarket.address], { from: owner });
		});

		it('should be able to change parameters for both markets independently', async () => {
			const val1 = toUnit(0.1);
			const val2 = toUnit(0.5);
			await perpsV2MarketSettings.setMaxFundingVelocity(firstMarketKey, val1, { from: owner });
			await perpsV2MarketSettings.setMaxFundingVelocity(secondMarketKey, val2, { from: owner });
			assert.bnEqual(await perpsV2MarketSettings.maxFundingVelocity(firstMarketKey), val1);
			assert.bnEqual(await perpsV2MarketSettings.maxFundingVelocity(secondMarketKey), val2);
		});
	});
});
