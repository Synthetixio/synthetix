const { contract, artifacts } = require('hardhat');
const { assert } = require('../common');
const { toUnit } = require('../../utils')();
const SafeDecimalMath = artifacts.require('SafeDecimalMath');
const DynamicFee = artifacts.require('DynamicFee');
const TestableDynamicFee = artifacts.require('TestableDynamicFee');

contract('TestableDynamicFee', () => {
	let testableDynamicFee;

	before(async () => {
		DynamicFee.link(await SafeDecimalMath.new());
		TestableDynamicFee.link(await DynamicFee.new());
		testableDynamicFee = await TestableDynamicFee.new();
	});

	it('Can get dynamic fee', async () => {
		const prices = [toUnit('102'), toUnit('101'), toUnit('100')];
		const dynamicFee = await testableDynamicFee.testGetDynamicFee(prices);
		assert.bnEqual(dynamicFee, '18900990099009900');
	});
});
