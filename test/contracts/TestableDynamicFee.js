const { contract, artifacts } = require('hardhat');
const { assert } = require('./common');
const { toUnit } = require('../utils')();
const SafeDecimalMath = artifacts.require('SafeDecimalMath');
const DynamicFee = artifacts.require('DynamicFee');
const TestableDynamicFee = artifacts.require('TestableDynamicFee');

contract('DynamicFee', () => {
	let testableDynamicFee;

	before(async () => {
		const safeDecimalMath = await SafeDecimalMath.new();
		DynamicFee.link(safeDecimalMath);
		TestableDynamicFee.link(safeDecimalMath);
		TestableDynamicFee.link(await DynamicFee.new());
		testableDynamicFee = await TestableDynamicFee.new();
	});

	it('Can get price differential', async () => {
		const priceDiff1 = await testableDynamicFee.testGetPriceDifferential(toUnit('8'), toUnit('10'));
		assert.bnEqual(priceDiff1, '196000000000000000');
		const priceDiff2 = await testableDynamicFee.testGetPriceDifferential(
			toUnit('12'),
			toUnit('10')
		);
		assert.bnEqual(priceDiff2, '196000000000000000');
		assert.bnEqual(priceDiff1, priceDiff2);
	});

	it('Can get price weight', async () => {
		const priceWeight0 = await testableDynamicFee.testGetPriceWeight('0');
		assert.bnEqual(priceWeight0, toUnit('1'));

		const priceWeight1 = await testableDynamicFee.testGetPriceWeight('1');
		assert.bnEqual(priceWeight1, toUnit('0.9'));

		const priceWeight2 = await testableDynamicFee.testGetPriceWeight('2');
		assert.bnEqual(priceWeight2, toUnit('0.81'));
	});

	it('Can get dynamic fee according to SIP feasibility spreadsheet round 13-22, all below threshold', async () => {
		const prices = [
			toUnit('49535.05178912'),
			toUnit('49714.05205647'),
			toUnit('49691.8024553899'),
			toUnit('49714.05205647'),
			toUnit('49722.83886705'),
			toUnit('49838.87627216'),
			toUnit('49842.74988613'),
			toUnit('49933.34034209'),
			toUnit('49871.92313713'),
			toUnit('49981'),
			toUnit('49960.65493467'),
			toUnit('49994'),
		];
		const dynamicFee = await testableDynamicFee.testGetDynamicFee(prices);
		assert.bnEqual(dynamicFee, '0');
	});

	it('Can get dynamic fee according to SIP feasibility spreadsheet round 14-23, last one above threshold', async () => {
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
			toUnit('49981'),
		];
		const dynamicFee = await testableDynamicFee.testGetDynamicFee(prices);
		assert.bnEqual(dynamicFee, '2064427530203592');
	});

	it('Can get dynamic fee according to SIP feasibility spreadsheet round 23-32, first one above threshold', async () => {
		const prices = [
			toUnit('49198.77'),
			toUnit('49143.5399999999'),
			toUnit('49096.77'),
			toUnit('49131.10261767'),
			toUnit('49088.63670793'),
			toUnit('49046.17079819'),
			toUnit('49088.63670793'),
			toUnit('49234.65005734'),
			toUnit('49190.99117585'),
			toUnit('49234.65005734'),
			toUnit('49535.05178912'),
		];
		const dynamicFee = await testableDynamicFee.testGetDynamicFee(prices);
		assert.bnEqual(dynamicFee, '799801523256537');
	});

	it('Can get dynamic fee according to SIP feasibility spreadsheet round 63-72, 70% above threshold', async () => {
		const prices = [
			toUnit('44661.70868763'),
			toUnit('44672.6561639399'),
			toUnit('45483.8961602099'),
			toUnit('45586.5085919099'),
			toUnit('45919.00562933'),
			toUnit('46183.17440371'),
			toUnit('46217.7336139799'),
			toUnit('46463.74676537'),
			toUnit('46675.18493538'),
			toUnit('46948.76815888'),
			toUnit('47222.35138239'),
			toUnit('47382.88726893'),
		];
		const dynamicFee = await testableDynamicFee.testGetDynamicFee(prices);
		assert.bnEqual(dynamicFee, '18366333809739328');
	});

	it('Can get the same dynamic fee according to SIP feasibility spreadsheet round 58-67, 50% above threshold', async () => {
		const prices = [
			toUnit('46183.17440371'),
			toUnit('46217.7336139799'),
			toUnit('46463.74676537'),
			toUnit('46675.18493538'),
			toUnit('46948.76815888'),
			toUnit('47222.35138239'),
			toUnit('47382.88726893'),
			toUnit('47449.76309439'),
			toUnit('47580.67384441'),
			toUnit('47670.81054939'),
			toUnit('47911.8471578599'),
		];
		const dynamicFee = await testableDynamicFee.testGetDynamicFee(prices);
		assert.bnEqual(dynamicFee, '4502723211780442');
	});
});
