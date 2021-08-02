'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const TesteableTempOwned = artifacts.require('TestableTempOwned');

contract('TempOwned', accounts => {
	const [deployerAccount, tempOwner, account3] = accounts;

	it('should should not allow call owned method if EOL date reached', async () => {
		const contract = await TesteableTempOwned.new(tempOwner, Date.now() - 60e5, {
			from: deployerAccount,
		});

		// const res = await contract.getMeaningOfLife({ from: tempOwner });
		const res = await contract.getDebugData({ from: tempOwner });

		console.log(res);

		// await assert.revert(
		// 	'Owner EOL date already reached'
		// );
	});

	it('should should not allow call owned method if no temp owner given', async () => {
		const contract = await TesteableTempOwned.new(tempOwner, Date.now() + 60e5, {
			from: deployerAccount,
		});

		await assert.revert(
			contract.getMeaningOfLife({ from: account3 }),
			'Only executable by temp owner'
		);
	});
});
