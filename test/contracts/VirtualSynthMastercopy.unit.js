'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const { ensureOnlyExpectedMutativeFunctions, trimUtf8EscapeChars } = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS, ZERO_BYTES32 },
} = require('../..');

const VirtualSynth = artifacts.require('VirtualSynth');
const VirtualSynthMastercopy = artifacts.require('VirtualSynthMastercopy');

contract('VirtualSynthMastercopy (unit tests)', async accounts => {
	const [, owner, mockResolver, mockSynth] = accounts;

	it('ensure same functions as VirtualSynth are mutative', () => {
		for (const abi of [VirtualSynth.abi, VirtualSynthMastercopy.abi]) {
			ensureOnlyExpectedMutativeFunctions({
				abi,
				ignoreParents: ['ERC20'],
				expected: ['initialize', 'settle'],
			});
		}
	});

	describe('with instance', () => {
		let instance;

		before(async () => {});

		beforeEach(async () => {
			instance = await VirtualSynthMastercopy.new();
		});

		it('is initialized', async () => {
			assert.isTrue(await instance.initialized());
		});

		it('and the instance cannot be initialized again', async () => {
			await assert.revert(
				instance.initialize(mockSynth, mockResolver, owner, '10', toBytes32('sUSD')),
				'vSynth already initialized'
			);
		});

		it('and the state is empty', async () => {
			assert.equal(await instance.synth(), ZERO_ADDRESS);
			assert.equal(await instance.resolver(), ZERO_ADDRESS);
			assert.equal(await instance.totalSupply(), '0');
			assert.equal(await instance.balanceOf(owner), '0');
			assert.equal(await instance.balanceOfUnderlying(owner), '0');
			assert.equal(await instance.currencyKey(), ZERO_BYTES32);
			assert.equal(trimUtf8EscapeChars(await instance.name()), 'Virtual Synth ');
			assert.equal(trimUtf8EscapeChars(await instance.symbol()), 'v');
		});

		it('and state-dependent functions fail', async () => {
			await assert.revert(instance.secsLeftInWaitingPeriod());
			await assert.revert(instance.readyToSettle());
		});
	});
});
