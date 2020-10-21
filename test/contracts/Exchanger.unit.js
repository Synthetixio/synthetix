'use strict';

const {
	artifacts,
	contract,
	// web3, legacy, network
} = require('@nomiclabs/buidler');

// const { smockit } = require('@eth-optimism/smock');

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

// const {
// 	toBytes32,
// 	defaults: { WAITING_PERIOD_SECS, PRICE_DEVIATION_THRESHOLD_FACTOR },
// } = require('../..');

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

	// describe('when a fake is instantiated', () => {
	// 	let exchanger;

	// 	it.only('test', async () => {
	// 		await network.provider._init();

	// 		const ExRates = smockit(artifacts.require('ExchangeRates').abi);

	// 		console.log(ExRates.address);

	// 		console.log(ExRates);

	// 		// console.log(ExRates.abi);
	// 	});
	// });
});
