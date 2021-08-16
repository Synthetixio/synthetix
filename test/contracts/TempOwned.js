'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');
const { currentTime, fastForward } = require('../utils')();

const TestableTempOwnedFactory = artifacts.require('TestableTempOwned');

contract('TempOwned', accounts => {
	const DAY = 60 * 60 * 24;
	const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

	const [deployerAccount, tempOwner, account3] = accounts;

	let TestableTempOwned;
	let timestamp;

	beforeEach(async () => {
		timestamp = await currentTime();
	});

	describe('when attempting to deploy with an invalid owner address', () => {
		it('reverts', async () => {
			await assert.revert(
				TestableTempOwnedFactory.new(ZERO_ADDRESS, timestamp + DAY, { from: deployerAccount }),
				'Owner address cannot be 0'
			);
		});
	});

	describe('when attempting to deploy with an invalid EOL date', () => {
		it('reverts', async () => {
			await assert.revert(
				TestableTempOwnedFactory.new(tempOwner, timestamp - DAY, { from: deployerAccount }),
				'Invalid temp owner EOL'
			);
		});
	});

	describe('when deploying with a valid EOL date', () => {
		let tempOwnerEOL;

		before('deploy', async () => {
			tempOwnerEOL = timestamp + DAY;

			TestableTempOwned = await TestableTempOwnedFactory.new(tempOwner, tempOwnerEOL, {
				from: deployerAccount,
			});
		});

		it('properly set tempOwner', async () => {
			assert.equal(tempOwner, await TestableTempOwned.tempOwner());
		});

		it('properly set tempOwnerEOL', async () => {
			assert.equal(tempOwnerEOL, await TestableTempOwned.tempOwnerEOL());
		});

		describe('before reaching the EOL date', () => {
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

		describe('after reaching the EOL date', () => {
			before('fast forward', async () => {
				await fastForward(DAY + 1);
			});

			it('does not allow temp owner to change the value', async () => {
				await assert.revert(
					TestableTempOwned.setTestValue(1337, { from: tempOwner }),
					'Owner EOL date already reached'
				);
			});
		});
	});
});
