'use strict';

const BN = require('bn.js');
const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const TesteableTempOwned = artifacts.require('TestableTempOwned');

contract('TempOwned', accounts => {
	const [deployerAccount, tempOwner, account3] = accounts;

	const tomorrow = new BN(Math.floor(new Date().getTime()) / 1000);
	const yesterday = new BN(Math.floor(new Date().getTime()) / 1000);

	it('should should not allow call owned method if EOL date reached', async () => {
		const contract = await TesteableTempOwned.new(tempOwner, yesterday, {
			from: deployerAccount,
		});

		const res = await contract.getDebugData({ from: tempOwner });
		console.log({ yesterday });
		console.log(res);

		console.log(await contract.getNow({ from: tempOwner }));

		await assert.revert(
			contract.getMeaningOfLife({ from: tempOwner }),
			'Owner EOL date already reached'
		);
	});

	it('should should not allow call owned method from another address', async () => {
		const contract = await TesteableTempOwned.new(tempOwner, tomorrow, {
			from: deployerAccount,
		});

		await assert.revert(
			contract.getMeaningOfLife({ from: account3 }),
			'Only executable by temp owner'
		);
	});
});
