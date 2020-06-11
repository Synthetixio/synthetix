'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts } = require('./setup');

const { toUnit } = require('../utils')();

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('EternalStorage', accounts => {
	const EternalStorage = artifacts.require('EternalStorage');
	const [deployerAccount, ownerAccount, associatedContract, account1] = accounts;
	let eternalStorage;

	before(async () => {
		({ EternalStorage: eternalStorage } = await setupAllContracts({
			accounts,
			synths: [],
			contracts: ['EternalStorage'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	it('should revert when owner parameter is passed the zero address', async () => {
		await assert.revert(
			EternalStorage.new(ZERO_ADDRESS, associatedContract, { from: deployerAccount })
		);
	});

	it('should set owner address on deployment', async () => {
		const instance = await EternalStorage.new(ownerAccount, ZERO_ADDRESS, {
			from: deployerAccount,
		});
		const owner = await instance.owner();
		assert.equal(owner, ownerAccount);
	});

	it('should set the associatedContract address on deployment', async () => {
		const instance = await EternalStorage.new(ownerAccount, associatedContract, {
			from: deployerAccount,
		});
		const _associatedContract = await instance.associatedContract();
		assert.equal(associatedContract, _associatedContract);
	});

	describe('given an instance', () => {
		describe('when storing a uint from the associatedContract', () => {
			const recordKey = toBytes32('myUintValue');
			const valueUint = toUnit('1000');
			before(async () => {
				await eternalStorage.setUIntValue(recordKey, valueUint, {
					from: associatedContract,
				});
			});
			it('then any account can read the uint with the recordKey', async () => {
				const storedUint = await eternalStorage.getUIntValue(recordKey, toUnit('1000'), {
					from: account1,
				});

				assert.bnEqual(storedUint, valueUint);
			});
			it('then the associatedContract can delete the uint with the recordKey', async () => {
				const storedUint = await eternalStorage.deleteUIntValue(recordKey, {
					from: account1,
				});

				assert.bnEqual(storedUint, valueUint);
			});
			it('when any account attempts to delete the uint then revert', async () => {
				const storedUint = await eternalStorage.deleteUIntValue(recordKey, {
					from: account1,
				});

				assert.bnEqual(storedUint, valueUint);
			});
		});
	});
});
