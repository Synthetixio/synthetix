'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { toUnit } = require('../utils')();

const TokenState = artifacts.require('TokenState');

contract('TokenState @ovm-skip', accounts => {
	const [deployerAccount, owner, associatedContract, account2] = accounts;

	let instance;
	beforeEach(async () => {
		// the owner is the associated contract, so we can simulate
		instance = await TokenState.new(owner, associatedContract, {
			from: deployerAccount,
		});
	});
	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: TokenState.abi,
			ignoreParents: ['State'],
			expected: ['setAllowance', 'setBalanceOf'],
		});
	});
	describe('setAllowance()', () => {
		it('can only be invoked by the associated contracts', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: instance.setAllowance,
				accounts,
				address: associatedContract,
				args: [associatedContract, associatedContract, toUnit('1')],
			});
		});
		it('when invoked, it sets the correct allowance', async () => {
			assert.equal(await instance.allowance(owner, account2), '0');
			await instance.setAllowance(owner, account2, toUnit('100'), { from: associatedContract });
			assert.bnEqual(await instance.allowance(owner, account2), toUnit('100'));
			// but not for any other user
			assert.equal(await instance.allowance(account2, owner), '0');
			assert.equal(await instance.allowance(owner, associatedContract), '0');
		});
	});
	describe('setBalanceOf()', () => {
		it('can only be invoked by the associated contracts', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: instance.setBalanceOf,
				accounts,
				address: associatedContract,
				args: [associatedContract, toUnit('1')],
			});
		});
		it('when invoked, it sets the correct balance', async () => {
			assert.equal(await instance.balanceOf(account2), '0');
			await instance.setBalanceOf(account2, toUnit('25'), { from: associatedContract });
			assert.bnEqual(await instance.balanceOf(account2), toUnit('25'));
			// but not for any other user
			assert.equal(await instance.balanceOf(owner), '0');
			assert.equal(await instance.balanceOf(associatedContract), '0');
		});
	});
});
