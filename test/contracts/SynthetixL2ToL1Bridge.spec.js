const { contract, web3 } = require('@nomiclabs/buidler');
const { setupAllContracts } = require('./setup');
const { assert } = require('./common');
const { toBN } = web3.utils;

contract('SynthetixL2ToL1Bridge (spec tests)', accounts => {
	const [, owner] = accounts;

	let mintableSynthetix, synthetixL2ToL1Bridge;

	describe('when deploying the system', () => {
		before('deploy all contracts', async () => {
			({
				Synthetix: mintableSynthetix, // we request Synthetix instead of MintableSynthetix because it is renamed in setup.js
				SynthetixL2ToL1Bridge: synthetixL2ToL1Bridge,
			} = await setupAllContracts({
				accounts,
				contracts: ['MintableSynthetix', 'SynthetixL2ToL1Bridge'],
			}));
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
					await synthetixL2ToL1Bridge.initiateWithdrawal(amountToWithdraw, {
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
