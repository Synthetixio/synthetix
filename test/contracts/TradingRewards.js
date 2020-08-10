'use strict';

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { mockToken } = require('./setup');
const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { toWei } = web3.utils;

const TradingRewards = artifacts.require('TradingRewards');

contract('TradingRewards', accounts => {
	const [deployerAccount, owner, rewardsDistribution, account1] = accounts;

	let rewards;

	const rewardsTokenTotalSupply = toWei('1000000', 'ether');

	addSnapshotBeforeRestoreAfterEach();

	describe('when deployibg a rewards token', () => {
		let token;

		before('deploy rewards token', async () => {
			({ token } = await mockToken({
				accounts,
				name: 'Rewards Token',
				symbol: 'RWD',
				supply: rewardsTokenTotalSupply,
			}));
		});

		it('deployed the rewards token with the correct number of decimals', async () => {
			assert.equal('18', (await token.decimals()).toString(10));
		});

		it.skip('deployed a rewards token with the expected supply', async () => {
			assert.deepEqual(rewardsTokenTotalSupply, await token.totalSupply());
		});

		describe.skip('when deploying the rewards contract', () => {
			before('deploy rewards contract', async () => {
				rewards = await TradingRewards.new(owner, token.address, rewardsDistribution, {
					from: deployerAccount,
				});
			});

			it('ensure only known functions are mutative', () => {
				ensureOnlyExpectedMutativeFunctions({
					abi: rewards.abi,
					ignoreParents: ['Owned', 'Pausable'],
					expected: [
						'claimRewardsForPeriod',
						'claimRewardsForPeriods',
						'recordExchangeFeeForAccount',
						'setRewardsDistribution',
						'notifyRewardAmount',
						'recoverTokens',
						'recoverRewardsTokens',
					],
				});
			});

			describe('before a period is started', () => {
				it('reports the current period to be 0', async () => {
					assert.equal(await rewards.getCurrentPeriod(), 0);
				});

				it('reports the current period to not be claimable', async () => {
					assert.isNotTrue(await rewards.getPeriodIsClaimable(0));
				});

				it('reverts when trying to record fees', async () => {
					await assert.revert(
						rewards.recordExchangeFeeForAccount(10, account1),
						'No period available'
					);
				});

				it('reverts when attempting to create a new period with no rewards balance', async () => {
					await assert.revert(
						rewards.notifyRewardAmount(10, { from: rewardsDistribution }),
						'Insufficient free rewards'
					);
				});

				describe('when some rewards tokens are transferred to the contract', () => {
					const amount = toWei('1000', 'ether');

					before('transfer some rewards tokens to the contract', async () => {
						await token.transfer(rewards.address, amount);
					});

					it('holds the transferred tokens', async () => {
						assert.equal(amount, await token.balanceOf(rewards.address));
					});

					// it('reverts when any account attempts to create a new period', async () => {});
				});
			});
		});
	});
});
