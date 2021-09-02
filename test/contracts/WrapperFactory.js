'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { currentTime, toUnit, multiplyDecimal } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	getDecodedLogs,
	decodedEventEqual,
} = require('./helpers');

const { setupAllContracts } = require('./setup');

const { toBytes32 } = require('../..');
const { toBN } = require('web3-utils');

contract('WrapperFactory', async accounts => {
	const synths = ['sUSD', 'sETH', 'ETH', 'SNX'];
	const [sETH, ETH] = ['sETH', 'ETH'].map(toBytes32);

	const [, owner, oracle, , account1] = accounts;

	let systemSettings,
		feePool,
		exchangeRates,
		FEE_ADDRESS,
		sUSDSynth,
		sETHSynth,
		etherWrapper,
		weth,
		timestamp;

	before(async () => {
		({
			SystemSettings: systemSettings,
			FeePool: feePool,
			ExchangeRates: exchangeRates,
			EtherWrapper: etherWrapper,
			SynthsUSD: sUSDSynth,
			SynthsETH: sETHSynth,
			WETH: weth,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'AddressResolver',
				'SystemStatus',
				'Issuer',
				'Depot',
				'ExchangeRates',
				'FeePool',
				'FeePoolEternalStorage',
				'DebtCache',
				'Exchanger',
				'WrapperFactory',
				'WETH',
				'CollateralManager',
			],
		}));

		// set defaults for test - 50bps mint and burn fees
		await systemSettings.setEtherWrapperMintFeeRate(toUnit('0.005'), { from: owner });
		await systemSettings.setEtherWrapperBurnFeeRate(toUnit('0.005'), { from: owner });

		FEE_ADDRESS = await feePool.FEE_ADDRESS();
		timestamp = await currentTime();

		// Depot requires ETH rates
		await exchangeRates.updateRates([sETH, ETH], ['1500', '1500'].map(toUnit), timestamp, {
			from: oracle,
		});
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only expected functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: etherWrapper.abi,
			hasFallback: true,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'MixinSystemSettings'],
			expected: ['mint', 'burn', 'distributeFees'],
		});
	});

	describe('On deployment of Contract', async () => {});

	describe('createWrapper', async () => {});

	describe('totalIssuedSynths', async () => {});

	describe('distributeFees', async () => {
		let tx;
		let feesEscrowed;
		let sETHIssued;

		before(async () => {
			const amount = toUnit('10');
			await weth.deposit({ from: account1, value: amount });
			await weth.approve(etherWrapper.address, amount, { from: account1 });
			await etherWrapper.mint(amount, { from: account1 });

			feesEscrowed = await etherWrapper.feesEscrowed();
			sETHIssued = await etherWrapper.sETHIssued();
			tx = await etherWrapper.distributeFees();
		});

		it('burns `feesEscrowed` sETH', async () => {
			const logs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sETHSynth],
			});

			decodedEventEqual({
				event: 'Burned',
				emittedFrom: sETHSynth.address,
				args: [etherWrapper.address, feesEscrowed],
				log: logs.filter(l => !!l).find(({ name }) => name === 'Burned'),
			});
		});
		it('issues sUSD to the feepool', async () => {
			const logs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSDSynth],
			});
			const rate = await exchangeRates.rateForCurrency(sETH);

			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSDSynth.address,
				args: [FEE_ADDRESS, multiplyDecimal(feesEscrowed, rate)],
				log: logs
					.reverse()
					.filter(l => !!l)
					.find(({ name }) => name === 'Issued'),
			});
		});
		it('sETHIssued is reduced by `feesEscrowed`', async () => {
			assert.bnEqual(await etherWrapper.sETHIssued(), sETHIssued.sub(feesEscrowed));
		});
		it('feesEscrowed = 0', async () => {
			assert.bnEqual(await etherWrapper.feesEscrowed(), toBN(0));
		});
	});
});
