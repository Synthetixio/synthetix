'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts } = require('./setup');

contract('SynthUtil', accounts => {
	const SynthUtil = artifacts.require('SynthUtil');
	const [deployerAccount, ownerAccount, account1, account2, account3] = accounts;
	let synthUtil;

	before(async () => {
		({ SynthUtil: synthUtil } = await setupAllContracts({
			accounts,
			synths: [],
			contracts: ['SynthUtil'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('given an instance', () => {
		it('when then', async () => {});
	});
});
