'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert } = require('./common');

const MinimalProxyFactory = artifacts.require('TestableMinimalProxyFactory');
const MockMutator = artifacts.require('MockMutator');
const MockPayable = artifacts.require('MockPayable');
const MockReverter = artifacts.require('MockReverter');

const { buildMinimalProxyCode, getEventByName } = require('./helpers');

const { toBN } = web3.utils;

contract('MinimalProxyFactory', async accounts => {
	let minimalProxyFactory;
	let mockMutator, mockPayable, mockReverter;

	before(async () => {
		mockMutator = await MockMutator.new();
		mockPayable = await MockPayable.new();
		mockReverter = await MockReverter.new();
	});

	beforeEach(async () => {
		minimalProxyFactory = await MinimalProxyFactory.new();
	});

	it('generates the correct create data', async () => {
		let proxyCreateData = await minimalProxyFactory.generateMinimalProxyCreateData(accounts[0]);
		proxyCreateData = proxyCreateData.replace(/^0x/, '');

		assert.equal(proxyCreateData.length, 110); // 55 bytes
		assert.equal(proxyCreateData.substring(0, 20), '3d602d80600a3d3981f3'); // constructor
		assert.equal(
			proxyCreateData.substring(20), // code
			buildMinimalProxyCode(accounts[0], {
				includePrefix: false,
			})
		);
	});

	describe('proxy can invoke non-payable functionality', () => {
		let instance;

		beforeEach(async () => {
			const tx = await minimalProxyFactory.cloneAsMinimalProxy(
				mockMutator.address,
				'Failed to clone'
			);
			instance = await MockMutator.at(getEventByName({ tx, name: 'CloneDeployed' }).args.clone);
		});

		it('can execute functions', async () => {
			const initialCount = await instance.read();
			await instance.update();
			assert.bnEqual(await instance.read(), initialCount.add(toBN('1')));
		});

		it('cannot send ETH if function is not payable', async () => {
			await assert.revert(instance.update({ value: '100' }));
		});
	});

	describe('proxy can invoke payable functionality', () => {
		let instance;

		beforeEach(async () => {
			const tx = await minimalProxyFactory.cloneAsMinimalProxy(
				mockPayable.address,
				'Failed to clone'
			);
			instance = await MockPayable.at(getEventByName({ tx, name: 'CloneDeployed' }).args.clone);
		});

		it('can send ETH on calls', async () => {
			const amount = '100';
			const initialBalance = toBN(await web3.eth.getBalance(instance.address));
			const initialPaidTimes = await instance.paidTimes();

			await instance.pay({ value: amount });

			const afterBalance = toBN(await web3.eth.getBalance(instance.address));
			assert.bnEqual(afterBalance, initialBalance.add(toBN(amount)));
			assert.bnEqual(await instance.paidTimes(), initialPaidTimes.add(toBN('1')));
		});
	});

	describe('proxy can handle reverts', () => {
		let instance;

		beforeEach(async () => {
			const tx = await minimalProxyFactory.cloneAsMinimalProxy(
				mockReverter.address,
				'Failed to clone'
			);
			instance = await MockReverter.at(getEventByName({ tx, name: 'CloneDeployed' }).args.clone);
		});

		it('can forwards reverts', async () => {
			const revertMsg = 'MinimalProxy: forwarded revert';
			await assert.revert(instance.revertWithMsg(revertMsg), revertMsg);
		});
	});
});
