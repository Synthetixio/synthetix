const { contract } = require('hardhat');

const { toBytes32 } = require('../..');
const { toUnit } = require('../utils')();

const { setupAllContracts } = require('./setup');
const { assert } = require('./common');
const {
	getDecodedLogs,
	decodedEventEqual,
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
} = require('./helpers');

contract('FuturesMarketSettings', accounts => {
	let futuresMarketSettings;

	const owner = accounts[1];

	const baseAsset = toBytes32('sBTC');
	const takerFee = toUnit('0.003');
	const makerFee = toUnit('0.001');
	const maxLeverage = toUnit('10');
	const maxMarketValue = toUnit('100000');
	const minInitialMargin = toUnit('100');
	const maxFundingRate = toUnit('0.1');
	const maxFundingRateSkew = toUnit('1');
	const maxFundingRateDelta = toUnit('0.0125');

	before(async () => {
		({ FuturesMarketSettings: futuresMarketSettings } = await setupAllContracts({
			accounts,
			contracts: ['FuturesMarketSettings'],
		}));
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
				'setMinInitialMargin',
				'setMaxFundingRate',
				'setMaxFundingRateSkew',
				'setMaxFundingRateDelta',
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
					'minInitialMargin',
					minInitialMargin,
					futuresMarketSettings.setMinInitialMargin,
					futuresMarketSettings.getMinInitialMargin,
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

		it('Initially the params are unitialized', async () => {
			for (const p of params) {
				const getter = p[3];
				assert.bnEqual(await getter(baseAsset), '0');
			}
		});

		describe('Setting the params', async () => {
			describe('when not invoked by the owner', async () => {
				it('should revert ', async () => {
					for (const p of params) {
						// const param = toBytes32(p[0]);
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
		});
	});
});
