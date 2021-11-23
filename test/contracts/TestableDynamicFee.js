const { contract, artifacts } = require('hardhat');
const { assert } = require('./common');
const { toUnit } = require('../utils')();
const SafeDecimalMath = artifacts.require('SafeDecimalMath');
const DynamicFee = artifacts.require('DynamicFee');
const TestableDynamicFee = artifacts.require('TestableDynamicFee');

contract('TestableDynamicFee', () => {
	let testableDynamicFee;

	before(async () => {
		const safeDecimalMath = await SafeDecimalMath.new();
		DynamicFee.link(safeDecimalMath);
		TestableDynamicFee.link(safeDecimalMath);
		TestableDynamicFee.link(await DynamicFee.new());
		testableDynamicFee = await TestableDynamicFee.new();
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

	it('Can get dynamic fee round 14-23', async () => {
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
		const dynamicFee = await testableDynamicFee.testGetDynamicFee(prices, '0');
		assert.bnEqual(dynamicFee, '2064427530203592');
	});

	it('Can get dynamic fee round 15-24', async () => {
		const prices = [
			toUnit('49190.99117585'),
			toUnit('49234.65005734'),
			toUnit('49535.05178912'),
			toUnit('49714.05205647'),
			toUnit('49691.8024553899'),
			toUnit('49714.05205647'),
			toUnit('49722.83886705'),
			toUnit('49838.87627216'),
			toUnit('49842.74988613'),
			toUnit('49933.34034209'),
		];
		const dynamicFee = await testableDynamicFee.testGetDynamicFee(prices, '0');
		assert.bnEqual(dynamicFee, '1857984777183232');
	});

	it('Can get dynamic fee round 34-43', async () => {
		const prices = [
			toUnit('48364.4121895'),
			toUnit('48954.93260767'),
			toUnit('48964.89486113'),
			toUnit('49054.03062906'),
			toUnit('49009.46274509'),
			toUnit('49054.03062906'),
			toUnit('49093.89744338'),
			toUnit('49095.24231598'),
			toUnit('49101.41'),
			toUnit('49208'),
		];
		const dynamicFee = await testableDynamicFee.testGetDynamicFee(prices, '0');
		assert.bnEqual(dynamicFee, '8062531530836597');
	});
});
