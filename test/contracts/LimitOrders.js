'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const LimitOrders = artifacts.require('LimitOrders');

const { toBytes32 } = require('../..');
const { toUnit } = require('../utils')();
const { setupAllContracts } = require('./setup');

contract('LimitOrders', accounts => {
	const [, proxy, owner, account1] = accounts;
	let limitOrders, addressResolver;

	const [sUSD, sBTC, iBTC] = ['sUSD', 'sBTC', 'sETH'].map(toBytes32);

	before(async () => {
		({ LimitOrders: limitOrders, AddressResolver: addressResolver } = await setupAllContracts({
			accounts,
			contracts: ['LimitOrders', 'Synthetix'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('given an instance', () => {
		it('should set constructor params on deployment', async () => {
			const instance = await LimitOrders.new(proxy, owner, addressResolver.address);
			assert.equal(await instance.proxy(), proxy);
			assert.equal(await instance.owner(), owner);
			assert.equal(await instance.addressResolverProxy(), addressResolver.address);
		});

		it('should not have orders', async () => {
			assert.bnEqual(await limitOrders.orderCount(), 0);
		});

		describe('new order', () => {
			it('should not create an order if sourceAmount equals 0', async () => {
				const sourceAmount = toUnit('0');
				const minDestinationAmount = toUnit('100');
				const executionFee = toUnit('0');
				await assert.revert(
					limitOrders.newOrder(sUSD, sourceAmount, sBTC, minDestinationAmount, executionFee, {
						from: account1,
						value: 1,
					}),
					'sourceAmount should be greater than 0'
				);
			});

			it('should not create an order if minDestinationAmount equals 0', async () => {
				const sourceAmount = toUnit('1');
				const minDestinationAmount = toUnit('0');
				const executionFee = toUnit('0');
				await assert.revert(
					limitOrders.newOrder(sUSD, sourceAmount, sBTC, minDestinationAmount, executionFee, {
						from: account1,
						value: 1,
					}),
					'minDestinationAmount should be greater than 0'
				);
			});

			it('should not create an order if wei deposit is lower than execution fee', async () => {
				const sourceAmount = toUnit('1');
				const minDestinationAmount = toUnit('1');
				const executionFee = toUnit('1');
				await assert.revert(
					limitOrders.newOrder(sUSD, sourceAmount, sBTC, minDestinationAmount, executionFee, {
						from: account1,
						value: toUnit('0.5'),
					}),
					'wei deposit must be larger than executionFee'
				);
			});

			it('should create a new order', async () => {
				const sourceAmount = toUnit('1');
				const minDestinationAmount = toUnit('1');
				const executionFee = toUnit('1');
				const weiDeposit = toUnit('1.2');

				const orderCount = await limitOrders.orderCount();

				const tx = await limitOrders.newOrder(
					sUSD,
					sourceAmount,
					sBTC,
					minDestinationAmount,
					executionFee,
					{
						from: account1,
						value: weiDeposit,
					}
				);
				const logs = LimitOrders.decodeLogs(tx.receipt.rawLogs);
				assert.eventEqual(logs[0], 'Order', {
					orderID: orderCount.toNumber() + 1,
					submitter: account1,
					sourceCurrencyKey: sUSD,
					sourceAmount,
					minDestinationAmount,
					destinationCurrencyKey: sBTC,
					executionFee,
					weiDeposit,
				});
			});
		});
	});
});
