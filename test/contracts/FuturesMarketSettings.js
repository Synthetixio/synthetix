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
	let futuresMarketSettings;

	let mockFuturesMarketBTC;

	const owner = accounts[1];
	const randomAddress = accounts[2];

	const baseAsset = toBytes32('sBTC');
	const takerFee = toUnit('0.003');
	const makerFee = toUnit('0.001');
	const maxLeverage = toUnit('10');
	const maxMarketValue = toUnit('100000');

	const maxFundingRate = toUnit('0.1');
	const maxFundingRateSkew = toUnit('1');
	const maxFundingRateDelta = toUnit('0.0125');

	before(async () => {
		({ FuturesMarketSettings: futuresMarketSettings } = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: ['FuturesMarketSettings', 'SystemStatus'],
		}));

		mockFuturesMarketBTC = await artifacts.require('GenericMock').new();

		mockGenericContractFnc({
			instance: mockFuturesMarketBTC,
			mock: 'FuturesMarket',
			fncName: 'recomputeFunding',
			returns: ['0'],
		});

		// connect the market
		await futuresMarketSettings.connectMarket(baseAsset, mockFuturesMarketBTC.address, {
			from: owner,
		});
	});

	it('Only expected functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: futuresMarketSettings.abi,
			ignoreParents: ['Owned', 'MixinSystemSettings'],
			expected: [
				'connectMarket',
				'setAllParameters',
				'setTakerFee',
				'setMakerFee',
				'setMaxLeverage',
				'setMaxMarketValue',
				'setMaxFundingRate',
				'setMaxFundingRateSkew',
				'setMaxFundingRateDelta',
			],
		});
	});

	describe('connectMarket', () => {
		const asset = toBytes32('sUNI');
		it('Only the owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketSettings.connectMarket,
				args: [asset, randomAddress],
				address: owner,
				accounts,
			});
		});

		describe('when invoked by the owner', () => {
			let tx;
			before(async () => {
				tx = await futuresMarketSettings.connectMarket(asset, randomAddress, {
					from: owner,
				});
			});

			it('it should connect the market', async () => {
				const marketAddress = await futuresMarketSettings.markets(toBytes32('sUNI'));
				assert.equal(marketAddress, randomAddress);
			});

			it('it should emit an event', async () => {
				assert.eventEqual(tx, 'MarketConnected', {
					market: toBytes32('sUNI'),
					marketAddress: randomAddress,
				});
			});
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
					const fundingParams = [maxFundingRate, maxFundingRateSkew, maxFundingRateDelta];

					await onlyGivenAddressCanInvoke({
						fnc: futuresMarketSettings.setAllParameters,
						args: [baseAsset, takerFee, makerFee, maxLeverage, maxMarketValue, fundingParams],
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
					const newFundingParams = [
						newMaxFundingRate,
						newMaxFundingRateSkew,
						newMaxFundingRateDelta,
					];
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
								newFundingParams,
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
});
