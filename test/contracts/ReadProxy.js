'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');
const { mockGenericContractFnc } = require('./setup');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');
const { toUnit } = require('../utils')();
const {
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
	proxyThruTo,
} = require('./helpers');

contract('ReadProxy', async accounts => {
	const [, owner, account1, , account3] = accounts;

	let resolver;
	let forwarder;

	beforeEach(async () => {
		resolver = await artifacts.require('AddressResolver').new(owner);
		forwarder = await artifacts.require('ReadProxy').new(owner);
	});

	it('only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: forwarder.abi,
			ignoreParents: ['Owned'],
			hasFallback: true,
			expected: ['setTarget'],
		});
	});

	it('setTarget() can only be invoked by the owner', async () => {
		await onlyGivenAddressCanInvoke({
			address: owner,
			fnc: forwarder.setTarget,
			args: [resolver.address],
			reason: 'Only the contract owner may perform this action',
			accounts,
		});
	});

	describe('when the target is set by the owner', () => {
		let txn;
		beforeEach(async () => {
			txn = await forwarder.setTarget(resolver.address, { from: owner });
		});

		it('then a TargetUpdated event is emitted with the new target address', async () => {
			assert.eventEqual(txn, 'TargetUpdated', { newTarget: resolver.address });
		});

		it('Then a call to the forwarder must pass through to target via fallback function', async () => {
			const expected = await resolver.getAddress(toBytes32('Synthetix'));
			assert.equal(expected, ZERO_ADDRESS);

			const response = await proxyThruTo({
				proxy: forwarder,
				target: resolver,
				fncName: 'getAddress',
				args: [toBytes32('Synthetix')],
				from: account3,
				call: true,
			});

			assert.equal(response, expected);
		});

		describe('when a third party uses the forwarder', () => {
			let thirdPartyContract;
			beforeEach(async () => {
				thirdPartyContract = await artifacts.require('UsingReadProxy').new(forwarder.address);
			});
			it('when attempting to invoke a view that calls the forwarder it fails', async () => {
				await assert.revert(thirdPartyContract.run(toBytes32('ETH')), 'Missing ExchangeRates');
			});

			describe('when the resource is updated in the forwarders target', () => {
				let exRates;
				beforeEach(async () => {
					exRates = await artifacts.require('GenericMock').new();
					await mockGenericContractFnc({
						instance: exRates,
						mock: 'ExchangeRates',
						fncName: 'rateForCurrency',
						returns: [toUnit('250')],
					});
					await resolver.importAddresses([toBytes32('ExchangeRates')], [exRates.address], {
						from: owner,
					});
				});
				it('when invoking a view that calls the forwarder it succeeds and passes thru', async () => {
					const actual = await thirdPartyContract.run(toBytes32('ETH'));
					assert.bnEqual(actual, toUnit('250'));
				});
			});
		});

		describe('when the target has been updated', () => {
			beforeEach(async () => {
				await resolver.importAddresses([toBytes32('Synthetix')], [account1], { from: owner });
			});
			it('Then a call to the forwarder must pass through to target via fallback function', async () => {
				const expected = await resolver.getAddress(toBytes32('Synthetix'));
				assert.equal(expected, account1);

				const response = await proxyThruTo({
					proxy: forwarder,
					target: resolver,
					fncName: 'getAddress',
					args: [toBytes32('Synthetix')],
					from: account3,
					call: true,
				});

				assert.equal(response, expected);
			});
		});
	});

	describe('when the target is some mock contract with a view and a mutative function', () => {
		let mockMutator;
		beforeEach(async () => {
			mockMutator = await artifacts.require('MockMutator').new();
			await forwarder.setTarget(mockMutator.address, { from: owner });
		});

		it('When trying to forward to the view, it works as expected', async () => {
			const response = await proxyThruTo({
				proxy: forwarder,
				target: mockMutator,
				fncName: 'read',
				args: [],
				from: account3,
				call: true,
			});

			assert.equal(response, '0');
		});

		it('When trying to forward a call to the mutative function, it reverts', async () => {
			// forwarder uses staticcall which reverts on any state mutation
			await assert.revert(
				proxyThruTo({
					proxy: forwarder,
					target: mockMutator,
					fncName: 'update',
					args: [],
					from: account3,
					call: true,
				})
			);
		});
		it('When trying to forward a transaction to the mutative function, it reverts', async () => {
			await assert.revert(
				proxyThruTo({
					proxy: forwarder,
					target: mockMutator,
					fncName: 'update',
					args: [],
					from: account3,
					call: false, // try as transaction
				})
			);
		});
	});
});
