const { artifacts, contract, web3 } = require('hardhat');
const { assert } = require('./common');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { mockToken } = require('./setup');
const { toWei, toBN } = web3.utils;
const { toUnit } = require('../utils')();
const helper = require('./TradingRewards.helper');
const {
	itHasConsistentState,
	itHasConsistentStateForPeriod,
	snapshotBeforeRestoreAfterWithHelper,
	itCorrectlyRecoversUnassignedTokens,
	itCorrectlyRecoversAssignedTokens,
} = require('./TradingRewards.behaviors');

const TradingRewards = artifacts.require('TradingRewards');
const FakeTradingRewards = artifacts.require('FakeTradingRewards');

/*
 * This tests the TradingRewards contract in a standalone manner,
 * i.e. not integrating with the rest of the Synthetix system.
 *
 * Dependencies with the system are bypassed via FakeTradingRewards.
 *
 * Integration with the rest of the system are tested in TradingRewards.integration.js.
 **/
contract('TradingRewards (unit tests) @ovm-skip', accounts => {
	const [
		deployerAccount,
		owner,
		periodController,
		account1,
		account2,
		account3,
		account4,
		account5,
		account6,
		account7,
	] = accounts;

	const rewardsTokenTotalSupply = '1000000';

	const zeroAddress = '0x0000000000000000000000000000000000000000';
	const mockAddress = '0x0000000000000000000000000000000000000001';

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: TradingRewards.abi,
			ignoreParents: ['Owned', 'Pausable', 'MixinResolver'],
			expected: [
				'claimRewardsForPeriod',
				'claimRewardsForPeriods',
				'closeCurrentPeriodWithRewards',
				'recordExchangeFeeForAccount',
				'setPeriodController',
				'recoverTokens',
				'recoverUnassignedRewardTokens',
				'recoverAssignedRewardTokensAndDestroyPeriod',
			],
		});
	});

	describe('when deploying a TradingRewards contract without setting up its address resolver', () => {
		before('deploy rewards contract', async () => {
			this.rewards = await TradingRewards.new(owner, mockAddress, mockAddress, {
				from: deployerAccount,
			});
		});

		it('reverts when trying to record a fee', async () => {
			await assert.revert(
				this.rewards.recordExchangeFeeForAccount('1', mockAddress),
				'Missing address: Exchanger'
			);
		});
	});

	describe('when deploying a TradingRewards contract with invalid constructor parameters', () => {
		it('reverts when owner address is invalid', async () => {
			await assert.revert(
				TradingRewards.new(zeroAddress, mockAddress, mockAddress, { from: deployerAccount }),
				'Owner address cannot be 0'
			);
		});

		it('reverts when the period controller is invalid', async () => {
			await assert.revert(
				TradingRewards.new(mockAddress, zeroAddress, mockAddress, { from: deployerAccount }),
				'Invalid period controller'
			);
		});

		// Note: MixinResolver will not revert when its resolver address is invalid.
	});

	describe('when going through various periods', () => {
		describe('when deploying a rewards token', () => {
			before('deploy rewards token', async () => {
				({ token: this.token } = await mockToken({
					accounts,
					name: 'Rewards Token',
					symbol: 'RWD',
					supply: rewardsTokenTotalSupply,
				}));

				helper.incrementExpectedBalance(owner, rewardsTokenTotalSupply);
			});

			it('has the expected parameters', async () => {
				assert.equal('18', await this.token.decimals());
				assert.equal(toWei(rewardsTokenTotalSupply), await this.token.totalSupply());
				assert.equal(toWei(rewardsTokenTotalSupply), await this.token.balanceOf(owner));
			});

			// FakeTradingRewards does not enforce onlyExchanger modifier
			describe('when a FakeTradingRewards contract is deployed', () => {
				before('deploy rewards contract', async () => {
					this.rewards = await FakeTradingRewards.new(
						owner,
						periodController,
						mockAddress,
						this.token.address,
						{
							from: deployerAccount,
						}
					);
				});

				it('has the expected parameters', async () => {
					assert.equal(this.token.address, await this.rewards.getRewardsToken());
					assert.equal(periodController, await this.rewards.getPeriodController());
					assert.equal(owner, await this.rewards.owner());
					assert.equal(mockAddress, await this.rewards.resolver());
				});

				itHasConsistentState({ ctx: this, accounts });
				itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });

				describe('when any address attempts to record fees', () => {
					snapshotBeforeRestoreAfterWithHelper();

					it('allows any address to record a fee (since this is a mock contract)', async () => {
						await this.rewards.recordExchangeFeeForAccount('1', account6, { from: account6 });
					});
				});

				describe('when fees are recorded in period 0', () => {
					before('record some fees in period 0', async () => {
						await helper.recordFee({
							rewards: this.rewards,
							account: account1,
							fee: 10,
							periodID: 0,
						});
						await helper.recordFee({
							rewards: this.rewards,
							account: account2,
							fee: 130,
							periodID: 0,
						});
						await helper.recordFee({
							rewards: this.rewards,
							account: account3,
							fee: 4501,
							periodID: 0,
						});
						await helper.recordFee({
							rewards: this.rewards,
							account: account4,
							fee: 1337,
							periodID: 0,
						});
						await helper.recordFee({
							rewards: this.rewards,
							account: account5,
							fee: 42,
							periodID: 0,
						});
						await helper.recordFee({
							rewards: this.rewards,
							account: account5, // account5 records again
							fee: 1000,
							periodID: 0,
						});
					});

					itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });

					it('reports available rewards for current period to be 0, since its not finalized', async () => {
						assert.bnEqual(
							toBN(0),
							await this.rewards.getAvailableRewardsForAccountForPeriod(account1, 0)
						);
					});

					it('reverts when any of the accounts attempt to claim rewards from period 0', async () => {
						await assert.revert(
							this.rewards.claimRewardsForPeriod(0, { from: account1 }),
							'Period is not finalized'
						);
						await assert.revert(
							this.rewards.claimRewardsForPeriod(0, { from: account3 }),
							'Period is not finalized'
						);
					});

					it('reverts when any account attempts to close the current period', async () => {
						await assert.revert(
							this.rewards.closeCurrentPeriodWithRewards('42', { from: account1 }),
							'Caller not period controller'
						);
					});

					it('reverts if the period is attempted to be closed with insufficient balance', async () => {
						await assert.revert(
							this.rewards.closeCurrentPeriodWithRewards('42', { from: periodController }),
							'Insufficient free rewards'
						);
					});

					describe('when period 0 is closed with no rewards', () => {
						snapshotBeforeRestoreAfterWithHelper();

						before('close the period', async () => {
							await helper.closePeriodWithRewards({
								amount: '0',
								rewards: this.rewards,
								periodController,
							});
						});

						itHasConsistentState({ ctx: this, periodID: 0, accounts });
						itHasConsistentState({ ctx: this, periodID: 1, accounts });

						it('reverts when an account attempts to claim', async () => {
							await assert.revert(
								this.rewards.claimRewardsForPeriod(0, { from: account1 }),
								'No rewards available'
							);
						});
					});

					it('reverts when attempting to recover free reward tokens and there arent any', async () => {
						await assert.revert(
							this.rewards.recoverUnassignedRewardTokens(owner, { from: owner }),
							'No tokens to recover'
						);
					});

					describe('when 10000 reward tokens are transferred to the contract', () => {
						const rewardsPeriod0 = '10000';

						before('transfer reward tokens to the contract', async () => {
							await helper.depositRewards({
								amount: rewardsPeriod0,
								token: this.token,
								rewards: this.rewards,
								owner,
							});

							helper.incrementExpectedBalance(owner, `-${rewardsPeriod0}`);
						});

						it('holds the transferred tokens', async () => {
							assert.equal(toWei(rewardsPeriod0), await this.token.balanceOf(this.rewards.address));
						});

						it('continues to report no available rewards', async () => {
							assert.bnEqual(await this.rewards.getAvailableRewards(), toBN(0));
						});

						it('still reverts when any account attempts to close period 0', async () => {
							await assert.revert(
								this.rewards.closeCurrentPeriodWithRewards('10', { from: account1 }),
								'Caller not period controller'
							);
						});

						it('reverts when the owner attempts to recover the free reward tokens to an invalid address', async () => {
							await assert.revert(
								this.rewards.recoverUnassignedRewardTokens(zeroAddress, { from: owner }),
								'Invalid recover address'
							);
							await assert.revert(
								this.rewards.recoverUnassignedRewardTokens(this.rewards.address, { from: owner }),
								'Invalid recover address'
							);
						});

						describe('when recovering all unassigned tokens', () => {
							snapshotBeforeRestoreAfterWithHelper();

							itCorrectlyRecoversUnassignedTokens({ ctx: this, owner, recoverAccount: account7 });
						});

						describe('when period 0 is closed with less rewards than those free in the contract', () => {
							snapshotBeforeRestoreAfterWithHelper();

							const delta = '42';

							before('close the period', async () => {
								await helper.closePeriodWithRewards({
									amount: `${rewardsPeriod0 - delta}`,
									rewards: this.rewards,
									periodController,
								});
							});

							itCorrectlyRecoversUnassignedTokens({ ctx: this, owner, recoverAccount: account7 });
						});

						describe('when period 0 is closed and period 1 is created', () => {
							before('close the period', async () => {
								await helper.closePeriodWithRewards({
									amount: rewardsPeriod0,
									rewards: this.rewards,
									periodController,
								});
							});

							itHasConsistentState({ ctx: this, accounts });

							it('reverts when any address attempts to pause the contract', async () => {
								await assert.revert(
									this.rewards.setPaused(true, { from: account2 }),
									'Only the contract owner may perform this action'
								);
							});

							describe('when the contract is paused', () => {
								snapshotBeforeRestoreAfterWithHelper();

								before('pause the contract', async () => {
									await this.rewards.setPaused(true, { from: owner });
								});

								it('reverts when an account attempts to claim', async () => {
									await assert.revert(
										this.rewards.claimRewardsForPeriod(0, { from: account1 }),
										'This action cannot be performed while the contract is paused'
									);
									await assert.revert(
										this.rewards.claimRewardsForPeriods([0, 1], { from: account1 }),
										'This action cannot be performed while the contract is paused'
									);
								});
							});

							describe('when claiming all rewards for period 0', () => {
								snapshotBeforeRestoreAfterWithHelper();

								before('claim rewards by all accounts that recorded fees in period 0', async () => {
									await helper.claimRewards({
										rewards: this.rewards,
										account: account1,
										periodID: 0,
									});
									await helper.claimRewards({
										rewards: this.rewards,
										account: account2,
										periodID: 0,
									});
									await helper.claimRewards({
										rewards: this.rewards,
										account: account3,
										periodID: 0,
									});
									await helper.claimRewards({
										rewards: this.rewards,
										account: account4,
										periodID: 0,
									});
									await helper.claimRewards({
										rewards: this.rewards,
										account: account5,
										periodID: 0,
									});
								});

								itHasConsistentState({ ctx: this, accounts });
								itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });

								it('reverts if accounts that claimed attempt to claim again', async () => {
									await assert.revert(
										this.rewards.claimRewardsForPeriod(0, { from: account1 }),
										'No rewards available'
									);
									await assert.revert(
										this.rewards.claimRewardsForPeriod(0, { from: account2 }),
										'No rewards available'
									);
								});

								it('reverts if accounts that did not record fees attempt to claim', async () => {
									await assert.revert(
										this.rewards.claimRewardsForPeriod(0, { from: account6 }),
										'No rewards available'
									);
									await assert.revert(
										this.rewards.claimRewardsForPeriod(0, { from: account7 }),
										'No rewards available'
									);
								});
							});

							it('reverts when attempting to recover assigned tokens from any account', async () => {
								await assert.revert(
									this.rewards.recoverAssignedRewardTokensAndDestroyPeriod(account7, 0, {
										from: account7,
									}),
									'Only the contract owner may perform this action'
								);
							});

							it('reverts when attempting to recover assigned tokens to an invalid address', async () => {
								await assert.revert(
									this.rewards.recoverAssignedRewardTokensAndDestroyPeriod(zeroAddress, 0, {
										from: owner,
									}),
									'Invalid recover address'
								);
								await assert.revert(
									this.rewards.recoverAssignedRewardTokensAndDestroyPeriod(
										this.rewards.address,
										0,
										{ from: owner }
									),
									'Invalid recover address'
								);
							});

							it('reverts when attempting to recover assigned tokens from the active period', async () => {
								await assert.revert(
									this.rewards.recoverAssignedRewardTokensAndDestroyPeriod(account7, 1, {
										from: owner,
									}),
									'Cannot recover from active'
								);
							});

							describe('when recovering reward tokens from a finalized period', () => {
								snapshotBeforeRestoreAfterWithHelper();

								itCorrectlyRecoversAssignedTokens({
									ctx: this,
									owner,
									recoverAccount: account7,
									periodID: 0,
								});

								it('reverts when attempting to claim rewards from the period', async () => {
									await assert.revert(
										this.rewards.claimRewardsForPeriod(1, { from: account1 }),
										'Period is not finalized'
									);
								});

								it('reverts when attempting to recover assigned tokens from a period with no rewards', async () => {
									await assert.revert(
										this.rewards.recoverAssignedRewardTokensAndDestroyPeriod(account7, 1, {
											from: owner,
										}),
										'Cannot recover from active'
									);
								});
							});

							describe('when fees are recorded in period 1', () => {
								before('record some fees in period 1', async () => {
									await helper.recordFee({
										rewards: this.rewards,
										account: account1,
										fee: 1500,
										periodID: 1,
									});
									await helper.recordFee({
										rewards: this.rewards,
										account: account2,
										fee: 7000,
										periodID: 1,
									});
									await helper.recordFee({
										rewards: this.rewards,
										account: account3,
										fee: 500,
										periodID: 1,
									});
									await helper.recordFee({
										rewards: this.rewards,
										account: account4,
										fee: 1000,
										periodID: 1,
									});
								});

								itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });
								itHasConsistentStateForPeriod({ periodID: 1, ctx: this, accounts });

								it('reports available rewards for current period to be 0, since its not finalized', async () => {
									assert.bnEqual(
										toBN(0),
										await this.rewards.getAvailableRewardsForAccountForPeriod(account1, 1)
									);
								});

								it('reverts when any of the accounts attempt to claim rewards from period 1', async () => {
									await assert.revert(
										this.rewards.claimRewardsForPeriod(1, { from: account1 }),
										'Period is not finalized'
									);
									await assert.revert(
										this.rewards.claimRewardsForPeriod(1, { from: account3 }),
										'Period is not finalized'
									);
								});

								describe('when partially claiming rewards for period 0', () => {
									before(
										'claim rewards by all accounts that recorded fees in period 0',
										async () => {
											await helper.claimRewards({
												rewards: this.rewards,
												account: account1,
												periodID: 0,
											});
											await helper.claimRewards({
												rewards: this.rewards,
												account: account2,
												periodID: 0,
											});
											await helper.claimRewards({
												rewards: this.rewards,
												account: account3,
												periodID: 0,
											});
										}
									);

									itHasConsistentState({ ctx: this, accounts });
									itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });

									it('reverts if the period is attempted to be closed with insufficient balance', async () => {
										await assert.revert(
											this.rewards.closeCurrentPeriodWithRewards('100', { from: periodController }),
											'Insufficient free rewards'
										);
									});

									describe('when 50000 reward tokens are transferred to the contract', () => {
										const rewardsPeriod1 = '50000';

										before('transfer reward tokens to the contract', async () => {
											await helper.depositRewards({
												amount: rewardsPeriod1,
												token: this.token,
												rewards: this.rewards,
												owner,
											});

											helper.incrementExpectedBalance(owner, `-${rewardsPeriod1}`);
										});

										describe('when period 1 is closed and period 2 is created', () => {
											before('close the period', async () => {
												await helper.closePeriodWithRewards({
													amount: rewardsPeriod1,
													rewards: this.rewards,
													periodController,
												});
											});

											itHasConsistentState({ ctx: this, accounts });

											it('properly reports accumulated available rewards', async () => {
												assert.bnEqual(
													await this.rewards.getAvailableRewardsForAccountForPeriods(account4, [
														0,
														1,
													]),
													helper.calculateMultipleRewards({
														account: account4,
														periodIDs: [0, 1],
													})
												);
											});

											it('reverts when an account attempts to claim from multiple periods and it does not have a claim to one of them', async () => {
												// Already claimed period 0
												await assert.revert(
													this.rewards.claimRewardsForPeriods([0, 1], { from: account3 }),
													'No rewards available'
												);
												// Nothing to claim in any period
												await assert.revert(
													this.rewards.claimRewardsForPeriods([0, 1], { from: account7 }),
													'No rewards available'
												);
												// Nothing to claim in period 1
												await assert.revert(
													this.rewards.claimRewardsForPeriods([0, 1], { from: account5 }),
													'No rewards available'
												);
											});

											describe('when accounts claim from multiple periods', () => {
												before(async () => {
													await helper.claimMultipleRewards({
														rewards: this.rewards,
														account: account4,
														periodIDs: [0, 1],
													});
												});

												itHasConsistentState({ ctx: this, accounts });
												itHasConsistentStateForPeriod({ periodID: 0, ctx: this, accounts });
												itHasConsistentStateForPeriod({ periodID: 1, ctx: this, accounts });
												itHasConsistentStateForPeriod({ periodID: 2, ctx: this, accounts });

												it('reverts when an account attempts to claim from multiple periods again', async () => {
													await assert.revert(
														this.rewards.claimRewardsForPeriods([0, 1], { from: account4 }),
														'No rewards available'
													);
												});
											});
										});
									});
								});
							});
						});
					});
				});

				it('reverts when trying to send ether to the contract', async () => {
					await assert.revert(
						web3.eth.sendTransaction({
							value: toUnit('42'),
							from: owner,
							to: this.rewards.address,
						})
					);
				});

				it('reverts when any address attempts to change the periodController', async () => {
					await assert.revert(
						this.rewards.setPeriodController(account7, { from: account7 }),
						'Only the contract owner may perform this action'
					);
				});

				it('reverts when the period controller is set to an invalid address', async () => {
					await assert.revert(
						this.rewards.setPeriodController(zeroAddress, { from: owner }),
						'Invalid period controller'
					);
				});

				describe('when changing the period controller', () => {
					snapshotBeforeRestoreAfterWithHelper();

					let changeTx;

					before(async () => {
						changeTx = await this.rewards.setPeriodController(mockAddress, { from: owner });
					});

					it('changed the period controller', async () => {
						assert.equal(await this.rewards.getPeriodController(), mockAddress);
					});

					it('emitted a PeriodControllerChanged event', async () => {
						assert.eventEqual(changeTx, 'PeriodControllerChanged', {
							newPeriodController: mockAddress,
						});
					});
				});

				describe('when sending non-reward tokens to the contract', () => {
					let someToken;

					const supply = '1000';

					before('deploy a mock token and send to the contract', async () => {
						({ token: someToken } = await mockToken({
							accounts,
							name: 'Some Token',
							symbol: 'SMT',
							supply,
						}));
					});

					it('supplied the token to the owner', async () => {
						assert.bnEqual(await someToken.balanceOf(owner), toUnit(supply));
					});

					it('reverts when trying to recover tokens that the contract does not have', async () => {
						await assert.revert(
							this.rewards.recoverTokens(someToken.address, account1, { from: owner }),
							'No tokens to recover'
						);
					});

					describe('when the tokens are transferred to the contract', () => {
						before(async () => {
							await someToken.transfer(this.rewards.address, toUnit(supply), { from: owner });
						});

						it('holds the balance', async () => {
							assert.bnEqual(await someToken.balanceOf(this.rewards.address), toUnit(supply));
						});

						it('reverts when any address attempts to withdraw the tokens', async () => {
							await assert.revert(
								this.rewards.recoverTokens(someToken.address, account1),
								'Only the contract owner may perform this action'
							);
						});

						it('reverts when the target token is the rewards token', async () => {
							await assert.revert(
								this.rewards.recoverTokens(this.token.address, account1, { from: owner }),
								'Must use another function'
							);
						});

						it('reverts when the recover address is invalid', async () => {
							await assert.revert(
								this.rewards.recoverTokens(someToken.address, zeroAddress, { from: owner }),
								'Invalid recover address'
							);
							await assert.revert(
								this.rewards.recoverTokens(someToken.address, this.rewards.address, {
									from: owner,
								}),
								'Invalid recover address'
							);
						});

						describe('when the owner recovers the tokens', () => {
							let recoverTx;

							before(async () => {
								recoverTx = await this.rewards.recoverTokens(someToken.address, account7, {
									from: owner,
								});
							});

							it('credited the tokens to the recovery account', async () => {
								assert.bnEqual(await someToken.balanceOf(account7), toUnit(supply));
							});

							it('left the contract with no tokens', async () => {
								assert.bnEqual(await someToken.balanceOf(this.rewards.address), toBN(0));
							});

							it('emits a TokensRecovered event', async () => {
								assert.eventEqual(recoverTx, 'TokensRecovered', {
									tokenAddress: someToken.address,
									recoverAddress: account7,
									amount: toUnit(supply),
								});
							});
						});
					});
				});
			});
		});
	});
});
