const { contract, web3 } = require('@nomiclabs/buidler');
const { setupAllContracts } = require('./setup');
const { assert } = require('./common');
const { toBN } = web3.utils;

contract('SynthetixBridgeToBase (spec tests)', accounts => {
	const [, owner, user] = accounts;

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
			it('the withdrawal should fail', async () => {
				await assert.revert(
					synthetixBridgeToBase.initiateWithdrawal('1', { from: user }),
					'Not enough transferable SNX'
				);
			});
		});

		it('shows the expected cross domain message gas limit', async () => {
			assert.bnEqual(await systemSettings.crossDomainMessageGasLimit(), 3e6);
		});

		describe('when a user has the required balance', () => {
			const amountToWithdraw = 1;

			describe('when requesting a withdrawal', () => {
				let userBalanceBefore;
				let initialSupply;

				before('record user balance and initial total supply', async () => {
					userBalanceBefore = await mintableSynthetix.balanceOf(owner);
					initialSupply = await mintableSynthetix.totalSupply();
				});

				before('inititate a withdrawal', async () => {
					await synthetixBridgeToBase.initiateWithdrawal(amountToWithdraw, {
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
