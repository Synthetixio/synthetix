'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const SelfDestructible = artifacts.require('SelfDestructible');
const TestableSelfDestructible = artifacts.require('TestableSelfDestructible');

const { fastForward } = require('../utils')();

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

contract('SelfDestructible', async accounts => {
	const SELFDESTRUCT_DELAY = 2419200;

	const [deployerAccount, owner, account1] = accounts;

	let instance;

	// we must snapshot here so that invoking fastForward() later on in this test does not
	// pollute the global scope by moving on the block timestamp from its starting point
	addSnapshotBeforeRestoreAfterEach();

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SelfDestructible.abi,
			ignoreParents: ['Owned'],
			expected: [
				'setSelfDestructBeneficiary',
				'initiateSelfDestruct',
				'terminateSelfDestruct',
				'selfDestruct',
			],
		});
	});

	it('it fails when instantiated directly', async () => {
		try {
			await SelfDestructible.new();
			assert.fail('Should not have succeeded');
		} catch (err) {
			// Note: this fails with the below:
			// 		Error: SelfDestructible error: contract binary not set. Can't deploy new instance.
			// 		This contract may be abstract, not implement an abstract parent's methods completely
			// 		or not invoke an inherited contract's constructor correctly
			// This is because the contract's bytecode is empty as solc can tell it doesn't implement the superclass
			// of Owned in its constructor
		}
	});

	describe('when instantiated by a contract', () => {
		beforeEach(async () => {
			// the owner is the associated contract, so we can simulate
			instance = await TestableSelfDestructible.new(owner, {
				from: deployerAccount,
			});
		});
		it('on instantiation, the beneficiary is the owner', async () => {
			assert.equal(await instance.selfDestructBeneficiary(), owner);
		});

		describe('setSelfDestructBeneficiary()', () => {
			it('can only be invoked by the owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.setSelfDestructBeneficiary,
					accounts,
					address: owner,
					args: [account1],
				});
			});
			it('when invoked, it sets the beneficiary', async () => {
				const txn = await instance.setSelfDestructBeneficiary(account1, { from: owner });
				assert.equal(await instance.selfDestructBeneficiary(), account1);
				assert.eventEqual(txn, 'SelfDestructBeneficiaryUpdated', { newBeneficiary: account1 });
			});
		});

		describe('initiateSelfDestruct()', () => {
			it('can only be invoked by the owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.initiateSelfDestruct,
					accounts,
					address: owner,
					args: [],
				});
			});
			it('when invoked, it sets the flag', async () => {
				assert.equal(await instance.selfDestructInitiated(), false);
				assert.equal(await instance.initiationTime(), '0');
				const txn = await instance.initiateSelfDestruct({ from: owner });
				assert.equal(await instance.selfDestructInitiated(), true);
				assert.ok((await instance.initiationTime()).gt(0));
				assert.eventEqual(txn, 'SelfDestructInitiated', { selfDestructDelay: SELFDESTRUCT_DELAY });
			});
		});

		describe('terminateSelfDestruct()', () => {
			it('can only be invoked by the owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.terminateSelfDestruct,
					accounts,
					address: owner,
					args: [],
				});
			});
			it('when invoked, it does nothing', async () => {
				assert.equal(await instance.selfDestructInitiated(), false);
				const txn = await instance.terminateSelfDestruct({ from: owner });
				assert.equal(await instance.selfDestructInitiated(), false);
				assert.eventEqual(txn, 'SelfDestructTerminated', []);
			});
			describe('when initiateSelfDestruct() has been called', () => {
				beforeEach(async () => {
					await instance.initiateSelfDestruct({ from: owner });
				});
				it('when terminateSelfDestruct() invoked, it unsets the flag and time', async () => {
					assert.equal(await instance.selfDestructInitiated(), true);
					assert.ok((await instance.initiationTime()).gt(0));
					const txn = await instance.terminateSelfDestruct({ from: owner });
					assert.equal(await instance.selfDestructInitiated(), false);
					assert.equal(await instance.initiationTime(), '0');
					assert.eventEqual(txn, 'SelfDestructTerminated', []);
				});
			});
		});

		describe('selfDestruct()', () => {
			it('can only be invoked by the owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.selfDestruct,
					accounts,
					skipPassCheck: true, // don't call now as it will fail without setup
					address: owner,
					args: [],
				});
			});
			describe('when initiateSelfDestruct() is invoked', () => {
				beforeEach(async () => {
					await instance.initiateSelfDestruct({ from: owner });
				});
				it('selfDestruct() fails as no delay elapsed', async () => {
					await assert.revert(instance.selfDestruct({ from: owner }));
				});
				describe('when delay elapses', () => {
					beforeEach(async () => {
						await fastForward(SELFDESTRUCT_DELAY + 1);
					});
					it('then selfDestruct succeeds', async () => {
						const transaction = await instance.selfDestruct({ from: owner });
						assert.eventEqual(transaction, 'SelfDestructed', {
							beneficiary: owner,
						});
					});
				});
			});
		});
	});
});
