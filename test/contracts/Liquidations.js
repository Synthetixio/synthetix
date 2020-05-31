'use strict';

const { contract } = require('@nomiclabs/buidler');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts, setupContract } = require('./setup');

const { currentTime, multiplyDecimal, divideDecimal, toUnit, fastForward } = require('../utils')();

const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

const { toBytes32 } = require('../..');

contract('Liquidations', accounts => {
	const [sUSD, SNX] = ['sUSD', 'SNX'].map(toBytes32);
	const [deployerAccount, owner, oracle, account1, alice, bob, carol] = accounts;
	const [week, month] = [604800, 2629743];

	let addressResolver,
		exchangeRates,
		issuer,
		issuanceEternalStorage,
		liquidations,
		eternalStorageLiquidations,
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
			Issuer: issuer,
			IssuanceEternalStorage: issuanceEternalStorage,
			Liquidations: liquidations,
			EternalStorageLiquidations: eternalStorageLiquidations,
			SynthsUSD: sUSDContract,
			Synthetix: synthetix,
			SynthetixState: synthetixState,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'AddressResolver',
				'ExchangeRates',
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

	beforeEach(async () => {
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
					args: [200],
					address: owner,
					accounts,
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('setLiquidationPenalty() can only be invoked by owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.setLiquidationPenalty,
					args: [20],
					address: owner,
					accounts,
					reason: 'Only the contract owner may perform this action',
				});
			});
			describe('when setting properties outside of the bounds', () => {
				it('when setLiquidationDelay is set to 0 then revert');
				it('when setLiquidationDelay is set above 1 month then revert');
				it('when setLiquidationRatio is set above MAX_LIQUIDATION_RATIO then revert', async () => {
					const MAX_LIQUIDATION_RATIO = await liquidations.MAX_LIQUIDATION_RATIO();
					const newLiquidationRatio = MAX_LIQUIDATION_RATIO.add(toUnit('1'));

					await assert.revert(
						liquidations.setLiquidationRatio(newLiquidationRatio, {
							from: owner,
						}),
						'ratio >= MAX_LIQUIDATION_RATIO'
					);
				});
				it('when setLiquidationPenalty is set above MAX_LIQUIDATION_PENALTY then revert', async () => {
					const MAX_LIQUIDATION_PENALTY = await liquidations.MAX_LIQUIDATION_PENALTY();
					const newLiquidationPenalty = MAX_LIQUIDATION_PENALTY.add(toUnit('1'));
					await assert.revert(
						liquidations.setLiquidationPenalty(newLiquidationPenalty, {
							from: owner,
						}),
						'penalty >= MAX_LIQUIDATION_PENALTY'
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
			xit('removeAccountInLiquidation() can only be invoked by synthetix', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.removeAccountInLiquidation,
					args: [alice],
					address: owner,
					accounts,
					reason: 'Liquidations: Only the synthetix or Issuer contract can perform this action',
				});
			});
			xit('removeAccountInLiquidation() can only be invoked by issuer', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: liquidations.removeAccountInLiquidation,
					args: [alice],
					address: owner,
					accounts,
					reason: 'Liquidations: Only the synthetix or Issuer contract can perform this action',
				});
			});
		});
	});
	describe('calculateAmountToFixCollateral', () => {
		let ratio;
		let penalty;
		describe('given target ratio of 800%', () => {
			beforeEach(async () => {
				ratio = toUnit('0.125');

				await synthetixState.setIssuanceRatio(ratio, { from: owner });
			});
			describe('given liquidation penalty is 100%', () => {
				beforeEach(() => {
					penalty = toUnit('1');
				});
				it('should take all the collateral to burn debt', async () => {
					const collateralBefore = toUnit('600');
					const debtBefore = toUnit('300');

					// amount of debt to burn to fix is all debt
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
			describe('given liquidation penalty is 10%', () => {
				beforeEach(() => {
					penalty = toUnit('0.1');
				});
				it('calculates sUSD to fix ratio from 200%, with $600 SNX collateral and $300 debt', async () => {
					const collateralBefore = toUnit('600');
					const debtBefore = toUnit('300');
					const expectedAmount = toUnit('260.869565217391304347');

					// amount of debt to burn to fix is all debt
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
					const collateralBefore = toUnit('600');
					const debtBefore = toUnit('200');
					const expectedAmount = toUnit('144.927536231884057971');

					// amount of debt to burn to fix is all debt
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
	describe('given Alice is undercollateralized', () => {
		beforeEach(async () => {
			// SNX is 6 dolla
			await exchangeRates.updateRates([SNX], ['6'].map(toUnit), timestamp, {
				from: oracle,
			});
			// Alice issues sUSD wen SNX 6 dolla
			await synthetix.transfer(alice, toUnit('10000'), { from: owner });
			await synthetix.issueMaxSynths({ from: alice });

			// Drop SNX value to $.1
			await exchangeRates.updateRates([SNX], ['.1'].map(toUnit), timestamp, {
				from: oracle,
			});
		});
		describe('when bob flags Alice for liquidation', () => {
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
			describe('given Alice does not fix her c ratio and 2 weeks have passed', () => {
				beforeEach(async () => {
					fastForwardAndUpdateRates(week * 2.1);
				});
				it('then isOpenForLiquidation returns true for Alice', async () => {
					const isOpenForLiquidation = await liquidations.isOpenForLiquidation(alice);
					assert.equal(isOpenForLiquidation, true);
				});
				describe('when bob calls liquidateDelinquentAccount and burns 100 sUSD to liquidate SNX', () => {
					const sUSD100 = toUnit('100');
					let aliceDebtBefore;

					beforeEach(async () => {
						aliceDebtBefore = await synthetix.debtBalanceOf(alice, sUSD);
						// Get Bob some sUSD
						await sUSDContract.issue(bob, sUSD100, {
							from: owner,
						});
						assert.bnEqual(await sUSDContract.balanceOf(bob), sUSD100);

						// Liquidate Alice
						await synthetix.liquidateDelinquentAccount(alice, sUSD100);
					});

					it('then Bob sUSD balance is reduced by 100 sUSD', async () => {
						assert.bnEqual(await sUSDContract.balanceOf(bob), 0);
					});
					xit('then Bob has 100 sUSD worth SNX + the penalty', async () => {
						const snxBalance = await synthetix.balanceOf(bob);
						console.log(snxBalance, snxBalance.toString());
					});
					xit('then Alice debt is reduced by 100 sUSD', async () => {
						const aliceDebtAfter = await synthetix.debtBalanceOf(alice, sUSD);
						const difference = aliceDebtBefore - aliceDebtAfter;
						assert.bnEqual(difference, sUSD100);
					});
					it('then Alice has less SNX + penalty');
				});
			});
		});
	});
});
