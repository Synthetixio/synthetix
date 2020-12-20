'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const State = artifacts.require('State');
const TestableState = artifacts.require('TestableState');

contract('State', accounts => {
	const [deployerAccount, owner, associatedContract, account2] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: State.abi,
			ignoreParents: ['Owned'],
			expected: ['setAssociatedContract'],
		});
	});

	it('it fails when instantiated directly', async () => {
		try {
			await State.new(owner);
			assert.fail('Should not have succeeded');
		} catch (err) {
			// Note: this fails with the below:
			// 		Error: State error: contract binary not set. Can't deploy new instance.
			// 		This contract may be abstract, not implement an abstract parent's methods completely
			// 		or not invoke an inherited contract's constructor correctly
			// This is because the contract's bytecode is empty as solc can tell it doesn't implement the superclass
			// of Owned in its constructor
		}
	});

	describe('when instantiated by a contract', () => {
		let instance;
		beforeEach(async () => {
			// the owner is the associated contract, so we can simulate
			instance = await TestableState.new(owner, associatedContract, {
				from: deployerAccount,
			});
		});

		it('the associated contract is set as expected', async () => {
			assert.equal(await instance.associatedContract(), associatedContract);
		});

		describe('setAssociatedContract()', () => {
			it('can only be invoked by the owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.setAssociatedContract,
					accounts,
					address: owner,
					args: [account2],
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('when invoked by the owner, it changes the associated owner', async () => {
				await instance.setAssociatedContract(account2, { from: owner });
				assert.equal(await instance.associatedContract(), account2);
			});
		});

		describe('onlyAssociatedContract modifier', () => {
			describe('when applied to a function', () => {
				beforeEach(async () => {
					await instance.setAssociatedContract(account2, { from: owner });
				});
				it('then that function cannot be invoked by anyone else ', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: instance.testModifier,
						accounts,
						address: account2,
						args: [],
						reason: 'Only the associated contract can perform this action',
					});
				});
			});
		});
	});
});
