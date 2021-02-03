'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert } = require('./common');

const SafeDecimalMath = artifacts.require('SafeDecimalMath');
const PublicMath = artifacts.require('PublicMath');

const { toUnit } = require('../utils')();

const { toBN } = web3.utils;

contract('Math', async () => {
	let instance;

	before(async () => {
		PublicMath.link(await SafeDecimalMath.new());
	});

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		instance = await PublicMath.new();
	});

	// -----------------------
	// powerDecimal
	// -----------------------
	it('should correctly calculate x^0 as 1', async () => {
		assert.bnEqual(await instance.powerDecimal(toUnit('46'), toBN('0')), toUnit(1));
		assert.bnEqual(await instance.powerDecimal(toUnit('1000000000'), toBN('0')), toUnit(1));
		assert.bnEqual(await instance.powerDecimal(toBN('1'), toBN('0')), toUnit(1));
	});

	it('should return correct results for expected power for x^1 as x', async () => {
		assert.bnEqual(await instance.powerDecimal(toUnit('10'), toBN('1')), toUnit('10'));
		assert.bnEqual(await instance.powerDecimal(toUnit('46'), toBN('1')), toUnit('46'));
	});

	it('should return correct results for expected power for x^2', async () => {
		assert.bnEqual(await instance.powerDecimal(toUnit('10'), toBN('2')), toUnit('100'));
		assert.bnEqual(await instance.powerDecimal(toUnit('5'), toBN('2')), toUnit('25'));
		assert.bnEqual(await instance.powerDecimal(toUnit('2'), toBN('2')), toUnit('4'));
	});

	it('should return correct results for expected power for x^n', async () => {
		assert.bnEqual(await instance.powerDecimal(toUnit('10'), toBN('1')), toUnit('10'));
		assert.bnEqual(await instance.powerDecimal(toUnit('10'), toBN('2')), toUnit('100'));
		assert.bnEqual(await instance.powerDecimal(toUnit('10'), toBN('3')), toUnit('1000'));
		assert.bnEqual(await instance.powerDecimal(toUnit('10'), toBN('4')), toUnit('10000'));
		assert.bnEqual(await instance.powerDecimal(toUnit('10'), toBN('5')), toUnit('100000'));
	});
	it('should return correct results for expected power of decimals x^n', async () => {
		assert.bnEqual(await instance.powerDecimal(toUnit('1.25'), toBN('1')), toUnit('1.25'));
		assert.bnEqual(await instance.powerDecimal(toUnit('1.25'), toBN('2')), toUnit('1.5625'));
		assert.bnEqual(await instance.powerDecimal(toUnit('1.25'), toBN('3')), toUnit('1.953125'));
		assert.bnEqual(await instance.powerDecimal(toUnit('1.25'), toBN('4')), toUnit('2.44140625'));
	});
	it('should revert overflow uint when base number power to x^n is too large', async () => {
		await assert.revert(
			instance.powerDecimal(toUnit('10000000000000000000000000000'), toBN('100'))
		);
	});
});
