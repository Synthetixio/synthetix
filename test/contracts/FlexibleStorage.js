'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');
const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');

const AddressResolver = artifacts.require('AddressResolver');
const FlexibleStorage = artifacts.require('FlexibleStorage');

contract('FlexibleStorage', accounts => {
	const [deployerAccount, owner, account1, account2, account3] = accounts;

	let storage;
	let resolver;

	const [contractA, contractB] = ['ContractA', 'ContractB'].map(toBytes32);
	const [recordA, recordB, recordC] = ['recordA', 'recordB', 'recordC'].map(toBytes32);

	beforeEach(async () => {
		resolver = await AddressResolver.new(owner, { from: deployerAccount });
		storage = await FlexibleStorage.new(resolver.address, {
			from: deployerAccount,
		});
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: storage.abi,
			ignoreParents: ['ContractStorage'],
			expected: [
				'deleteUIntValue',
				'setUIntValue',
				'setUIntValues',
				'deleteIntValue',
				'setIntValue',
				'setIntValues',
				'deleteAddressValue',
				'setAddressValue',
				'setAddressValues',
				'deleteBoolValue',
				'setBoolValue',
				'setBoolValues',
				'deleteBytes32Value',
				'setBytes32Value',
				'setBytes32Values',
			],
		});
	});

	[
		{ type: 'UInt', values: ['10', '20', '30'], unset: '0' },
		{ type: 'Int', values: ['-5', '20', '-100'], unset: '0' },
		{ type: 'Address', values: [account2, account3], unset: ZERO_ADDRESS },
		{ type: 'Bool', values: [true, false, true], unset: false },
		{ type: 'Bytes32', values: [recordA, recordB, recordC], unset: toBytes32('') },
	].forEach(({ type, values, unset }) => {
		describe(type, () => {
			describe('get()', () => {
				it('returns unset by default', async () => {
					assert.equal(await storage[`get${type}Value`](contractA, recordA), unset);
					assert.equal(await storage[`get${type}Value`](contractA, recordB), unset);
					assert.equal(await storage[`get${type}Value`](contractB, recordB), unset);
					assert.deepEqual(await storage[`get${type}Values`](contractA, [recordA, recordB]), [
						unset,
						unset,
					]);
				});

				describe('when ContractA is added to the AddressResolver', () => {
					beforeEach(async () => {
						await resolver.importAddresses([contractA], [account1], { from: owner });
					});
					describe('when there are some values stored in ContractA', () => {
						beforeEach(async () => {
							await storage[`set${type}Values`](
								contractA,
								[recordA, recordB],
								[values[0], values[1]],
								{
									from: account1,
								}
							);
						});
						it('then the values are gettable', async () => {
							assert.equal(await storage[`get${type}Value`](contractA, recordA), values[0]);
							assert.equal(await storage[`get${type}Value`](contractA, recordB), values[1]);
							assert.deepEqual(await storage[`get${type}Values`](contractA, [recordB, recordA]), [
								values[1],
								values[0],
							]);
						});
						it('but not from other contracts', async () => {
							assert.equal(await storage[`get${type}Value`](contractB, recordA), unset);
							assert.equal(await storage[`get${type}Value`](contractB, recordB), unset);
							assert.deepEqual(await storage[`get${type}Values`](contractB, [recordA, recordB]), [
								unset,
								unset,
							]);
						});
					});
				});
			});

			describe('set()', () => {
				it('when invoked by a non-contract, fails immediately', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: storage[`set${type}Value`],
						args: [contractA, recordB, values[0]],
						accounts,
						reason: 'Cannot find contract in Address Resolver',
					});
				});
				describe('when ContractA is added to the AddressResolver', () => {
					beforeEach(async () => {
						await resolver.importAddresses([contractA], [account1], { from: owner });
					});
					it('then only contract A can invoke a set()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: storage[`set${type}Value`],
							args: [contractA, recordB, values[0]],
							accounts,
							address: account1,
							reason: 'Can only be invoked by the configured contract',
						});
					});
					it('and setting emits an event', async () => {
						const txn = await storage[`set${type}Value`](contractA, recordB, values[0], {
							from: account1,
						});
						assert.eventEqual(txn, `ValueSet${type}`, [contractA, recordB, values[0]]);
					});
					it('and setting mulitple entries emits multiple events', async () => {
						const txn = await storage[`set${type}Values`](
							contractA,
							[recordA, recordB],
							[values[0], values[1]],
							{
								from: account1,
							}
						);
						assert.eventsEqual(
							txn,
							`ValueSet${type}`,
							[contractA, recordA, values[0]],
							`ValueSet${type}`,
							[contractA, recordB, values[1]]
						);
					});
					describe('when contract A has record A', () => {
						beforeEach(async () => {
							await storage[`set${type}Value`](contractA, recordA, values[0], { from: account1 });
						});
						describe('when another contract replaces one in the address resolver', () => {
							beforeEach(async () => {
								await resolver.importAddresses([contractA], [account2], { from: owner });
							});
							describe('when the other contract adds a record', () => {
								beforeEach(async () => {
									await storage[`set${type}Value`](contractA, recordB, values[1], {
										from: account2,
									});
								});
								it('then both exist on contract A', async () => {
									assert.deepEqual(
										await storage[`get${type}Values`](contractA, [recordA, recordB]),
										[values[0], values[1]]
									);
								});
							});
						});
					});
				});
			});

			describe('delete()', () => {
				it('when invoked by a non-contract, fails immediately', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: storage[`delete${type}Value`],
						args: [contractA, recordB],
						accounts,
						reason: 'Cannot find contract in Address Resolver',
					});
				});
				describe('when ContractA is added to the AddressResolver', () => {
					beforeEach(async () => {
						await resolver.importAddresses([contractA], [account1], { from: owner });
					});
					it('then only contract A can invoke a delete()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: storage[`delete${type}Value`],
							args: [contractA, recordB],
							accounts,
							address: account1,
							reason: 'Can only be invoked by the configured contract',
						});
					});
					it('and deleting emits an event', async () => {
						const txn = await storage[`delete${type}Value`](contractA, recordA, { from: account1 });
						assert.eventEqual(txn, `ValueDeleted${type}`, [contractA, recordA, unset]);
					});
					describe('when a value exists for recordA', () => {
						beforeEach(async () => {
							await storage[`set${type}Value`](contractA, recordA, values[1], { from: account1 });
							assert.equal(await storage[`get${type}Value`](contractA, recordA), values[1]);
						});
						describe('when recordA is deleted', () => {
							let txn;
							beforeEach(async () => {
								txn = await storage[`delete${type}Value`](contractA, recordA, { from: account1 });
							});
							it('then deletion ensures that value is removed', async () => {
								assert.equal(await storage[`get${type}Value`](contractA, recordA), unset);
							});
							it('and the emitted event contains the deleted value', async () => {
								assert.eventEqual(txn, `ValueDeleted${type}`, [contractA, recordA, values[1]]);
							});
						});
					});
				});
			});
		});
	});
});
