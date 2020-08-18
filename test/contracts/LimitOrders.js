'use strict';

const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const LimitOrders = artifacts.require('LimitOrders');

const { toBytes32 } = require('../..');
const { toUnit } = require('../utils')();
const { setupAllContracts } = require('./setup');

const ZERO_ADDRESS = '0x' + '0'.repeat(40);

const {
	getDecodedLogs,
	decodedEventEqual,
	proxyThruTo,
	getTransactionReceipt,
} = require('./helpers');

contract('LimitOrders', accounts => {
	const [, proxy, owner, account1, account2] = accounts;
	let proxyLimitOrders, limitOrders, limitOrdersState, addressResolver;

	const [sUSD, sBTC, iBTC] = ['sUSD', 'sBTC', 'sETH'].map(toBytes32);

	before(async () => {
		({
			LimitOrders: limitOrders,
			AddressResolver: addressResolver,
			ProxyLimitOrders: proxyLimitOrders,
			LimitOrdersState: limitOrdersState,
		} = await setupAllContracts({
			accounts,
			contracts: ['LimitOrdersState', 'LimitOrders', 'Synthetix', 'Proxy', 'AddressResolver'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('given an instance', () => {
		it('should set constructor params on deployment', async () => {
			const instance = await LimitOrders.new(proxy, owner, addressResolver.address);
			assert.equal(await instance.proxy(), proxy);
			assert.equal(await instance.owner(), owner);
			assert.equal(await instance.resolver(), addressResolver.address);
		});

		it('should not have orders', async () => {
			assert.bnEqual(await limitOrders.getLatestID(), 0);
		});

		describe('new order', () => {
			it('should not create an order if sourceAmount equals 0', async () => {
				const sourceAmount = toUnit('0');
				const minDestinationAmount = toUnit('100');
				const executionFee = toUnit('0');
				await assert.revert(
					limitOrders.createOrder(sUSD, sourceAmount, sBTC, minDestinationAmount, executionFee, {
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
					limitOrders.createOrder(sUSD, sourceAmount, sBTC, minDestinationAmount, executionFee, {
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
					limitOrders.createOrder(sUSD, sourceAmount, sBTC, minDestinationAmount, executionFee, {
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

				const orderCount = await limitOrders.getLatestID();

				await limitOrders.createOrder(
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

				assert.equal(await limitOrders.getLatestID(), orderCount.toNumber() + 1);
			});
		});
		describe('cancel order', () => {
			let lastOrderID;
			beforeEach(async () => {
				const sourceAmount = toUnit('1');
				const minDestinationAmount = toUnit('1');
				const executionFee = toUnit('1');
				const weiDeposit = toUnit('1.2');

				await limitOrders.createOrder(
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
				lastOrderID = await limitOrders.getLatestID();
			});
			it('should cancel the order', async () => {
				await limitOrders.cancelOrder(lastOrderID, { from: account1 });
				const lastOrder = await limitOrders.getOrder(lastOrderID);
				assert.equal(lastOrder.submitter, ZERO_ADDRESS);
			});
			it('should not cancel the order if signer is not submitter', async () => {
				await assert.revert(
					limitOrders.cancelOrder(lastOrderID, { from: account2 }),
					'Sender must be the order submitter'
				);
			});
			it('should not cancel the order if order does not exist', async () => {
				await assert.revert(
					limitOrders.cancelOrder(2, { from: account1 }),
					'Order already executed or cancelled'
				);
			});
		});
		describe('execute order', () => {
			let lastOrderID;
			beforeEach(async () => {
				const sourceAmount = toUnit('1');
				const minDestinationAmount = toUnit('1');
				const executionFee = toUnit('1');
				const weiDeposit = toUnit('1.2');

				await limitOrders.createOrder(
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
				lastOrderID = await limitOrders.getLatestID();
			});
			it('should execute the order if destinationCurrency price allows to buy an amount >= minDestinationAmount', async () => {});
		});
	});
});
