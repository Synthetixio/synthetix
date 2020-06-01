'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts, setupContract } = require('./setup');

const { currentTime, multiplyDecimal, divideDecimal, toUnit, fastForward } = require('../utils')();

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

// const {
// 	constants: { ZERO_ADDRESS },
// } = require('../..');

const { toBytes32 } = require('../..');

const MockExchanger = artifacts.require('MockExchanger');

contract('Liquidations', accounts => {
	const [sUSD, SNX] = ['sUSD', 'SNX'].map(toBytes32);
	const [, owner, oracle, account1, alice, bob, carol] = accounts;
	const [hour, day, week, month] = [3600, 86400, 604800, 2629743];
	const sUSD100 = toUnit('100');

	let addressResolver,
		exchangeRates,
		// exchanger,
		// issuer,
		// issuanceEternalStorage,
		liquidations,
		// eternalStorageLiquidations,
		sUSDContract,
		synthetix,
		synthetixState,
		timestamp;

	// run this once before all tests to prepare our environment, snapshots on beforeEach will take
	// care of resetting to this state
	before(async () => {
		({
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			// Exchanger: exchanger,
			// Issuer: issuer,
			// IssuanceEternalStorage: issuanceEternalStorage,
			Liquidations: liquidations,
			// EternalStorageLiquidations: eternalStorageLiquidations,
			SynthsUSD: sUSDContract,
			Synthetix: synthetix,
			SynthetixState: synthetixState,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'AddressResolver',
				'ExchangeRates',
				'Exchanger', // required for Synthetix to check if exchanger().hasWaitingPeriodOrSettlementOwing
				'Issuer',
				'IssuanceEternalStorage', // required to ensure issuing and burning succeed
				'Liquidations',
				'EternalStorageLiquidations',
				'Synthetix',
				'SynthetixState',
			],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	const fastForwardAndUpdateRates = async seconds => {
		await fastForward(seconds);
		await updateRatesWithDefaults();
	};

	const updateRatesWithDefaults = async () => {
		timestamp = await currentTime();
		// SNX is 6 dolla
		await exchangeRates.updateRates([SNX], ['6'].map(toUnit), timestamp, {
			from: oracle,
		});
	};

	const updateSNXPrice = async rate => {
		await exchangeRates.updateRates([SNX], [rate].map(toUnit), timestamp, {
			from: oracle,
		});
	};

	beforeEach(async () => {
		// Set issuanceRatio to 800%
		const issuanceRatio800 = toUnit('0.125');
		await synthetixState.setIssuanceRatio(issuanceRatio800, { from: owner });

		updateRatesWithDefaults();
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: liquidations.abi,
			ignoreParents: ['MixinResolver'],
			expected: [
				'flagAccountForLiquidation',
				'removeAccountInLiquidation',
				'checkAndRemoveAccountInLiquidation',
				'setLiquidationDelay',
				'setLiquidationRatio',
				'setLiquidationPenalty',
			],
		});
	});

	it('should set constructor params on deployment', async () => {
		const instance = await setupContract({
			contract: 'Liquidations',
			accounts,
			skipPostDeploy: true,
			args: [account1, addressResolver.address],
		});

		assert.equal(await instance.owner(), account1);
		assert.equal(await instance.resolver(), addressResolver.address);
	});

	describe('Default settings', () => {
		it('liquidation (issuance) ratio is .5 or 1/2', async () => {
			const liquidationRatio = await liquidations.liquidationRatio();
			assert.bnEqual(liquidationRatio, toUnit('.5'));
		});
		it('liquidation collateral ratio is 200%', async () => {
			const liquidationCollateralRatio = await liquidations.liquidationCollateralRatio();
			assert.bnEqual(liquidationCollateralRatio, toUnit('2'));
		});
		it('liquidation penalty is 10%', async () => {
			const liquidationPenalty = await liquidations.liquidationPenalty();
			assert.bnEqual(liquidationPenalty, toUnit('.1'));
		});
		it('liquidation delay is 2 weeks', async () => {
			const liquidationDelay = await liquidations.liquidationDelay();
			assert.bnEqual(liquidationDelay, week * 2);
		});
		it('MAX_LIQUIDATION_RATIO is 100%', async () => {
			const MAX_LIQUIDATION_RATIO = await liquidations.MAX_LIQUIDATION_RATIO();
			assert.bnEqual(MAX_LIQUIDATION_RATIO, toUnit('1'));
		});
		it('MAX_LIQUIDATION_PENALTY is 25%', async () => {
			const MAX_LIQUIDATION_PENALTY = await liquidations.MAX_LIQUIDATION_PENALTY();
			assert.bnEqual(MAX_LIQUIDATION_PENALTY, toUnit('.25'));
		});
	});

	describe('protected methods', () => {
		describe('only owner functions', () => {
			it('setLiquidationDelay() can only be invoked by owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.setLiquidationDelay,
					args: [week],
					address: owner,
					accounts,
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('setLiquidationRatio() can only be invoked by owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.setLiquidationRatio,
					args: [toUnit('.5')],
					address: owner,
					accounts,
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('setLiquidationPenalty() can only be invoked by owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.setLiquidationPenalty,
					args: [toUnit('.2')],
					address: owner,
					accounts,
					reason: 'Only the contract owner may perform this action',
				});
			});
			describe('when owner sets expected properties', () => {
				xit('owner can change liquidationCollateralRatio to 300%', async () => {
					await liquidations.setLiquidationRatio(toUnit('.3333333333333'), { from: owner });
					assert.bnEqual(await liquidations.liquidationCollateralRatio(), toUnit('3'));
				});
				it('owner can change liquidationCollateralRatio to 200%', async () => {
					await liquidations.setLiquidationRatio(toUnit('.5'), { from: owner });
					assert.bnEqual(await liquidations.liquidationCollateralRatio(), toUnit('2'));
				});
				xit('owner can change liquidationCollateralRatio to 150%', async () => {
					await liquidations.setLiquidationRatio(toUnit('0.6666666667'), { from: owner });
					assert.bnEqual(await liquidations.liquidationCollateralRatio(), toUnit('1.5'));
				});
				xit('owner can change liquidationCollateralRatio to 110%', async () => {
					await liquidations.setLiquidationRatio(toUnit('0.9090909091'), { from: owner });
					assert.bnEqual(await liquidations.liquidationCollateralRatio(), toUnit('1.1'));
				});
				it('owner can change liquidationCollateralRatio to 100%', async () => {
					await liquidations.setLiquidationRatio(toUnit('1'), { from: owner });
					assert.bnEqual(await liquidations.liquidationCollateralRatio(), toUnit('1'));
				});
				it('owner can set liquidationPenalty to 25%', async () => {
					await liquidations.setLiquidationPenalty(toUnit('.25'), { from: owner });
					assert.bnEqual(await liquidations.liquidationPenalty(), toUnit('.25'));
				});
				it('owner can set liquidationPenalty to 1%', async () => {
					await liquidations.setLiquidationPenalty(toUnit('.01'), { from: owner });
					assert.bnEqual(await liquidations.liquidationPenalty(), toUnit('.01'));
				});
				it('owner can set liquidationPenalty to 0%', async () => {
					await liquidations.setLiquidationPenalty(toUnit('0'), { from: owner });
					assert.bnEqual(await liquidations.liquidationPenalty(), toUnit('0'));
				});
				it('owner can set liquidationDelay to 1 day', async () => {
					await liquidations.setLiquidationDelay(day, { from: owner });
					const liquidationDelay = await liquidations.liquidationDelay();
					assert.bnEqual(liquidationDelay, day);
				});
				it('owner can set liquidationDelay to 1 month', async () => {
					await liquidations.setLiquidationDelay(month, { from: owner });
					const liquidationDelay = await liquidations.liquidationDelay();
					assert.bnEqual(liquidationDelay, month);
				});
			});
			describe('when owner sets properties outside of the bounds', () => {
				it('when setLiquidationDelay is set to 0 then revert', async () => {
					await assert.revert(
						liquidations.setLiquidationDelay(0, {
							from: owner,
						}),
						'Must be greater than 1 day'
					);
				});
				it('when setLiquidationDelay is set above 1 month then revert', async () => {
					await assert.revert(
						liquidations.setLiquidationDelay(month + day, {
							from: owner,
						}),
						'Must be less than 1 month'
					);
				});
				it('when setLiquidationRatio is set above MAX_LIQUIDATION_RATIO then revert', async () => {
					const MAX_LIQUIDATION_RATIO = await liquidations.MAX_LIQUIDATION_RATIO();
					const newLiquidationRatio = MAX_LIQUIDATION_RATIO.add(toUnit('1'));

					await assert.revert(
						liquidations.setLiquidationRatio(newLiquidationRatio, {
							from: owner,
						}),
						'liquidationRatio > MAX_LIQUIDATION_RATIO'
					);
				});
				it('when setLiquidationPenalty is set above MAX_LIQUIDATION_PENALTY then revert', async () => {
					const MAX_LIQUIDATION_PENALTY = await liquidations.MAX_LIQUIDATION_PENALTY();
					const newLiquidationPenalty = MAX_LIQUIDATION_PENALTY.add(toUnit('1'));
					await assert.revert(
						liquidations.setLiquidationPenalty(newLiquidationPenalty, {
							from: owner,
						}),
						'penalty > MAX_LIQUIDATION_PENALTY'
					);
				});
			});
		});
		describe('only internal contracts can call', () => {
			beforeEach(async () => {
				await liquidations.flagAccountForLiquidation(alice, { from: bob });

				// Overwrite Synthetix / Issuer address to the owner to allow us to invoke removeAccInLiquidation
				await addressResolver.importAddresses(
					['Synthetix', 'Issuer'].map(toBytes32),
					[owner, owner],
					{
						from: owner,
					}
				);

				// now have Liquidations resync its cache
				await liquidations.setResolverAndSyncCache(addressResolver.address, { from: owner });
			});
			it('removeAccountInLiquidation() can only be invoked by synthetix', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.removeAccountInLiquidation,
					args: [alice],
					address: owner, // TODO: is this supposed to be synthetix.address
					accounts,
					reason: 'Liquidations: Only the synthetix or Issuer contract can perform this action',
				});
			});
			it('removeAccountInLiquidation() can only be invoked by issuer', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.removeAccountInLiquidation,
					args: [alice],
					address: owner, // TODO: is this supposed to be issuer.address
					accounts,
					reason: 'Liquidations: Only the synthetix or Issuer contract can perform this action',
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

				await synthetixState.setIssuanceRatio(ratio, { from: owner });

				collateralBefore = toUnit('600');
				debtBefore = toUnit('300');
			});
			describe('given liquidation penalty is 100%', () => {
				beforeEach(() => {
					penalty = toUnit('1');
				});
				it('should take all the collateral to burn debt', async () => {
					// amount of debt to redeem to fix is all debt
					const susdToLiquidate = await synthetix.calculateAmountToFixCollateral(
						debtBefore,
						collateralBefore,
						penalty
					);

					assert.bnEqual(susdToLiquidate, debtBefore);

					const collateralAfterMinusPenalty = collateralBefore.sub(
						multiplyDecimal(susdToLiquidate, toUnit('1').add(penalty))
					);

					assert.bnEqual(toUnit('0'), collateralAfterMinusPenalty);
				});
			});
			describe('given liquidation penalty is greater than 100%, at 110%', () => {
				beforeEach(() => {
					penalty = toUnit('1.1');
				});
				it('the amount to redeem to fix collateral is greater than collateral', async () => {
					// amount of debt to burn to fix is all debt
					const susdToLiquidate = await synthetix.calculateAmountToFixCollateral(
						debtBefore,
						collateralBefore,
						penalty
					);

					const collateralAfterMinusPenalty = collateralBefore.sub(
						multiplyDecimal(susdToLiquidate, toUnit('1').add(penalty))
					);

					assert.isTrue(toUnit('0').gt(collateralAfterMinusPenalty));
				});
			});
			describe('given liquidation penalty is 10%', () => {
				beforeEach(() => {
					penalty = toUnit('0.1');
				});
				it('calculates sUSD to fix ratio from 200%, with $600 SNX collateral and $300 debt', async () => {
					const expectedAmount = toUnit('260.869565217391304347');

					// amount of debt to redeem to fix
					const susdToLiquidate = await synthetix.calculateAmountToFixCollateral(
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
					const susdToLiquidate = await synthetix.calculateAmountToFixCollateral(
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
	describe('when anyone calls liquidateDelinquentAccount on alice', () => {
		let exchanger;
		describe('then do liquidation checks', () => {
			beforeEach(async () => {
				exchanger = await MockExchanger.new(synthetix.address);
				await addressResolver.importAddresses(['Exchanger'].map(toBytes32), [exchanger.address], {
					from: owner,
				});
				// now have synthetix resync its cache
				await synthetix.setResolverAndSyncCache(addressResolver.address, { from: owner });
			});
			it('when SNX rate is stale then revert', async () => {
				await fastForward(hour * 4); // 3 hour stale period
				await assert.revert(
					synthetix.liquidateDelinquentAccount(alice, sUSD100, { from: bob }),
					'Rate stale or not a synth'
				);
			});
			it('when a liquidator has SettlementOwing from hasWaitingPeriodOrSettlementOwing then revert', async () => {
				// Setup Bob with a settlement oweing
				console.log('exchanger.setReclaim(sUSD100)');
				await exchanger.setReclaim(sUSD100);
				await exchanger.setNumEntries(1);

				await assert.revert(
					synthetix.liquidateDelinquentAccount(alice, sUSD100, { from: bob }),
					'sUSD needs to be settled'
				);
			});
			it('when a liquidator has hasWaitingPeriod from hasWaitingPeriodOrSettlementOwing then revert', async () => {
				// Setup Bob with a waiting period
				await exchanger.setMaxSecsLeft(180);
				await exchanger.setNumEntries(1);
				await assert.revert(
					synthetix.liquidateDelinquentAccount(alice, sUSD100, { from: bob }),
					'sUSD needs to be settled'
				);
			});
			it('when an account is not isOpenForLiquidation then revert', async () => {
				await assert.revert(
					synthetix.liquidateDelinquentAccount(alice, sUSD100, { from: bob }),
					'Account not open for liquidation'
				);
			});
		});
		describe('when Alice is undercollateralized', () => {
			beforeEach(async () => {
				// wen SNX 6 dolla
				await updateSNXPrice('6');

				// Alice issues sUSD
				await synthetix.transfer(alice, toUnit('800'), { from: owner });
				await synthetix.issueMaxSynths({ from: alice });

				// Drop SNX value to $1
				await updateSNXPrice('1');
			});
			it('and liquidation Collateral Ratio is 200%', async () => {
				assert.bnEqual(await liquidations.liquidationCollateralRatio(), toUnit('2'));
			});
			it('and liquidation penalty is 10%', async () => {
				assert.bnEqual(await liquidations.liquidationPenalty(), toUnit('.1'));
			});
			it('and liquidation delay is 2 weeks', async () => {
				assert.bnEqual(await liquidations.liquidationDelay(), week * 2);
			});
			describe('when Alice has not been flagged for liquidation', () => {
				it('and Alice calls checkAndRemoveAccountInLiquidation then it reverts', async () => {
					await assert.revert(
						liquidations.checkAndRemoveAccountInLiquidation(alice, {
							from: alice,
						}),
						'Account has no liquidation set'
					);
				});
			});
			describe('when Bob flags Alice for liquidation', () => {
				let flagForLiquidationTransaction;
				let timeOfTransaction;
				beforeEach(async () => {
					timeOfTransaction = await currentTime();
					flagForLiquidationTransaction = await liquidations.flagAccountForLiquidation(alice, {
						from: bob,
					});
				});
				it('then sets a deadline liquidation delay of 2 weeks', async () => {
					const liquidationDeadline = await liquidations.getLiquidationDeadlineForAccount(alice);
					assert.isTrue(liquidationDeadline > 0);
					assert.isTrue(liquidationDeadline > timeOfTransaction);
					assert.isTrue(liquidationDeadline > timeOfTransaction + week * 2);
				});
				it('then emits an event accountFlaggedForLiquidation', async () => {
					const liquidationDeadline = await liquidations.getLiquidationDeadlineForAccount(alice);
					assert.eventEqual(flagForLiquidationTransaction, 'AccountFlaggedForLiquidation', {
						account: alice,
						deadline: liquidationDeadline,
					});
				});
				describe('when Bob or anyone else tries to flag Alice address for liquidation again', () => {
					it('then it fails for Bob as Alices address is already flagged', async () => {
						await assert.revert(
							liquidations.flagAccountForLiquidation(alice, {
								from: bob,
							}),
							'Account already flagged for liquidation'
						);
					});
					it('then it fails for Carol Baskin as Alices address is already flagged', async () => {
						await assert.revert(
							liquidations.flagAccountForLiquidation(alice, {
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
							removeFlagTransaction = await liquidations.checkAndRemoveAccountInLiquidation(alice, {
								from: alice,
							});
						});
						// TODO: Alice should be removed
						xit('then Alice liquidation entry is removed', async () => {
							const deadline = await liquidations.getLiquidationDeadlineForAccount(alice);
							assert.bnEqual(deadline, 0);
						});
						xit('then Alices account is not open for liquidation', async () => {
							const isOpenForLiquidation = await liquidations.isOpenForLiquidation(alice);
							assert.bnEqual(isOpenForLiquidation, false);
						});
						xit('then events AccountRemovedFromLiqudation are emitted', async () => {
							assert.eventEqual(removeFlagTransaction, 'AccountRemovedFromLiqudation', {
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

							// Get Bob some sUSD
							await sUSDContract.issue(bob, sUSD100, {
								from: owner,
							});

							// Bob Liquidates Alice
							await assert.revert(
								synthetix.liquidateDelinquentAccount(alice, sUSD100, {
									from: bob,
								}),
								'Account not open for liquidation'
							);
						});
						it('then Alice liquidation entry remains', async () => {
							const deadline = await liquidations.getLiquidationDeadlineForAccount(alice);
							assert.isTrue(deadline > 0);
						});
						it('then Alices account is not open for liquidation', async () => {
							const isOpenForLiquidation = await liquidations.isOpenForLiquidation(alice);
							assert.bnEqual(isOpenForLiquidation, false);
						});
						it('then Bob still has 100sUSD', async () => {
							assert.bnEqual(await sUSDContract.balanceOf(bob), sUSD100);
						});
						it('then Bob still has 0 SNX', async () => {
							assert.bnEqual(await synthetix.balanceOf(bob), 0);
						});
						it('then Alice still has 800 SNX', async () => {
							assert.bnEqual(await synthetix.balanceOf(alice), toUnit('800'));
						});
					});

					describe('when Alice burnSynthsToTarget to fix her c-ratio ', () => {
						let burnTransaction;
						beforeEach(async () => {
							await updateSNXPrice('1');
							burnTransaction = await synthetix.burnSynthsToTarget({ from: alice });
						});
						xit('then AccountRemovedFromLiqudation event is emitted', async () => {
							assert.eventEqual(burnTransaction, 'AccountRemovedFromLiqudation', {
								account: alice,
							});
						});
						it('then Alice liquidation entry is removed', async () => {
							const deadline = await liquidations.getLiquidationDeadlineForAccount(alice);
							assert.bnEqual(deadline, 0);
						});
						it('then Alices account is not open for liquidation', async () => {
							const isOpenForLiquidation = await liquidations.isOpenForLiquidation(alice);
							assert.bnEqual(isOpenForLiquidation, false);
						});
					});
					describe('when Alice does not fix her c-ratio ', () => {
						beforeEach(async () => {
							await updateSNXPrice('1');
						});
						it('then isOpenForLiquidation returns true for Alice', async () => {
							const isOpenForLiquidation = await liquidations.isOpenForLiquidation(alice);
							assert.equal(isOpenForLiquidation, true);
						});
						it('when carol calls liquidateDelinquentAccount but has 0 sUSD then revert', async () => {
							assert.bnEqual(await sUSDContract.balanceOf(carol), 0);

							await assert.revert(
								synthetix.liquidateDelinquentAccount(alice, sUSD100, { from: carol }),
								'Not enough sUSD'
							);
						});
						it('when Bobs liquidates alice for 100 sUSD but only has 99 sUSD then revert', async () => {
							const sUSD99 = toUnit('99');
							await sUSDContract.issue(bob, sUSD99, {
								from: owner,
							});
							assert.bnEqual(await sUSDContract.balanceOf(bob), sUSD99);
							await assert.revert(
								synthetix.liquidateDelinquentAccount(alice, sUSD100, { from: bob }),
								'Not enough sUSD'
							);
						});
						describe('when Alice calls checkAndRemoveAccountInLiquidation', () => {
							beforeEach(async () => {
								await liquidations.checkAndRemoveAccountInLiquidation(alice, {
									from: alice,
								});
							});
							it('then Alices account is still open for liquidation', async () => {
								const isOpenForLiquidation = await liquidations.isOpenForLiquidation(alice);
								assert.bnEqual(isOpenForLiquidation, true);
							});
							it('then Alice liquidation deadline still exists', async () => {
								const deadline = await liquidations.getLiquidationDeadlineForAccount(alice);
								assert.notEqual(deadline, 0);
							});
						});
						describe('when Bob liquidates alice for 100 sUSD to get 110 SNX', () => {
							const SNX110 = toUnit('110');
							let aliceDebtBefore;
							let aliceSNXBefore;
							beforeEach(async () => {
								// Get Bob some sUSD
								await sUSDContract.issue(bob, sUSD100, {
									from: owner,
								});
								assert.bnEqual(await sUSDContract.balanceOf(bob), sUSD100);

								// Record Alices state
								aliceDebtBefore = await synthetix.debtBalanceOf(alice, sUSD);
								console.log('aliceDebtBefore', aliceDebtBefore.toString());
								aliceSNXBefore = await synthetix.balanceOf(alice);

								// Bob Liquidates Alice
								await synthetix.liquidateDelinquentAccount(alice, sUSD100, { from: bob });
							});
							it('then Bob sUSD balance is reduced by 100 sUSD', async () => {
								assert.bnEqual(await sUSDContract.balanceOf(bob), 0);
							});
							it('then Alice debt is reduced by 100 sUSD', async () => {
								const aliceDebtAfter = await synthetix.debtBalanceOf(alice, sUSD);
								const difference = aliceDebtBefore.sub(aliceDebtAfter);
								assert.bnEqual(difference, sUSD100);
							});
							it('then Alice has less SNX + penalty', async () => {
								const aliceSNXAfter = await synthetix.balanceOf(alice);
								const difference = aliceSNXBefore.sub(aliceSNXAfter);
								assert.bnEqual(difference, SNX110);
							});
							it('then Bob has 100 SNX + the 10 SNX penalty (110)', async () => {
								const snxBalance = await synthetix.balanceOf(bob);
								assert.bnEqual(snxBalance, SNX110);
							});
							it('then Alice SNX balance is 690', async () => {
								const aliceSNXAfter = await synthetix.balanceOf(alice);
								assert.bnEqual(aliceSNXAfter, toUnit('690'));
							});
							xit('then Alice debt is 433.33', async () => {
								const aliceDebtAfter = await synthetix.debtBalanceOf(alice, sUSD);
								assert.bnEqual(aliceDebtAfter, toUnit('433.33'));
							});
							xit('then Alice collateralisationRatio is 158.77%', async () => {
								const aliceCRatioAfter = await synthetix.collateralisationRatio(alice);
								assert.bnEqual(aliceCRatioAfter, toUnit('1.5877'));
							});
							describe('when carol liquidatues Alive with 50 sUSD', () => {
								const sUSD50 = toUnit('50');
								const SNX55 = toUnit('55');
								beforeEach(async () => {
									// Get Carol some sUSD
									await sUSDContract.issue(carol, sUSD50, {
										from: owner,
									});
									assert.bnEqual(await sUSDContract.balanceOf(carol), sUSD50);

									// Record Alices state
									aliceDebtBefore = await synthetix.debtBalanceOf(alice, sUSD);
									console.log('aliceDebtBefore', aliceDebtBefore.toString());
									aliceSNXBefore = await synthetix.balanceOf(alice);

									// Carol Liquidates Alice
									await synthetix.liquidateDelinquentAccount(alice, sUSD50, { from: carol });
								});
								it('then Carols sUSD balance is reduced by 50 sUSD', async () => {
									assert.bnEqual(await sUSDContract.balanceOf(carol), 0);
								});
								it('then Alice debt is reduced by 50 sUSD', async () => {
									const aliceDebtAfter = await synthetix.debtBalanceOf(alice, sUSD);
									const difference = aliceDebtBefore.sub(aliceDebtAfter);
									assert.bnEqual(difference, sUSD50);
								});
								it('then Alice has less SNX + penalty', async () => {
									const aliceSNXAfter = await synthetix.balanceOf(alice);
									const difference = aliceSNXBefore.sub(aliceSNXAfter);
									assert.bnEqual(difference, SNX55);
								});
								it('then Carol has 50 SNX + the 5 SNX penalty (55)', async () => {
									const snxBalance = await synthetix.balanceOf(carol);
									assert.bnEqual(snxBalance, SNX55);
								});
								it('then Alice SNX balance is 635', async () => {
									const aliceSNXAfter = await synthetix.balanceOf(alice);
									assert.bnEqual(aliceSNXAfter, toUnit('635'));
								});
								xit('then Alice debt is 383.33', async () => {
									const aliceDebtAfter = await synthetix.debtBalanceOf(alice, sUSD);
									assert.bnEqual(aliceDebtAfter, toUnit('383.33'));
								});
								xit('then Alice collateralisationRatio is X%', async () => {
									const aliceCRatioAfter = await synthetix.collateralisationRatio(alice);
									assert.bnEqual(aliceCRatioAfter, toUnit('X'));
								});
								describe('when Bob liqudates Alice with 1000 sUSD', () => {
									const sUSD1000 = toUnit('1000');
									let liquidationTransaction;
									beforeEach(async () => {
										await sUSDContract.issue(bob, sUSD1000, {
											from: owner,
										});
										assert.bnEqual(await sUSDContract.balanceOf(bob), sUSD1000);

										// Record Alices state
										aliceDebtBefore = await synthetix.debtBalanceOf(alice, sUSD);
										console.log('aliceDebtBefore', aliceDebtBefore.toString());
										aliceSNXBefore = await synthetix.balanceOf(alice);

										// Bob Liquidates Alice
										liquidationTransaction = await synthetix.liquidateDelinquentAccount(
											alice,
											sUSD1000,
											{
												from: bob,
											}
										);
									});
									it('then Bobs liquidation partially liquidates the 1000 sUSD');
									it('then Alice liquidation entry is removed', async () => {
										const deadline = await liquidations.getLiquidationDeadlineForAccount(alice);
										assert.bnEqual(deadline, 0);
									});
									it('then Alices account is not open for liquidation', async () => {
										const isOpenForLiquidation = await liquidations.isOpenForLiquidation(alice);
										assert.bnEqual(isOpenForLiquidation, false);
									});
									it('then events AccountLiquidated & AccountRemovedFromLiqudation are emitted', async () => {
										assert.eventsEqual(
											liquidationTransaction,
											'AccountLiquidated',
											{
												account: alice,
											},
											'Transfer',
											{
												from: alice,
												to: bob,
											}
											// TODO this should be removed from liquidation in this test case
											// 'AccountRemovedFromLiqudation',
											// {
											// 	account: alice,
											// }
										);
									});
									xit('then Alice issuanceRatio is now at the issuanceRatio', async () => {
										const aliceCRatioAfter = await synthetix.collateralisationRatio(alice);
										const issuanceRatio = await synthetixState.issuanceRatio(alice);
										assert.bnEqual(aliceCRatioAfter, issuanceRatio);
									});
								});
							});
						});
					});
				});
			});
		});
	});
});
