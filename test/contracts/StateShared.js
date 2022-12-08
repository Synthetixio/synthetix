'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const { onlyGivenAddressesCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const StateShared = artifacts.require('StateShared');
const TestableStateShared = artifacts.require('TestableStateShared');

contract('StateShared', accounts => {
	const [deployerAccount, owner, associatedContract, account2] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: StateShared.abi,
			ignoreParents: ['Owned'],
			expected: ['addAssociatedContracts', 'removeAssociatedContracts'],
		});
	});

	it('it fails when instantiated directly', async () => {
		try {
			await StateShared.new(owner);
			assert.fail('Should not have succeeded');
		} catch (err) {
			// Note: this fails with the below:
			// 		Error: StateShared error: contract binary not set. Can't deploy new instance.
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
			instance = await TestableStateShared.new(owner, [associatedContract], {
				from: deployerAccount,
			});
		});

		it('the associated contract is set as expected', async () => {
			assert.deepEqual(await instance.associatedContracts(), [associatedContract]);
		});

		describe('setAssociatedContracts()', () => {
			it('can only be invoked by the owner', async () => {
				await onlyGivenAddressesCanInvoke({
					fnc: instance.addAssociatedContracts,
					accounts,
					addresses: [owner],
					args: [[account2]],
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('when invoked by the owner, it adds the associated owner', async () => {
				await instance.addAssociatedContracts([account2], { from: owner });
				assert.deepEqual(await instance.associatedContracts(), [associatedContract, account2]);
			});
		});

		describe('removeAssociatedContracts()', () => {
			it('can only be invoked by the owner', async () => {
				await onlyGivenAddressesCanInvoke({
					fnc: instance.removeAssociatedContracts,
					accounts,
					addresses: [owner],
					args: [[associatedContract]],
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('when invoked by the owner, it removes the associated owner', async () => {
				await instance.addAssociatedContracts([account2], { from: owner });
				await instance.removeAssociatedContracts([associatedContract], { from: owner });
				assert.deepEqual(await instance.associatedContracts(), [account2]);
			});
		});

		describe('onlyAssociatedContracts modifier', () => {
			describe('when applied to a function', () => {
				beforeEach(async () => {
					await instance.addAssociatedContracts([account2], { from: owner });
				});
				it('then that function cannot be invoked by anyone else ', async () => {
					await onlyGivenAddressesCanInvoke({
						fnc: instance.testModifier,
						accounts,
						addresses: [associatedContract, account2],
						args: [],
						reason: 'Only an associated contract can perform this action',
					});
				});

				it('removing an associated function revokes access to it ', async () => {
					await instance.removeAssociatedContracts([associatedContract], { from: owner });
					await onlyGivenAddressesCanInvoke({
						fnc: instance.testModifier,
						accounts,
						addresses: [account2],
						args: [],
						reason: 'Only an associated contract can perform this action',
					});
				});
			});
		});
	});
});
