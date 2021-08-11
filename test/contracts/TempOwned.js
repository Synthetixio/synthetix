'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { currentTime, fastForward } = require('../utils')();

const TesteableTempOwned = artifacts.require('TestableTempOwned');

contract('TempOwned', accounts => {
	const DAY = 60 * 60 * 24;
	const [deployerAccount, tempOwner, account3] = accounts;
	let timestamp;

	beforeEach(async () => {
		timestamp = await currentTime();
	});

	it('should not allow call owned method if EOL date reached', async () => {
		const contract = await TesteableTempOwned.new(tempOwner, timestamp - DAY, {
			from: deployerAccount,
		});

		await assert.revert(
			contract.setTestValue(4, { from: tempOwner }),
			'Owner EOL date already reached'
		);
	});

	it('should not allow call owned method from another address', async () => {
		const contract = await TesteableTempOwned.new(tempOwner, timestamp + DAY, {
			from: deployerAccount,
		});

		await assert.revert(
			contract.setTestValue(4, { from: account3 }),
			'Only executable by temp owner'
		);
	});

	describe('when reaching EOL', () => {
		addSnapshotBeforeRestoreAfterEach();

		it('allows to call a method to the tempOwner before EOL, then EOL is reached and blocks the execution', async () => {
			const contract = await TesteableTempOwned.new(tempOwner, timestamp + DAY, {
				from: deployerAccount,
			});

			assert.equal(await contract.testValue(), 0);

			await contract.setTestValue(1, { from: tempOwner });

			assert.equal(await contract.testValue(), 1);

			await fastForward(DAY * 2);

			await assert.revert(
				contract.setTestValue(3, { from: tempOwner }),
				'Owner EOL date already reached'
			);
		});
	});
});
