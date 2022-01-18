'use strict';

const { contract } = require('hardhat');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { toBytes32 } = require('../..');
const { toUnit } = require('../utils')();
const {
	setExchangeFeeRateForSynths,
	setupPriceAggregators,
	updateAggregatorRates,
} = require('./helpers');

const { setupAllContracts } = require('./setup');

contract('SynthUtil', accounts => {
	const [, ownerAccount, , account2] = accounts;
	let synthUtil, sUSDContract, synthetix, exchangeRates, systemSettings, debtCache;

	const [sUSD, sBTC, iBTC, SNX] = ['sUSD', 'sBTC', 'iBTC', 'SNX'].map(toBytes32);
	const synthKeys = [sUSD, sBTC, iBTC];
	const synthPrices = [toUnit('1'), toUnit('5000'), toUnit('5000')];

	before(async () => {
		({
			SynthUtil: synthUtil,
			SynthsUSD: sUSDContract,
			Synthetix: synthetix,
			ExchangeRates: exchangeRates,
			SystemSettings: systemSettings,
			DebtCache: debtCache,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD', 'sBTC', 'iBTC'],
			contracts: [
				'SynthUtil',
				'Synthetix',
				'Exchanger',
				'ExchangeRates',
				'ExchangeState',
				'FeePoolEternalStorage',
				'SystemSettings',
				'DebtCache',
				'Issuer',
				'CollateralManager',
				'RewardEscrowV2', // required for issuer._collateral to read collateral
			],
		}));

		await setupPriceAggregators(exchangeRates, ownerAccount, [sBTC, iBTC]);
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		await updateAggregatorRates(
			exchangeRates,
			[sBTC, iBTC, SNX],
			['5000', '5000', '0.2'].map(toUnit)
		);
		await debtCache.takeDebtSnapshot();

		// set a 0% default exchange fee rate for test purpose
		const exchangeFeeRate = toUnit('0');
		await setExchangeFeeRateForSynths({
			owner: ownerAccount,
			systemSettings,
			synthKeys,
			exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
		});
	});

	describe('given an instance', () => {
		const sUSDMinted = toUnit('10000');
		const amountToExchange = toUnit('50');
		const sUSDAmount = toUnit('100');
		beforeEach(async () => {
			await synthetix.issueSynths(sUSDMinted, {
				from: ownerAccount,
			});
			await sUSDContract.transfer(account2, sUSDAmount, { from: ownerAccount });
			await synthetix.exchange(sUSD, amountToExchange, sBTC, { from: account2 });
		});
		describe('totalSynthsInKey', () => {
			it('should return the total balance of synths into the specified currency key', async () => {
				assert.bnEqual(await synthUtil.totalSynthsInKey(account2, sUSD), sUSDAmount);
			});
		});
		describe('synthsBalances', () => {
			it('should return the balance and its value in sUSD for every synth in the wallet', async () => {
				const effectiveValue = await exchangeRates.effectiveValue(sUSD, amountToExchange, sBTC);
				assert.deepEqual(await synthUtil.synthsBalances(account2), [
					[sUSD, sBTC, iBTC],
					[toUnit('50'), effectiveValue, 0],
					[toUnit('50'), toUnit('50'), 0],
				]);
			});
		});
		describe('synthsRates', () => {
			it('should return the correct synth rates', async () => {
				assert.deepEqual(await synthUtil.synthsRates(), [synthKeys, synthPrices]);
			});
		});
		describe('synthsTotalSupplies', () => {
			it('should return the correct synth total supplies', async () => {
				const effectiveValue = await exchangeRates.effectiveValue(sUSD, amountToExchange, sBTC);
				assert.deepEqual(await synthUtil.synthsTotalSupplies(), [
					synthKeys,
					[sUSDMinted.sub(amountToExchange), effectiveValue, 0],
					[sUSDMinted.sub(amountToExchange), amountToExchange, 0],
				]);
			});
		});
	});
});
