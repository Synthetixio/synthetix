'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts } = require('./setup');

contract('SynthUtility', accounts => {
	const SynthUtility = artifacts.require('SynthUtility');
	const [deployerAccount, ownerAccount, account1, account2, account3] = accounts;
	let ynthUtility;

	before(async () => {
		({ SynthUtility: synthUtility } = await setupAllContracts({
			accounts,
			synths: [],
			contracts: ['SynthUtility'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('given an instance', () => {
		it('when then', async () => {});
	});
});
