'use strict';

const { contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { currentTime, toUnit } = require('../utils')();
const { GAS_PRICE } = require('../../hardhat.config');

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

	const [, owner, oracle, , account1] = accounts;

	let systemSettings,
		exchangeRates,
		addressResolver,
		sETHSynth,
		etherWrapper,
		nativeEtherWrapper,
		weth,
		timestamp;

	before(async () => {
		({
			SystemSettings: systemSettings,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			EtherWrapper: etherWrapper,
			NativeEtherWrapper: nativeEtherWrapper,
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
			assert.equal(
				await addressResolver.getAddress(toBytes32('EtherWrapper')),
				etherWrapper.address
			);
		});
	});

	describe('mint', async () => {
		beforeEach(async () => {
			await systemSettings.setEtherWrapperMintFeeRate('0', { from: owner });
		});
		describe('when called with 0 ETH sent', async () => {
			it('reverts', async () => {
				await assert.revert(
					nativeEtherWrapper.mint({ value: '0', from: account1 }),
					'msg.value must be greater than 0'
				);
			});
		});
		describe('when ETH is sent with call', async () => {
			let tx;
			let amount;

			beforeEach(async () => {
				amount = toUnit('1');
				tx = await nativeEtherWrapper.mint({ value: amount, from: account1 });
			});

			it('wraps sent ETH into WETH', async () => {
				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [weth],
				});

				decodedEventEqual({
					event: 'Deposit',
					emittedFrom: weth.address,
					args: [nativeEtherWrapper.address, amount],
					log: logs
						.reverse()
						.filter(l => !!l)
						.find(({ name }) => name === 'Deposit'),
				});
			});
			it('calls EtherWrapper.mint(amount)', async () => {
				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [etherWrapper],
				});
				decodedEventEqual({
					event: 'Minted',
					emittedFrom: etherWrapper.address,
					args: [nativeEtherWrapper.address, amount, '0'],
					log: logs
						.reverse()
						.filter(l => !!l)
						.find(({ name }) => name === 'Minted'),
				});
			});
			it('transfers sETH to msg.sender', async () => {
				assert.bnEqual(await sETHSynth.balanceOf(account1), amount);
			});
		});
	});

	describe('burn', async () => {
		beforeEach(async () => {
			await systemSettings.setEtherWrapperBurnFeeRate('0', { from: owner });
		});

		describe('when called with amount = 0', async () => {
			it('reverts', async () => {
				await assert.revert(
					nativeEtherWrapper.burn('0', { from: account1 }),
					'amount must be greater than 0'
				);
			});
		});
		describe('when called with 0 sETH balance', async () => {
			it('reverts', async () => {
				await assert.revert(
					nativeEtherWrapper.burn('1', { from: account1 }),
					'SafeMath: subtraction overflow'
				);
			});
		});
		describe('when called with sETH balance', async () => {
			let sethBalanceBefore;
			let ethBalanceBefore, ethBalanceAfter;
			let tx;
			let amount;

			beforeEach(async () => {
				// Mint some sETH.
				await nativeEtherWrapper.mint({ value: toUnit('1'), from: account1 });
				sethBalanceBefore = await sETHSynth.balanceOf(account1);
				amount = sethBalanceBefore;

				// Approve sETH.
				await sETHSynth.approve(nativeEtherWrapper.address, amount, { from: account1 });

				// Burn.
				ethBalanceBefore = await web3.eth.getBalance(account1);
				tx = await nativeEtherWrapper.burn(amount, { from: account1 });
				ethBalanceAfter = await web3.eth.getBalance(account1);
			});

			it('transfers sETH from msg.sender to contract', async () => {
				assert.bnEqual(await sETHSynth.balanceOf(account1), sethBalanceBefore.sub(amount));
			});
			it('calls EtherWrapper.burn(amount)', async () => {
				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [etherWrapper],
				});
				decodedEventEqual({
					event: 'Burned',
					emittedFrom: etherWrapper.address,
					args: [nativeEtherWrapper.address, amount, '0'],
					log: logs.filter(l => !!l).filter(({ name }) => name === 'Burned')[1],
				});
			});
			it('unwraps received WETH into ETH', async () => {
				const logs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [weth],
				});

				decodedEventEqual({
					event: 'Withdrawal',
					emittedFrom: weth.address,
					args: [nativeEtherWrapper.address, amount],
					log: logs
						.reverse()
						.filter(l => !!l)
						.find(({ name }) => name === 'Withdrawal'),
				});
			});
			xit('sends full ETH balance to msg.sender', async () => {
				const gasPaid = toBN(tx.receipt.gasUsed * GAS_PRICE);

				// Note: currently failing under coverage via:
				// AssertionError: expected '9999990279979998999390' to equal '9999994999999998763389'
				// 		+ expected - actual
				// 		-9999990279979998999390
				// 		+9999994999999998763389
				// We encounter this in Depot.js too.
				// It's likely caused by a gas estimation bug somewhere.
				assert.bnEqual(
					toBN(ethBalanceBefore)
						.sub(gasPaid)
						.add(amount),
					ethBalanceAfter
				);
			});
		});
	});
});
