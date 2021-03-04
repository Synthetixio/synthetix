'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { currentTime, fastForward } = require('../utils')();
const { timeIsClose } = require('./helpers');

const OneWeekSetup = artifacts.require('OneWeekSetup');

contract('LimitedSetup @ovm-skip', accounts => {
	const [deployerAccount, owner] = accounts;

	let instance;
	let timestamp;

	// we must snapshot here so that invoking fastForward() later on in this test does not
	// pollute the global scope by moving on the block timestamp from its starting point
	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		timestamp = await currentTime();
		// the owner is the associated contract, so we can simulate
		instance = await OneWeekSetup.new(owner, {
			from: deployerAccount,
		});
	});
	describe('when mixed into a contract with one week setup', () => {
		it('then the time is the current time plus one week', async () => {
			timeIsClose({
				actual: (await instance.publicSetupExpiryTime()).toString(),
				expected: (+timestamp + 3600 * 24 * 7).toString(),
			});
		});
		describe('when a test function is invoked that is only allowed during setup', () => {
			it('then it succeeds', async () => {
				await instance.testFunc();
			});
			describe('when 6 days pass', () => {
				beforeEach(async () => {
					await fastForward(3600 * 24 * 6);
				});
				it('then it still succeeds', async () => {
					await instance.testFunc();
				});
				describe('when another day and change passes', () => {
					beforeEach(async () => {
						await fastForward(Math.round(3600 * 24 * 1.1));
					});
					it('then it fails as the setup period has expired', async () => {
						await assert.revert(instance.testFunc());
					});
				});
			});
		});
	});
});
