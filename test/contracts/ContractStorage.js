'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { toBytes32 } = require('../..');
const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');

const ContractStorage = artifacts.require('MockContractStorage');
const AddressResolver = artifacts.require('AddressResolver');

contract('ContractStorage', accounts => {
	const [deployerAccount, owner, account1, account2] = accounts;

	let storage;
	let resolver;

	const [contractA, contractB] = ['ContractA', 'ContractB'].map(toBytes32);
	const [recordA, recordB, recordC] = ['recordA', 'recordB', 'recordC'].map(toBytes32);

	beforeEach(async () => {
		resolver = await AddressResolver.new(owner, { from: deployerAccount });
		storage = await ContractStorage.new(resolver.address, {
			from: deployerAccount,
		});
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: storage.abi,
			expected: ['migrateContractKey', 'persistEntry'],
		});
	});

	it('it fails when instantiated directly', async () => {
		try {
			await artifacts.require('ContractStorage').new(resolver.address);
			assert.fail('Should not have succeeded');
		} catch (err) {
			// Note: this fails with the below:
			// 		... error: contract binary not set. Can't deploy new instance.
			// 		This contract may be abstract, not implement an abstract parent's methods completely
			// 		or not invoke an inherited contract's constructor correctly
			// This is because the contract's bytecode is empty as solc can tell it doesn't implement the superclass
			// of Owned in its constructor
		}
	});

	describe('onlyContract modifier', () => {
		it('when invoked by a non-contract, fails immediately', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: storage.persistEntry,
				args: [contractA, recordB, '123', true],
				accounts,
				reason: 'Cannot find contract in Address Resolver',
			});
		});
		describe('when ContractA is added to the AddressResolver', () => {
			beforeEach(async () => {
				// simulate that account1 is "contractA"
				await resolver.importAddresses([contractA], [account1], { from: owner });
			});
			it('then only that contract can invoke a function protected by the onlyContract modifier', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: storage.persistEntry,
					args: [contractA, recordB, '123', true],
					accounts,
					address: account1,
					reason: 'Can only be invoked by the configured contract',
				});
			});
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
				const entryA = { value: '10', flag: true };
				const entryB = { value: '50', flag: false };
				const entryC = { value: '90', flag: true };
				const emptyEntry = { value: '0', flag: false };

				beforeEach(async () => {
					await storage.persistEntry(contractA, recordA, entryA.value, entryA.flag, {
						from: account1,
					});
					await storage.persistEntry(contractA, recordB, entryB.value, entryB.flag, {
						from: account1,
					});
				});

				const assertExpectedValues = async ({ contract, record, expected }) => {
					const { value, flag } = await storage.getEntry(contract, record);
					assert.bnEqual(value, expected.value);
					assert.equal(flag, expected.flag);
				};
				it('then those values are retriveable', async () => {
					await assertExpectedValues({ contract: contractA, record: recordA, expected: entryA });
					await assertExpectedValues({ contract: contractA, record: recordB, expected: entryB });
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
						await assertExpectedValues({ contract: contractB, record: recordA, expected: entryA });
					});

					it('and retriving the records from ContractA returns nothing', async () => {
						await assertExpectedValues({
							contract: contractA,
							record: recordA,
							expected: emptyEntry,
						});
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

						describe('when there is another value stored in contract B from recordC', () => {
							beforeEach(async () => {
								await storage.persistEntry(contractB, recordC, entryC.value, entryC.flag, {
									from: account2,
								});
							});
							it('then retriving the records from ContractB works as expected', async () => {
								await assertExpectedValues({
									contract: contractB,
									record: recordA,
									expected: entryA,
								});
								await assertExpectedValues({
									contract: contractB,
									record: recordB,
									expected: entryB,
								});
								await assertExpectedValues({
									contract: contractB,
									record: recordC,
									expected: entryC,
								});
							});
							it('and retriving the records from ContractA returns nothing', async () => {
								await assertExpectedValues({
									contract: contractA,
									record: recordA,
									expected: emptyEntry,
								});
								await assertExpectedValues({
									contract: contractA,
									record: recordB,
									expected: emptyEntry,
								});
								await assertExpectedValues({
									contract: contractA,
									record: recordC,
									expected: emptyEntry,
								});
							});
						});

						it('when contract A tries to set something in contract B, it fails', async () => {
							await assert.revert(
								storage.persistEntry(contractB, recordC, '40', true, { from: account1 }),
								'Can only be invoked by the configured contract'
							);
						});
						describe('when contract A tries to set something in contract A already set earlier', () => {
							const newEntryA = {
								value: '999',
								flag: false,
							};
							beforeEach(async () => {
								await storage.persistEntry(contractA, recordA, newEntryA.value, newEntryA.flag, {
									from: account1,
								});
							});
							it('then it succeeds', async () => {
								await assertExpectedValues({
									contract: contractA,
									record: recordA,
									expected: newEntryA,
								});
							});
							it('and does not overwrite that same record in ContractB', async () => {
								await assertExpectedValues({
									contract: contractB,
									record: recordA,
									expected: entryA,
								});
							});
						});

						describe('when contract A tries to set something new in contract A', () => {
							beforeEach(async () => {
								await storage.persistEntry(contractA, recordC, entryC.value, entryC.flag, {
									from: account1,
								});
							});
							it('then it succeeds', async () => {
								await assertExpectedValues({
									contract: contractA,
									record: recordC,
									expected: entryC,
								});
							});
							it('and does not create the same record in ContractB', async () => {
								await assertExpectedValues({
									contract: contractB,
									record: recordC,
									expected: emptyEntry,
								});
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
						await assertExpectedValues({ contract: contractB, record: recordA, expected: entryA });
					});

					it('and retriving the records from ContractA works also', async () => {
						await assertExpectedValues({ contract: contractA, record: recordA, expected: entryA });
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
								await storage.persistEntry(contractB, recordC, entryC.value, entryC.flag, {
									from: account2,
								});
							});
							it('then retriving the records from ContractB works as expected', async () => {
								await assertExpectedValues({
									contract: contractB,
									record: recordA,
									expected: entryA,
								});
								await assertExpectedValues({
									contract: contractB,
									record: recordB,
									expected: entryB,
								});
								await assertExpectedValues({
									contract: contractB,
									record: recordC,
									expected: entryC,
								});
							});
							it('and retriving the records from ContractA works also', async () => {
								await assertExpectedValues({
									contract: contractA,
									record: recordA,
									expected: entryA,
								});
								await assertExpectedValues({
									contract: contractA,
									record: recordB,
									expected: entryB,
								});
								await assertExpectedValues({
									contract: contractA,
									record: recordC,
									expected: entryC,
								});
							});
						});

						it('when contract A tries to set something new in contract B, it fails', async () => {
							await assert.revert(
								storage.persistEntry(contractB, recordC, '40', false, { from: account1 }),
								'Can only be invoked by the configured contract'
							);
						});
						describe('when contract A tries to set something in contract A already set earlier', () => {
							const newEntryA = {
								value: '999',
								flag: false,
							};
							beforeEach(async () => {
								await storage.persistEntry(contractA, recordA, newEntryA.value, newEntryA.flag, {
									from: account1,
								});
							});
							it('then it succeeds', async () => {
								await assertExpectedValues({
									contract: contractA,
									record: recordA,
									expected: newEntryA,
								});
							});
							it('and it overwrites that same record in ContractB', async () => {
								await assertExpectedValues({
									contract: contractB,
									record: recordA,
									expected: newEntryA,
								});
							});
						});

						describe('when contract A tries to set something new in contract A', () => {
							beforeEach(async () => {
								await storage.persistEntry(contractA, recordC, entryC.value, entryC.flag, {
									from: account1,
								});
							});
							it('then it succeeds', async () => {
								await assertExpectedValues({
									contract: contractA,
									record: recordC,
									expected: entryC,
								});
							});
							it('and it creates the same record in ContractB', async () => {
								await assertExpectedValues({
									contract: contractB,
									record: recordC,
									expected: entryC,
								});
							});
						});
					});
				});
			});
		});
	});
});
