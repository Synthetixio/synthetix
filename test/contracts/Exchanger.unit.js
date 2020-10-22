'use strict';

const { artifacts, contract, web3, legacy, network } = require('@nomiclabs/buidler');

const { smockit } = require('@eth-optimism/smock');

// const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

// const { currentTime, fastForward, multiplyDecimal, divideDecimal, toUnit } = require('../utils')();

// const { setupAllContracts } = require('./setup');

const {
	// 	setExchangeFeeRateForSynths,
	// 	getDecodedLogs,
	// 	decodedEventEqual,
	// 	timeIsClose,
	// 	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	// 	setStatus,
	// 	convertToAggregatorPrice,
} = require('./helpers');

const {
	toBytes32,
	// 	defaults: { WAITING_PERIOD_SECS, PRICE_DEVIATION_THRESHOLD_FACTOR },
} = require('../..');

const Exchanger = artifacts.require('Exchanger');

contract('Exchanger (unit tests)', async accounts => {
	// addSnapshotBeforeRestoreAfterEach();

	// beforeEach(async () => {
	// 	timestamp = await currentTime();
	// 	await exchangeRates.updateRates(
	// 		[sAUD, sEUR, SNX, sETH, sBTC, iBTC],
	// 		['0.5', '2', '1', '100', '5000', '5000'].map(toUnit),
	// 		timestamp,
	// 		{
	// 			from: oracle,
	// 		}
	// 	);

	// 	// set a 0.5% exchange fee rate (1/200)
	// 	exchangeFeeRate = toUnit('0.005');
	// 	await setExchangeFeeRateForSynths({
	// 		owner,
	// 		systemSettings,
	// 		synthKeys,
	// 		exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
	// 	});
	// });

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: Exchanger.abi,
			ignoreParents: ['MixinResolver'],
			expected: [
				'exchange',
				'exchangeOnBehalf',
				'exchangeOnBehalfWithTracking',
				'exchangeWithTracking',
				'exchangeWithVirtual',
				'settle',
				'suspendSynthWithInvalidRate',
				'setLastExchangeRateForSynth',
			],
		});
	});

	describe('when a contract is instantiated', () => {
		it.only('test mocking', async () => {
			const ExRates = await smockit(artifacts.require('ExchangeRates').abi);

			ExRates.smocked.rateForCurrency.will.return.with(arg =>
				arg === toBytes32('sETH') ? '111' : '999'
			);

			// const tester = await artifacts.require('TestMe').new(ExRates.address);

			// console.log('With sETH', (await tester.showMe(toBytes32('sETH'))).toString());
			// console.log('Otherwise', (await tester.showMe(toBytes32('SNX'))).toString());
		});
	});
});
