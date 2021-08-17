'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');
const { fastForward } = require('../utils')();

const TestableTempOwnedFactory = artifacts.require('TestableTempOwned');

contract('TemporarilyOwned', accounts => {
	const DAY = 60 * 60 * 24;
	const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

	const [deployerAccount, tempOwner, account3] = accounts;

	let TestableTempOwned;

	describe('when attempting to deploy with an invalid owner address', () => {
		it('reverts', async () => {
			await assert.revert(
				TestableTempOwnedFactory.new(ZERO_ADDRESS, DAY, { from: deployerAccount }),
				'Owner address cannot be 0'
			);
		});
	});

	describe('when deploying with valid parameters', () => {
		let duration;

		before('deploy', async () => {
			duration = DAY;

			TestableTempOwned = await TestableTempOwnedFactory.new(tempOwner, duration, {
				from: deployerAccount,
			});
		});

		it('properly set tempOwner', async () => {
			assert.equal(tempOwner, await TestableTempOwned.tempOwner());
		});

		it('properly set duration', async () => {
			assert.equal(duration, await TestableTempOwned.duration());
		});

		describe('before duration expires', () => {
			it('does not allow any address to change the value', async () => {
				await assert.revert(
					TestableTempOwned.setTestValue(42, { from: account3 }),
					'Only executable by temp owner'
				);
			});

			it('allows temp owner to change the value', async () => {
				await TestableTempOwned.setTestValue(42, { from: tempOwner });

				assert.equal(42, await TestableTempOwned.testValue());
			});
		});

		describe('after duration expiry', () => {
			before('fast forward', async () => {
				await fastForward(duration);
			});

			it('does not allow temp owner to change the value', async () => {
				await assert.revert(
					TestableTempOwned.setTestValue(1337, { from: tempOwner }),
					'Ownership expired'
				);
			});
		});
	});
});
