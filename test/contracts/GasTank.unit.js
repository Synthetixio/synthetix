'use strict';

const { web3 } = require('@nomiclabs/buidler');
const { toBN } = web3.utils;

const GasTank = artifacts.require('GasTank');
const FakeGasTank = artifacts.require('FakeGasTank');
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

const { toUnit } = require('../utils')();

const { assert } = require('./common');

contract('Gas Tank (unit tests)', async accounts => {
	const [deployerAccount, owner, , accountOne, accountTwo] = accounts;

	before(async () => {
		this.owner = owner;
	});

	beforeEach(async () => {
		this.instance = await FakeGasTank.new(owner, ZERO_ADDRESS);
	});

	describe('constructor', () => {
		it('should set constructor params on deployment', async () => {
			assert.equal(await this.instance.owner(), owner);
		});
	});

	describe('deposits', () => {
		it('should return 0 when address has not made any deposit', async () => {
			assert.equal(await this.instance.balanceOf(accountOne), 0);
		});

		describe('depositEther', () => {
			it('should show the amount in the account deposit', async () => {
				const depositAmount = toUnit('10');
				await this.instance.depositEther({ value: depositAmount, from: accountOne });
				assert.bnEqual(await this.instance.balanceOf(accountOne), toBN(depositAmount));
			});

			it('should revert if the amount equals 0', async () => {
				await assert.revert(
					this.instance.depositEther({ value: 0, from: accountOne }),
					'Deposit must be greater than 0'
				);
			});
		});

		describe('withdrawEther', () => {
			const depositAmount = toUnit('10');
			beforeEach(async () => {
				await this.instance.depositEther({ value: depositAmount, from: accountOne });
			});
			it('should allow the account to withdraw their whole deposit', async () => {
				// Balance should be equal to depositAmount
				assert.bnEqual(await this.instance.balanceOf(accountOne), toBN(depositAmount));

				await this.instance.withdrawEther(depositAmount, { from: accountOne });
				assert.equal(await this.instance.balanceOf(accountOne), 0);
			});

			it('should allow the account to withdraw a part of their deposit', async () => {
				const withdrawAmount = toUnit('6');
				// Balance should be equal to depositAmount
				assert.bnEqual(await this.instance.balanceOf(accountOne), toBN(depositAmount));

				await this.instance.withdrawEther(withdrawAmount, { from: accountOne });
				assert.bnEqual(
					await this.instance.balanceOf(accountOne),
					toBN(depositAmount).sub(toBN(withdrawAmount))
				);
			});

			it('should revert if the account tries to withdraw more than current balance', async () => {
				const withdrawAmount = toUnit('11');
				await assert.revert(
					this.instance.withdrawEther(withdrawAmount, { from: accountOne }),
					'revert SafeMath'
				);
			});
		});
	});

	describe('maxGasPrice', () => {
		describe('maxGasPriceOf', () => {
			it('should return 0 when account has not set any max gas price', async () => {
				assert.equal(await this.instance.maxGasPriceOf(accountOne), 0);
			});
		});
		describe('setMaxGasPrice', () => {
			it('should set the max gas price for the sender', async () => {
				const maxGasPrice = toUnit('100');
				await this.instance.setMaxGasPrice(maxGasPrice, { from: accountOne });
				assert.bnEqual(await this.instance.maxGasPriceOf(accountOne), maxGasPrice);
			});
		});
	});
});
