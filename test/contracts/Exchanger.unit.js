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
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	// 	setStatus,
	// 	convertToAggregatorPrice,
} = require('./helpers');

const {
	toBytes32,
	// 	defaults: { WAITING_PERIOD_SECS, PRICE_DEVIATION_THRESHOLD_FACTOR },
} = require('../..');

const Exchanger = artifacts.require('Exchanger');

const prepareMocks = async ({ contracts, owner }) => {
	const mocks = {};
	for (const contract of contracts) {
		mocks[contract] = await smockit(artifacts.require(contract).abi);
	}

	const resolver = await artifacts.require('AddressResolver').new(owner);
	await resolver.importAddresses(
		Object.keys(mocks).map(contract => toBytes32(contract)),
		Object.values(mocks).map(mock => mock.address),
		{ from: owner }
	);
	return { mocks, resolver };
};

const steps = {
	whenMockedToAllowInvocations({ byAnyone }, cb) {
		describe('when mocked to allow anyone to invoke', () => {
			beforeEach(async () => {
				this.mocks.Synthetix.smocked.synthsByAddress.will.return.with(() =>
					byAnyone ? toBytes32('sUSD') : toBytes32()
				);
			});
			cb();
		});
	},
};

contract('Exchanger (unit tests)', async accounts => {
	const [, owner, user1] = accounts;

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
		let instance;

		before(async () => {
			Exchanger.link(await artifacts.require('SafeDecimalMath').new());
		});

		beforeEach(async () => {
			({ mocks: this.mocks, resolver: this.resolver } = await prepareMocks({
				owner,
				contracts: [
					'SystemStatus',
					'ExchangeState',
					'ExchangeRates',
					'Synthetix',
					'FeePool',
					'TradingRewards',
					'DelegateApprovals',
					'Issuer',
					'FlexibleStorage',
				],
			}));

			// stub system setting if need be
			// mocks.FlexibleStorage.smocked.getUIntValue.will.return.with((contract, record) =>
			// 	contract === toBytes32('SystemSettings') && record === toBytes32('waitingPeriodSecs')
			// 		? '60'
			// 		: '0'
			// );

			// mocks.Synthetix.mock.
			// synthetix.smocked.transferFrom.will.return.with(() => true);
			// synthetix.smocked.balanceOf.will.return.with(() => web3.utils.toWei('1'));
			// synthetix.smocked.transfer.will.return.with(() => true);
			// messenger.smocked.sendMessage.will.return.with(() => {});
		});

		beforeEach(async () => {
			instance = await Exchanger.new(owner, this.resolver.address);
			await instance.setResolverAndSyncCache(this.resolver.address, { from: owner });
		});

		it('test mocking', async () => {
			// console.log('waiting period secs', (await instance.waitingPeriodSecs()).toString());
			// const tester = await artifacts.require('TestMe').new(ExRates.address);
			// console.log('With sETH', (await tester.showMe(toBytes32('sETH'))).toString());
			// console.log('Otherwise', (await tester.showMe(toBytes32('SNX'))).toString());
		});

		describe('exchanging', () => {
			describe('failure modes', () => {
				const args = [owner, toBytes32('sUSD'), '100', toBytes32('sETH'), owner];
				steps.whenMockedToAllowInvocations({ byAnyone: false }, () => {
					it('it reverts when called by regular accounts', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.exchangeWithVirtual,
							args,
							accounts,
							reason: 'Exchanger: Only synthetix or a synth contract can perform this action',
						});
					});
				});

				steps.whenMockedToAllowInvocations({ byAnyone: true }, () => {
					it('it reverts when either rate is invalid', async () => {
						// allow anyone to call onlySynthetixOrSynth() modifier
						// mocks.Synthetix.smocked.synthsByAddress.will.return.with(() => toBytes32('sUSD'));
					});
				});
			});
			beforeEach(async () => {
				// allow anyone to call onlySynthetixOrSynth() modifier
				this.mocks.Synthetix.smocked.synthsByAddress.will.return.with(() => toBytes32('sUSD'));
			});
			describe('exchangeWithVirtual()', () => {
				it('trying something', async () => {
					const txn = await instance.exchangeWithVirtual(
						owner,
						toBytes32('sUSD'),
						'100',
						toBytes32('sETH'),
						owner
						// { from: owner }
					);
				});
			});
		});
	});
});
