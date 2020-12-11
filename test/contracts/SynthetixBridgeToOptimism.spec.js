const { contract, web3 } = require('@nomiclabs/buidler');
const { setupAllContracts } = require('./setup');
const { assert } = require('./common');
const { toBN } = web3.utils;

contract('SynthetixBridgeToOptimism (spec tests)', accounts => {
	const [, owner, newBridge] = accounts;

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
						await synthetixBridgeToOptimism.initiateDeposit(amountToDeposit, {
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

		describe('initiateRewardDeposit', () => {
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

					before('perform a initiateRewardDeposit', async () => {
						await synthetixBridgeToOptimism.initiateRewardDeposit(amountToDeposit, {
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

		describe('migrateBridge', () => {
			describe('when the owner migrates the bridge', () => {
				let bridgeBalance;

				before('record balance', async () => {
					bridgeBalance = await synthetix.balanceOf(synthetixBridgeToOptimism.address);
				});

				before('migrate the bridge', async () => {
					await synthetixBridgeToOptimism.migrateBridge(newBridge, {
						from: owner,
					});
				});

				it('transfers the whoel balacne to the new bridge', async () => {
					assert.bnEqual(await synthetix.balanceOf(synthetixBridgeToOptimism.address), 0);
					assert.bnEqual(await synthetix.balanceOf(newBridge), bridgeBalance);
				});
			});
		});
	});
});
