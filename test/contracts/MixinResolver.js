'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert } = require('./common');

const MixinResolver = artifacts.require('MixinResolver');
const TestableMixinResolver = artifacts.require('TestableMixinResolver');
const AddressResolver = artifacts.require('AddressResolver');

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('MixinResolver', async accounts => {
	const [deployerAccount, owner, account1, account2, account3] = accounts;
	const addressesToCache = ['Example_1', 'Example_2', 'Example_3'];

	let instance;
	let resolver;
	beforeEach(async () => {
		resolver = await AddressResolver.new(owner, { from: deployerAccount });
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: MixinResolver.abi,
			ignoreParents: ['Owned'],
			expected: ['setResolverAndSyncCache'],
		});
	});

	it('it fails when instantiated directly', async () => {
		try {
			await MixinResolver.new(resolver.address, new Array(24).fill('').map(toBytes32));
			assert.fail('Should not have succeeded');
		} catch (err) {
			// Note: this fails with the below:
			// 		Error: MixinResolver error: contract binary not set. Can't deploy new instance.
			// 		This contract may be abstract, not implement an abstract parent's methods completely
			// 		or not invoke an inherited contract's constructor correctly
			// This is because the contract's bytecode is empty as solc can tell it doesn't implement the superclass
			// of Owned in its constructor
		}
	});

	describe('when mixed into a contract', () => {
		beforeEach(async () => {
			// the owner is the associated contract, so we can simulate
			instance = await TestableMixinResolver.new(owner, resolver.address, {
				from: deployerAccount,
			});
		});

		it('resolver set on construction', async () => {
			const actual = await instance.resolver();
			assert.equal(actual, resolver.address);
		});
		it('getResolverAddressesRequired() view', async () => {
			const actual = await instance.getResolverAddressesRequired();
			assert.deepEqual(actual, addressesToCache.map(toBytes32));
		});

		describe('setResolverAndSyncCache()', () => {
			it('should disallow non owners to call', async () => {
				await onlyGivenAddressCanInvoke({
					accounts,
					fnc: instance.setResolverAndSyncCache,
					args: [resolver.address],
					skipPassCheck: true,
					address: owner,
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('when invoked by the owner without all the addresses it needs preset', async () => {
				await assert.revert(
					instance.setResolverAndSyncCache(resolver.address, { from: owner }),
					'Resolver missing target'
				);
			});
			describe('when the given address resolver has all the required keys', () => {
				beforeEach(async () => {
					await resolver.importAddresses(
						addressesToCache.map(toBytes32),
						[account1, account2, account3],
						{ from: owner }
					);
				});
				it('then when invoked by the owner it succeeds', async () => {
					await instance.setResolverAndSyncCache(resolver.address, { from: owner });
				});
			});
		});

		describe('isResolverCached()', () => {
			it('false if the resolver is different', async () => {
				const actual = await instance.isResolverCached(ZERO_ADDRESS);
				assert.ok(!actual);
			});

			it('false when given resolver is same but not addresses cached', async () => {
				const actual = await instance.isResolverCached(resolver.address);
				assert.ok(!actual);
			});
			describe('when the given address resolver has all the required keys', () => {
				beforeEach(async () => {
					await resolver.importAddresses(
						addressesToCache.map(toBytes32),
						[account1, account2, account3],
						{ from: owner }
					);
				});
				it('still false when given resolver not cached', async () => {
					const actual = await instance.isResolverCached(resolver.address);
					assert.ok(!actual);
				});
				describe('when setResolverAndSyncCache() invoked', () => {
					beforeEach(async () => {
						await instance.setResolverAndSyncCache(resolver.address, { from: owner });
					});
					it('then true as everything synced', async () => {
						const actual = await instance.isResolverCached(resolver.address);
						assert.ok(actual);
					});
				});
			});
		});
	});
});
