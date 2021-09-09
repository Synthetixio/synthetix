'use strict';

const { contract, artifacts } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { currentTime, toUnit } = require('../utils')();

const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
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

	let addressResolver,
		flexibleStorage,
		systemSettings,
		feePool,
		exchangeRates,
		FEE_ADDRESS,
		sUSDSynth,
		wrapperFactory,
		weth,
		timestamp;

	before(async () => {
		({
			AddressResolver: addressResolver,
			SystemSettings: systemSettings,
			FeePool: feePool,
			ExchangeRates: exchangeRates,
			WrapperFactory: wrapperFactory,
			SynthsUSD: sUSDSynth,
			WETH: weth,
			FlexibleStorage: flexibleStorage,
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
				'WETH',
				'CollateralManager',
				'WrapperFactory',
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
			abi: wrapperFactory.abi,
			hasFallback: true,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver', 'MixinSystemSettings'],
			expected: ['createWrapper', 'distributeFees'],
		});
	});

	describe('On deployment of Contract', async () => {
		let instance;
		beforeEach(async () => {
			instance = wrapperFactory;
		});

		it('should set constructor params on deployment', async () => {
			assert.equal(await instance.resolver(), addressResolver.address);
			assert.equal(await instance.owner(), owner);
		});

		it('should access its dependencies via the address resolver', async () => {
			assert.equal(
				await addressResolver.getAddress(toBytes32('FlexibleStorage')),
				flexibleStorage.address
			);
		});
	});

	describe('createWrapper', async () => {
		it('only owner can invoke', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: systemSettings.setCrossDomainMessageGasLimit,
				args: [0, 4e6],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		describe('when successfully invoked', () => {
			let createdWrapperAddress;
			let txn;

			before(async () => {
				txn = await wrapperFactory.createWrapper(weth.address, sETH, toBytes32('SynthsETH'), {
					from: owner,
				});
			});

			it('emits new wrapper contract address', async () => {
				// extract address from events
				createdWrapperAddress = txn.logs.find(l => l.event === 'WrapperCreated').args
					.wrapperAddress;

				assert.isOk(createdWrapperAddress);
			});

			it('created wrapper has rebuilt cache', async () => {
				const etherWrapper = await artifacts.require('Wrapper').at(createdWrapperAddress);

				// call totalIssuedSynths because it depends on address for ExchangeRates
				await etherWrapper.totalIssuedSynths();
			});

			it('registers to isWrapper', async () => {
				assert.isOk(await wrapperFactory.isWrapper(createdWrapperAddress));
			});
		});
	});

	describe('totalIssuedSynths', async () => {});

	describe('distributeFees', async () => {
		let tx;
		let feesEscrowed;
		let etherWrapper;

		before(async () => {
			// deploy a wrapper
			const txn = await wrapperFactory.createWrapper(weth.address, sETH, toBytes32('SynthsETH'), {
				from: owner,
			});

			const createdWrapperAddress = txn.logs.find(l => l.event === 'WrapperCreated').args
				.wrapperAddress;

			etherWrapper = await artifacts.require('Wrapper').at(createdWrapperAddress);

			const amount = toUnit('10');
			await systemSettings.setWrapperMaxTokenAmount(sETH, amount, { from: owner });
			await weth.deposit({ from: account1, value: amount });
			await weth.approve(etherWrapper.address, amount, { from: account1 });
			await etherWrapper.mint(amount, { from: account1 });

			feesEscrowed = await wrapperFactory.feesEscrowed();
			tx = await wrapperFactory.distributeFees();
		});
		it('issues sUSD to the feepool', async () => {
			const logs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSDSynth],
			});

			decodedEventEqual({
				event: 'Transfer',
				emittedFrom: await sUSDSynth.proxy(),
				args: [wrapperFactory.address, FEE_ADDRESS, feesEscrowed],
				log: logs
					.reverse()
					.filter(l => !!l)
					.find(({ name }) => name === 'Transfer'),
			});
		});

		it('feesEscrowed = 0', async () => {
			assert.bnEqual(await wrapperFactory.feesEscrowed(), toBN(0));
		});
	});
});
