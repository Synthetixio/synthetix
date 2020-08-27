'use strict';

const GasTank = artifacts.require('GasTank');
const FakeGasTank = artifacts.require('FakeGasTank');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('Gas Tank (unit tests)', async accounts => {
	const [deployerAccount, owner, , accountOne, accountTwo] = accounts;

	before(async () => {
		this.owner = owner;
	});

	beforeEach(async () => {
		this.instance = await FakeGasTank.new(owner, ZERO_ADDRESS);
	});

	describe('constructor', () => {
		it('should set constructor params on deployment', async () => {
			assert.equal(await this.instance.owner(), owner);
		});
	});
});
