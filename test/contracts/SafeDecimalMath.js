'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert } = require('./common');

const SafeDecimalMath = artifacts.require('SafeDecimalMath');
const PublicSafeDecimalMath = artifacts.require('PublicSafeDecimalMath');

const { toUnit, fromUnit, toPreciseUnit, fromPreciseUnit } = require('../utils')();

const { toBN } = web3.utils;

contract('SafeDecimalMath', async () => {
	let instance;

	before(async () => {
		PublicSafeDecimalMath.link(await SafeDecimalMath.new());
	});

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		instance = await PublicSafeDecimalMath.new();
	});

	// -----------------------
	// UNITS
	// -----------------------

	it('should have the correct unit', async () => {
		assert.bnEqual(await instance.unit(), toUnit('1'));
	});

	it('should have the correct precise unit', async () => {
		assert.bnEqual(await instance.preciseUnit(), toPreciseUnit('1'));
	});

	it('should be able to from and to both kinds of units without getting a different result', async () => {
		assert.equal(fromUnit(toUnit('1')), '1');
		assert.equal(fromPreciseUnit(toPreciseUnit('1')), '1');

		assert.equal(fromUnit(toUnit('0.5')), '0.5');
		assert.equal(fromPreciseUnit(toPreciseUnit('0.5')), '0.5');
	});

	// -----------------------
	// multiplyDecimal
	// -----------------------
	it('should return correct results for expected multiplications', async () => {
		assert.bnEqual(await instance.multiplyDecimal(toUnit('10'), toUnit('2')), toUnit('20'));
		assert.bnEqual(await instance.multiplyDecimal(toUnit('10'), toUnit('0.3')), toUnit('3'));
		assert.bnEqual(await instance.multiplyDecimal(toUnit('46'), toUnit('3')), toUnit('138'));
	});

	it('should correctly multiply by zero', async () => {
		assert.bnEqual(await instance.multiplyDecimal(toUnit('46'), toBN('0')), 0);
		assert.bnEqual(await instance.multiplyDecimal(toUnit('1000000000'), toBN('0')), 0);
		assert.bnEqual(await instance.multiplyDecimal(toBN('1'), toBN('0')), 0);
	});

	it('should correctly multiply by one', async () => {
		assert.bnEqual(await instance.multiplyDecimal(toUnit('46'), toUnit('1')), toUnit('46'));
		assert.bnEqual(
			await instance.multiplyDecimal(toUnit('1000000000'), toUnit('1')),
			toUnit('1000000000')
		);
	});

	it('should apply decimal multiplication commutatively', async () => {
		assert.bnEqual(
			await instance.multiplyDecimal(toUnit('1.5'), toUnit('7')),
			await instance.multiplyDecimal(toUnit('7'), toUnit('1.5'))
		);

		assert.bnEqual(
			await instance.multiplyDecimal(toUnit('234098'), toUnit('7')),
			await instance.multiplyDecimal(toUnit('7'), toUnit('234098'))
		);
	});

	it('should revert multiplication on overflow', async () => {
		await assert.revert(
			instance.multiplyDecimal(
				toUnit('10000000000000000000000000000'),
				toUnit('10000000000000000000000000000')
			)
		);
	});

	it('should truncate instead of rounding when multiplying', async () => {
		const oneAbove = toUnit('1').add(toBN('1'));
		const oneBelow = toUnit('1').sub(toBN('1'));

		assert.bnEqual(await instance.multiplyDecimal(oneAbove, oneBelow), oneBelow);
	});

	// -----------------------
	// divideDecimal
	// -----------------------

	it('should divide decimals correctly', async () => {
		assert.bnEqual(await instance.divideDecimal(toUnit('1'), toUnit('4')), toUnit('0.25'));
		assert.bnEqual(await instance.divideDecimal(toUnit('20'), toUnit('4')), toUnit('5'));
		assert.bnEqual(await instance.divideDecimal(toUnit('20'), toUnit('0.25')), toUnit('80'));
	});

	it('should revert on divide by zero', async () => {
		await assert.revert(instance.divideDecimal(toUnit('1'), toUnit('0')));
		await assert.revert(instance.divideDecimal(toUnit('100'), toUnit('0')));
		await assert.revert(instance.divideDecimal(toUnit('0.25'), toUnit('0')));
	});

	it('should correctly divide by one', async () => {
		assert.bnEqual(await instance.divideDecimal(toUnit('1'), toUnit('1')), toUnit('1'));
		assert.bnEqual(await instance.divideDecimal(toUnit('100'), toUnit('1')), toUnit('100'));
		assert.bnEqual(await instance.divideDecimal(toUnit('0.25'), toUnit('1')), toUnit('0.25'));
	});

	it('should truncate instead of rounding when dividing', async () => {
		assert.bnEqual(
			await instance.divideDecimal(toUnit('2'), toUnit('3')),
			toUnit('0.666666666666666666')
		);
	});

	// -----------------------
	// multiplyDecimalRound
	// -----------------------

	it('should return correct results for expected rounding multiplications', async () => {
		assert.bnEqual(await instance.multiplyDecimalRound(toUnit('10'), toUnit('2')), toUnit('20'));
		assert.bnEqual(await instance.multiplyDecimalRound(toUnit('10'), toUnit('0.3')), toUnit('3'));
		assert.bnEqual(await instance.multiplyDecimalRound(toUnit('46'), toUnit('3')), toUnit('138'));
		assert.bnEqual(
			await instance.multiplyDecimalRound(toUnit('11.111111111111111111'), toUnit('0.5')),
			toUnit('5.555555555555555556')
		);
	});

	it('should correctly multiply and round by zero', async () => {
		assert.bnEqual(await instance.multiplyDecimalRound(toUnit('46'), toBN('0')), 0);
		assert.bnEqual(await instance.multiplyDecimalRound(toUnit('1000000000'), toBN('0')), 0);
		assert.bnEqual(await instance.multiplyDecimalRound(toBN('1'), toBN('0')), 0);
	});

	it('should correctly multiply and round by one', async () => {
		assert.bnEqual(await instance.multiplyDecimalRound(toUnit('46'), toUnit('1')), toUnit('46'));
		assert.bnEqual(
			await instance.multiplyDecimalRound(toUnit('1000000000'), toUnit('1')),
			toUnit('1000000000')
		);
	});

	it('should apply decimal and rounding multiplication commutatively', async () => {
		assert.bnEqual(
			await instance.multiplyDecimalRound(toUnit('1.5'), toUnit('7')),
			await instance.multiplyDecimalRound(toUnit('7'), toUnit('1.5'))
		);

		assert.bnEqual(
			await instance.multiplyDecimalRound(toUnit('234098'), toUnit('7')),
			await instance.multiplyDecimalRound(toUnit('7'), toUnit('234098'))
		);
	});

	it('should revert multiplication and rounding on overflow', async () => {
		await assert.revert(
			instance.multiplyDecimalRound(
				toUnit('10000000000000000000000000000'),
				toUnit('10000000000000000000000000000')
			)
		);
	});

	it('should round instead of truncating when multiplying with rounding', async () => {
		const oneAbove = toUnit('1').add(toBN('1'));
		const oneBelow = toUnit('1').sub(toBN('1'));

		assert.bnEqual(await instance.multiplyDecimalRound(oneAbove, oneBelow), toUnit('1'));
	});

	// -----------------------
	// divideDecimalRound
	// -----------------------
	it('should divide decimals and round correctly', async () => {
		assert.bnEqual(await instance.divideDecimalRound(toUnit('1'), toUnit('4')), toUnit('0.25'));
		assert.bnEqual(await instance.divideDecimalRound(toUnit('20'), toUnit('4')), toUnit('5'));
		assert.bnEqual(await instance.divideDecimalRound(toUnit('20'), toUnit('0.25')), toUnit('80'));
		assert.bnEqual(
			await instance.divideDecimalRound(toUnit('10'), toUnit('6')),
			toUnit('1.666666666666666667')
		);
	});

	it('should revert on divide by zero when rounding', async () => {
		await assert.revert(instance.divideDecimalRound(toUnit('1'), toUnit('0')));
		await assert.revert(instance.divideDecimalRound(toUnit('100'), toUnit('0')));
		await assert.revert(instance.divideDecimalRound(toUnit('0.25'), toUnit('0')));
	});

	it('should correctly divide by one when rounding', async () => {
		assert.bnEqual(await instance.divideDecimalRound(toUnit('1'), toUnit('1')), toUnit('1'));
		assert.bnEqual(await instance.divideDecimalRound(toUnit('100'), toUnit('1')), toUnit('100'));
		assert.bnEqual(await instance.divideDecimalRound(toUnit('0.25'), toUnit('1')), toUnit('0.25'));
	});

	it('should round instead of truncating when dividing and rounding', async () => {
		assert.bnEqual(
			await instance.divideDecimalRound(toUnit('2'), toUnit('3')),
			toUnit('0.666666666666666667')
		);
	});

	// -----------------------
	// multiplyDecimalRoundPrecise
	// -----------------------
	it('[precise] should return correct results for expected rounding multiplications', async () => {
		assert.bnEqual(
			await instance.multiplyDecimalRoundPrecise(toPreciseUnit('10'), toPreciseUnit('2')),
			toPreciseUnit('20')
		);
		assert.bnEqual(
			await instance.multiplyDecimalRoundPrecise(toPreciseUnit('10'), toPreciseUnit('0.3')),
			toPreciseUnit('3')
		);
		assert.bnEqual(
			await instance.multiplyDecimalRoundPrecise(toPreciseUnit('46'), toPreciseUnit('3')),
			toPreciseUnit('138')
		);

		assert.bnEqual(
			await instance.multiplyDecimalRoundPrecise(
				toPreciseUnit('11.111111111111111111111111111'),
				toPreciseUnit('0.5')
			),
			toPreciseUnit('5.555555555555555555555555556')
		);
	});

	it('[precise] should correctly multiply and round by zero', async () => {
		assert.bnEqual(await instance.multiplyDecimalRoundPrecise(toPreciseUnit('46'), toBN('0')), 0);
		assert.bnEqual(
			await instance.multiplyDecimalRoundPrecise(toPreciseUnit('1000000000'), toBN('0')),
			0
		);
		assert.bnEqual(await instance.multiplyDecimalRoundPrecise(toBN('1'), toBN('0')), 0);
	});

	it('[precise] should correctly multiply and round by one', async () => {
		assert.bnEqual(
			await instance.multiplyDecimalRoundPrecise(toPreciseUnit('46'), toPreciseUnit('1')),
			toPreciseUnit('46')
		);
		assert.bnEqual(
			await instance.multiplyDecimalRoundPrecise(toPreciseUnit('1000000000'), toPreciseUnit('1')),
			toPreciseUnit('1000000000')
		);
	});

	it('[precise] should apply decimal and rounding multiplication commutatively', async () => {
		assert.bnEqual(
			await instance.multiplyDecimalRoundPrecise(toPreciseUnit('1.5'), toPreciseUnit('7')),
			await instance.multiplyDecimalRoundPrecise(toPreciseUnit('7'), toPreciseUnit('1.5'))
		);

		assert.bnEqual(
			await instance.multiplyDecimalRoundPrecise(toPreciseUnit('234098'), toPreciseUnit('7')),
			await instance.multiplyDecimalRoundPrecise(toPreciseUnit('7'), toPreciseUnit('234098'))
		);
	});

	it('[precise] should revert multiplication and rounding on overflow', async () => {
		await assert.revert(
			instance.multiplyDecimalRoundPrecise(
				toPreciseUnit('1000000000000000000000'),
				toPreciseUnit('1000000000000000000000')
			)
		);
	});

	it('[precise] should round instead of truncating when multiplying with rounding', async () => {
		const oneAbove = toPreciseUnit('1').add(toBN('1'));
		const oneBelow = toPreciseUnit('1').sub(toBN('1'));

		assert.bnEqual(
			await instance.multiplyDecimalRoundPrecise(oneAbove, oneBelow),
			toPreciseUnit('1')
		);
	});

	// -----------------------
	// divideDecimalRoundPrecise
	// -----------------------
	it('[precise] should divide decimals and round correctly', async () => {
		assert.bnEqual(
			await instance.divideDecimalRoundPrecise(toPreciseUnit('1'), toPreciseUnit('4')),
			toPreciseUnit('0.25')
		);
		assert.bnEqual(
			await instance.divideDecimalRoundPrecise(toPreciseUnit('20'), toPreciseUnit('4')),
			toPreciseUnit('5')
		);
		assert.bnEqual(
			await instance.divideDecimalRoundPrecise(toPreciseUnit('20'), toPreciseUnit('0.25')),
			toPreciseUnit('80')
		);
		assert.bnEqual(
			await instance.divideDecimalRoundPrecise(toPreciseUnit('10'), toPreciseUnit('6')),
			toPreciseUnit('1.666666666666666666666666667')
		);
	});

	it('[precise] should revert on divide by zero when rounding', async () => {
		await assert.revert(instance.divideDecimalRoundPrecise(toPreciseUnit('1'), toBN('0')));
		await assert.revert(instance.divideDecimalRoundPrecise(toPreciseUnit('100'), toBN('0')));
		await assert.revert(instance.divideDecimalRoundPrecise(toPreciseUnit('0.25'), toBN('0')));
	});

	it('[precise] should correctly divide by one when rounding', async () => {
		assert.bnEqual(
			await instance.divideDecimalRoundPrecise(toPreciseUnit('1'), toPreciseUnit('1')),
			toPreciseUnit('1')
		);
		assert.bnEqual(
			await instance.divideDecimalRoundPrecise(toPreciseUnit('100'), toPreciseUnit('1')),
			toPreciseUnit('100')
		);
		assert.bnEqual(
			await instance.divideDecimalRoundPrecise(toPreciseUnit('0.25'), toPreciseUnit('1')),
			toPreciseUnit('0.25')
		);
	});

	it('[precise] should round instead of truncating when dividing and rounding', async () => {
		assert.bnEqual(
			await instance.divideDecimalRoundPrecise(toPreciseUnit('2'), toPreciseUnit('3')),
			toPreciseUnit('0.666666666666666666666666667')
		);
	});
});
