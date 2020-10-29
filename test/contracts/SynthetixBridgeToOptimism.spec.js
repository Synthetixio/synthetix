const { contract, web3 } = require('@nomiclabs/buidler');
const { setupAllContracts } = require('./setup');
const { assert } = require('./common');
const { toBN } = web3.utils;

contract('SynthetixBridgeToOptimism (spec tests)', accounts => {
	const [, owner] = accounts;

	let synthetix, synthetixBridgeToOptimism;

	describe('when deploying the system', () => {
		before('deploy all contracts', async () => {
			({
				Synthetix: synthetix,
				SynthetixBridgeToOptimism: synthetixBridgeToOptimism,
			} = await setupAllContracts({
				accounts,
				contracts: ['Synthetix', 'Issuer', 'RewardEscrow', 'SynthetixBridgeToOptimism'],
			}));
		});

		describe('deposit', () => {
			describe('when a user has provided allowance to the bridge contract', () => {
				const amountToDeposit = 1;

				before('approve SynthetixBridgeToOptimism', async () => {
					await synthetix.approve(synthetixBridgeToOptimism.address, amountToDeposit, {
						from: owner,
					});
				});

				describe('when performing a deposit', () => {
					let userBalanceBefore;

					before('record balance before', async () => {
						userBalanceBefore = await synthetix.balanceOf(owner);
					});

					before('perform a deposit', async () => {
						await synthetixBridgeToOptimism.deposit(amountToDeposit, {
							from: owner,
						});
					});

					it('reduces the user balance', async () => {
						const userBalanceAfter = await synthetix.balanceOf(owner);

						assert.bnEqual(userBalanceBefore.sub(toBN(amountToDeposit)), userBalanceAfter);
					});

					it("increases the contract's balance", async () => {
						assert.bnEqual(
							await synthetix.balanceOf(synthetixBridgeToOptimism.address),
							amountToDeposit
						);
					});
				});
			});
		});

		describe('rewardDeposit', () => {
			describe('when a user has provided allowance to the bridge contract', () => {
				const amountToDeposit = 1;

				before('approve SynthetixBridgeToOptimism', async () => {
					await synthetix.approve(synthetixBridgeToOptimism.address, amountToDeposit, {
						from: owner,
					});
				});

				describe('when performing a deposit', () => {
					let userBalanceBefore;

					before('record balance before', async () => {
						userBalanceBefore = await synthetix.balanceOf(owner);
					});

					before('perform a rewardDeposit', async () => {
						await synthetixBridgeToOptimism.rewardDeposit(amountToDeposit, {
							from: owner,
						});
					});

					it('reduces the user balance', async () => {
						const userBalanceAfter = await synthetix.balanceOf(owner);

						assert.bnEqual(userBalanceBefore.sub(toBN(amountToDeposit)), userBalanceAfter);
					});

					it("increases the contract's balance", async () => {
						assert.bnEqual(
							await synthetix.balanceOf(synthetixBridgeToOptimism.address),
							amountToDeposit * 2
						);
					});
				});
			});
		});
	});
});
