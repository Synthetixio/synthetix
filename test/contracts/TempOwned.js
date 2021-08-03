'use strict';

const { ethers, artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const TesteableTempOwned = artifacts.require('TestableTempOwned');

contract('TempOwned', accounts => {
	const [deployerAccount, tempOwner, account3] = accounts;
	let timestamp;

	beforeEach(async () => {
		timestamp = (await ethers.provider.getBlock()).timestamp;
	});

	it('should should not allow call owned method if EOL date reached', async () => {
		const contract = await TesteableTempOwned.new(tempOwner, timestamp - 60 * 60, {
			from: deployerAccount,
		});

		await assert.revert(
			contract.setTestValue(4, { from: tempOwner }),
			'Owner EOL date already reached'
		);
	});

	it('should should not allow call owned method from another address', async () => {
		const contract = await TesteableTempOwned.new(tempOwner, timestamp + 60 * 60, {
			from: deployerAccount,
		});

		await assert.revert(
			contract.setTestValue(4, { from: account3 }),
			'Only executable by temp owner'
		);
	});

	it('allows to call a method to the tempOwner before EOL, then EOL is reached and blocks the execution', async () => {
		const contract = await TesteableTempOwned.new(tempOwner, timestamp + 60 * 60, {
			from: deployerAccount,
		});

		await assert.revert(
			contract.setTestValue(4, { from: account3 }),
			'Only executable by temp owner'
		);
	});
});
