'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');
const { currentTime, fastForward } = require('../utils')();
const { onlyGivenAddressCanInvoke } = require('./helpers');

const TestableTempOwnedFactory = artifacts.require('TestableTempOwned');

contract('TemporarilyOwned', accounts => {
	const DAY = 60 * 60 * 24;
	const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

	const [deployerAccount, temporaryOwner, account1, account2, account3] = accounts;

	let TestableTempOwned;
	let expectedExpiry;

	describe('when attempting to deploy with an invalid owner address', () => {
		it('reverts', async () => {
			await assert.revert(
				TestableTempOwnedFactory.new(ZERO_ADDRESS, DAY, { from: deployerAccount }),
				'Temp owner address cannot be 0'
			);
		});
	});

	describe('when attempting to deploy with 0 duration', () => {
		it('reverts', async () => {
			await assert.revert(
				TestableTempOwnedFactory.new(temporaryOwner, '0', { from: deployerAccount }),
				'Duration cannot be 0'
			);
		});
	});

	describe('when deploying with valid parameters', () => {
		let ownershipDuration;

		before('deploy', async () => {
			ownershipDuration = DAY;

			expectedExpiry = (await currentTime()) + ownershipDuration;

			TestableTempOwned = await TestableTempOwnedFactory.new(temporaryOwner, ownershipDuration, {
				from: deployerAccount,
			});
		});

		it('properly set temporaryOwner', async () => {
			assert.equal(temporaryOwner, await TestableTempOwned.temporaryOwner());
		});

		it('properly set expiry date', async () => {
			assert.bnClose(
				expectedExpiry.toString(),
				(await TestableTempOwned.expiryTime()).toString(),
				'10'
			);
		});

		describe('before expiration', () => {
			it('only allows the owner to execute', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: TestableTempOwned.setTestValue,
					args: [42],
					address: temporaryOwner,
					accounts,
					reason: 'Only executable by temp owner',
				});
			});
		});

		describe('after expiration', () => {
			before('fast forward', async () => {
				await fastForward(ownershipDuration);
			});

			it('does not allow temp owner to change the value', async () => {
				await assert.revert(
					TestableTempOwned.setTestValue(1337, { from: temporaryOwner }),
					'Ownership expired'
				);
			});
		});
	});

	describe('when attempting to set a new expiry time', () => {
		let ownershipDuration;

		before('deploy', async () => {
			ownershipDuration = DAY;

			expectedExpiry = (await currentTime()) + ownershipDuration;

			TestableTempOwned = await TestableTempOwnedFactory.new(temporaryOwner, ownershipDuration, {
				from: deployerAccount,
			});
		});

		it('only allows the owner to execute', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: TestableTempOwned.setNewExpiryTime,
				args: [42],
				address: temporaryOwner,
				accounts,
				reason: 'Only executable by temp owner',
			});
		});

		it('should only set a new expiry time if it is sooner than what is currently set', async () => {
			ownershipDuration = DAY * 2;

			await assert.revert(
				TestableTempOwned.setNewExpiryTime(ownershipDuration, { from: temporaryOwner }),
				'New expiry time must be sooner than it currently is'
			);
		});

		it('should properly set the expiry time', async () => {
			ownershipDuration = 2;

			expectedExpiry = (await currentTime()) + ownershipDuration;

			await TestableTempOwned.setNewExpiryTime(ownershipDuration, {
				from: temporaryOwner,
			});

			assert.bnClose(
				expectedExpiry.toString(),
				(await TestableTempOwned.expiryTime()).toString(),
				'10'
			);
		});

		it('should not allow nominated owner to accept ownership after expiration', async () => {
			const nominatedOwner = account1;

			const txn = await TestableTempOwned.nominateNewOwner(nominatedOwner, {
				from: temporaryOwner,
			});
			assert.eventEqual(txn, 'OwnerNominated', { newOwner: nominatedOwner });

			const nominatedOwnerFromContract = await TestableTempOwned.nominatedOwner();
			assert.equal(nominatedOwnerFromContract, nominatedOwner);

			await fastForward(ownershipDuration);

			await assert.revert(
				TestableTempOwned.acceptOwnership({ from: account1 }),
				'Ownership expired'
			);
		});

		it('should not allow the nomination of a new owner after expiration', async () => {
			const nominatedOwner = account1;

			await fastForward(ownershipDuration);

			await assert.revert(
				TestableTempOwned.nominateNewOwner(nominatedOwner, { from: temporaryOwner }),
				'Ownership expired'
			);
		});
	});

	describe('when attempting to change ownership', () => {
		it('should not nominate new owner when not invoked by current contract owner', async () => {
			const nominatedOwner = temporaryOwner;

			await assert.revert(
				TestableTempOwned.nominateNewOwner(nominatedOwner, { from: temporaryOwner }),
				'Ownership expired'
			);

			await assert.revert(
				TestableTempOwned.acceptOwnership({ from: account1 }),
				'Ownership expired'
			);

			TestableTempOwned = await TestableTempOwnedFactory.new(temporaryOwner, DAY, {
				from: deployerAccount,
			});

			await assert.revert(
				TestableTempOwned.nominateNewOwner(nominatedOwner, { from: account1 }),
				'Only executable by temp owner'
			);

			const nominatedOwnerFromContract = await TestableTempOwned.nominatedOwner();
			assert.equal(nominatedOwnerFromContract, ZERO_ADDRESS);
		});

		it('should nominate new owner when invoked by current contract owner', async () => {
			const nominatedOwner = account1;

			const txn = await TestableTempOwned.nominateNewOwner(nominatedOwner, {
				from: temporaryOwner,
			});
			assert.eventEqual(txn, 'OwnerNominated', { newOwner: nominatedOwner });

			const nominatedOwnerFromContract = await TestableTempOwned.nominatedOwner();
			assert.equal(nominatedOwnerFromContract, nominatedOwner);
		});

		it('should not accept new owner nomination when not invoked by nominated owner', async () => {
			const nominatedOwner = account2;

			await assert.revert(
				TestableTempOwned.acceptOwnership({ from: account3 }),
				'You must be nominated before you can accept ownership'
			);

			const owner = await TestableTempOwned.temporaryOwner();
			assert.notEqual(owner, nominatedOwner);
		});

		it('should accept new owner nomination when invoked by nominated owner', async () => {
			const nominatedOwner = account1;

			let txn = await TestableTempOwned.nominateNewOwner(nominatedOwner, { from: temporaryOwner });
			assert.eventEqual(txn, 'OwnerNominated', { newOwner: nominatedOwner });

			const nominatedOwnerFromContract = await TestableTempOwned.nominatedOwner();
			assert.equal(nominatedOwnerFromContract, nominatedOwner);

			txn = await TestableTempOwned.acceptOwnership({ from: account1 });

			assert.eventEqual(txn, 'OwnerChanged', { oldOwner: temporaryOwner, newOwner: account1 });

			const owner = await TestableTempOwned.temporaryOwner();
			const nominatedOwnerFromContact = await TestableTempOwned.nominatedOwner();

			assert.equal(owner, nominatedOwner);
			assert.equal(nominatedOwnerFromContact, ZERO_ADDRESS);
		});
	});
});
