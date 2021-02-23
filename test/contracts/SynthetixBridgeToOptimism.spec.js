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

contract('SynthetixBridgeToOptimism (spec tests)', accounts => {
	const [, owner, newBridge] = accounts;

	let synthetix, synthetixBridgeToOptimism, systemSettings;

	describe('when deploying the system', () => {
		before('deploy all contracts', async () => {
			({
				Synthetix: synthetix,
				SynthetixBridgeToOptimism: synthetixBridgeToOptimism,
				SystemSettings: systemSettings,
			} = await setupAllContracts({
				accounts,
				contracts: ['Synthetix', 'Issuer', 'SynthetixBridgeToOptimism'],
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

		describe('initiateEscrowMigration', () => {
			it('reverts when an entriesId subarray contains an empty array', async () => {
				const entryIdsEmpty = [[1, 2, 3], []];
				await assert.revert(
					synthetixBridgeToOptimism.initiateEscrowMigration(entryIdsEmpty),
					'Entry IDs required'
				);
			});
		});

		describe('initiateEscrowMigration', () => {
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
