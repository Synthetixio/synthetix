'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert } = require('./common');

const { toBytes32 } = require('../..');
const { onlyGivenAddressCanInvoke } = require('./helpers');
const { ZERO_ADDRESS } = require('../utils')();

const AddressResolver = artifacts.require('AddressResolver');

contract('AddressResolver', accounts => {
	const [deployerAccount, owner, account1, account2, account3, account4] = accounts;

	let resolver;
	beforeEach(async () => {
		// the owner is the associated contract, so we can simulate
		resolver = await AddressResolver.new(owner, {
			from: deployerAccount,
		});
	});

	describe('importAddresses()', () => {
		it('can only be invoked by the owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: resolver.importAddresses,
				args: [[toBytes32('something')], [account1]],
				address: owner,
				accounts,
			});
		});
		describe('when a different number of names are given to addresses', () => {
			it('then it reverts', async () => {
				await assert.revert(
					resolver.importAddresses([], [account1], { from: owner }),
					'Input lengths must match'
				);
				await assert.revert(
					resolver.importAddresses([toBytes32('test')], [account1, account2], { from: owner }),
					'Input lengths must match'
				);
				await assert.revert(
					resolver.importAddresses([toBytes32('test')], [], { from: owner }),
					'Input lengths must match'
				);
			});
		});
		describe('when three separate addresses are given', () => {
			beforeEach(async () => {
				await resolver.importAddresses(
					['first', 'second', 'third'].map(toBytes32),
					[account1, account2, account3],
					{ from: owner }
				);
			});
			it('then each can be looked up in turn', async () => {
				assert.equal(await resolver.getAddress(toBytes32('first')), account1);
				assert.equal(await resolver.getAddress(toBytes32('second')), account2);
				assert.equal(await resolver.getAddress(toBytes32('third')), account3);
			});
			describe('when two are overridden', () => {
				beforeEach(async () => {
					await resolver.importAddresses(['second', 'third'].map(toBytes32), [account3, account4], {
						from: owner,
					});
				});
				it('then the first remains the same while the other two are updated', async () => {
					assert.equal(await resolver.getAddress(toBytes32('first')), account1);
					assert.equal(await resolver.getAddress(toBytes32('second')), account3);
					assert.equal(await resolver.getAddress(toBytes32('third')), account4);
				});
			});
		});
	});

	describe('getAddress()', () => {
		it('when invoked with no entries, returns 0 address', async () => {
			assert.equal(await resolver.getAddress(toBytes32('first')), ZERO_ADDRESS);
		});
		describe('when three separate addresses are given', () => {
			beforeEach(async () => {
				await resolver.importAddresses(
					['first', 'second', 'third'].map(toBytes32),
					[account1, account2, account3],
					{ from: owner }
				);
			});
			it('then getAddress returns the same as the public mapping', async () => {
				assert.equal(await resolver.getAddress(toBytes32('third')), account3);
				assert.equal(await resolver.repository(toBytes32('second')), account2);
			});
		});
	});

	describe('requireAndGetAddress()', () => {
		it('when invoked with no entries, reverts', async () => {
			await assert.revert(
				resolver.requireAndGetAddress(toBytes32('first'), 'Some error'),
				'Some error'
			);
		});
		describe('when three separate addresses are given', () => {
			beforeEach(async () => {
				await resolver.importAddresses(
					['first', 'second', 'third'].map(toBytes32),
					[account1, account2, account3],
					{ from: owner }
				);
			});
			it('then requireAndGetAddress() returns the same as the public mapping', async () => {
				assert.equal(await resolver.requireAndGetAddress(toBytes32('third'), 'Error'), account3);
				assert.equal(await resolver.requireAndGetAddress(toBytes32('second'), 'Error'), account2);
			});
			it('when invoked with an unknown entry, reverts', async () => {
				await assert.revert(
					resolver.requireAndGetAddress(toBytes32('other'), 'Some error again'),
					'Some error again'
				);
			});
		});
	});
});
