'use strict';

const { contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { currentTime, toUnit } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	getDecodedLogs,
	decodedEventEqual,
} = require('./helpers');

const { setupAllContracts } = require('./setup');

const { toBytes32 } = require('../..');
const { toBN } = require('web3-utils');

contract('NativeEtherWrapper', async accounts => {
	const synths = ['sUSD', 'sETH', 'ETH', 'SNX'];
	const [sETH, ETH] = ['sETH', 'ETH'].map(toBytes32);

	const ONE = toBN('1');

	const [, owner, oracle, , account1] = accounts;

	let systemSettings,
		feePool,
		exchangeRates,
		addressResolver,
		depot,
		issuer,
		FEE_ADDRESS,
		sUSDSynth,
		sETHSynth,
		etherWrapper,
		nativeEtherWrapper,
		weth,
		timestamp;

	before(async () => {
		({
			SystemSettings: systemSettings,
			AddressResolver: addressResolver,
			Issuer: issuer,
			FeePool: feePool,
			Depot: depot,
			ExchangeRates: exchangeRates,
			EtherWrapper: etherWrapper,
			NativeEtherWrapper: nativeEtherWrapper,
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
				'EtherWrapper',
				'NativeEtherWrapper',
				'WETH',
				'CollateralManager',
			],
		}));

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
			abi: nativeEtherWrapper.abi,
			hasFallback: true,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['mint', 'burn'],
		});
	});

	describe('On deployment of Contract', async () => {
		let instance;
		beforeEach(async () => {
			instance = nativeEtherWrapper;
		});

		it('should set constructor params on deployment', async () => {
			assert.equal(await instance.resolver(), addressResolver.address);
		});

		it('should access its dependencies via the address resolver', async () => {
			assert.equal(await addressResolver.getAddress(toBytes32('SynthsETH')), sETHSynth.address);
		});
	});

	describe('mint', async () => {
		it('works', async () => {
			await nativeEtherWrapper.mint({ value: toUnit('1'), from: account1 });
		});
	});

	describe('burn', async () => {
		it('works', async () => {
			await nativeEtherWrapper.mint({ value: toUnit('1'), from: account1 });
			const balance = await sETHSynth.balanceOf(account1);
			await sETHSynth.approve(nativeEtherWrapper.address, balance, { from: account1 });
			await nativeEtherWrapper.burn(balance, { from: account1 });
		});
	});
});
