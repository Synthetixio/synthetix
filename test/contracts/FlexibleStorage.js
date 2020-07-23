'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');
const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');
// const { mockGenericContractFnc, setupAllContracts } = require('./setup');

const FlexibleStorage = artifacts.require('FlexibleStorage');

contract('FlexibleStorage', accounts => {
	const [deployerAccount, owner, account1, account2, account3] = accounts;

	// include definition inside "contract" fnc to ensure is replaced with legacy when required
	const AddressResolver = artifacts.require('AddressResolver');

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
			expected: [
				'migrateContractKey',
				'deleteUIntValue',
				'setUIntValue',
				'setUIntValues',
				'deleteAddressValue',
				'setAddressValue',
				'setAddressValues',
			],
		});
	});

	describe('migrateContractKey()', () => {
		it('when invoked by a non-contract, fails immediately', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: storage.migrateContractKey,
				args: [contractA, contractB, false],
				accounts,
				reason: 'Cannot find contract in Address Resolver',
			});
		});

		describe('when ContractA is added to the AddressResolver', () => {
			beforeEach(async () => {
				// simulate that account1 is "contractA"
				await resolver.importAddresses([contractA], [account1], { from: owner });
			});
			describe('when migrate is called for an empty contract', () => {
				it('then it fails as the contract does not have an entry', async () => {
					await assert.revert(
						storage.migrateContractKey(contractA, contractB, true, { from: account1 }),
						'Cannot migrate empty contract'
					);
				});
			});
			describe('when there are some values stored', () => {
				beforeEach(async () => {
					await storage.setUIntValues(contractA, [recordA, recordB], ['10', '20'], {
						from: account1,
					});
				});
				it('then only it may invoke migrate', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: storage.migrateContractKey,
						args: [contractA, contractB, false],
						// now we can assert that "contractA" can migrate, as we impersonated it
						// via account1
						address: account1,
						accounts,
						reason: 'Can only be invoked by the configured contract',
					});
				});
				describe('when ContractA migrates to ContractB with removal enabled', () => {
					let txn;
					beforeEach(async () => {
						txn = await storage.migrateContractKey(contractA, contractB, true, { from: account1 });
					});
					it('then retriving the records from ContractB works as expected', async () => {
						const results = await storage.getUIntValues(contractB, [recordB, recordA]);
						assert.deepEqual(results, ['20', '10']);
					});

					it('and retriving the records from ContractA returns nothing', async () => {
						const results = await storage.getUIntValues(contractA, [recordB, recordA]);
						assert.deepEqual(results, ['0', '0']);
					});

					it('and the migration issues a KeyMigrated event', async () => {
						assert.eventEqual(txn, 'KeyMigrated', [contractA, contractB, true]);
					});

					describe('when migrate is called again', () => {
						it('then it fails as the contract no longer has an entry', async () => {
							await assert.revert(
								storage.migrateContractKey(contractA, contractB, true, { from: account1 }),
								'Cannot migrate empty contract'
							);
						});
					});

					describe('when contractB added to the AddressResolver', () => {
						beforeEach(async () => {
							// simulate "contractB" from account2
							await resolver.importAddresses([contractB], [account2], { from: owner });
						});

						describe('when there is another value stored in contract B from contractB', () => {
							beforeEach(async () => {
								await storage.setUIntValue(contractB, recordC, '30', {
									from: account2,
								});
							});
							it('then retriving the records from ContractB works as expected', async () => {
								const results = await storage.getUIntValues(contractB, [recordA, recordB, recordC]);
								assert.deepEqual(results, ['10', '20', '30']);
							});
							it('and retriving the records from ContractA returns nothing', async () => {
								const results = await storage.getUIntValues(contractA, [recordC, recordB, recordA]);
								assert.deepEqual(results, ['0', '0', '0']);
							});
						});

						it('when contract A tries to set something in contract B, it fails', async () => {
							await assert.revert(
								storage.setUIntValue(contractB, recordC, '40', { from: account1 }),
								'Can only be invoked by the configured contract'
							);
						});
						describe('when contract A tries to set something in contract A already set earlier', () => {
							beforeEach(async () => {
								await storage.setUIntValue(contractA, recordA, '100', {
									from: account1,
								});
							});
							it('then it succeeds', async () => {
								assert.equal(await storage.getUIntValue(contractA, recordA), '100');
							});
							it('and does not overwrite that same record in ContractB', async () => {
								assert.equal(await storage.getUIntValue(contractB, recordA), '10');
							});
						});

						describe('when contract A tries to set something new in contract A', () => {
							beforeEach(async () => {
								await storage.setUIntValue(contractA, recordC, '50', {
									from: account1,
								});
							});
							it('then it succeeds', async () => {
								assert.equal(await storage.getUIntValue(contractA, recordC), '50');
							});
							it('and does not create the same record in ContractB', async () => {
								assert.equal(await storage.getUIntValue(contractB, recordC), '0');
							});
						});
					});
				});

				describe('when ContractA migrates to ContractB with removal disabled', () => {
					let txn;
					beforeEach(async () => {
						txn = await storage.migrateContractKey(contractA, contractB, false, { from: account1 });
					});
					it('then retriving the records from ContractB works as expected', async () => {
						const results = await storage.getUIntValues(contractB, [recordB, recordA]);
						assert.deepEqual(results, ['20', '10']);
					});

					it('and retriving the records from ContractA works also', async () => {
						const results = await storage.getUIntValues(contractA, [recordB, recordA]);
						assert.deepEqual(results, ['20', '10']);
					});

					it('and the migration issues a KeyMigrated event', async () => {
						assert.eventEqual(txn, 'KeyMigrated', [contractA, contractB, false]);
					});

					describe('when contractB added to the AddressResolver', () => {
						beforeEach(async () => {
							// simulate "contractB" from account2
							await resolver.importAddresses([contractB], [account2], { from: owner });
						});

						describe('when there is another value stored in contract B', () => {
							beforeEach(async () => {
								await storage.setUIntValue(contractB, recordC, '30', {
									from: account2,
								});
							});
							it('then retriving the records from ContractB works as expected', async () => {
								const results = await storage.getUIntValues(contractB, [recordA, recordB, recordC]);
								assert.deepEqual(results, ['10', '20', '30']);
							});
							it('and retriving the records from ContractA works also', async () => {
								const results = await storage.getUIntValues(contractA, [recordC, recordB, recordA]);
								assert.deepEqual(results, ['30', '20', '10']);
							});
						});

						it('when contract A tries to set something new in contract B, it fails', async () => {
							await assert.revert(
								storage.setUIntValue(contractB, recordC, '40', { from: account1 }),
								'Can only be invoked by the configured contract'
							);
						});
						describe('when contract A tries to set something in contract A already set earlier', () => {
							beforeEach(async () => {
								await storage.setUIntValue(contractA, recordA, '100', {
									from: account1,
								});
							});
							it('then it succeeds', async () => {
								assert.equal(await storage.getUIntValue(contractA, recordA), '100');
							});
							it('and it overwrites that same record in ContractB', async () => {
								assert.equal(await storage.getUIntValue(contractB, recordA), '100');
							});
						});

						describe('when contract A tries to set something new in contract A', () => {
							beforeEach(async () => {
								await storage.setUIntValue(contractA, recordC, '50', {
									from: account1,
								});
							});
							it('then it succeeds', async () => {
								assert.equal(await storage.getUIntValue(contractA, recordC), '50');
							});
							it('and it creates the same record in ContractB', async () => {
								assert.equal(await storage.getUIntValue(contractB, recordC), '50');
							});
						});
					});
				});
			});
		});
	});

	[
		{ type: 'UInt', values: ['10', '20', '30'], unset: '0' },
		{ type: 'Address', values: [account2, account3], unset: ZERO_ADDRESS },
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
						const txn = await storage[`delete${type}Value`](contractA, recordB, { from: account1 });
						assert.eventEqual(txn, 'ValueDeleted', [contractA, recordB]);
					});
					describe('when a value exists for recordA', () => {
						beforeEach(async () => {
							await storage[`set${type}Value`](contractA, recordA, values[1], { from: account1 });
							assert.equal(await storage[`get${type}Value`](contractA, recordA), values[1]);
						});
						describe('when recordA is deleted', () => {
							beforeEach(async () => {
								await storage[`delete${type}Value`](contractA, recordA, { from: account1 });
							});
							it('then deletion ensures that value is removed', async () => {
								assert.equal(await storage[`get${type}Value`](contractA, recordA), unset);
							});
						});
					});
				});
			});
		});
	});
});
