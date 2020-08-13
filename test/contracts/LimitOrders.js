'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const LimitOrders = artifacts.require('LimitOrders');

const { toBytes32 } = require('../..');
const { toUnit } = require('../utils')();
const { setupAllContracts } = require('./setup');

const {
	getDecodedLogs,
	decodedEventEqual,
	proxyThruTo,
	getTransactionReceipt,
} = require('./helpers');

contract('LimitOrders', accounts => {
	const [, proxy, owner, account1] = accounts;
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
			contracts: ['LimitOrders', 'Synthetix', 'Proxy', 'AddressResolver', 'LimitOrdersState'],
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

		it.only('should not have orders', async () => {
			console.log(limitOrders.getLatestID);
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

				// const { tx: hash } = await proxyThruTo({
				// 	proxy: proxyLimitOrders,
				// 	target: limitOrders,
				// 	fncName: 'createOrder',
				// 	user: account1,
				// 	args: [sUSD, sourceAmount, sBTC, minDestinationAmount, executionFee],
				// 	value: weiDeposit,
				// });

				// const logs = await getDecodedLogs({ hash, contracts: [limitOrders] });

				// decodedEventEqual({
				// 	log: logs[0],
				// 	event: 'OrderCreated',
				// 	emittedFrom: proxyLimitOrders.address,
				// 	args: [sUSD, sourceAmount, sBTC, minDestinationAmount, executionFee],
				// });

				assert.equal(await limitOrders.getLatestID(), orderCount.toNumber() + 1);
			});
		});
	});
});
