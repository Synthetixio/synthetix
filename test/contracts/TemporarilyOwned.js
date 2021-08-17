'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');
const { currentTime, fastForward } = require('../utils')();
const { onlyGivenAddressCanInvoke } = require('./helpers');

const TestableTempOwnedFactory = artifacts.require('TestableTempOwned');

contract('TemporarilyOwned', accounts => {
	const DAY = 60 * 60 * 24;
	const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

	const [deployerAccount, temporaryOwner] = accounts;

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
});
