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

contract('SynthetixBridgeToOptimism (spec tests) @ovm-skip', accounts => {
	const [, owner, randomAddress] = accounts;

	let synthetix,
		synthetixBridgeToOptimism,
		synthetixBridgeEscrow,
		systemSettings,
		rewardsDistribution;

	describe('when deploying the system', () => {
		before('deploy all contracts', async () => {
			({
				Synthetix: synthetix,
				SynthetixBridgeToOptimism: synthetixBridgeToOptimism,
				SystemSettings: systemSettings,
				SynthetixBridgeEscrow: synthetixBridgeEscrow,
				RewardsDistribution: rewardsDistribution,
			} = await setupAllContracts({
				accounts,
				contracts: [
					'Synthetix',
					'SynthetixBridgeToOptimism',
					'SystemSettings',
					'RewardsDistribution',
				],
			}));
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

		describe('migrateEscrow', () => {
			it('reverts when an entriesId subarray contains an empty array', async () => {
				const entryIdsEmpty = [[1, 2, 3], []];
				await assert.revert(
					synthetixBridgeToOptimism.migrateEscrow(entryIdsEmpty),
					'Entry IDs required'
				);
			});
		});

		describe('migrateEscrow', () => {
			it('reverts when an entriesId subarray contains an empty array', async () => {
				const entryIdsEmpty = [[], [1, 2, 3]];
				await assert.revert(
					synthetixBridgeToOptimism.depositAndMigrateEscrow(1, entryIdsEmpty),
					'Entry IDs required'
				);
			});
		});

		describe('deposit', () => {
			const amountToDeposit = 1;

			describe('when a user has not provided allowance to the bridge contract', () => {
				it('the deposit should fail', async () => {
					await assert.revert(
						synthetixBridgeToOptimism.deposit(amountToDeposit, { from: owner }),
						'SafeMath: subtraction overflow'
					);
				});
			});

			describe('when a user has provided allowance to the bridge contract', () => {
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

					it("increases the escrow's balance", async () => {
						assert.bnEqual(
							await synthetix.balanceOf(synthetixBridgeEscrow.address),
							amountToDeposit
						);
					});
				});
			});
		});

		describe('depositTo', () => {
			const amountToDeposit = toBN(1);

			describe('when a user has not provided allowance to the bridge contract', () => {
				it('the deposit should fail', async () => {
					await assert.revert(
						synthetixBridgeToOptimism.depositTo(randomAddress, amountToDeposit, { from: owner }),
						'SafeMath: subtraction overflow'
					);
				});
			});

			describe('when a user has provided allowance to the bridge contract', () => {
				before('approve SynthetixBridgeToOptimism', async () => {
					await synthetix.approve(synthetixBridgeToOptimism.address, amountToDeposit, {
						from: owner,
					});
				});

				describe('when performing a deposit', () => {
					let userBalanceBefore;
					let contractBalanceBefore;

					before('record balances before', async () => {
						userBalanceBefore = await synthetix.balanceOf(owner);
						contractBalanceBefore = await synthetix.balanceOf(synthetixBridgeEscrow.address);
					});

					before('perform a deposit to a separate address', async () => {
						await synthetixBridgeToOptimism.depositTo(randomAddress, amountToDeposit, {
							from: owner,
						});
					});

					it('reduces the user balance', async () => {
						const userBalanceAfter = await synthetix.balanceOf(owner);

						assert.bnEqual(userBalanceBefore.sub(toBN(amountToDeposit)), userBalanceAfter);
					});

					it("increases the escrow's balance", async () => {
						assert.bnEqual(
							await synthetix.balanceOf(synthetixBridgeEscrow.address),
							contractBalanceBefore.add(amountToDeposit)
						);
					});
				});
			});
		});

		describe('depositReward', () => {
			describe('when a user has provided allowance to the bridge contract', () => {
				const amountToDeposit = toBN(1);

				before('approve SynthetixBridgeToOptimism', async () => {
					await synthetix.approve(synthetixBridgeToOptimism.address, amountToDeposit, {
						from: owner,
					});
				});

				describe('when performing a deposit', () => {
					let userBalanceBefore;
					let contractBalanceBefore;

					before('record balance before', async () => {
						userBalanceBefore = await synthetix.balanceOf(owner);
						contractBalanceBefore = await synthetix.balanceOf(synthetixBridgeEscrow.address);
					});

					before('perform a depositReward', async () => {
						await synthetixBridgeToOptimism.depositReward(amountToDeposit, {
							from: owner,
						});
					});

					it('reduces the user balance', async () => {
						const userBalanceAfter = await synthetix.balanceOf(owner);

						assert.bnEqual(userBalanceBefore.sub(toBN(amountToDeposit)), userBalanceAfter);
					});

					it("increases the escrow's balance", async () => {
						assert.bnEqual(
							await synthetix.balanceOf(synthetixBridgeEscrow.address),
							contractBalanceBefore.add(amountToDeposit)
						);
					});
				});
			});
		});

		describe('notifyReward', () => {
			describe('the owner has added SynthetixBridgeToOptimism to rewards distributins list', () => {
				const amountToDistribute = toBN(1000);
				before('addRewardDistribution', async () => {
					await rewardsDistribution.addRewardDistribution(
						synthetixBridgeToOptimism.address,
						amountToDistribute,
						{
							from: owner,
						}
					);
				});

				describe('distributing the rewards', () => {
					let bridgeBalanceBefore;
					let escrowBalanceBefore;

					before('record balance before', async () => {
						bridgeBalanceBefore = await synthetix.balanceOf(synthetixBridgeToOptimism.address);
						escrowBalanceBefore = await synthetix.balanceOf(synthetixBridgeEscrow.address);
					});

					before('transfer amount to be distributed and distributeRewards', async () => {
						// first pawn the authority contract
						await rewardsDistribution.setAuthority(owner, {
							from: owner,
						});
						await synthetix.transfer(rewardsDistribution.address, amountToDistribute, {
							from: owner,
						});
						await rewardsDistribution.distributeRewards(amountToDistribute, {
							from: owner,
						});
					});

					it('the balance of the bridge remains intact', async () => {
						assert.bnEqual(
							await synthetix.balanceOf(synthetixBridgeToOptimism.address),
							bridgeBalanceBefore
						);
					});

					it("increases the escrow's balance", async () => {
						assert.bnEqual(
							await synthetix.balanceOf(synthetixBridgeEscrow.address),
							escrowBalanceBefore.add(amountToDistribute)
						);
					});
				});
			});
		});

		describe('forwardTokensToEscrow', () => {
			describe('when some MIME tokens are accidentally transferred to the bridge', () => {
				const amount = toBN('999');
				let initialAmount;
				before(async () => {
					initialAmount = await synthetix.balanceOf(synthetixBridgeEscrow.address);
					await synthetix.transfer(synthetixBridgeToOptimism.address, amount, {
						from: owner,
					});
					assert.bnEqual(await synthetix.balanceOf(synthetixBridgeToOptimism.address), amount);
				});
				describe('when anyone invokeds forwardTokensToEscrow', () => {
					before(async () => {
						await synthetixBridgeToOptimism.forwardTokensToEscrow(synthetix.address, {
							from: randomAddress,
						});
					});
					it('then the tokens are sent from the bridge to the escrow', async () => {
						assert.equal(await synthetix.balanceOf(synthetixBridgeToOptimism.address), '0');
						assert.bnEqual(
							await synthetix.balanceOf(synthetixBridgeEscrow.address),
							initialAmount.add(amount)
						);
					});
				});
			});
		});
	});
});
