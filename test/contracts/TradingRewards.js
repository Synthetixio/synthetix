'use strict';

const { mockToken } = require('./setup');
const { artifacts, contract } = require('@nomiclabs/buidler');
const { assert } = require('./common');

const TradingRewards = artifacts.require('TradingRewards');

contract('TradingRewards', accounts => {
	const [deployerAccount, owner, rewardsDistribution] = accounts;

	let token;
	let rewards;

	before('Deploy rewards token', async () => {
		({ token } = await mockToken({
			accounts,
			name: 'Rewards Token',
			symbol: 'RWD',
		}));
	});

	before('Deploy TradingRewards contract', async () => {
		rewards = await TradingRewards.new(owner, token.address, rewardsDistribution, {
			from: deployerAccount,
		});
	});

	it('has a valid address', async () => {
		assert.ok(rewards.address.length > 0);
	});
});
