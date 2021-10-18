const { contract, artifacts } = require('hardhat');
const { assert } = require('./common');
const { toUnit } = require('../utils')();
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

	it('Can get threshold', async () => {
		const threshold = await testableDynamicFee.testThreshold();
		assert.bnEqual(threshold, toUnit('0.004'));
	});

	it('Can get weight decay', async () => {
		const weightDecay = await testableDynamicFee.testWeightDecay();
		assert.bnEqual(weightDecay, toUnit('0.9'));
	});

	it('Can get price differential', async () => {
		const priceDiff = await testableDynamicFee.testGetPriceDifferential(
			toUnit('102'),
			toUnit('101')
		);
		assert.bnEqual(priceDiff, '5900990099009900');
	});

	it('Can get price weight', async () => {
		const priceWeight0 = await testableDynamicFee.testGetPriceWeight('0');
		assert.bnEqual(priceWeight0, toUnit('1'));

		const priceWeight1 = await testableDynamicFee.testGetPriceWeight('1');
		assert.bnEqual(priceWeight1, toUnit('0.9'));

		const priceWeight2 = await testableDynamicFee.testGetPriceWeight('2');
		assert.bnEqual(priceWeight2, toUnit('0.81'));
	});

	it('Can get dynamic fee', async () => {
		const prices = [
			toUnit('49234.65005734'),
			toUnit('49535.05178912'),
			toUnit('49714.05205647'),
			toUnit('49691.8024553899'),
			toUnit('49714.05205647'),
			toUnit('49722.83886705'),
			toUnit('49838.87627216'),
			toUnit('49842.74988613'),
			toUnit('49933.34034209'),
			toUnit('49871.92313713'),
		];
		const dynamicFee = await testableDynamicFee.testGetDynamicFee(prices);
		assert.bnEqual(dynamicFee, '2064427530203592');
	});
});
