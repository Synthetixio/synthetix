'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');
const { ensureOnlyExpectedMutativeFunctions, onlyGivenAddressCanInvoke } = require('./helpers');
const { mockGenericContractFnc, setupAllContracts } = require('./setup');

const FlexibleStorage = artifacts.require('FlexibleStorage');

contract('FlexibleStorage', accounts => {
	const [deployerAccount, owner, account1, account2, account3, account4] = accounts;

	// include definition inside "contract" fnc to ensure is replaced with legacy when required
	const AddressResolver = artifacts.require('AddressResolver');

	let storage;
	let resolver;

	before(async () => {
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
		const [contractA, contractB] = ['ContractA', 'ContractB'].map(toBytes32);

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
				const [recordA, recordB] = ['recordA', 'recordB'].map(toBytes32);

				beforeEach(async () => {
					await storage.setUIntValues(contractA, [recordA, recordB], ['10', '20'], {
						from: account1,
					});
				});
				describe('when ContractA migrates to ContractB with removal enabled', () => {
					beforeEach(async () => {
						await storage.migrateContractKey(contractA, contractB, true, { from: account1 });
					});
					it('then retriving the records from ContractB works as expected', async () => {
						const results = await storage.getUIntValues(contractB, [recordB, recordA]);

						assert.deepEqual(results, ['20', '10']);
					});
				});
			});
		});
	});
});
