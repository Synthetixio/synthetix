'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const BaseMigration = artifacts.require('BaseMigration');
const MockMigration = artifacts.require('MockMigration');
const TokenState = artifacts.require('TokenState');
const LegacyTokenState = artifacts.require('LegacyTokenState');
const VirtualSynth = artifacts.require('VirtualSynth');

const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');

contract('BaseMigration', async accounts => {
	const [deployerAccount, owner] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: BaseMigration.abi,
			ignoreParents: ['Owned'],
			expected: ['returnOwnership'],
		});
	});

	it('it fails when instantiated directly', async () => {
		try {
			await BaseMigration.new(owner);
			assert.fail('Should not have succeeded');
		} catch (err) {
			// Note: this fails with the below:
			// 		Error: BaseMigration error: contract binary not set. Can't deploy new instance.
			// 		This contract may be abstract, not implement an abstract parent's methods completely
			// 		or not invoke an inherited contract's constructor correctly
			// This is because the contract's bytecode is empty as solc can tell it doesn't implement the superclass
			// of Owned in its constructor
		}
	});

	describe('when extended by a contract', () => {
		let instance;
		beforeEach(async () => {
			// the owner is the associated contract, so we can simulate
			instance = await MockMigration.new(owner, {
				from: deployerAccount,
			});
		});

		it('deployer is set', async () => {
			assert.equal(await instance.deployer(), deployerAccount);
		});

		it('owner is set', async () => {
			assert.equal(await instance.owner(), owner);
		});

		describe('when the onlyDeployer modifier is used', () => {
			it('only allows the deployer to execute', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.canOnlyBeRunByDeployer,
					args: [],
					address: deployerAccount,
					accounts,
				});
			});
		});

		describe('when ownership needs returning', () => {
			let contractThatIsOwned;
			let legacyContractThatIsOwned;
			beforeEach(async () => {
				contractThatIsOwned = await TokenState.new(owner, owner);
				legacyContractThatIsOwned = await LegacyTokenState.new(owner, owner);
			});
			describe('when these contracts have the mock migration as their nominated owner', () => {
				beforeEach(async () => {
					await contractThatIsOwned.nominateNewOwner(instance.address, { from: owner });
					await legacyContractThatIsOwned.nominateOwner(instance.address, { from: owner });
					// ensure both expose functions as expected
					assert.equal(await contractThatIsOwned.nominatedOwner(), instance.address);
					assert.equal(await legacyContractThatIsOwned.nominatedOwner(), instance.address);
				});
				describe('and when the mock migration has accepted ownership over them', () => {
					beforeEach(async () => {
						await instance.acceptOwnership(contractThatIsOwned.address);
						await instance.acceptOwnership(legacyContractThatIsOwned.address);
						// ensure acceptOwnership in the mock worked
						assert.equal(await contractThatIsOwned.owner(), instance.address);
						assert.equal(await legacyContractThatIsOwned.owner(), instance.address);
					});
					describe('when returnOwnership is invoked on a regular Owned', () => {
						beforeEach(async () => {
							await instance.returnOwnership(contractThatIsOwned.address);
						});
						it('then the nominated owner is updated', async () => {
							assert.equal(await contractThatIsOwned.nominatedOwner(), owner);
						});
					});
					describe('when returnOwnership is invoked on a legacy Owned', () => {
						beforeEach(async () => {
							await instance.returnOwnership(legacyContractThatIsOwned.address);
						});
						it('then the nominated owner is updated', async () => {
							assert.equal(await legacyContractThatIsOwned.nominatedOwner(), owner);
						});
					});
				});
			});

			describe('when returnOwnership is invoked on something that is not Owned', () => {
				let forSomethingNotOwned;
				beforeEach(async () => {
					forSomethingNotOwned = await VirtualSynth.new();
				});
				it('then the function reverts', async () => {
					await assert.revert(
						instance.returnOwnership(forSomethingNotOwned.address),
						'Legacy nomination failed'
					);
				});
			});
		});
	});
});
