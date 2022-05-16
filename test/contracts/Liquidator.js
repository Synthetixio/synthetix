'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts, setupContract } = require('./setup');

const { currentTime, multiplyDecimal, divideDecimal, toUnit, fastForward } = require('../utils')();

const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	setStatus,
	updateAggregatorRates,
} = require('./helpers');

const {
	toBytes32,
	ZERO_ADDRESS,
	defaults: {
		ISSUANCE_RATIO,
		LIQUIDATION_DELAY,
		LIQUIDATION_RATIO,
		LIQUIDATION_ESCROW_DURATION,
		LIQUIDATION_PENALTY,
		SELF_LIQUIDATION_PENALTY,
		FLAG_REWARD,
		LIQUIDATE_REWARD,
	},
} = require('../..');

const MockExchanger = artifacts.require('MockExchanger');
const FlexibleStorage = artifacts.require('FlexibleStorage');

contract('Liquidator', accounts => {
	const [sUSD, SNX] = ['sUSD', 'SNX'].map(toBytes32);
	const [deployerAccount, owner, , account1, alice, bob, carol, david] = accounts;
	const week = 3600 * 24 * 7;

	let addressResolver,
		exchangeRates,
		liquidator,
		liquidatorRewards,
		synthetix,
		synthetixDebtShare,
		systemSettings,
		systemStatus,
		debtCache,
		issuer;

	// run this once before all tests to prepare our environment, snapshots on beforeEach will take
	// care of resetting to this state
	before(async () => {
		({
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			Liquidator: liquidator,
			LiquidatorRewards: liquidatorRewards,
			Synthetix: synthetix,
			SynthetixDebtShare: synthetixDebtShare,
			SystemSettings: systemSettings,
			SystemStatus: systemStatus,
			DebtCache: debtCache,
			Issuer: issuer,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'AddressResolver',
				'ExchangeRates',
				'Exchanger', // required for Synthetix to check if exchanger().hasWaitingPeriodOrSettlementOwing
				'FeePool',
				'DebtCache',
				'Issuer',
				'Liquidator',
				'LiquidatorRewards',
				'SystemStatus', // test system status controls
				'SystemSettings',
				'Synthetix',
				'SynthetixDebtShare',
				'CollateralManager',
				'RewardEscrowV2', // required for Issuer._collateral() to load balances
			],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	const fastForwardAndUpdateRates = async seconds => {
		await fastForward(seconds);
		await updateRatesWithDefaults();
	};

	const updateRatesWithDefaults = async () => {
		await updateSNXPrice('6');
	};

	const updateSNXPrice = async rate => {
		await updateAggregatorRates(exchangeRates, [SNX], [rate].map(toUnit));
		await debtCache.takeDebtSnapshot();
	};

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: liquidator.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'flagAccountForLiquidation',
				'removeAccountInLiquidation',
				'checkAndRemoveAccountInLiquidation',
			],
		});
	});

	it('should set constructor params on deployment', async () => {
		const instance = await setupContract({
			contract: 'Liquidator',
			accounts,
			skipPostDeploy: true,
			args: [account1, addressResolver.address],
		});

		assert.equal(await instance.owner(), account1);
		assert.equal(await instance.resolver(), addressResolver.address);
	});

	describe('Default settings', () => {
		it('liquidation (issuance) ratio', async () => {
			const liquidationRatio = await liquidator.liquidationRatio();
			assert.bnEqual(liquidationRatio, LIQUIDATION_RATIO);
		});
		it('liquidation collateral ratio is inverted ratio', async () => {
			const liquidationCollateralRatio = await liquidator.liquidationCollateralRatio();
			assert.bnClose(liquidationCollateralRatio, divideDecimal(toUnit('1'), LIQUIDATION_RATIO));
		});
		it('liquidation escrow duration', async () => {
			const liquidationEscrowDuration = await liquidator.liquidationEscrowDuration();
			assert.bnEqual(liquidationEscrowDuration, LIQUIDATION_ESCROW_DURATION);
		});
		it('liquidation penalty ', async () => {
			const liquidationPenalty = await liquidator.liquidationPenalty();
			assert.bnEqual(liquidationPenalty, LIQUIDATION_PENALTY);
		});
		it('self liquidation penalty ', async () => {
			const selfLiquidationPenalty = await liquidator.selfLiquidationPenalty();
			assert.bnEqual(selfLiquidationPenalty, SELF_LIQUIDATION_PENALTY);
		});
		it('liquidation delay', async () => {
			const liquidationDelay = await liquidator.liquidationDelay();
			assert.bnEqual(liquidationDelay, LIQUIDATION_DELAY);
		});
		it('issuance ratio is correctly configured as a default', async () => {
			assert.bnEqual(await liquidator.issuanceRatio(), ISSUANCE_RATIO);
		});
		it('flag reward ', async () => {
			const flagReward = await liquidator.flagReward();
			assert.bnEqual(flagReward, FLAG_REWARD);
		});
		it('liquidate reward ', async () => {
			const liquidateReward = await liquidator.liquidateReward();
			assert.bnEqual(liquidateReward, LIQUIDATE_REWARD);
		});
	});

	describe('with issuanceRatio of 0.125', () => {
		beforeEach(async () => {
			// Set issuanceRatio to 800%
			const issuanceRatio800 = toUnit('0.125');
			await systemSettings.setIssuanceRatio(issuanceRatio800, { from: owner });

			await updateRatesWithDefaults();
		});
		describe('system staleness checks', () => {
			describe('when SNX is stale', () => {
				beforeEach(async () => {
					const rateStalePeriod = await exchangeRates.rateStalePeriod();

					// fast forward until rates are stale
					await fastForward(rateStalePeriod + 1);
				});
				it('when flagAccountForLiquidation() is invoked, it reverts for rate stale', async () => {
					await assert.revert(
						liquidator.flagAccountForLiquidation(alice, { from: owner }),
						'Rate invalid or not a synth'
					);
				});
				it('when checkAndRemoveAccountInLiquidation() is invoked, it reverts for rate stale', async () => {
					await assert.revert(
						liquidator.checkAndRemoveAccountInLiquidation(alice, { from: owner }),
						'Rate invalid or not a synth'
					);
				});
			});
			describe('when the system is suspended', () => {
				beforeEach(async () => {
					await setStatus({ owner, systemStatus, section: 'System', suspend: true });
				});
				it('when liquidateDelinquentAccount() is invoked, it reverts with operation prohibited', async () => {
					await assert.revert(
						synthetix.liquidateDelinquentAccount(alice, { from: owner }),
						'Operation prohibited'
					);
				});
				it('when liquidateSelf() is invoked, it reverts with operation prohibited', async () => {
					await assert.revert(synthetix.liquidateSelf({ from: owner }), 'Operation prohibited');
				});
				it('when checkAndRemoveAccountInLiquidation() is invoked, it reverts with operation prohibited', async () => {
					await assert.revert(
						liquidator.checkAndRemoveAccountInLiquidation(alice, { from: owner }),
						'Operation prohibited'
					);
				});
			});
			describe('when the liquidation default params not set', () => {
				let storage;
				beforeEach(async () => {
					storage = await FlexibleStorage.new(addressResolver.address, {
						from: deployerAccount,
					});

					// replace FlexibleStorage in resolver
					await addressResolver.importAddresses(
						['FlexibleStorage'].map(toBytes32),
						[storage.address],
						{
							from: owner,
						}
					);

					await liquidator.rebuildCache();
					await systemSettings.rebuildCache();
				});
				it('when flagAccountForLiquidation() is invoked, it reverts with liquidation ratio not set', async () => {
					await assert.revert(
						liquidator.flagAccountForLiquidation(alice, { from: owner }),
						'Liquidation ratio not set'
					);
				});
				describe('when the liquidationRatio is set', () => {
					beforeEach(async () => {
						// await systemSettings.setIssuanceRatio(ISSUANCE_RATIO, { from: owner });
						await systemSettings.setLiquidationRatio(LIQUIDATION_RATIO, { from: owner });
					});
					it('when flagAccountForLiquidation() is invoked, it reverts with liquidation delay not set', async () => {
						await assert.revert(
							liquidator.flagAccountForLiquidation(alice, { from: owner }),
							'Liquidation delay not set'
						);
					});
				});
			});
		});
		describe('protected methods', () => {
			describe('only internal contracts can call', () => {
				beforeEach(async () => {
					// Overwrite Issuer address to the owner to allow us to invoke removeAccInLiquidation
					await addressResolver.importAddresses(['Issuer'].map(toBytes32), [owner], {
						from: owner,
					});

					// now have Liquidator resync its cache
					await liquidator.rebuildCache();
				});
				it('removeAccountInLiquidation() can only be invoked by issuer', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: liquidator.removeAccountInLiquidation,
						args: [alice],
						address: owner, // TODO: is this supposed to be issuer.address
						accounts,
						reason: 'Liquidator: Only the Issuer contract can perform this action',
					});
				});
			});
		});
		describe('calculateAmountToFixCollateral', () => {
			let ratio;
			let penalty;
			let collateralBefore;
			let debtBefore;
			describe('given target ratio of 800%, collateral of $600, debt of $300', () => {
				beforeEach(async () => {
					ratio = toUnit('0.125');

					await systemSettings.setIssuanceRatio(ratio, { from: owner });

					collateralBefore = toUnit('600');
					debtBefore = toUnit('300');
				});
				describe('given liquidation penalty is 10%', () => {
					beforeEach(async () => {
						penalty = toUnit('0.1');
						await systemSettings.setLiquidationPenalty(penalty, { from: owner });
					});
					it('calculates sUSD to fix ratio from 200%, with $600 SNX collateral and $300 debt', async () => {
						const expectedAmount = toUnit('260.869565217391304347');

						// amount of debt to redeem to fix
						const susdToLiquidate = await liquidator.calculateAmountToFixCollateral(
							debtBefore,
							collateralBefore,
							penalty
						);

						assert.bnEqual(susdToLiquidate, expectedAmount);

						// check expected amount fixes c-ratio to 800%
						const debtAfter = debtBefore.sub(susdToLiquidate);
						const collateralAfterMinusPenalty = collateralBefore.sub(
							multiplyDecimal(susdToLiquidate, toUnit('1').add(penalty))
						);

						// c-ratio = debt / collateral
						const collateralRatio = divideDecimal(debtAfter, collateralAfterMinusPenalty);

						assert.bnEqual(collateralRatio, ratio);
					});
					it('calculates sUSD to fix ratio from 300%, with $600 SNX collateral and $200 debt', async () => {
						debtBefore = toUnit('200');
						const expectedAmount = toUnit('144.927536231884057971');

						// amount of debt to redeem to fix
						const susdToLiquidate = await liquidator.calculateAmountToFixCollateral(
							debtBefore,
							collateralBefore,
							penalty
						);

						assert.bnEqual(susdToLiquidate, expectedAmount);

						// check expected amount fixes c-ratio to 800%
						const debtAfter = debtBefore.sub(susdToLiquidate);
						const collateralAfterMinusPenalty = collateralBefore.sub(
							multiplyDecimal(susdToLiquidate, toUnit('1').add(penalty))
						);

						// c-ratio = debt / collateral
						const collateralRatio = divideDecimal(debtAfter, collateralAfterMinusPenalty);

						assert.bnEqual(collateralRatio, ratio);
					});
				});
			});
		});
		describe('when Alice calls liquidateSelf', () => {
			let exchanger;
			describe('then do self liquidation checks', () => {
				beforeEach(async () => {
					exchanger = await MockExchanger.new(synthetix.address);
					await addressResolver.importAddresses(['Exchanger'].map(toBytes32), [exchanger.address], {
						from: owner,
					});
					await Promise.all([synthetix.rebuildCache(), issuer.rebuildCache()]);
				});
				it('when Alice is not is not open for self liquidation then revert', async () => {
					await assert.revert(synthetix.liquidateSelf({ from: alice }), 'Not open for liquidation');
				});
			});
			describe('when Alice is undercollateralized', () => {
				beforeEach(async () => {
					// wen SNX 6 dolla
					await updateSNXPrice('6');

					// Alice issues sUSD $600
					await synthetix.transfer(alice, toUnit('800'), { from: owner });
					await synthetix.issueMaxSynths({ from: alice });

					// Bob issues sUSD $6000
					await synthetix.transfer(bob, toUnit('8000'), { from: owner });
					await synthetix.issueMaxSynths({ from: bob });

					// Drop SNX value to $1 (Collateral worth $800 after)
					await updateSNXPrice('1');
				});
				it('and liquidation Collateral Ratio is 150%', async () => {
					assert.bnClose(await liquidator.liquidationCollateralRatio(), toUnit('1.5'));
				});
				it('and self liquidation penalty is 20%', async () => {
					assert.bnEqual(await liquidator.selfLiquidationPenalty(), SELF_LIQUIDATION_PENALTY);
				});
				describe('when Alice issuance ratio is fixed as SNX price increases', () => {
					beforeEach(async () => {
						await updateSNXPrice('6');

						const liquidationRatio = await liquidator.liquidationRatio();

						const ratio = await synthetix.collateralisationRatio(alice);
						const targetIssuanceRatio = await liquidator.issuanceRatio();

						// check Alice ratio is above liquidation ratio
						assert.isTrue(ratio.lt(liquidationRatio));

						// check Alice ratio is above or equal to target issuance ratio
						assert.isTrue(ratio.lte(targetIssuanceRatio));
					});
					it('then isLiquidationOpen returns false as ratio equal to target issuance ratio', async () => {
						assert.isFalse(await liquidator.isLiquidationOpen(alice, true));
					});
				});
				describe('given Alice issuance ratio is higher than the liquidation ratio', () => {
					let liquidationRatio;
					beforeEach(async () => {
						liquidationRatio = await liquidator.liquidationRatio();

						const ratio = await synthetix.collateralisationRatio(alice);
						const targetIssuanceRatio = await liquidator.issuanceRatio();

						// check Alice ratio is above or equal liquidation ratio
						assert.isTrue(ratio.gte(liquidationRatio));

						// check Alice ratio is above target issuance ratio
						assert.isTrue(ratio.gt(targetIssuanceRatio));
					});
					it('then isLiquidationOpen returns true', async () => {
						assert.isTrue(await liquidator.isLiquidationOpen(alice, true));
					});
				});
				describe('when Alice c-ratio is above the liquidation ratio and attempts to self liquidate', () => {
					beforeEach(async () => {
						await updateSNXPrice('10');

						await assert.revert(
							synthetix.liquidateSelf({
								from: alice,
							}),
							'Not open for liquidation'
						);
					});
					it('then Alices account is not open for self liquidation', async () => {
						const isSelfLiquidationOpen = await liquidator.isLiquidationOpen(alice, true);
						assert.bnEqual(isSelfLiquidationOpen, false);
					});
					it('then Alice still has 800 SNX', async () => {
						assert.bnEqual(await synthetix.collateral(alice), toUnit('800'));
					});
				});
				describe('given Alice has $600 Debt, $800 worth of SNX Collateral and c-ratio at 133.33%', () => {
					describe('when Alice calls self liquidate', () => {
						let txn;
						let ratio;
						let penalty;
						let aliceDebtValueBefore;
						let aliceDebtShareBefore;
						let aliceCollateralBefore;
						let bobDebtValueBefore, bobRewardsBalanceBefore;
						let amountToFixRatio;
						beforeEach(async () => {
							// Given issuance ratio is 800%
							ratio = toUnit('0.125');

							// And self liquidation penalty is 20%
							penalty = toUnit('0.2');
							await systemSettings.setSelfLiquidationPenalty(penalty, { from: owner });

							// Record Alices state
							aliceCollateralBefore = await synthetix.collateral(alice);
							aliceDebtShareBefore = await synthetixDebtShare.balanceOf(alice);
							aliceDebtValueBefore = await synthetix.debtBalanceOf(alice, sUSD);

							// Record Bobs state
							bobDebtValueBefore = await synthetix.debtBalanceOf(bob, sUSD);
							bobRewardsBalanceBefore = await liquidatorRewards.earned(bob);

							txn = await synthetix.liquidateSelf({
								from: alice,
							});
						});
						it('it succeeds and the ratio is fixed', async () => {
							const cratio = await synthetix.collateralisationRatio(alice);

							// check Alice ratio is above or equal to target issuance ratio
							assert.bnClose(ratio, cratio, toUnit('100000000000000000'));

							// check Alice has their debt share and collateral reduced
							assert.isTrue((await synthetixDebtShare.balanceOf(alice)).lt(aliceDebtShareBefore));
							assert.isTrue((await synthetix.collateral(alice)).lt(aliceCollateralBefore));

							const expectedAmount = toUnit('588.235294117647058823');

							// amount of debt to redeem to fix
							amountToFixRatio = await liquidator.calculateAmountToFixCollateral(
								aliceDebtValueBefore,
								aliceCollateralBefore,
								penalty
							);

							assert.bnEqual(amountToFixRatio, expectedAmount);

							// check expected amount fixes c-ratio to 800%
							const debtAfter = aliceDebtValueBefore.sub(amountToFixRatio);
							const collateralAfterMinusPenalty = aliceCollateralBefore.sub(
								multiplyDecimal(amountToFixRatio, toUnit('1').add(penalty))
							);

							// c-ratio = debt / collateral
							const collateralRatio = divideDecimal(debtAfter, collateralAfterMinusPenalty);

							assert.bnEqual(collateralRatio, ratio);

							// Alice should not be open for liquidation anymore
							assert.isFalse(await liquidator.isLiquidationOpen(alice, false));

							// Check that the redeemed SNX is sent to the LiquidatorRewards contract
							const logs = artifacts.require('Synthetix').decodeLogs(txn.receipt.rawLogs);
							assert.eventEqual(
								logs.find(log => log.event === 'AccountLiquidated'),
								'AccountLiquidated',
								{
									account: alice,
									snxRedeemed: await synthetix.balanceOf(liquidatorRewards.address),
								}
							);

							// Make sure the other staker, Bob, gets the redeemed SNX bonus.
							const bobDebtValueAfter = await synthetix.debtBalanceOf(bob, sUSD);
							const bobRewardsBalanceAfter = await liquidatorRewards.earned(bob);

							assert.bnGt(bobDebtValueAfter, bobDebtValueBefore);
							assert.bnGt(bobRewardsBalanceAfter, bobRewardsBalanceBefore);

							const debtValueDiff = bobDebtValueAfter.sub(bobDebtValueBefore);
							const rewardsDiff = bobRewardsBalanceAfter.sub(bobRewardsBalanceBefore);
							assert.bnGt(rewardsDiff, debtValueDiff);
						});
					});
				});
			});
		});

		describe('when anyone calls liquidateDelinquentAccount on alice', () => {
			let exchanger;
			describe('then do liquidation checks', () => {
				beforeEach(async () => {
					exchanger = await MockExchanger.new(synthetix.address);
					await addressResolver.importAddresses(['Exchanger'].map(toBytes32), [exchanger.address], {
						from: owner,
					});
					await Promise.all([synthetix.rebuildCache(), issuer.rebuildCache()]);
				});
				it('when an account is not open for liquidation then revert', async () => {
					await assert.revert(
						synthetix.liquidateDelinquentAccount(alice, { from: bob }),
						'Not open for liquidation'
					);
				});
			});
			describe('when Alice is undercollateralized', () => {
				beforeEach(async () => {
					// wen SNX 6 dolla
					await updateSNXPrice('6');

					// Alice issues sUSD $600
					await synthetix.transfer(alice, toUnit('800'), { from: owner });
					await synthetix.issueMaxSynths({ from: alice });

					// Bob issues sUSD $6000
					await synthetix.transfer(bob, toUnit('8000'), { from: owner });
					await synthetix.issueMaxSynths({ from: bob });

					// Drop SNX value to $1 (Collateral worth $800 after)
					await updateSNXPrice('1');
				});
				it('and liquidation Collateral Ratio is 150%', async () => {
					assert.bnClose(await liquidator.liquidationCollateralRatio(), toUnit('1.5'));
				});
				it('and liquidation penalty is 10%', async () => {
					assert.bnEqual(await liquidator.liquidationPenalty(), LIQUIDATION_PENALTY);
				});
				it('and liquidation delay is 3 days', async () => {
					assert.bnEqual(await liquidator.liquidationDelay(), LIQUIDATION_DELAY);
				});
				describe('when Alice has not been flagged for liquidation', () => {
					it('and Alice calls checkAndRemoveAccountInLiquidation then it reverts', async () => {
						await assert.revert(
							liquidator.checkAndRemoveAccountInLiquidation(alice, {
								from: alice,
							}),
							'Account has no liquidation set'
						);
					});
					it('then isLiquidationDeadlinePassed returns false as no liquidation set', async () => {
						assert.isFalse(await liquidator.isLiquidationDeadlinePassed(alice));
					});
				});
				describe('when Bob flags Alice for liquidation', () => {
					let flagForLiquidationTransaction;
					let timeOfTransaction;
					beforeEach(async () => {
						timeOfTransaction = await currentTime();
						flagForLiquidationTransaction = await liquidator.flagAccountForLiquidation(alice, {
							from: bob,
						});
					});
					it('then sets a deadline liquidation delay of 2 weeks', async () => {
						const liquidationDeadline = await liquidator.getLiquidationDeadlineForAccount(alice);
						assert.isTrue(liquidationDeadline.gt(0));
						assert.isTrue(liquidationDeadline.gt(timeOfTransaction));
						assert.isTrue(liquidationDeadline.gt(timeOfTransaction + week * 2));
					});
					it('then emits an event accountFlaggedForLiquidation', async () => {
						const liquidationDeadline = await liquidator.getLiquidationDeadlineForAccount(alice);
						assert.eventEqual(flagForLiquidationTransaction, 'AccountFlaggedForLiquidation', {
							account: alice,
							deadline: liquidationDeadline,
						});
					});
					describe('when deadline has passed and Alice issuance ratio is fixed as SNX price increases', () => {
						beforeEach(async () => {
							const delay = await liquidator.liquidationDelay();

							// fast forward to after deadline
							await fastForward(delay + 100);

							await updateSNXPrice(toUnit('6'));

							const liquidationRatio = await liquidator.liquidationRatio();

							const ratio = await synthetix.collateralisationRatio(alice);
							const targetIssuanceRatio = await liquidator.issuanceRatio();

							// check Alice ratio is below liquidation ratio
							assert.isTrue(ratio.lt(liquidationRatio));

							// check Alice ratio is below or equal to target issuance ratio
							assert.isTrue(ratio.lte(targetIssuanceRatio));
						});
						it('then isLiquidationDeadlinePassed returns true', async () => {
							assert.isTrue(await liquidator.isLiquidationDeadlinePassed(alice));
						});
						it('then isLiquidationOpen returns false as ratio equal to target issuance ratio', async () => {
							assert.isFalse(await liquidator.isLiquidationOpen(alice, false));
						});
					});
					describe('given Alice issuance ratio is higher than the liquidation ratio', () => {
						let liquidationRatio;
						beforeEach(async () => {
							liquidationRatio = await liquidator.liquidationRatio();

							const ratio = await synthetix.collateralisationRatio(alice);
							const targetIssuanceRatio = await liquidator.issuanceRatio();

							// check Alice ratio is above or equal liquidation ratio
							assert.isTrue(ratio.gte(liquidationRatio));

							// check Alice ratio is above target issuance ratio
							assert.isTrue(ratio.gt(targetIssuanceRatio));
						});
						describe('when the liquidation deadline has not passed', () => {
							it('then isLiquidationOpen returns false as deadline not passed', async () => {
								assert.isFalse(await liquidator.isLiquidationOpen(alice, false));
							});
							it('then isLiquidationDeadlinePassed returns false', async () => {
								assert.isFalse(await liquidator.isLiquidationDeadlinePassed(alice));
							});
						});
						describe('fast forward 2 weeks, when the liquidation deadline has passed', () => {
							beforeEach(async () => {
								const delay = await liquidator.liquidationDelay();

								await fastForward(delay + 100);
							});
							it('then isLiquidationDeadlinePassed returns true', async () => {
								assert.isTrue(await liquidator.isLiquidationDeadlinePassed(alice));
							});
							it('then isLiquidationOpen returns true', async () => {
								assert.isTrue(await liquidator.isLiquidationOpen(alice, false));
							});
						});
					});
					describe('when Bob or anyone else tries to flag Alice address for liquidation again', () => {
						it('then it fails for Bob as Alices address is already flagged', async () => {
							await assert.revert(
								liquidator.flagAccountForLiquidation(alice, {
									from: bob,
								}),
								'Account already flagged for liquidation'
							);
						});
						it('then it fails for Carol Baskin as Alices address is already flagged', async () => {
							await assert.revert(
								liquidator.flagAccountForLiquidation(alice, {
									from: carol,
								}),
								'Account already flagged for liquidation'
							);
						});
					});
					describe('when the price of SNX increases', () => {
						let removeFlagTransaction;
						beforeEach(async () => {
							await updateSNXPrice('6');
						});
						describe('when Alice calls checkAndRemoveAccountInLiquidation', () => {
							beforeEach(async () => {
								removeFlagTransaction = await liquidator.checkAndRemoveAccountInLiquidation(alice, {
									from: alice,
								});
							});
							it('then Alice liquidation entry is removed', async () => {
								const deadline = await liquidator.getLiquidationDeadlineForAccount(alice);
								assert.bnEqual(deadline, 0);
							});
							it('then Alices account is not open for liquidation', async () => {
								const isForcedLiquidationOpen = await liquidator.isLiquidationOpen(alice, false);
								assert.bnEqual(isForcedLiquidationOpen, false);
							});
							it('then events AccountRemovedFromLiquidation are emitted', async () => {
								assert.eventEqual(removeFlagTransaction, 'AccountRemovedFromLiquidation', {
									account: alice,
								});
							});
						});
					});
					describe('given the liquidation deadline has passed ', () => {
						beforeEach(async () => {
							await fastForwardAndUpdateRates(week * 2.1);
						});
						describe('when Alice c-ratio is above the liquidation Ratio and Bob liquidates alice', () => {
							beforeEach(async () => {
								await updateSNXPrice('10');

								// Bob Liquidates Alice
								await assert.revert(
									synthetix.liquidateDelinquentAccount(alice, {
										from: bob,
									}),
									'Not open for liquidation'
								);
							});
							it('then Alice liquidation entry remains', async () => {
								const deadline = await liquidator.getLiquidationDeadlineForAccount(alice);
								assert.isTrue(deadline > 0);
							});
							it('then Alices account is not open for liquidation', async () => {
								const isForcedLiquidationOpen = await liquidator.isLiquidationOpen(alice, false);
								assert.bnEqual(isForcedLiquidationOpen, false);
							});
							it('then Alice still has 600 SDS', async () => {
								assert.bnEqual(await synthetixDebtShare.balanceOf(alice), toUnit('600'));
							});
							it('then Alice still has 800 SNX', async () => {
								assert.bnEqual(await synthetix.collateral(alice), toUnit('800'));
							});
						});

						describe('when Alice burnSynthsToTarget to fix her c-ratio ', () => {
							let burnTransaction;
							beforeEach(async () => {
								await updateSNXPrice('1');
								burnTransaction = await synthetix.burnSynthsToTarget({ from: alice });
							});
							it('then AccountRemovedFromLiquidation event is emitted', async () => {
								const logs = artifacts
									.require('Liquidator')
									.decodeLogs(burnTransaction.receipt.rawLogs);
								assert.eventEqual(
									logs.find(log => log.event === 'AccountRemovedFromLiquidation'),
									'AccountRemovedFromLiquidation',
									{
										account: alice,
									}
								);
							});
							it('then Alice liquidation entry is removed', async () => {
								const deadline = await liquidator.getLiquidationDeadlineForAccount(alice);
								assert.bnEqual(deadline, 0);
							});
							it('then Alices account is not open for liquidation', async () => {
								const isForcedLiquidationOpen = await liquidator.isLiquidationOpen(alice, false);
								assert.bnEqual(isForcedLiquidationOpen, false);
							});
						});
						describe('when Alice burnSynths and her c-ratio is still below issuance ratio', () => {
							let aliceDebtBalance;
							let amountToBurn;
							beforeEach(async () => {
								await updateSNXPrice('1');
								aliceDebtBalance = await synthetixDebtShare.balanceOf(alice);
								amountToBurn = toUnit('10');
								await synthetix.burnSynths(amountToBurn, { from: alice });
							});
							it('then alice debt balance is less amountToBurn', async () => {
								assert.bnEqual(
									await synthetixDebtShare.balanceOf(alice),
									aliceDebtBalance.sub(amountToBurn)
								);
							});
							it('then Alice liquidation entry is still there', async () => {
								const deadline = await liquidator.getLiquidationDeadlineForAccount(alice);
								assert.isTrue(deadline > 0);
							});
							it('then Alices account is still open for liquidation', async () => {
								const isForcedLiquidationOpen = await liquidator.isLiquidationOpen(alice, false);
								assert.isTrue(isForcedLiquidationOpen);
							});
						});
						describe('when Alice burnSynths and her c-ratio is above issuance ratio', () => {
							let aliceDebtBalance;
							let amountToBurn;
							beforeEach(async () => {
								await updateSNXPrice('1');
								aliceDebtBalance = await synthetixDebtShare.balanceOf(alice);

								const maxIssuableSynths = await synthetix.maxIssuableSynths(alice);
								amountToBurn = aliceDebtBalance.sub(maxIssuableSynths).abs();

								await synthetix.burnSynths(amountToBurn, { from: alice });
							});
							it('then alice debt balance is less amountToBurn', async () => {
								assert.bnEqual(
									await synthetixDebtShare.balanceOf(alice),
									aliceDebtBalance.sub(amountToBurn)
								);
							});
							it('then Alice liquidation entry is removed', async () => {
								const deadline = await liquidator.getLiquidationDeadlineForAccount(alice);
								assert.bnEqual(deadline, 0);
							});
							it('then Alices account is not open for liquidation', async () => {
								const isForcedLiquidationOpen = await liquidator.isLiquidationOpen(alice, false);
								assert.bnEqual(isForcedLiquidationOpen, false);
							});
						});
						describe('when Alice burns all her debt to fix her c-ratio', () => {
							let aliceDebtBalance;
							let burnTransaction;
							beforeEach(async () => {
								await updateSNXPrice('1');

								aliceDebtBalance = await synthetixDebtShare.balanceOf(alice);

								burnTransaction = await synthetix.burnSynths(aliceDebtBalance, { from: alice });
							});
							it('then alice has no more debt', async () => {
								assert.bnEqual(toUnit(0), await synthetixDebtShare.balanceOf(alice));
							});
							it('then AccountRemovedFromLiquidation event is emitted', async () => {
								const logs = artifacts
									.require('Liquidator')
									.decodeLogs(burnTransaction.receipt.rawLogs);
								assert.eventEqual(
									logs.find(log => log.event === 'AccountRemovedFromLiquidation'),
									'AccountRemovedFromLiquidation',
									{
										account: alice,
									}
								);
							});
							it('then Alice liquidation entry is removed', async () => {
								const deadline = await liquidator.getLiquidationDeadlineForAccount(alice);
								assert.bnEqual(deadline, 0);
							});
							it('then Alices account is not open for liquidation', async () => {
								const isForcedLiquidationOpen = await liquidator.isLiquidationOpen(alice, false);
								assert.bnEqual(isForcedLiquidationOpen, false);
							});
						});
						describe('when Alice does not fix her c-ratio ', () => {
							beforeEach(async () => {
								await updateSNXPrice('1');
							});
							it('then isLiquidationOpen returns true for Alice', async () => {
								const isForcedLiquidationOpen = await liquidator.isLiquidationOpen(alice, false);
								assert.equal(isForcedLiquidationOpen, true);
							});
							describe('when Alice calls checkAndRemoveAccountInLiquidation', () => {
								beforeEach(async () => {
									await liquidator.checkAndRemoveAccountInLiquidation(alice, {
										from: alice,
									});
								});
								it('then Alices account is still open for liquidation', async () => {
									const isForcedLiquidationOpen = await liquidator.isLiquidationOpen(alice, false);
									assert.bnEqual(isForcedLiquidationOpen, true);
								});
								it('then Alice liquidation deadline still exists', async () => {
									const deadline = await liquidator.getLiquidationDeadlineForAccount(alice);
									assert.notEqual(deadline, 0);
								});
								it('then Alice liquidation caller still exists', async () => {
									const caller = await liquidator.getLiquidationCallerForAccount(alice);
									assert.notEqual(caller, ZERO_ADDRESS);
								});
							});
							describe('given Alice has $600 Debt, $800 worth of SNX Collateral and c-ratio at 133.33%', () => {
								describe('when bob calls liquidateDelinquentAccount on Alice', () => {
									let txn;
									let ratio;
									let penalty;
									let aliceDebtShareBefore;
									let aliceDebtValueBefore;
									let aliceCollateralBefore;
									let bobSnxBalanceBefore;
									let amountToFixRatio;
									beforeEach(async () => {
										// Given issuance ratio is 800%
										ratio = toUnit('0.125');

										// And liquidation penalty is 30%
										penalty = toUnit('0.3');
										await systemSettings.setLiquidationPenalty(penalty, { from: owner });

										// Record Alices state
										aliceCollateralBefore = await synthetix.collateral(alice);
										aliceDebtShareBefore = await synthetixDebtShare.balanceOf(alice);
										aliceDebtValueBefore = await synthetix.debtBalanceOf(alice, sUSD);

										// Record Bobs state
										bobSnxBalanceBefore = await synthetix.balanceOf(bob);

										// Should be able to liquidate and fix c-ratio
										txn = await synthetix.liquidateDelinquentAccount(alice, {
											from: bob,
										});
									});
									it('then Bob can liquidate Alice once fixing the c-ratio', async () => {
										const cratio = await synthetix.collateralisationRatio(alice);

										// check Alice ratio is above or equal to target issuance ratio
										assert.bnClose(ratio, cratio, toUnit('100000000000000000'));

										// check Alice has their debt share and collateral reduced
										assert.isTrue(
											(await synthetixDebtShare.balanceOf(alice)).lt(aliceDebtShareBefore)
										);
										assert.isTrue((await synthetix.collateral(alice)).lt(aliceCollateralBefore));

										const expectedAmount = toUnit('597.014925373134328358');

										// amount of debt to redeem to fix
										amountToFixRatio = await liquidator.calculateAmountToFixCollateral(
											aliceDebtValueBefore,
											aliceCollateralBefore,
											penalty
										);

										assert.bnEqual(amountToFixRatio, expectedAmount);

										// check expected amount fixes c-ratio to 800%
										const debtAfter = aliceDebtValueBefore.sub(amountToFixRatio);
										const collateralAfterMinusPenalty = aliceCollateralBefore.sub(
											multiplyDecimal(amountToFixRatio, toUnit('1').add(penalty))
										);

										// c-ratio = debt / collateral
										const collateralRatio = divideDecimal(debtAfter, collateralAfterMinusPenalty);

										assert.bnEqual(collateralRatio, ratio);

										// Alice should not be open for liquidation anymore
										assert.isFalse(await liquidator.isLiquidationOpen(alice, false));

										// Alice should have liquidation entry removed
										assert.bnEqual(await liquidator.getLiquidationDeadlineForAccount(alice), 0);

										const logs = artifacts.require('Liquidator').decodeLogs(txn.receipt.rawLogs);
										assert.eventEqual(
											logs.find(log => log.event === 'AccountRemovedFromLiquidation'),
											'AccountRemovedFromLiquidation',
											{
												account: alice,
											}
										);

										// then the liquidation rewards are properly distributed to bob
										const flagReward = await liquidator.flagReward();
										const liquidateReward = await liquidator.liquidateReward();
										const caller = await liquidator.getLiquidationCallerForAccount(alice);

										assert.bnEqual(
											await synthetix.balanceOf(caller),
											bobSnxBalanceBefore.add(flagReward).add(liquidateReward)
										);
									});
								});
							});
						});
					});
				});
			});
		});
		describe('Given Alice has SNX and never issued any debt', () => {
			beforeEach(async () => {
				await synthetix.transfer(alice, toUnit('100'), { from: owner });
			});
			it('then she should not be able to be flagged for liquidation', async () => {
				await assert.revert(
					liquidator.flagAccountForLiquidation(alice),
					'Account issuance ratio is less than liquidation ratio'
				);
			});
			it('then liquidateDelinquentAccount fails', async () => {
				await assert.revert(
					synthetix.liquidateDelinquentAccount(alice),
					'Not open for liquidation'
				);
			});
			it('then liquidateSelf fails', async () => {
				await assert.revert(synthetix.liquidateSelf({ from: alice }), 'Not open for liquidation');
			});
		});
		describe('When David collateral value is less than debt issued + penalty) ', () => {
			let davidDebtBefore;
			let davidCollateralBefore;
			beforeEach(async () => {
				await updateSNXPrice('6');

				// David issues sUSD $600
				await synthetix.transfer(david, toUnit('800'), { from: owner });
				await synthetix.issueMaxSynths({ from: david });

				// Drop SNX value to $0.1 (Collateral worth $80)
				await updateSNXPrice('0.1');
			});
			it('then his collateral ratio should be greater than 1 (more debt than collateral)', async () => {
				const cratio = await synthetix.collateralisationRatio(david);

				assert.isTrue(cratio.gt(toUnit('1')));

				davidDebtBefore = await synthetixDebtShare.balanceOf(david);
				davidCollateralBefore = await synthetix.collateral(david);
				const collateralInUSD = await exchangeRates.effectiveValue(
					SNX,
					davidCollateralBefore,
					sUSD
				);

				assert.isTrue(davidDebtBefore.gt(collateralInUSD));
			});
			describe('when Bob flags and tries to liquidate David', () => {
				beforeEach(async () => {
					// flag account for liquidation
					await liquidator.flagAccountForLiquidation(david, {
						from: bob,
					});

					// fastForward to after liquidation delay
					const liquidationDeadline = await liquidator.getLiquidationDeadlineForAccount(david);
					await fastForwardAndUpdateRates(liquidationDeadline + 1);

					// Drop SNX value to $0.1 after update rates resets to default
					await updateSNXPrice('0.1');

					// ensure Bob has enough sUSD
					await synthetix.transfer(bob, toUnit('100000'), {
						from: owner,
					});
					await synthetix.issueMaxSynths({ from: bob });
				});
				it('then david is openForLiquidation', async () => {
					assert.isTrue(await liquidator.isLiquidationOpen(david, false));
				});
				describe('when the SNX rate is stale', () => {
					beforeEach(async () => {
						await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));
					});
					it('then liquidate reverts', async () => {
						await assert.revert(
							synthetix.liquidateDelinquentAccount(david, { from: bob }),
							'A synth or SNX rate is invalid'
						);
					});
				});
				describe('when Bob liquidates all of davids collateral', async () => {
					beforeEach(async () => {
						await synthetix.liquidateDelinquentAccount(david, {
							from: bob,
						});
					});
					it('then David should have 0 collateral', async () => {
						assert.bnEqual(await synthetix.collateral(david), toUnit('0'));
					});
					it('then David should have a collateral ratio of 0', async () => {
						const davidCRatioAfter = await synthetix.collateralisationRatio(david);
						assert.bnEqual(davidCRatioAfter, 0);
					});
					it('then David should still have debt owing', async () => {
						const davidDebt = await synthetixDebtShare.balanceOf(david);
						assert.isTrue(davidDebt.gt(0));
					});
					it('then David wont be open for liquidation', async () => {
						assert.isFalse(await liquidator.isLiquidationOpen(david, false));
					});
					it('then David liquidation entry is removed', async () => {
						const deadline = await liquidator.getLiquidationDeadlineForAccount(david);
						assert.bnEqual(deadline, 0);
					});
				});
			});
		});
	});
});
