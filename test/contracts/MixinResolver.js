require('.'); // import common test scaffolding

const MixinResolver = artifacts.require('MixinResolver');
const AddressResolver = artifacts.require('AddressResolver');

const {
	// 	currentTime,
	// 	fastForward,
	// 	multiplyDecimal,
	// 	divideDecimal,
	// 	toUnit,
	ZERO_ADDRESS,
} = require('../utils/testUtils');

const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
} = require('../utils/setupUtils');

const { toBytes32 } = require('../..');

contract('MixinResolver', async accounts => {
	const [deployerAccount, owner, account1, account2, account3] = accounts;

	let instance;
	let resolver;
	let baseAddresses;
	let addressesToCache;
	beforeEach(async () => {
		baseAddresses = ['Synthetix', 'Depot', 'SomethingElse'];
		addressesToCache = baseAddresses
			.concat(new Array(24 - baseAddresses.length).fill(''))
			.map(toBytes32);

		resolver = await AddressResolver.deployed();

		// the owner is the associated contract, so we can simulate
		instance = await MixinResolver.new(
			owner,
			resolver.address,
			// fill in empty entries
			addressesToCache,
			{
				from: deployerAccount,
			}
		);
	});
	it('resolver set on construction', async () => {
		const actual = await instance.resolver();
		assert.equal(actual, resolver.address);
	});
	it('getResolverAddressesRequired() view', async () => {
		const actual = await instance.getResolverAddressesRequired();
		assert.deepEqual(actual, addressesToCache);
	});
	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: instance.abi,
			ignoreParents: ['Owned'],
			expected: ['setResolverAndSyncCache'],
		});
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
					baseAddresses.map(toBytes32),
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
					baseAddresses.map(toBytes32),
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
