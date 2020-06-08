'use strict';

const { artifacts, contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts, setupContract } = require('./setup');

const { currentTime, multiplyDecimal, divideDecimal, toUnit, fastForward } = require('../utils')();

const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	setStatus,
} = require('./helpers');

const { toBytes32 } = require('../..');

const MockExchanger = artifacts.require('MockExchanger');

contract('Liquidations', accounts => {
	const [sUSD, SNX] = ['sUSD', 'SNX'].map(toBytes32);
	const [, owner, oracle, account1, alice, bob, carol, david] = accounts;
	const [hour, day, week] = [3600, 86400, 604800];
	const sUSD100 = toUnit('100');

	let addressResolver,
		exchangeRates,
		liquidations,
		sUSDContract,
		synthetix,
		synthetixState,
		systemStatus,
		feePoolState,
		issuer,
		timestamp;

	// run this once before all tests to prepare our environment, snapshots on beforeEach will take
	// care of resetting to this state
	before(async () => {
		({
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			Liquidations: liquidations,
			SynthsUSD: sUSDContract,
			Synthetix: synthetix,
			SynthetixState: synthetixState,
			SystemStatus: systemStatus,
			FeePoolState: feePoolState,
			Issuer: issuer,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'AddressResolver',
				'ExchangeRates',
				'Exchanger', // required for Synthetix to check if exchanger().hasWaitingPeriodOrSettlementOwing
				'FeePool',
				'FeePoolState', // required for checking issuance data appended
				'Issuer',
				'IssuanceEternalStorage', // required to ensure issuing and burning succeed
				'Liquidations',
				'SystemStatus', // test system status controls
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
		await updateSNXPrice('6');
	};

	const updateSNXPrice = async rate => {
		timestamp = await currentTime();
		await exchangeRates.updateRates([SNX], [rate].map(toUnit), timestamp, {
			from: oracle,
		});
	};

	beforeEach(async () => {
		// Set issuanceRatio to 800%
		const issuanceRatio800 = toUnit('0.125');
		await synthetixState.setIssuanceRatio(issuanceRatio800, { from: owner });

		await updateRatesWithDefaults();
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

	describe('system staleness checks', () => {
		describe('when SNX is stale', () => {
			beforeEach(async () => {
				const rateStalePeriod = await exchangeRates.rateStalePeriod();

				// fast forward until rates are stale
				await fastForward(rateStalePeriod + 1);
			});
			it('when flagAccountForLiquidation() is invoked, it reverts for rate stale', async () => {
				await assert.revert(
					liquidations.flagAccountForLiquidation(alice, { from: owner }),
					'Rate stale or not a synth'
				);
			});
			it('when checkAndRemoveAccountInLiquidation() is invoked, it reverts for rate stale', async () => {
				await assert.revert(
					liquidations.checkAndRemoveAccountInLiquidation(alice, { from: owner }),
					'Rate stale or not a synth'
				);
			});
		});
		describe('when the system is suspended', () => {
			beforeEach(async () => {
				await setStatus({ owner, systemStatus, section: 'System', suspend: true });
			});
			it('when liquidateDelinquentAccount() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					synthetix.liquidateDelinquentAccount(alice, toUnit('10'), { from: owner }),
					'Operation prohibited'
				);
			});
			it('when checkAndRemoveAccountInLiquidation() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					liquidations.checkAndRemoveAccountInLiquidation(alice, { from: owner }),
					'Operation prohibited'
				);
			});
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
					args: [toUnit('.1')],
					address: owner,
					accounts,
					reason: 'Only the contract owner may perform this action',
				});
			});
			describe('when owner sets expected properties', () => {
				describe('given liquidation penalty is 10%', () => {
					beforeEach(async () => {
						assert.bnEqual(await liquidations.liquidationPenalty(), toUnit('0.1'));
					});
					it('owner can change liquidationCollateralRatio to 300%', async () => {
						await liquidations.setLiquidationRatio(divideDecimal(toUnit('1'), toUnit('3')), {
							from: owner,
						});
						assert.bnClose(await liquidations.liquidationCollateralRatio(), toUnit('3'));
					});
					it('owner can change liquidationCollateralRatio to 200%', async () => {
						await liquidations.setLiquidationRatio(toUnit('.5'), { from: owner });
						assert.bnEqual(await liquidations.liquidationCollateralRatio(), toUnit('2'));
					});
					it('owner can change liquidationCollateralRatio up to 110%', async () => {
						await liquidations.setLiquidationRatio(divideDecimal(toUnit('1'), toUnit('1.1')), {
							from: owner,
						});
						assert.bnClose(await liquidations.liquidationCollateralRatio(), toUnit('1.1'));
					});
					it('reverts when changing liquidationCollateralRatio to 109%', async () => {
						await assert.revert(
							liquidations.setLiquidationRatio(divideDecimal(toUnit('1'), toUnit('1.09')), {
								from: owner,
							}),
							'liquidationRatio > MAX_LIQUIDATION_RATIO / (1 + penalty)'
						);
					});
					it('reverts when changing liquidationCollateralRatio to 100%', async () => {
						await assert.revert(
							liquidations.setLiquidationRatio(toUnit('1'), { from: owner }),
							'liquidationRatio > MAX_LIQUIDATION_RATIO / (1 + penalty)'
						);
					});
					describe('minimum liquidation ratio - given issuanceRatio is 800% at 0.125', () => {
						let RATIO_FROM_TARGET_BUFFER;
						let MIN_LIQUIDATION_RATIO;
						let issuanceRatio;
						beforeEach(async () => {
							await synthetixState.setIssuanceRatio(toUnit('0.125'), { from: owner });

							issuanceRatio = await synthetixState.issuanceRatio();

							RATIO_FROM_TARGET_BUFFER = await liquidations.RATIO_FROM_TARGET_BUFFER();

							// min liquidation ratio is how much the collateral ratio can drop from the issuance ratio before liquidation's can be started.
							MIN_LIQUIDATION_RATIO = multiplyDecimal(RATIO_FROM_TARGET_BUFFER, issuanceRatio);
						});
						it('then MIN_LIQUIDATION_RATIO is equal double issuance ratio (400%)', () => {
							// minimum liquidation ratio should be 0.125 * 2 = 0.25 (CRatio 800% -> 400%)
							assert.bnEqual(RATIO_FROM_TARGET_BUFFER, toUnit('2'));
							assert.bnEqual(MIN_LIQUIDATION_RATIO, toUnit('0.25'));
						});
						it('when owner sets liquidationCollateralRatio below the MIN_LIQUIDATION_RATIO, then should revert', async () => {
							await assert.revert(
								liquidations.setLiquidationRatio(MIN_LIQUIDATION_RATIO.sub(toUnit('.1')), {
									from: owner,
								}),
								'liquidationRatio < MIN_LIQUIDATION_RATIO'
							);
						});
						it('when owner sets liquidationCollateralRatio above the MIN_LIQUIDATION_RATIO, then it should be allowed', async () => {
							const expectedLiquidationRatio = MIN_LIQUIDATION_RATIO.add(toUnit('.1'));
							await liquidations.setLiquidationRatio(expectedLiquidationRatio, {
								from: owner,
							});
							// rounding in division
							assert.bnClose(
								await liquidations.liquidationCollateralRatio(),
								divideDecimal(toUnit('1'), expectedLiquidationRatio)
							);
						});
						it('when owner sets liquidationCollateralRatio equal to MIN_LIQUIDATION_RATIO, then it should be allowed', async () => {
							const expectedLiquidationRatio = MIN_LIQUIDATION_RATIO;
							await liquidations.setLiquidationRatio(expectedLiquidationRatio, {
								from: owner,
							});
							assert.bnEqual(
								await liquidations.liquidationCollateralRatio(),
								divideDecimal(toUnit('1'), expectedLiquidationRatio)
							);
						});
					});
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
				it('owner can set liquidationDelay to 30 days', async () => {
					await liquidations.setLiquidationDelay(30 * day, { from: owner });
					const liquidationDelay = await liquidations.liquidationDelay();
					assert.bnEqual(liquidationDelay, 30 * day);
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
				it('when setLiquidationDelay is set above 30 days then revert', async () => {
					await assert.revert(
						liquidations.setLiquidationDelay(31 * day, {
							from: owner,
						}),
						'Must be less than 30 days'
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
				// Overwrite Issuer address to the owner to allow us to invoke removeAccInLiquidation
				await addressResolver.importAddresses(['Issuer'].map(toBytes32), [owner], {
					from: owner,
				});

				// now have Liquidations resync its cache
				await liquidations.setResolverAndSyncCache(addressResolver.address, { from: owner });
			});
			it('removeAccountInLiquidation() can only be invoked by issuer', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.removeAccountInLiquidation,
					args: [alice],
					address: owner, // TODO: is this supposed to be issuer.address
					accounts,
					reason: 'Liquidations: Only the Issuer contract can perform this action',
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
			describe('given liquidation penalty is 10%', () => {
				beforeEach(async () => {
					penalty = toUnit('0.1');
					await liquidations.setLiquidationPenalty(penalty, { from: owner });
				});
				it('calculates sUSD to fix ratio from 200%, with $600 SNX collateral and $300 debt', async () => {
					const expectedAmount = toUnit('260.869565217391304347');

					// amount of debt to redeem to fix
					const susdToLiquidate = await liquidations.calculateAmountToFixCollateral(
						debtBefore,
						collateralBefore
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
					const susdToLiquidate = await liquidations.calculateAmountToFixCollateral(
						debtBefore,
						collateralBefore
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
				await Promise.all([
					synthetix.setResolverAndSyncCache(addressResolver.address, { from: owner }),
					await issuer.setResolverAndSyncCache(addressResolver.address, { from: owner }),
				]);
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

				// Alice issues sUSD $600
				await synthetix.transfer(alice, toUnit('800'), { from: owner });
				await synthetix.issueMaxSynths({ from: alice });

				// Drop SNX value to $1 (Collateral worth $800 after)
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
				it('then isLiquidationDeadlinePassed returns false as no liquidation set', async () => {
					assert.isFalse(await liquidations.isLiquidationDeadlinePassed(alice));
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
					assert.isTrue(liquidationDeadline.gt(0));
					assert.isTrue(liquidationDeadline.gt(timeOfTransaction));
					assert.isTrue(liquidationDeadline.gt(timeOfTransaction + week * 2));
				});
				it('then emits an event accountFlaggedForLiquidation', async () => {
					const liquidationDeadline = await liquidations.getLiquidationDeadlineForAccount(alice);
					assert.eventEqual(flagForLiquidationTransaction, 'AccountFlaggedForLiquidation', {
						account: alice,
						deadline: liquidationDeadline,
					});
				});
				describe('when deadline has passed and Alice issuance ratio is fixed as SNX price increases', () => {
					beforeEach(async () => {
						const delay = await liquidations.liquidationDelay();

						// fast forward to after deadline
						await fastForward(delay + 100);

						await updateSNXPrice(toUnit('6'));

						const liquidationRatio = await liquidations.liquidationRatio();

						const ratio = await synthetix.collateralisationRatio(alice);
						const targetIssuanceRatio = await synthetixState.issuanceRatio();

						// check Alice ratio is below liquidation ratio
						assert.isTrue(ratio.lt(liquidationRatio));

						// check Alice ratio is below or equal to target issuance ratio
						assert.isTrue(ratio.lte(targetIssuanceRatio));
					});
					it('then isLiquidationDeadlinePassed returns true', async () => {
						assert.isTrue(await liquidations.isLiquidationDeadlinePassed(alice));
					});
					it('then isOpenForLiquidation returns false as ratio equal to target issuance ratio', async () => {
						assert.isFalse(await liquidations.isOpenForLiquidation(alice));
					});
				});
				describe('given Alice issuance ratio is higher than the liquidation ratio', () => {
					let liquidationRatio;
					beforeEach(async () => {
						liquidationRatio = await liquidations.liquidationRatio();

						const ratio = await synthetix.collateralisationRatio(alice);
						const targetIssuanceRatio = await synthetixState.issuanceRatio();

						// check Alice ratio is above or equal liquidation ratio
						assert.isTrue(ratio.gte(liquidationRatio));

						// check Alice ratio is above target issuance ratio
						assert.isTrue(ratio.gt(targetIssuanceRatio));
					});
					describe('when the liquidation deadline has not passed', () => {
						it('then isOpenForLiquidation returns false as deadline not passed', async () => {
							assert.isFalse(await liquidations.isOpenForLiquidation(alice));
						});
						it('then isLiquidationDeadlinePassed returns false', async () => {
							assert.isFalse(await liquidations.isLiquidationDeadlinePassed(alice));
						});
					});
					describe('fast forward 2 weeks, when the liquidation deadline has passed', () => {
						beforeEach(async () => {
							const delay = await liquidations.liquidationDelay();

							await fastForward(delay + 100);
						});
						it('then isLiquidationDeadlinePassed returns true', async () => {
							assert.isTrue(await liquidations.isLiquidationDeadlinePassed(alice));
						});
						it('then isOpenForLiquidation returns true', async () => {
							assert.isTrue(await liquidations.isOpenForLiquidation(alice));
						});
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
						it('then Alice liquidation entry is removed', async () => {
							const deadline = await liquidations.getLiquidationDeadlineForAccount(alice);
							assert.bnEqual(deadline, 0);
						});
						it('then Alices account is not open for liquidation', async () => {
							const isOpenForLiquidation = await liquidations.isOpenForLiquidation(alice);
							assert.bnEqual(isOpenForLiquidation, false);
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
							assert.bnEqual(await synthetix.collateral(alice), toUnit('800'));
						});
					});

					describe('when Alice burnSynthsToTarget to fix her c-ratio ', () => {
						let burnTransaction;
						beforeEach(async () => {
							await updateSNXPrice('1');
							burnTransaction = await synthetix.burnSynthsToTarget({ from: alice });
						});
						// TODO: AccountRemovedFromLiquidation is emitted off the Liquidations contract
						xit('then AccountRemovedFromLiquidation event is emitted', async () => {
							assert.eventEqual(burnTransaction, 'AccountRemovedFromLiquidation', {
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
					describe('when Alice burnSynths and her c-ratio is still below issuance ratio', () => {
						let aliceDebtBalance;
						let amountToBurn;
						beforeEach(async () => {
							await updateSNXPrice('1');
							aliceDebtBalance = await synthetix.debtBalanceOf(alice, sUSD);
							amountToBurn = toUnit('10');
							await synthetix.burnSynths(amountToBurn, { from: alice });
						});
						it('then alice debt balance is less amountToBurn', async () => {
							assert.bnEqual(
								await synthetix.debtBalanceOf(alice, sUSD),
								aliceDebtBalance.sub(amountToBurn)
							);
						});
						it('then Alice liquidation entry is still there', async () => {
							const deadline = await liquidations.getLiquidationDeadlineForAccount(alice);
							assert.isTrue(deadline > 0);
						});
						it('then Alices account is still open for liquidation', async () => {
							const isOpenForLiquidation = await liquidations.isOpenForLiquidation(alice);
							assert.isTrue(isOpenForLiquidation);
						});
					});
					describe('when Alice burnSynths and her c-ratio is above issuance ratio', () => {
						let aliceDebtBalance;
						let amountToBurn;
						beforeEach(async () => {
							await updateSNXPrice('1');
							aliceDebtBalance = await synthetix.debtBalanceOf(alice, sUSD);

							const maxIssuableSynths = await synthetix.maxIssuableSynths(alice);
							amountToBurn = aliceDebtBalance.sub(maxIssuableSynths).abs();

							await synthetix.burnSynths(amountToBurn, { from: alice });
						});
						it('then alice debt balance is less amountToBurn', async () => {
							assert.bnEqual(
								await synthetix.debtBalanceOf(alice, sUSD),
								aliceDebtBalance.sub(amountToBurn)
							);
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
					describe('when Alice burns all her debt to fix her c-ratio', () => {
						let aliceDebtBalance;
						let burnTransaction;
						beforeEach(async () => {
							await updateSNXPrice('1');

							aliceDebtBalance = await synthetix.debtBalanceOf(alice, sUSD);

							burnTransaction = await synthetix.burnSynths(aliceDebtBalance, { from: alice });
						});
						it('then alice has no more debt', async () => {
							assert.bnEqual(toUnit(0), await synthetix.debtBalanceOf(alice, sUSD));
						});
						xit('then AccountRemovedFromLiquidation event is emitted', async () => {
							assert.eventEqual(burnTransaction, 'AccountRemovedFromLiquidation', {
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
						describe('when Bobs liquidates alice for 100 sUSD but only has 99 sUSD then revert', async () => {
							const sUSD99 = toUnit('99');
							beforeEach(async () => {
								// send bob some SNX
								await synthetix.transfer(bob, toUnit('10000'), {
									from: owner,
								});

								await synthetix.issueSynths(sUSD99, { from: bob });

								assert.bnEqual(await sUSDContract.balanceOf(bob), sUSD99);
							});

							it('it should revert', async () => {
								await assert.revert(
									synthetix.liquidateDelinquentAccount(alice, sUSD100, { from: bob }),
									'Not enough sUSD'
								);
							});
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
							let bobSNXBefore;
							beforeEach(async () => {
								// send bob some SNX
								await synthetix.transfer(bob, toUnit('1000'), {
									from: owner,
								});

								await synthetix.issueSynths(sUSD100, { from: bob });

								assert.bnEqual(await sUSDContract.balanceOf(bob), sUSD100);

								// Record Alices state
								aliceDebtBefore = await synthetix.debtBalanceOf(alice, sUSD);
								aliceSNXBefore = await synthetix.collateral(alice);

								// Record Bob's state
								bobSNXBefore = await synthetix.balanceOf(bob);

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
								const aliceSNXAfter = await synthetix.collateral(alice);
								const difference = aliceSNXBefore.sub(aliceSNXAfter);
								assert.bnEqual(difference, SNX110);
							});
							it('then Bob has extra 100 SNX + the 10 SNX penalty (110)', async () => {
								const snxBalance = await synthetix.balanceOf(bob);
								assert.bnEqual(snxBalance, bobSNXBefore.add(SNX110));
							});
							it('then Alice SNX balance is 690', async () => {
								const aliceSNXAfter = await synthetix.collateral(alice);
								assert.bnEqual(aliceSNXAfter, toUnit('690'));
							});
							it('then Alice issuance ratio is updated in feePoolState', async () => {
								const accountsDebtEntry = await feePoolState.getAccountsDebtEntry(alice, 0);
								const issuanceState = await synthetixState.issuanceData(alice);

								assert.bnEqual(
									issuanceState.initialDebtOwnership,
									accountsDebtEntry.debtPercentage
								);

								assert.bnEqual(issuanceState.debtEntryIndex, accountsDebtEntry.debtEntryIndex);
							});
							describe('given carol has obtained sUSD to liquidate alice', () => {
								const sUSD5 = toUnit('5');
								const sUSD50 = toUnit('50');
								const SNX55 = toUnit('55');
								let carolSNXBefore;
								beforeEach(async () => {
									// send Carol some SNX for sUSD
									await synthetix.transfer(carol, toUnit('1000'), {
										from: owner,
									});

									await synthetix.issueSynths(sUSD50, { from: carol });
									assert.bnEqual(await sUSDContract.balanceOf(carol), sUSD50);

									// Record Alices state
									aliceDebtBefore = await synthetix.debtBalanceOf(alice, sUSD);
									aliceSNXBefore = await synthetix.collateral(alice);

									// Record Carol State
									carolSNXBefore = await synthetix.balanceOf(carol);
								});
								describe('when carol liquidates Alice with 10 x 5 sUSD', () => {
									beforeEach(async () => {
										await Promise.all(
											Array(10)
												.fill(0)
												.map(() =>
													synthetix.liquidateDelinquentAccount(alice, sUSD5, { from: carol })
												)
										);
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
										const aliceSNXAfter = await synthetix.collateral(alice);
										const difference = aliceSNXBefore.sub(aliceSNXAfter);
										assert.bnEqual(difference, SNX55);
									});
									it('then Carol has extra 50 SNX + the 5 SNX penalty (55)', async () => {
										const snxBalance = await synthetix.balanceOf(carol);
										assert.bnEqual(snxBalance, carolSNXBefore.add(SNX55));
									});
									it('then Alice SNX balance is 635', async () => {
										const aliceSNXAfter = await synthetix.collateral(alice);
										assert.bnEqual(aliceSNXAfter, toUnit('635'));
									});
									it('then Alice issuance ratio is updated in feePoolState', async () => {
										const accountsDebtEntry = await feePoolState.getAccountsDebtEntry(alice, 0);
										const issuanceState = await synthetixState.issuanceData(alice);

										assert.bnEqual(
											issuanceState.initialDebtOwnership,
											accountsDebtEntry.debtPercentage
										);

										assert.bnEqual(issuanceState.debtEntryIndex, accountsDebtEntry.debtEntryIndex);
									});
								});
								describe('when carol liquidates Alice with 50 sUSD', () => {
									let liquidationTransaction;
									beforeEach(async () => {
										liquidationTransaction = await synthetix.liquidateDelinquentAccount(
											alice,
											sUSD50,
											{ from: carol }
										);
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
										const aliceSNXAfter = await synthetix.collateral(alice);
										const difference = aliceSNXBefore.sub(aliceSNXAfter);
										assert.bnEqual(difference, SNX55);
									});
									it('then Carol has extra 50 SNX + the 5 SNX penalty (55)', async () => {
										const snxBalance = await synthetix.balanceOf(carol);
										assert.bnEqual(snxBalance, carolSNXBefore.add(SNX55));
									});
									it('then Alice SNX balance is 635', async () => {
										const aliceSNXAfter = await synthetix.collateral(alice);
										assert.bnEqual(aliceSNXAfter, toUnit('635'));
									});
									it('then Alice issuance ratio is updated in feePoolState', async () => {
										const accountsDebtEntry = await feePoolState.getAccountsDebtEntry(alice, 0);
										const issuanceState = await synthetixState.issuanceData(alice);

										assert.bnEqual(
											issuanceState.initialDebtOwnership,
											accountsDebtEntry.debtPercentage
										);

										assert.bnEqual(issuanceState.debtEntryIndex, accountsDebtEntry.debtEntryIndex);
									});
									it('then events AccountLiquidated are emitted', async () => {
										assert.eventEqual(liquidationTransaction, 'AccountLiquidated', {
											account: alice,
											snxRedeemed: SNX55,
											amountLiquidated: sUSD50,
											liquidator: carol,
										});
									});
									describe('when Bob liqudates Alice with 1000 sUSD', () => {
										const sUSD1000 = toUnit('1000');
										let liquidationTransaction;
										let bobSynthBalanceBefore;
										beforeEach(async () => {
											// send Bob some SNX for sUSD
											await synthetix.transfer(bob, toUnit('10000'), {
												from: owner,
											});

											await synthetix.issueSynths(sUSD1000, { from: bob });

											bobSynthBalanceBefore = await sUSDContract.balanceOf(bob);
											assert.bnEqual(bobSynthBalanceBefore, sUSD1000);

											// Record Alices state
											aliceDebtBefore = await synthetix.debtBalanceOf(alice, sUSD);
											aliceSNXBefore = await synthetix.collateral(alice);

											// Bob Liquidates Alice
											liquidationTransaction = await synthetix.liquidateDelinquentAccount(
												alice,
												sUSD1000,
												{
													from: bob,
												}
											);
										});
										it('then Bobs partially liquidates the 1000 sUSD to repair Alice to target issuance ratio', async () => {
											const susdToFixRatio = await liquidations.calculateAmountToFixCollateral(
												aliceDebtBefore,
												aliceSNXBefore
											);

											const aliceDebtAfter = await synthetix.debtBalanceOf(alice, sUSD);
											assert.bnEqual(aliceDebtAfter, aliceDebtBefore.sub(susdToFixRatio));

											const bobSynthBalanceAfter = await sUSDContract.balanceOf(bob);
											assert.bnEqual(
												bobSynthBalanceAfter,
												bobSynthBalanceBefore.sub(susdToFixRatio)
											);
										});
										it('then Alice liquidation entry is removed', async () => {
											const deadline = await liquidations.getLiquidationDeadlineForAccount(alice);
											assert.bnEqual(deadline, 0);
										});
										it('then Alices account is not open for liquidation', async () => {
											const isOpenForLiquidation = await liquidations.isOpenForLiquidation(alice);
											assert.bnEqual(isOpenForLiquidation, false);
										});
										it('then events AccountLiquidated & AccountRemovedFromLiquidation are emitted', async () => {
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
												// 'AccountRemovedFromLiquidation', // TODO this should be emitted from liquidation in this test case
												// {
												// 	account: alice,
												// }
											);
										});
										it('then Alice issuanceRatio is now at the target issuanceRatio', async () => {
											const aliceCRatioAfter = await synthetix.collateralisationRatio(alice);
											const issuanceRatio = await synthetixState.issuanceRatio();
											assert.bnEqual(aliceCRatioAfter, issuanceRatio);
										});
									});
								});
							});
						});
						describe('given Alice has $600 Debt, $800 worth of SNX Collateral and c-ratio at 133.33%', () => {
							describe('when bob calls liquidate on Alice in multiple calls until fixing the ratio', () => {
								const sUSD1000 = toUnit('1000');
								let aliceDebtBefore;
								let aliceCollateralBefore;
								let bobSynthBalanceBefore;
								let amountToFixRatio;
								beforeEach(async () => {
									// send bob some SNX
									await synthetix.transfer(bob, toUnit('10000'), {
										from: owner,
									});

									await synthetix.issueSynths(sUSD1000, { from: bob });

									// Record Bob's state
									bobSynthBalanceBefore = await sUSDContract.balanceOf(bob);

									assert.bnEqual(bobSynthBalanceBefore, sUSD1000);

									// Record Alices state
									aliceDebtBefore = await synthetix.debtBalanceOf(alice, sUSD);
									aliceCollateralBefore = await synthetix.collateral(alice);

									// Calc amount to fix ratio
									amountToFixRatio = await liquidations.calculateAmountToFixCollateral(
										aliceDebtBefore,
										aliceCollateralBefore
									);
								});
								it('then Bob can liquidate Alice multiple times until fixing the c-ratio', async () => {
									const liquidateAmount = toUnit('50');
									let iterations = Math.floor(amountToFixRatio.div(liquidateAmount));

									// loop through until just less than amountToFixRato
									while (iterations > 0) {
										await synthetix.liquidateDelinquentAccount(alice, liquidateAmount, {
											from: bob,
										});

										iterations--;
									}

									// Should be able to liquidate one last time and fix c-ratio
									await synthetix.liquidateDelinquentAccount(alice, liquidateAmount, {
										from: bob,
									});

									// Alice should have liquidations closed
									assert.isFalse(await liquidations.isOpenForLiquidation(alice));

									// Alice should have liquidation entry removed
									assert.bnEqual(await liquidations.getLiquidationDeadlineForAccount(david), 0);

									// Bob's sUSD balance should be less amountToFixRatio
									assert.bnEqual(
										await sUSDContract.balanceOf(bob),
										bobSynthBalanceBefore.sub(amountToFixRatio)
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
				liquidations.flagAccountForLiquidation(alice),
				'Account issuance ratio is less than liquidation ratio'
			);
		});
		it('then liquidateDelinquentAccount fails', async () => {
			await assert.revert(
				synthetix.liquidateDelinquentAccount(alice, sUSD100),
				'Account not open for liquidation'
			);
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
			const issuanceRatio = await synthetix.collateralisationRatio(david);

			assert.isTrue(issuanceRatio.gt(toUnit('1')));

			davidDebtBefore = await synthetix.debtBalanceOf(david, sUSD);
			davidCollateralBefore = await synthetix.collateral(david);
			const collateralInUSD = await exchangeRates.effectiveValue(SNX, davidCollateralBefore, sUSD);

			assert.isTrue(davidDebtBefore.gt(collateralInUSD));
		});
		describe('when Bob flags and tries to liquidate Cavid', () => {
			beforeEach(async () => {
				// flag account for liquidation
				await liquidations.flagAccountForLiquidation(david, {
					from: bob,
				});

				// fastForward to after liquidation delay
				const liquidationDeadline = await liquidations.getLiquidationDeadlineForAccount(david);
				await fastForwardAndUpdateRates(liquidationDeadline + 1);

				// Drop SNX value to $0.1 after update rates resets to default
				await updateSNXPrice('0.1');
			});
			it('then david is openForLiquidatoin', async () => {
				assert.isTrue(await liquidations.isOpenForLiquidation(david));
			});
			describe('when Bob liquidates all of davids collateral', async () => {
				const sUSD600 = toUnit('600');
				beforeEach(async () => {
					await synthetix.transfer(bob, toUnit('100000'), {
						from: owner,
					});
					await synthetix.issueSynths(sUSD600, { from: bob });

					await synthetix.liquidateDelinquentAccount(david, sUSD600, {
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
					const davidDebt = await synthetix.debtBalanceOf(david, sUSD);
					assert.isTrue(davidDebt.gt(0));
				});
				it('then David wont be open for liquidation', async () => {
					assert.isFalse(await liquidations.isOpenForLiquidation(david));
				});
				describe('then David should be able to check and remove liquidation flag as no more collateral left', () => {
					let removeFlagTransaction;
					beforeEach(async () => {
						removeFlagTransaction = await liquidations.checkAndRemoveAccountInLiquidation(david, {
							from: owner,
						});
					});
					it('then David liquidation entry is removed', async () => {
						const deadline = await liquidations.getLiquidationDeadlineForAccount(david);
						assert.bnEqual(deadline, 0);
					});
					it('then David account is not open for liquidation', async () => {
						assert.isFalse(await liquidations.isOpenForLiquidation(david));
					});
					it('then events AccountRemovedFromLiquidation are emitted', async () => {
						assert.eventEqual(removeFlagTransaction, 'AccountRemovedFromLiquidation', {
							account: david,
						});
					});
				});
			});
		});
	});
});
