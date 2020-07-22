'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const {
	toBytes32,
	// constants: { ZERO_ADDRESS },
} = require('../..');
const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');
// const { mockGenericContractFnc, setupAllContracts } = require('./setup');

const FlexibleStorage = artifacts.require('FlexibleStorage');

contract('FlexibleStorage', accounts => {
	const [deployerAccount, owner, account1, account2] = accounts;

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
			expected: ['deleteUIntValue', 'migrateContractKey', 'setUIntValue', 'setUIntValues'],
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
			describe('when there are some values stored', () => {
				beforeEach(async () => {
					await storage.setUIntValues(contractA, [recordA, recordB], ['10', '20'], {
						from: account1,
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

	describe('get()', () => {
		it('returns 0 by default', async () => {
			assert.equal(await storage.getUIntValue(contractA, recordA), '0');
			assert.equal(await storage.getUIntValue(contractA, recordB), '0');
			assert.equal(await storage.getUIntValue(contractB, recordB), '0');
			assert.deepEqual(await storage.getUIntValues(contractA, [recordA, recordB]), ['0', '0']);
		});

		describe('when ContractA is added to the AddressResolver', () => {
			beforeEach(async () => {
				await resolver.importAddresses([contractA], [account1], { from: owner });
			});
			describe('when there are some values stored in ContractA', () => {
				const b = '5';
				const a = '4';
				beforeEach(async () => {
					await storage.setUIntValues(contractA, [recordA, recordB], [a, b], {
						from: account1,
					});
				});
				it('then the values are gettable', async () => {
					assert.equal(await storage.getUIntValue(contractA, recordA), a);
					assert.equal(await storage.getUIntValue(contractA, recordB), b);
					assert.deepEqual(await storage.getUIntValues(contractA, [recordB, recordA]), [b, a]);
				});
				it('but not from other contracts', async () => {
					assert.equal(await storage.getUIntValue(contractB, recordA), '0');
					assert.equal(await storage.getUIntValue(contractB, recordB), '0');
					assert.deepEqual(await storage.getUIntValues(contractB, [recordA, recordB]), ['0', '0']);
				});
			});
		});
	});

	describe('set()', () => {
		it('when invoked by a non-contract, fails immediately', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: storage.setUIntValue,
				args: [contractA, recordB, '999'],
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
					fnc: storage.setUIntValue,
					args: [contractA, recordB, '999'],
					accounts,
					address: account1,
					reason: 'Can only be invoked by the configured contract',
				});
			});
			it('and setting emits an event', async () => {
				const txn = await storage.setUIntValue(contractA, recordB, '999', { from: account1 });
				assert.eventEqual(txn, 'ValueSetUInt', [contractA, recordB, '999']);
			});
			it('and setting mulitple entries emits multiple events', async () => {
				const txn = await storage.setUIntValues(contractA, [recordA, recordB], ['111', '222'], {
					from: account1,
				});
				assert.eventsEqual(txn, 'ValueSetUInt', [contractA, recordA, '111'], 'ValueSetUInt', [
					contractA,
					recordB,
					'222',
				]);
			});
		});
	});

	describe('delete()', () => {
		it('when invoked by a non-contract, fails immediately', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: storage.deleteUIntValue,
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
					fnc: storage.deleteUIntValue,
					args: [contractA, recordB],
					accounts,
					address: account1,
					reason: 'Can only be invoked by the configured contract',
				});
			});
			it('and deleting emits an event', async () => {
				const txn = await storage.deleteUIntValue(contractA, recordB, { from: account1 });
				assert.eventEqual(txn, 'ValueDeleted', [contractA, recordB]);
			});
			describe('when a value exists for recordA', () => {
				beforeEach(async () => {
					await storage.setUIntValue(contractA, recordA, '666', { from: account1 });
					assert.equal(await storage.getUIntValue(contractA, recordA), '666');
				});
				describe('when recordA is deleted', () => {
					beforeEach(async () => {
						await storage.deleteUIntValue(contractA, recordA, { from: account1 });
					});
					it('then deletion ensures that value is removed', async () => {
						assert.equal(await storage.getUIntValue(contractA, recordA), '0');
					});
				});
			});
		});
	});
});
