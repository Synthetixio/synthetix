'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const Math$ = artifacts.require('contracts/Math.sol:Math');
const SafeMath = artifacts.require('SafeMath');
const SafeDecimalMath = artifacts.require('SafeDecimalMath');
const SignedSafeMath = artifacts.require('SignedSafeMath');
const SignedSafeDecimalMath = artifacts.require('SignedSafeDecimalMath');
const SimulatedLiquidityMath = artifacts.require('SimulatedLiquidityMath');
const PublicSimulatedLiquidityMath = artifacts.require('PublicSimulatedLiquidityMath');

const { toUnit } = require('../utils')();

contract('SimulatedLiquidityMath', async () => {
	let instance;

	before(async () => {
		Math$.link(await SafeDecimalMath.new());
		Math$.link(await SignedSafeMath.new());
		Math$.link(await SignedSafeDecimalMath.new());

		SafeDecimalMath.link(SafeMath.new());

		SignedSafeDecimalMath.link();

		SimulatedLiquidityMath.link(await Math$.new());
		SimulatedLiquidityMath.link(await SafeDecimalMath.new());
		SimulatedLiquidityMath.link(await SignedSafeDecimalMath.new());
		PublicSimulatedLiquidityMath.link(await SimulatedLiquidityMath.new());
	});

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		instance = await PublicSimulatedLiquidityMath.new();
	});

	// -----------------------
	// UNITS
	// -----------------------

	it('getSimulatedPrice', async () => {
		const openInterest = toUnit('0');
		const priceImpactFactor = toUnit('0.02');
		const maxOpenInterest = toUnit('150000');
		const oraclePrice = toUnit('2000');
		const buyAmount = toUnit('20000');

		const { quotePrice, quoteAmount } = await instance.getSimulatedPrice(
			openInterest,
			priceImpactFactor,
			maxOpenInterest,
			oraclePrice,
			buyAmount
		);
		// console.log([quotePrice, quoteAmount].map(x => x.toString()));

		// exchange ETH amount=20,000.000 rate=2000 premium=0.00537 mark_price=2,010.731 quote_price=2,005.349 take_amount=40,106,984.985
		assert.bnClose(quotePrice, toUnit('2005.349'), toUnit('1'));
		assert.bnClose(quoteAmount, toUnit('40106984.985'), toUnit('10'));
	});
});
