'use strict';
const w3utils = require('web3-utils');
const { artifacts, contract } = require('hardhat');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { setupContract } = require('./setup');
const { toUnit } = require('../utils')();
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('EternalStorage', accounts => {
	const EternalStorage = artifacts.require('EternalStorage');
	const [deployerAccount, owner, associatedContract, account1] = accounts;
	let eternalStorage;

	const toBytes = key => w3utils.asciiToHex(key);

	before(async () => {
		eternalStorage = await setupContract({
			accounts,
			contract: 'EternalStorage',
			args: [owner, associatedContract],
		});
	});

	addSnapshotBeforeRestoreAfterEach();

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: EternalStorage.abi,
			ignoreParents: ['Owned', 'State'],
			expected: [
				'deleteAddressValue',
				'deleteBooleanValue',
				'deleteBytes32Value',
				'deleteBytesValue',
				'deleteIntValue',
				'deleteStringValue',
				'deleteUIntValue',
				'setAddressValue',
				'setBooleanValue',
				'setBytes32Value',
				'setBytesValue',
				'setIntValue',
				'setStringValue',
				'setUIntValue',
			],
		});
	});

	it('should revert when owner parameter is passed the zero address', async () => {
		await assert.revert(
			EternalStorage.new(ZERO_ADDRESS, associatedContract, { from: deployerAccount })
		);
	});

	it('should set owner address on deployment', async () => {
		const instance = await EternalStorage.new(owner, ZERO_ADDRESS, {
			from: deployerAccount,
		});
		const ownerAddress = await instance.owner();
		assert.equal(owner, ownerAddress);
	});

	it('should set the associatedContract address on deployment', async () => {
		const instance = await EternalStorage.new(owner, associatedContract, {
			from: deployerAccount,
		});
		const _associatedContract = await instance.associatedContract();
		assert.equal(associatedContract, _associatedContract);
	});

	describe('given an instance', () => {
		before(async () => {
			eternalStorage = await EternalStorage.new(owner, associatedContract, {
				from: deployerAccount,
			});
		});
		describe('when storing a uint', () => {
			const recordKey = toBytes32('myUintValue');
			const valueUint = toUnit('1000');
			before(async () => {
				await eternalStorage.setUIntValue(recordKey, valueUint, {
					from: associatedContract,
				});
			});
			it('then any account can read the uint with the recordKey', async () => {
				const storedUint = await eternalStorage.getUIntValue(recordKey, {
					from: account1,
				});
				assert.bnEqual(storedUint, valueUint);
			});
			it('then the associatedContract can delete the uint with the recordKey', async () => {
				await eternalStorage.deleteUIntValue(recordKey, {
					from: associatedContract,
				});
				const storedUint = await eternalStorage.getUIntValue(recordKey, {
					from: account1,
				});
				assert.bnEqual(storedUint, 0);
			});
			it('when a non associated address attempts to delete the value then revert', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: eternalStorage.deleteUIntValue,
					accounts,
					address: associatedContract,
					args: [recordKey],
					reason: 'Only the associated contract can perform this action',
				});
			});
		});
		describe('when storing a string', () => {
			const recordKey = toBytes32('myStringValue');
			const valueString = 'Alice';
			before(async () => {
				await eternalStorage.setStringValue(recordKey, valueString, {
					from: associatedContract,
				});
			});
			it('then any account can read the string with the recordKey', async () => {
				const storedString = await eternalStorage.getStringValue(recordKey, {
					from: account1,
				});
				assert.bnEqual(storedString, valueString);
			});
			it('then the associatedContract can delete the string with the recordKey', async () => {
				await eternalStorage.deleteStringValue(recordKey, {
					from: associatedContract,
				});
				const storedString = await eternalStorage.getStringValue(recordKey, {
					from: account1,
				});
				assert.equal(storedString, '');
			});
			it('when a non associated address attempts to delete the value then revert', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: eternalStorage.deleteStringValue,
					accounts,
					address: associatedContract,
					args: [recordKey],
					reason: 'Only the associated contract can perform this action',
				});
			});
		});
		describe('when storing an address', () => {
			const recordKey = toBytes32('myAddressValue');
			before(async () => {
				await eternalStorage.setAddressValue(recordKey, account1, {
					from: associatedContract,
				});
			});
			it('then any account can read the address with the recordKey', async () => {
				const storedString = await eternalStorage.getAddressValue(recordKey, {
					from: account1,
				});
				assert.bnEqual(storedString, account1);
			});
			it('then the associatedContract can delete the address with the recordKey', async () => {
				await eternalStorage.deleteAddressValue(recordKey, {
					from: associatedContract,
				});
				const storedString = await eternalStorage.getAddressValue(recordKey, {
					from: account1,
				});
				assert.equal(storedString, ZERO_ADDRESS);
			});
			it('when a non associated address attempts to delete the value then revert', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: eternalStorage.deleteAddressValue,
					accounts,
					address: associatedContract,
					args: [recordKey],
					reason: 'Only the associated contract can perform this action',
				});
			});
		});
		describe('when storing bytes', () => {
			const recordKey = toBytes32('myBytesValue');
			const valueBytes = toBytes('value');
			before(async () => {
				await eternalStorage.setBytesValue(recordKey, valueBytes, {
					from: associatedContract,
				});
			});
			it('then any account can read the bytes with the recordKey', async () => {
				const storedBytes = await eternalStorage.getBytesValue(recordKey, {
					from: account1,
				});
				assert.bnEqual(storedBytes, valueBytes);
			});
			it('then the associatedContract can delete the bytes with the recordKey', async () => {
				await eternalStorage.deleteBytesValue(recordKey, {
					from: associatedContract,
				});
				const storedBytes = await eternalStorage.getBytesValue(recordKey, {
					from: account1,
				});
				assert.equal(storedBytes, null);
			});
			it('when a non associated address attempts to delete the value then revert', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: eternalStorage.deleteBytesValue,
					accounts,
					address: associatedContract,
					args: [recordKey],
					reason: 'Only the associated contract can perform this action',
				});
			});
		});
		describe('when storing bytes32', () => {
			const recordKey = toBytes32('myBytes32Value');
			const valueBytes = toBytes32('value');
			before(async () => {
				await eternalStorage.setBytes32Value(recordKey, valueBytes, {
					from: associatedContract,
				});
			});
			it('then any account can read the bytes32 with the recordKey', async () => {
				const storedBytes32 = await eternalStorage.getBytes32Value(recordKey, {
					from: account1,
				});
				assert.bnEqual(storedBytes32, valueBytes);
			});
			it('then the associatedContract can delete the bytes32 with the recordKey', async () => {
				await eternalStorage.deleteBytes32Value(recordKey, {
					from: associatedContract,
				});
				const storedBytes32 = await eternalStorage.getBytes32Value(recordKey, {
					from: account1,
				});
				assert.equal(storedBytes32, toBytes32(''));
			});
			it('when a non associated address attempts to delete the value then revert', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: eternalStorage.deleteBytes32Value,
					accounts,
					address: associatedContract,
					args: [recordKey],
					reason: 'Only the associated contract can perform this action',
				});
			});
		});
		describe('when storing bool', () => {
			const recordKey = toBytes32('myBoolValue');
			const valueBool = true;
			before(async () => {
				await eternalStorage.setBooleanValue(recordKey, valueBool, {
					from: associatedContract,
				});
			});
			it('then any account can read the bytes32 with the recordKey', async () => {
				const storedBool = await eternalStorage.getBooleanValue(recordKey, {
					from: account1,
				});
				assert.bnEqual(storedBool, valueBool);
			});
			it('then the associatedContract can delete the bytes32 with the recordKey', async () => {
				await eternalStorage.deleteBooleanValue(recordKey, {
					from: associatedContract,
				});
				const storedBool = await eternalStorage.getBooleanValue(recordKey, {
					from: account1,
				});
				assert.equal(storedBool, false);
			});
			it('when a non associated address attempts to delete the value then revert', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: eternalStorage.deleteBooleanValue,
					accounts,
					address: associatedContract,
					args: [recordKey],
					reason: 'Only the associated contract can perform this action',
				});
			});
		});
		describe('when storing a int', () => {
			const recordKey = toBytes32('myIntValue');
			const valueInt = toUnit('-1');
			before(async () => {
				await eternalStorage.setIntValue(recordKey, valueInt, {
					from: associatedContract,
				});
			});
			it('then any account can read the uint with the recordKey', async () => {
				const storedUint = await eternalStorage.getIntValue(recordKey, {
					from: account1,
				});
				assert.bnEqual(storedUint, valueInt);
			});
			it('then the associatedContract can delete the uint with the recordKey', async () => {
				await eternalStorage.deleteIntValue(recordKey, {
					from: associatedContract,
				});
				const storedUint = await eternalStorage.getIntValue(recordKey, {
					from: account1,
				});
				assert.bnEqual(storedUint, 0);
			});
			it('when a non associated address attempts to delete the value then revert', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: eternalStorage.deleteIntValue,
					accounts,
					address: associatedContract,
					args: [recordKey],
					reason: 'Only the associated contract can perform this action',
				});
			});
		});
	});
});
