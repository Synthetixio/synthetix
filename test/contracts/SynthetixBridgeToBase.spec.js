const { contract, web3 } = require('hardhat');
const { setupAllContracts } = require('./setup');
const { assert } = require('./common');
const { toBN } = web3.utils;
const {
	defaults: {
		CROSS_DOMAIN_DEPOSIT_GAS_LIMIT,
		CROSS_DOMAIN_ESCROW_GAS_LIMIT,
		CROSS_DOMAIN_REWARD_GAS_LIMIT,
		CROSS_DOMAIN_WITHDRAWAL_GAS_LIMIT,
	},
} = require('../../');

contract('SynthetixBridgeToBase (spec tests) @ovm-skip', accounts => {
	const [, owner, user, randomAddress] = accounts;

	let mintableSynthetix, synthetixBridgeToBase, systemSettings;

	describe('when deploying the system', () => {
		before('deploy all contracts', async () => {
			({
				Synthetix: mintableSynthetix, // we request Synthetix instead of MintableSynthetix because it is renamed in setup.js
				SynthetixBridgeToBase: synthetixBridgeToBase,
				SystemSettings: systemSettings,
			} = await setupAllContracts({
				accounts,
				contracts: ['MintableSynthetix', 'SynthetixBridgeToBase', 'SystemSettings'],
			}));
		});

		describe('when a user does not have the required balance', () => {
			it('withdraw() should fail', async () => {
				await assert.revert(
					synthetixBridgeToBase.withdraw('1', { from: user }),
					'Not enough transferable SNX'
				);
			});

			it('withdrawTo() should fail', async () => {
				await assert.revert(
					synthetixBridgeToBase.withdrawTo(randomAddress, '1', { from: user }),
					'Not enough transferable SNX'
				);
			});
		});

		it('returns the expected cross domain message gas limit', async () => {
			assert.bnEqual(
				await systemSettings.crossDomainMessageGasLimit(0),
				CROSS_DOMAIN_DEPOSIT_GAS_LIMIT
			);
			assert.bnEqual(
				await systemSettings.crossDomainMessageGasLimit(1),
				CROSS_DOMAIN_ESCROW_GAS_LIMIT
			);
			assert.bnEqual(
				await systemSettings.crossDomainMessageGasLimit(2),
				CROSS_DOMAIN_REWARD_GAS_LIMIT
			);
			assert.bnEqual(
				await systemSettings.crossDomainMessageGasLimit(3),
				CROSS_DOMAIN_WITHDRAWAL_GAS_LIMIT
			);
		});

		describe('when a user has the required balance', () => {
			const amountToWithdraw = 1;
			let userBalanceBefore;
			let initialSupply;

			describe('when requesting a withdrawal', () => {
				before('record user balance and initial total supply', async () => {
					userBalanceBefore = await mintableSynthetix.balanceOf(owner);
					initialSupply = await mintableSynthetix.totalSupply();
				});

				before('initiate a withdrawal', async () => {
					await synthetixBridgeToBase.withdraw(amountToWithdraw, {
						from: owner,
					});
				});

				it('reduces the user balance', async () => {
					const userBalanceAfter = await mintableSynthetix.balanceOf(owner);
					assert.bnEqual(userBalanceBefore.sub(toBN(amountToWithdraw)), userBalanceAfter);
				});

				it('reduces the total supply', async () => {
					const supplyAfter = await mintableSynthetix.totalSupply();
					assert.bnEqual(initialSupply.sub(toBN(amountToWithdraw)), supplyAfter);
				});
			});

			describe('when requesting a withdrawal to a different address', () => {
				before('record user balance and initial total supply', async () => {
					userBalanceBefore = await mintableSynthetix.balanceOf(owner);
					initialSupply = await mintableSynthetix.totalSupply();
				});

				before('initiate a withdrawal', async () => {
					await synthetixBridgeToBase.withdrawTo(randomAddress, amountToWithdraw, {
						from: owner,
					});
				});

				it('reduces the user balance', async () => {
					const userBalanceAfter = await mintableSynthetix.balanceOf(owner);
					assert.bnEqual(userBalanceBefore.sub(toBN(amountToWithdraw)), userBalanceAfter);
				});

				it('reduces the total supply', async () => {
					const supplyAfter = await mintableSynthetix.totalSupply();
					assert.bnEqual(initialSupply.sub(toBN(amountToWithdraw)), supplyAfter);
				});
			});
		});
	});
});
