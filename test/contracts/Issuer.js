'use strict';

const { artifacts, contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const { setupAllContracts, mockToken } = require('./setup');

const MockEtherWrapper = artifacts.require('MockEtherWrapper');

const {
	currentTime,
	multiplyDecimal,
	divideDecimalRound,
	divideDecimal,
	toUnit,
	fastForward,
} = require('../utils')();

const {
	setExchangeWaitingPeriod,
	setExchangeFeeRateForSynths,
	getDecodedLogs,
	decodedEventEqual,
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	setStatus,
} = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
	defaults: { ISSUANCE_RATIO, MINIMUM_STAKE_TIME, DYNAMIC_FEE_ROUNDS },
} = require('../..');

contract('Issuer (via Synthetix)', async accounts => {
	const WEEK = 604800;

	const [sUSD, sAUD, sEUR, SNX, sETH, ETH] = ['sUSD', 'sAUD', 'sEUR', 'SNX', 'sETH', 'ETH'].map(
		toBytes32
	);
	const synthKeys = [sUSD, sAUD, sEUR, sETH, SNX];

	const [, owner, oracle, account1, account2, account3, account6] = accounts;

	let synthetix,
		systemStatus,
		systemSettings,
		synthetixState,
		delegateApprovals,
		exchangeRates,
		feePool,
		sUSDContract,
		sETHContract,
		sEURContract,
		sAUDContract,
		escrow,
		rewardEscrowV2,
		timestamp,
		debtCache,
		issuer,
		synths,
		addressResolver,
		synthRedeemer,
		exchanger;

	const getRemainingIssuableSynths = async account =>
		(await synthetix.remainingIssuableSynths(account))[0];

	// run this once before all tests to prepare our environment, snapshots on beforeEach will take
	// care of resetting to this state
	before(async () => {
		synths = ['sUSD', 'sAUD', 'sEUR', 'sETH'];
		({
			Synthetix: synthetix,
			SynthetixState: synthetixState,
			SystemStatus: systemStatus,
			SystemSettings: systemSettings,
			ExchangeRates: exchangeRates,
			SynthetixEscrow: escrow,
			RewardEscrowV2: rewardEscrowV2,
			SynthsUSD: sUSDContract,
			SynthsETH: sETHContract,
			SynthsAUD: sAUDContract,
			SynthsEUR: sEURContract,
			Exchanger: exchanger,
			FeePool: feePool,
			DebtCache: debtCache,
			Issuer: issuer,
			DelegateApprovals: delegateApprovals,
			AddressResolver: addressResolver,
			SynthRedeemer: synthRedeemer,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'Synthetix',
				'ExchangeRates',
				'FeePool',
				'FeePoolEternalStorage',
				'AddressResolver',
				'RewardEscrowV2',
				'SynthetixEscrow',
				'SystemSettings',
				'Issuer',
				'DebtCache',
				'Exchanger', // necessary for burnSynths to check settlement of sUSD
				'DelegateApprovals', // necessary for *OnBehalf functions
				'FlexibleStorage',
				'CollateralManager',
				'SynthRedeemer',
			],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		timestamp = await currentTime();

		for (let i = 0; i < DYNAMIC_FEE_ROUNDS; i++) {
			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX, sETH],
				['0.5', '1.25', '0.1', '200'].map(toUnit),
				timestamp,
				{ from: oracle }
			);
		}

		// set a 0.3% default exchange fee rate
		const exchangeFeeRate = toUnit('0.003');
		await setExchangeFeeRateForSynths({
			owner,
			systemSettings,
			synthKeys,
			exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
		});
		await debtCache.takeDebtSnapshot();
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: issuer.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'addSynth',
				'addSynths',
				'burnForRedemption',
				'burnSynths',
				'burnSynthsOnBehalf',
				'burnSynthsToTarget',
				'burnSynthsToTargetOnBehalf',
				'issueMaxSynths',
				'issueMaxSynthsOnBehalf',
				'issueSynths',
				'issueSynthsOnBehalf',
				'liquidateDelinquentAccount',
				'removeSynth',
				'removeSynths',
			],
		});
	});

	it('minimum stake time is correctly configured as a default', async () => {
		assert.bnEqual(await issuer.minimumStakeTime(), MINIMUM_STAKE_TIME);
	});

	it('issuance ratio is correctly configured as a default', async () => {
		assert.bnEqual(await issuer.issuanceRatio(), ISSUANCE_RATIO);
	});

	describe('protected methods', () => {
		it('issueSynths() cannot be invoked directly by a user', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: issuer.issueSynths,
				args: [account1, toUnit('1')],
				accounts,
				reason: 'Only the synthetix contract can perform this action',
			});
		});
		it('issueSynthsOnBehalf() cannot be invoked directly by a user', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: issuer.issueSynthsOnBehalf,
				args: [account1, account2, toUnit('1')],
				accounts,
				reason: 'Only the synthetix contract can perform this action',
			});
		});
		it('issueMaxSynths() cannot be invoked directly by a user', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: issuer.issueMaxSynths,
				args: [account1],
				accounts,
				reason: 'Only the synthetix contract can perform this action',
			});
		});
		it('issueMaxSynthsOnBehalf() cannot be invoked directly by a user', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: issuer.issueMaxSynthsOnBehalf,
				args: [account1, account2],
				accounts,
				reason: 'Only the synthetix contract can perform this action',
			});
		});
		it('burnSynths() cannot be invoked directly by a user', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: issuer.burnSynths,
				args: [account1, toUnit('1')],
				accounts,
				reason: 'Only the synthetix contract can perform this action',
			});
		});
		it('burnSynthsOnBehalf() cannot be invoked directly by a user', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: issuer.burnSynthsOnBehalf,
				args: [account1, account2, toUnit('1')],
				accounts,
				reason: 'Only the synthetix contract can perform this action',
			});
		});
		it('burnSynthsToTarget() cannot be invoked directly by a user', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: issuer.burnSynthsToTarget,
				args: [account1],
				accounts,
				reason: 'Only the synthetix contract can perform this action',
			});
		});
		it('liquidateDelinquentAccount() cannot be invoked directly by a user', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: issuer.liquidateDelinquentAccount,
				args: [account1, toUnit('1'), account2],
				accounts,
				reason: 'Only the synthetix contract can perform this action',
			});
		});
		it('burnSynthsToTargetOnBehalf() cannot be invoked directly by a user', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: issuer.burnSynthsToTargetOnBehalf,
				args: [account1, account2],
				accounts,
				reason: 'Only the synthetix contract can perform this action',
			});
		});
	});

	describe('when minimum stake time is set to 0', () => {
		beforeEach(async () => {
			// set minimumStakeTime on issue and burning to 0
			await systemSettings.setMinimumStakeTime(0, { from: owner });
		});
		describe('when the issuanceRatio is 0.2', () => {
			beforeEach(async () => {
				// set default issuance ratio of 0.2
				await systemSettings.setIssuanceRatio(toUnit('0.2'), { from: owner });
			});

			describe('minimumStakeTime - recording last issue and burn timestamp', async () => {
				let now;

				beforeEach(async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('1000'), { from: owner });

					now = await currentTime();
				});

				it('should issue synths and store issue timestamp after now', async () => {
					// issue synths
					await synthetix.issueSynths(web3.utils.toBN('5'), { from: account1 });

					// issue timestamp should be greater than now in future
					const issueTimestamp = await issuer.lastIssueEvent(owner);
					assert.ok(issueTimestamp.gte(now));
				});

				describe('require wait time on next burn synth after minting', async () => {
					it('should revert when burning any synths within minStakeTime', async () => {
						// set minimumStakeTime
						await systemSettings.setMinimumStakeTime(60 * 60 * 8, { from: owner });

						// issue synths first
						await synthetix.issueSynths(web3.utils.toBN('5'), { from: account1 });

						await assert.revert(
							synthetix.burnSynths(web3.utils.toBN('5'), { from: account1 }),
							'Minimum stake time not reached'
						);
					});
					it('should set minStakeTime to 120 seconds and able to burn after wait time', async () => {
						// set minimumStakeTime
						await systemSettings.setMinimumStakeTime(120, { from: owner });

						// issue synths first
						await synthetix.issueSynths(web3.utils.toBN('5'), { from: account1 });

						// fastForward 30 seconds
						await fastForward(10);

						await assert.revert(
							synthetix.burnSynths(web3.utils.toBN('5'), { from: account1 }),
							'Minimum stake time not reached'
						);

						// fastForward 115 seconds
						await fastForward(125);

						// burn synths
						await synthetix.burnSynths(web3.utils.toBN('5'), { from: account1 });
					});
				});
			});

			describe('totalIssuedSynths()', () => {
				describe('when exchange rates set', () => {
					beforeEach(async () => {
						await fastForward(10);
						// Send a price update to give the synth rates
						await exchangeRates.updateRates(
							[sAUD, sEUR, sETH, ETH, SNX],
							['0.5', '1.25', '100', '100', '2'].map(toUnit),
							await currentTime(),
							{ from: oracle }
						);
						await debtCache.takeDebtSnapshot();
					});

					describe('when numerous issues in one currency', () => {
						beforeEach(async () => {
							// as our synths are mocks, let's issue some amount to users
							await sUSDContract.issue(account1, toUnit('1000'));
							await sUSDContract.issue(account2, toUnit('100'));
							await sUSDContract.issue(account3, toUnit('10'));
							await sUSDContract.issue(account1, toUnit('1'));

							// and since we are are bypassing the usual issuance flow here, we must cache the debt snapshot
							assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('0'));
							await debtCache.takeDebtSnapshot();
						});
						it('then totalIssuedSynths in should correctly calculate the total issued synths in sUSD', async () => {
							assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('1111'));
						});
						it('and in another synth currency', async () => {
							assert.bnEqual(await synthetix.totalIssuedSynths(sAUD), toUnit('2222'));
						});
						it('and in SNX', async () => {
							assert.bnEqual(await synthetix.totalIssuedSynths(SNX), divideDecimal('1111', '2'));
						});
						it('and in a non-synth currency', async () => {
							assert.bnEqual(await synthetix.totalIssuedSynths(ETH), divideDecimal('1111', '100'));
						});
						it('and in an unknown currency, reverts', async () => {
							await assert.revert(
								synthetix.totalIssuedSynths(toBytes32('XYZ')),
								'SafeMath: division by zero'
							);
						});
					});

					describe('when numerous issues in many currencies', () => {
						beforeEach(async () => {
							// as our synths are mocks, let's issue some amount to users
							await sUSDContract.issue(account1, toUnit('1000'));

							await sAUDContract.issue(account1, toUnit('1000')); // 500 sUSD worth
							await sAUDContract.issue(account2, toUnit('1000')); // 500 sUSD worth

							await sEURContract.issue(account3, toUnit('80')); // 100 sUSD worth

							await sETHContract.issue(account1, toUnit('1')); // 100 sUSD worth

							// and since we are are bypassing the usual issuance flow here, we must cache the debt snapshot
							assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('0'));
							await debtCache.takeDebtSnapshot();
						});
						it('then totalIssuedSynths in should correctly calculate the total issued synths in sUSD', async () => {
							assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('2200'));
						});
						it('and in another synth currency', async () => {
							assert.bnEqual(await synthetix.totalIssuedSynths(sAUD), toUnit('4400', '2'));
						});
						it('and in SNX', async () => {
							assert.bnEqual(await synthetix.totalIssuedSynths(SNX), divideDecimal('2200', '2'));
						});
						it('and in a non-synth currency', async () => {
							assert.bnEqual(await synthetix.totalIssuedSynths(ETH), divideDecimal('2200', '100'));
						});
						it('and in an unknown currency, reverts', async () => {
							await assert.revert(
								synthetix.totalIssuedSynths(toBytes32('XYZ')),
								'SafeMath: division by zero'
							);
						});
					});
				});
			});

			describe('debtBalance()', () => {
				it('should not change debt balance % if exchange rates change', async () => {
					let newAUDRate = toUnit('0.5');
					let timestamp = await currentTime();
					await exchangeRates.updateRates([sAUD], [newAUDRate], timestamp, { from: oracle });
					await debtCache.takeDebtSnapshot();

					await synthetix.transfer(account1, toUnit('20000'), {
						from: owner,
					});
					await synthetix.transfer(account2, toUnit('20000'), {
						from: owner,
					});

					const amountIssuedAcc1 = toUnit('30');
					const amountIssuedAcc2 = toUnit('50');
					await synthetix.issueSynths(amountIssuedAcc1, { from: account1 });
					await synthetix.issueSynths(amountIssuedAcc2, { from: account2 });

					await synthetix.exchange(sUSD, amountIssuedAcc2, sAUD, { from: account2 });

					const PRECISE_UNIT = web3.utils.toWei(web3.utils.toBN('1'), 'gether');
					let totalIssuedSynthsUSD = await synthetix.totalIssuedSynths(sUSD);
					const account1DebtRatio = divideDecimal(
						amountIssuedAcc1,
						totalIssuedSynthsUSD,
						PRECISE_UNIT
					);
					const account2DebtRatio = divideDecimal(
						amountIssuedAcc2,
						totalIssuedSynthsUSD,
						PRECISE_UNIT
					);

					timestamp = await currentTime();
					newAUDRate = toUnit('1.85');
					await exchangeRates.updateRates([sAUD], [newAUDRate], timestamp, { from: oracle });
					await debtCache.takeDebtSnapshot();

					totalIssuedSynthsUSD = await synthetix.totalIssuedSynths(sUSD);
					const conversionFactor = web3.utils.toBN(1000000000);
					const expectedDebtAccount1 = multiplyDecimal(
						account1DebtRatio,
						totalIssuedSynthsUSD.mul(conversionFactor),
						PRECISE_UNIT
					).div(conversionFactor);
					const expectedDebtAccount2 = multiplyDecimal(
						account2DebtRatio,
						totalIssuedSynthsUSD.mul(conversionFactor),
						PRECISE_UNIT
					).div(conversionFactor);

					assert.bnClose(await synthetix.debtBalanceOf(account1, sUSD), expectedDebtAccount1);
					assert.bnClose(await synthetix.debtBalanceOf(account2, sUSD), expectedDebtAccount2);
				});

				it("should correctly calculate a user's debt balance without prior issuance", async () => {
					await synthetix.transfer(account1, toUnit('200000'), {
						from: owner,
					});
					await synthetix.transfer(account2, toUnit('10000'), {
						from: owner,
					});

					const debt1 = await synthetix.debtBalanceOf(account1, toBytes32('sUSD'));
					const debt2 = await synthetix.debtBalanceOf(account2, toBytes32('sUSD'));
					assert.bnEqual(debt1, 0);
					assert.bnEqual(debt2, 0);
				});

				it("should correctly calculate a user's debt balance with prior issuance", async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('200000'), {
						from: owner,
					});

					// Issue
					const issuedSynths = toUnit('1001');
					await synthetix.issueSynths(issuedSynths, { from: account1 });

					const debt = await synthetix.debtBalanceOf(account1, toBytes32('sUSD'));
					assert.bnEqual(debt, issuedSynths);
				});
			});

			describe('remainingIssuableSynths()', () => {
				it("should correctly calculate a user's remaining issuable synths with prior issuance", async () => {
					const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
					const issuanceRatio = await systemSettings.issuanceRatio();

					const issuedSynthetixs = web3.utils.toBN('200012');
					await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
						from: owner,
					});

					// Issue
					const amountIssued = toUnit('2011');
					await synthetix.issueSynths(amountIssued, { from: account1 });

					const expectedIssuableSynths = multiplyDecimal(
						toUnit(issuedSynthetixs),
						multiplyDecimal(snx2usdRate, issuanceRatio)
					).sub(amountIssued);

					const remainingIssuable = await getRemainingIssuableSynths(account1);
					assert.bnEqual(remainingIssuable, expectedIssuableSynths);
				});

				it("should correctly calculate a user's remaining issuable synths without prior issuance", async () => {
					const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
					const issuanceRatio = await systemSettings.issuanceRatio();

					const issuedSynthetixs = web3.utils.toBN('20');
					await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
						from: owner,
					});

					const expectedIssuableSynths = multiplyDecimal(
						toUnit(issuedSynthetixs),
						multiplyDecimal(snx2usdRate, issuanceRatio)
					);

					const remainingIssuable = await getRemainingIssuableSynths(account1);
					assert.bnEqual(remainingIssuable, expectedIssuableSynths);
				});
			});

			describe('maxIssuableSynths()', () => {
				it("should correctly calculate a user's maximum issuable synths without prior issuance", async () => {
					const rate = await exchangeRates.rateForCurrency(toBytes32('SNX'));
					const issuedSynthetixs = web3.utils.toBN('200000');
					await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
						from: owner,
					});
					const issuanceRatio = await systemSettings.issuanceRatio();

					const expectedIssuableSynths = multiplyDecimal(
						toUnit(issuedSynthetixs),
						multiplyDecimal(rate, issuanceRatio)
					);
					const maxIssuableSynths = await synthetix.maxIssuableSynths(account1);

					assert.bnEqual(expectedIssuableSynths, maxIssuableSynths);
				});

				it("should correctly calculate a user's maximum issuable synths without any SNX", async () => {
					const maxIssuableSynths = await synthetix.maxIssuableSynths(account1);
					assert.bnEqual(0, maxIssuableSynths);
				});

				it("should correctly calculate a user's maximum issuable synths with prior issuance", async () => {
					const snx2usdRate = await exchangeRates.rateForCurrency(SNX);

					const issuedSynthetixs = web3.utils.toBN('320001');
					await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
						from: owner,
					});

					const issuanceRatio = await systemSettings.issuanceRatio();
					const amountIssued = web3.utils.toBN('1234');
					await synthetix.issueSynths(toUnit(amountIssued), { from: account1 });

					const expectedIssuableSynths = multiplyDecimal(
						toUnit(issuedSynthetixs),
						multiplyDecimal(snx2usdRate, issuanceRatio)
					);

					const maxIssuableSynths = await synthetix.maxIssuableSynths(account1);
					assert.bnEqual(expectedIssuableSynths, maxIssuableSynths);
				});
			});

			describe('adding and removing synths', () => {
				it('should allow adding a Synth contract', async () => {
					const previousSynthCount = await synthetix.availableSynthCount();

					const { token: synth } = await mockToken({
						accounts,
						synth: 'sXYZ',
						skipInitialAllocation: true,
						supply: 0,
						name: 'XYZ',
						symbol: 'XYZ',
					});

					const txn = await issuer.addSynth(synth.address, { from: owner });

					const currencyKey = toBytes32('sXYZ');

					// Assert that we've successfully added a Synth
					assert.bnEqual(
						await synthetix.availableSynthCount(),
						previousSynthCount.add(web3.utils.toBN(1))
					);
					// Assert that it's at the end of the array
					assert.equal(await synthetix.availableSynths(previousSynthCount), synth.address);
					// Assert that it's retrievable by its currencyKey
					assert.equal(await synthetix.synths(currencyKey), synth.address);

					// Assert event emitted
					assert.eventEqual(txn.logs[0], 'SynthAdded', [currencyKey, synth.address]);
				});

				it('should disallow adding a Synth contract when the user is not the owner', async () => {
					const { token: synth } = await mockToken({
						accounts,
						synth: 'sXYZ',
						skipInitialAllocation: true,
						supply: 0,
						name: 'XYZ',
						symbol: 'XYZ',
					});

					await onlyGivenAddressCanInvoke({
						fnc: issuer.addSynth,
						accounts,
						args: [synth.address],
						address: owner,
						reason: 'Only the contract owner may perform this action',
					});
				});

				it('should disallow double adding a Synth contract with the same address', async () => {
					const { token: synth } = await mockToken({
						accounts,
						synth: 'sXYZ',
						skipInitialAllocation: true,
						supply: 0,
						name: 'XYZ',
						symbol: 'XYZ',
					});

					await issuer.addSynth(synth.address, { from: owner });
					await assert.revert(issuer.addSynth(synth.address, { from: owner }), 'Synth exists');
				});

				it('should disallow double adding a Synth contract with the same currencyKey', async () => {
					const { token: synth1 } = await mockToken({
						accounts,
						synth: 'sXYZ',
						skipInitialAllocation: true,
						supply: 0,
						name: 'XYZ',
						symbol: 'XYZ',
					});

					const { token: synth2 } = await mockToken({
						accounts,
						synth: 'sXYZ',
						skipInitialAllocation: true,
						supply: 0,
						name: 'XYZ',
						symbol: 'XYZ',
					});

					await issuer.addSynth(synth1.address, { from: owner });
					await assert.revert(issuer.addSynth(synth2.address, { from: owner }), 'Synth exists');
				});

				describe('when another synth is added with 0 supply', () => {
					let currencyKey, synth, synthProxy;

					beforeEach(async () => {
						const symbol = 'sBTC';
						currencyKey = toBytes32(symbol);

						({ token: synth, proxy: synthProxy } = await mockToken({
							synth: symbol,
							accounts,
							name: 'test',
							symbol,
							supply: 0,
							skipInitialAllocation: true,
						}));

						await issuer.addSynth(synth.address, { from: owner });
					});

					it('should be able to query multiple synth addresses', async () => {
						const synthAddresses = await issuer.getSynths([currencyKey, sETH, sUSD]);
						assert.equal(synthAddresses[0], synth.address);
						assert.equal(synthAddresses[1], sETHContract.address);
						assert.equal(synthAddresses[2], sUSDContract.address);
						assert.equal(synthAddresses.length, 3);
					});

					it('should allow removing a Synth contract when it has no issued balance', async () => {
						const synthCount = await synthetix.availableSynthCount();

						assert.notEqual(await synthetix.synths(currencyKey), ZERO_ADDRESS);

						const txn = await issuer.removeSynth(currencyKey, { from: owner });

						// Assert that we have one less synth, and that the specific currency key is gone.
						assert.bnEqual(
							await synthetix.availableSynthCount(),
							synthCount.sub(web3.utils.toBN(1))
						);
						assert.equal(await synthetix.synths(currencyKey), ZERO_ADDRESS);

						assert.eventEqual(txn, 'SynthRemoved', [currencyKey, synth.address]);
					});

					it('should disallow removing a token by a non-owner', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: issuer.removeSynth,
							args: [currencyKey],
							accounts,
							address: owner,
							reason: 'Only the contract owner may perform this action',
						});
					});

					describe('when that synth has issued but has no rate', () => {
						beforeEach(async () => {
							await synth.issue(account1, toUnit('100'));
						});
						it('should disallow removing a Synth contract when it has an issued balance and no rate', async () => {
							// Assert that we can't remove the synth now
							await assert.revert(
								issuer.removeSynth(currencyKey, { from: owner }),
								'Cannot remove synth to redeem without rate'
							);
						});
						describe('when the synth has a rate', () => {
							beforeEach(async () => {
								for (let i = 0; i < DYNAMIC_FEE_ROUNDS; i++) {
									await exchangeRates.updateRates([currencyKey], [toUnit('2')], timestamp, {
										from: oracle,
									});
								}
							});

							describe('when another user exchanges into the synth', () => {
								beforeEach(async () => {
									await sUSDContract.issue(account2, toUnit('1000'));
									await synthetix.exchange(sUSD, toUnit('100'), currencyKey, { from: account2 });
								});
								describe('when the synth is removed', () => {
									beforeEach(async () => {
										await issuer.removeSynth(currencyKey, { from: owner });
									});
									it('then settling works as expected', async () => {
										await synthetix.settle(currencyKey);

										const { numEntries } = await exchanger.settlementOwing(owner, currencyKey);
										assert.equal(numEntries, '0');
									});
									describe('when the rate is also removed', () => {
										beforeEach(async () => {
											await exchangeRates.deleteRate(currencyKey, { from: oracle });
										});
										it('then settling works as expected', async () => {
											await synthetix.settle(currencyKey);

											const { numEntries } = await exchanger.settlementOwing(owner, currencyKey);
											assert.equal(numEntries, '0');
										});
									});
								});
								describe('when the same user exchanges out of the synth', () => {
									beforeEach(async () => {
										await setExchangeWaitingPeriod({ owner, systemSettings, secs: 60 });
										// pass through the waiting period so we can exchange again
										await fastForward(90);
										await synthetix.exchange(currencyKey, toUnit('1'), sUSD, { from: account2 });
									});
									describe('when the synth is removed', () => {
										beforeEach(async () => {
											await issuer.removeSynth(currencyKey, { from: owner });
										});
										it('then settling works as expected', async () => {
											await synthetix.settle(sUSD);

											const { numEntries } = await exchanger.settlementOwing(owner, sUSD);
											assert.equal(numEntries, '0');
										});
										it('then settling from the original currency works too', async () => {
											await synthetix.settle(currencyKey);
											const { numEntries } = await exchanger.settlementOwing(owner, currencyKey);
											assert.equal(numEntries, '0');
										});
										describe('when the rate is also removed', () => {
											beforeEach(async () => {
												await exchangeRates.deleteRate(currencyKey, { from: oracle });
											});
											it('then settling works as expected', async () => {
												await synthetix.settle(currencyKey);

												const { numEntries } = await exchanger.settlementOwing(owner, currencyKey);
												assert.equal(numEntries, '0');
											});
											it('then settling from the original currency works too', async () => {
												await synthetix.settle(currencyKey);
												const { numEntries } = await exchanger.settlementOwing(owner, currencyKey);
												assert.equal(numEntries, '0');
											});
										});
									});
								});
							});

							describe('when a debt snapshot is taken', () => {
								let totalIssuedSynths;
								beforeEach(async () => {
									await debtCache.takeDebtSnapshot();

									totalIssuedSynths = await issuer.totalIssuedSynths(sUSD, true);

									// 100 sETH at 2 per sETH is 200 total debt
									assert.bnEqual(totalIssuedSynths, toUnit('200'));
								});
								describe('when the synth is removed', () => {
									let txn;
									beforeEach(async () => {
										// base conditions
										assert.equal(await sUSDContract.balanceOf(synthRedeemer.address), '0');
										assert.equal(await synthRedeemer.redemptions(synthProxy.address), '0');

										// now do the removal
										txn = await issuer.removeSynth(currencyKey, { from: owner });
									});
									it('emits an event', async () => {
										assert.eventEqual(txn, 'SynthRemoved', [currencyKey, synth.address]);
									});
									it('issues the equivalent amount of sUSD', async () => {
										const amountOfsUSDIssued = await sUSDContract.balanceOf(synthRedeemer.address);

										// 100 units of sBTC at a rate of 2:1
										assert.bnEqual(amountOfsUSDIssued, toUnit('200'));
									});
									it('it invokes deprecate on the redeemer via the proxy', async () => {
										const redeemRate = await synthRedeemer.redemptions(synthProxy.address);

										assert.bnEqual(redeemRate, toUnit('2'));
									});
									it('and total debt remains unchanged', async () => {
										assert.bnEqual(await issuer.totalIssuedSynths(sUSD, true), totalIssuedSynths);
									});
								});
							});
						});
					});
				});

				describe('multiple add/remove synths', () => {
					let currencyKey, synth;

					beforeEach(async () => {
						const symbol = 'sBTC';
						currencyKey = toBytes32(symbol);

						({ token: synth } = await mockToken({
							synth: symbol,
							accounts,
							name: 'test',
							symbol,
							supply: 0,
							skipInitialAllocation: true,
						}));

						await issuer.addSynth(synth.address, { from: owner });
					});

					it('should allow adding multiple Synth contracts at once', async () => {
						const previousSynthCount = await synthetix.availableSynthCount();

						const { token: synth1 } = await mockToken({
							accounts,
							synth: 'sXYZ',
							skipInitialAllocation: true,
							supply: 0,
							name: 'XYZ',
							symbol: 'XYZ',
						});

						const { token: synth2 } = await mockToken({
							accounts,
							synth: 'sABC',
							skipInitialAllocation: true,
							supply: 0,
							name: 'ABC',
							symbol: 'ABC',
						});

						const txn = await issuer.addSynths([synth1.address, synth2.address], { from: owner });

						const currencyKey1 = toBytes32('sXYZ');
						const currencyKey2 = toBytes32('sABC');

						// Assert that we've successfully added two Synths
						assert.bnEqual(
							await synthetix.availableSynthCount(),
							previousSynthCount.add(web3.utils.toBN(2))
						);
						// Assert that they're at the end of the array
						assert.equal(await synthetix.availableSynths(previousSynthCount), synth1.address);
						assert.equal(
							await synthetix.availableSynths(previousSynthCount.add(web3.utils.toBN(1))),
							synth2.address
						);
						// Assert that they are retrievable by currencyKey
						assert.equal(await synthetix.synths(currencyKey1), synth1.address);
						assert.equal(await synthetix.synths(currencyKey2), synth2.address);

						// Assert events emitted
						assert.eventEqual(txn.logs[0], 'SynthAdded', [currencyKey1, synth1.address]);
						assert.eventEqual(txn.logs[1], 'SynthAdded', [currencyKey2, synth2.address]);
					});

					it('should disallow multi-adding the same Synth contract', async () => {
						const { token: synth } = await mockToken({
							accounts,
							synth: 'sXYZ',
							skipInitialAllocation: true,
							supply: 0,
							name: 'XYZ',
							symbol: 'XYZ',
						});

						await assert.revert(
							issuer.addSynths([synth.address, synth.address], { from: owner }),
							'Synth exists'
						);
					});

					it('should disallow multi-adding synth contracts with the same currency key', async () => {
						const { token: synth1 } = await mockToken({
							accounts,
							synth: 'sXYZ',
							skipInitialAllocation: true,
							supply: 0,
							name: 'XYZ',
							symbol: 'XYZ',
						});

						const { token: synth2 } = await mockToken({
							accounts,
							synth: 'sXYZ',
							skipInitialAllocation: true,
							supply: 0,
							name: 'XYZ',
							symbol: 'XYZ',
						});

						await assert.revert(
							issuer.addSynths([synth1.address, synth2.address], { from: owner }),
							'Synth exists'
						);
					});

					it('should disallow removing non-existent synths', async () => {
						const fakeCurrencyKey = toBytes32('NOPE');

						// Assert that we can't remove the synth
						await assert.revert(
							issuer.removeSynths([currencyKey, fakeCurrencyKey], { from: owner }),
							'Synth does not exist'
						);
					});

					it('should disallow removing sUSD', async () => {
						// Assert that we can't remove sUSD
						await assert.revert(
							issuer.removeSynths([currencyKey, sUSD], { from: owner }),
							'Cannot remove synth'
						);
					});

					it('should allow removing synths with no balance', async () => {
						const symbol2 = 'sFOO';
						const currencyKey2 = toBytes32(symbol2);

						const { token: synth2 } = await mockToken({
							synth: symbol2,
							accounts,
							name: 'foo',
							symbol2,
							supply: 0,
							skipInitialAllocation: true,
						});

						await issuer.addSynth(synth2.address, { from: owner });

						const previousSynthCount = await synthetix.availableSynthCount();

						const tx = await issuer.removeSynths([currencyKey, currencyKey2], { from: owner });

						assert.bnEqual(
							await synthetix.availableSynthCount(),
							previousSynthCount.sub(web3.utils.toBN(2))
						);

						// Assert events emitted
						assert.eventEqual(tx.logs[0], 'SynthRemoved', [currencyKey, synth.address]);
						assert.eventEqual(tx.logs[1], 'SynthRemoved', [currencyKey2, synth2.address]);
					});
				});
			});

			describe('issuance', () => {
				describe('potential blocking conditions', () => {
					beforeEach(async () => {
						// ensure user has synths to issue from
						await synthetix.transfer(account1, toUnit('1000'), { from: owner });
					});

					['System', 'Issuance'].forEach(section => {
						describe(`when ${section} is suspended`, () => {
							beforeEach(async () => {
								await setStatus({ owner, systemStatus, section, suspend: true });
							});
							it('then calling issue() reverts', async () => {
								await assert.revert(
									synthetix.issueSynths(toUnit('1'), { from: account1 }),
									'Operation prohibited'
								);
							});
							it('and calling issueMaxSynths() reverts', async () => {
								await assert.revert(
									synthetix.issueMaxSynths({ from: account1 }),
									'Operation prohibited'
								);
							});
							describe(`when ${section} is resumed`, () => {
								beforeEach(async () => {
									await setStatus({ owner, systemStatus, section, suspend: false });
								});
								it('then calling issue() succeeds', async () => {
									await synthetix.issueSynths(toUnit('1'), { from: account1 });
								});
								it('and calling issueMaxSynths() succeeds', async () => {
									await synthetix.issueMaxSynths({ from: account1 });
								});
							});
						});
					});
					['SNX', 'sAUD', ['SNX', 'sAUD'], 'none'].forEach(type => {
						describe(`when ${type} is stale`, () => {
							beforeEach(async () => {
								await fastForward(
									(await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300'))
								);

								// set all rates minus those to ignore
								const ratesToUpdate = ['SNX']
									.concat(synths)
									.filter(key => key !== 'sUSD' && ![].concat(type).includes(key));

								const timestamp = await currentTime();

								await exchangeRates.updateRates(
									ratesToUpdate.map(toBytes32),
									ratesToUpdate.map(() => toUnit('1')),
									timestamp,
									{
										from: oracle,
									}
								);
								await debtCache.takeDebtSnapshot();
							});

							if (type === 'none') {
								it('then calling issueSynths succeeds', async () => {
									await synthetix.issueSynths(toUnit('1'), { from: account1 });
								});
								it('and calling issueMaxSynths() succeeds', async () => {
									await synthetix.issueMaxSynths({ from: account1 });
								});
							} else {
								it('reverts on issueSynths()', async () => {
									await assert.revert(
										synthetix.issueSynths(toUnit('1'), { from: account1 }),
										'A synth or SNX rate is invalid'
									);
								});
								it('reverts on issueMaxSynths()', async () => {
									await assert.revert(
										synthetix.issueMaxSynths({ from: account1 }),
										'A synth or SNX rate is invalid'
									);
								});
							}
						});
					});
				});
				it('should allow the issuance of a small amount of synths', async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('1000'), { from: owner });

					// account1 should be able to issue
					// Note: If a too small amount of synths are issued here, the amount may be
					// rounded to 0 in the debt register. This will revert. As such, there is a minimum
					// number of synths that need to be issued each time issue is invoked. The exact
					// amount depends on the Synth exchange rate and the total supply.
					await synthetix.issueSynths(web3.utils.toBN('5'), { from: account1 });
				});

				it('should be possible to issue the maximum amount of synths via issueSynths', async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('1000'), { from: owner });

					const maxSynths = await synthetix.maxIssuableSynths(account1);

					// account1 should be able to issue
					await synthetix.issueSynths(maxSynths, { from: account1 });
				});

				it('should allow an issuer to issue synths in one flavour', async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('1000'), { from: owner });

					// account1 should be able to issue
					await synthetix.issueSynths(toUnit('10'), { from: account1 });

					// There should be 10 sUSD of value in the system
					assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('10'));

					// And account1 should own 100% of the debt.
					assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('10'));
					assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('10'));
				});

				// TODO: Check that the rounding errors are acceptable
				it('should allow two issuers to issue synths in one flavour', async () => {
					// Give some SNX to account1 and account2
					await synthetix.transfer(account1, toUnit('10000'), {
						from: owner,
					});
					await synthetix.transfer(account2, toUnit('10000'), {
						from: owner,
					});

					// Issue
					await synthetix.issueSynths(toUnit('10'), { from: account1 });
					await synthetix.issueSynths(toUnit('20'), { from: account2 });

					// There should be 30sUSD of value in the system
					assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('30'));

					// And the debt should be split 50/50.
					// But there's a small rounding error.
					// This is ok, as when the last person exits the system, their debt percentage is always 100% so
					// these rounding errors don't cause the system to be out of balance.
					assert.bnClose(await synthetix.debtBalanceOf(account1, sUSD), toUnit('10'));
					assert.bnClose(await synthetix.debtBalanceOf(account2, sUSD), toUnit('20'));
				});

				it('should allow multi-issuance in one flavour', async () => {
					// Give some SNX to account1 and account2
					await synthetix.transfer(account1, toUnit('10000'), {
						from: owner,
					});
					await synthetix.transfer(account2, toUnit('10000'), {
						from: owner,
					});

					// Issue
					await synthetix.issueSynths(toUnit('10'), { from: account1 });
					await synthetix.issueSynths(toUnit('20'), { from: account2 });
					await synthetix.issueSynths(toUnit('10'), { from: account1 });

					// There should be 40 sUSD of value in the system
					assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('40'));

					// And the debt should be split 50/50.
					// But there's a small rounding error.
					// This is ok, as when the last person exits the system, their debt percentage is always 100% so
					// these rounding errors don't cause the system to be out of balance.
					assert.bnClose(await synthetix.debtBalanceOf(account1, sUSD), toUnit('20'));
					assert.bnClose(await synthetix.debtBalanceOf(account2, sUSD), toUnit('20'));
				});

				describe('issueMaxSynths', () => {
					it('should allow an issuer to issue max synths in one flavour', async () => {
						// Give some SNX to account1
						await synthetix.transfer(account1, toUnit('10000'), {
							from: owner,
						});

						// Issue
						await synthetix.issueMaxSynths({ from: account1 });

						// There should be 200 sUSD of value in the system
						assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('200'));

						// And account1 should own all of it.
						assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('200'));
					});
				});

				it('should allow an issuer to issue max synths via the standard issue call', async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('10000'), {
						from: owner,
					});

					// Determine maximum amount that can be issued.
					const maxIssuable = await synthetix.maxIssuableSynths(account1);

					// Issue
					await synthetix.issueSynths(maxIssuable, { from: account1 });

					// There should be 200 sUSD of value in the system
					assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('200'));

					// And account1 should own all of it.
					assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('200'));
				});

				it('should disallow an issuer from issuing synths beyond their remainingIssuableSynths', async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('10000'), {
						from: owner,
					});

					// They should now be able to issue sUSD
					const issuableSynths = await getRemainingIssuableSynths(account1);
					assert.bnEqual(issuableSynths, toUnit('200'));

					// Issue that amount.
					await synthetix.issueSynths(issuableSynths, { from: account1 });

					// They should now have 0 issuable synths.
					assert.bnEqual(await getRemainingIssuableSynths(account1), '0');

					// And trying to issue the smallest possible unit of one should fail.
					await assert.revert(synthetix.issueSynths('1', { from: account1 }), 'Amount too large');
				});
			});

			describe('burning', () => {
				describe('potential blocking conditions', () => {
					beforeEach(async () => {
						// ensure user has synths to burb
						await synthetix.transfer(account1, toUnit('1000'), { from: owner });
						await synthetix.issueMaxSynths({ from: account1 });
					});
					['System', 'Issuance'].forEach(section => {
						describe(`when ${section} is suspended`, () => {
							beforeEach(async () => {
								await setStatus({ owner, systemStatus, section, suspend: true });
							});
							it('then calling burn() reverts', async () => {
								await assert.revert(
									synthetix.burnSynths(toUnit('1'), { from: account1 }),
									'Operation prohibited'
								);
							});
							it('and calling burnSynthsToTarget() reverts', async () => {
								await assert.revert(
									synthetix.burnSynthsToTarget({ from: account1 }),
									'Operation prohibited'
								);
							});
							describe(`when ${section} is resumed`, () => {
								beforeEach(async () => {
									await setStatus({ owner, systemStatus, section, suspend: false });
								});
								it('then calling burnSynths() succeeds', async () => {
									await synthetix.burnSynths(toUnit('1'), { from: account1 });
								});
								it('and calling burnSynthsToTarget() succeeds', async () => {
									await synthetix.burnSynthsToTarget({ from: account1 });
								});
							});
						});
					});

					['SNX', 'sAUD', ['SNX', 'sAUD'], 'none'].forEach(type => {
						describe(`when ${type} is stale`, () => {
							beforeEach(async () => {
								await fastForward(
									(await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300'))
								);

								// set all rates minus those to ignore
								const ratesToUpdate = ['SNX']
									.concat(synths)
									.filter(key => key !== 'sUSD' && ![].concat(type).includes(key));

								const timestamp = await currentTime();

								await exchangeRates.updateRates(
									ratesToUpdate.map(toBytes32),
									ratesToUpdate.map(rate => toUnit(rate === 'SNX' ? '0.1' : '1')),
									timestamp,
									{
										from: oracle,
									}
								);
								await debtCache.takeDebtSnapshot();
							});

							if (type === 'none') {
								it('then calling burnSynths() succeeds', async () => {
									await synthetix.burnSynths(toUnit('1'), { from: account1 });
								});
								it('and calling burnSynthsToTarget() succeeds', async () => {
									await synthetix.burnSynthsToTarget({ from: account1 });
								});
							} else {
								it('then calling burn() reverts', async () => {
									await assert.revert(
										synthetix.burnSynths(toUnit('1'), { from: account1 }),
										'A synth or SNX rate is invalid'
									);
								});
								it('and calling burnSynthsToTarget() reverts', async () => {
									await assert.revert(
										synthetix.burnSynthsToTarget({ from: account1 }),
										'A synth or SNX rate is invalid'
									);
								});
							}
						});
					});
				});

				it('should allow an issuer with outstanding debt to burn synths and decrease debt', async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('10000'), {
						from: owner,
					});

					// Issue
					await synthetix.issueMaxSynths({ from: account1 });

					// account1 should now have 200 sUSD of debt.
					assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('200'));

					// Burn 100 sUSD
					await synthetix.burnSynths(toUnit('100'), { from: account1 });

					// account1 should now have 100 sUSD of debt.
					assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('100'));
				});

				it('should disallow an issuer without outstanding debt from burning synths', async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('10000'), {
						from: owner,
					});

					// Issue
					await synthetix.issueMaxSynths({ from: account1 });

					// account2 should not have anything and can't burn.
					await assert.revert(
						synthetix.burnSynths(toUnit('10'), { from: account2 }),
						'No debt to forgive'
					);

					// And even when we give account2 synths, it should not be able to burn.
					await sUSDContract.transfer(account2, toUnit('100'), {
						from: account1,
					});

					await assert.revert(
						synthetix.burnSynths(toUnit('10'), { from: account2 }),
						'No debt to forgive'
					);
				});

				it('should revert when trying to burn synths that do not exist', async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('10000'), {
						from: owner,
					});

					// Issue
					await synthetix.issueMaxSynths({ from: account1 });

					// Transfer all newly issued synths to account2
					await sUSDContract.transfer(account2, toUnit('200'), {
						from: account1,
					});

					const debtBefore = await synthetix.debtBalanceOf(account1, sUSD);

					assert.ok(!debtBefore.isNeg());

					// Burning any amount of sUSD beyond what is owned will cause a revert
					await assert.revert(
						synthetix.burnSynths('1', { from: account1 }),
						'SafeMath: subtraction overflow'
					);
				});

				it("should only burn up to a user's actual debt level", async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('10000'), {
						from: owner,
					});
					await synthetix.transfer(account2, toUnit('10000'), {
						from: owner,
					});

					// Issue
					const fullAmount = toUnit('210');
					const account1Payment = toUnit('10');
					const account2Payment = fullAmount.sub(account1Payment);
					await synthetix.issueSynths(account1Payment, { from: account1 });
					await synthetix.issueSynths(account2Payment, { from: account2 });

					// Transfer all of account2's synths to account1
					const amountTransferred = toUnit('200');
					await sUSDContract.transfer(account1, amountTransferred, {
						from: account2,
					});
					// return;

					const balanceOfAccount1 = await sUSDContract.balanceOf(account1);

					// Then try to burn them all. Only 10 synths (and fees) should be gone.
					await synthetix.burnSynths(balanceOfAccount1, { from: account1 });
					const balanceOfAccount1AfterBurn = await sUSDContract.balanceOf(account1);

					// Recording debts in the debt ledger reduces accuracy.
					//   Let's allow for a 1000 margin of error.
					assert.bnClose(balanceOfAccount1AfterBurn, amountTransferred, '1000');
				});

				it("should successfully burn all user's synths @gasprofile", async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('10000'), {
						from: owner,
					});

					// Issue
					await synthetix.issueSynths(toUnit('199'), { from: account1 });

					// Then try to burn them all. Only 10 synths (and fees) should be gone.
					await synthetix.burnSynths(await sUSDContract.balanceOf(account1), {
						from: account1,
					});

					assert.bnEqual(await sUSDContract.balanceOf(account1), web3.utils.toBN(0));
				});

				it('should burn the correct amount of synths', async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('200000'), {
						from: owner,
					});
					await synthetix.transfer(account2, toUnit('200000'), {
						from: owner,
					});

					// Issue
					await synthetix.issueSynths(toUnit('199'), { from: account1 });

					// Then try to burn them all. Only 10 synths (and fees) should be gone.
					await synthetix.burnSynths(await sUSDContract.balanceOf(account1), {
						from: account1,
					});

					assert.bnEqual(await sUSDContract.balanceOf(account1), web3.utils.toBN(0));
				});

				it('should burn the correct amount of synths', async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('200000'), {
						from: owner,
					});
					await synthetix.transfer(account2, toUnit('200000'), {
						from: owner,
					});

					// Issue
					const issuedSynthsPt1 = toUnit('2000');
					const issuedSynthsPt2 = toUnit('2000');
					await synthetix.issueSynths(issuedSynthsPt1, { from: account1 });
					await synthetix.issueSynths(issuedSynthsPt2, { from: account1 });
					await synthetix.issueSynths(toUnit('1000'), { from: account2 });

					const debt = await synthetix.debtBalanceOf(account1, sUSD);
					assert.bnClose(debt, toUnit('4000'));
				});

				describe('debt calculation in multi-issuance scenarios', () => {
					it('should correctly calculate debt in a multi-issuance multi-burn scenario @gasprofile', async () => {
						// Give some SNX to account1
						await synthetix.transfer(account1, toUnit('500000'), {
							from: owner,
						});
						await synthetix.transfer(account2, toUnit('140000'), {
							from: owner,
						});
						await synthetix.transfer(account3, toUnit('1400000'), {
							from: owner,
						});

						// Issue
						const issuedSynths1 = toUnit('2000');
						const issuedSynths2 = toUnit('2000');
						const issuedSynths3 = toUnit('2000');

						// Send more than their synth balance to burn all
						const burnAllSynths = toUnit('2050');

						await synthetix.issueSynths(issuedSynths1, { from: account1 });
						await synthetix.issueSynths(issuedSynths2, { from: account2 });
						await synthetix.issueSynths(issuedSynths3, { from: account3 });

						await synthetix.burnSynths(burnAllSynths, { from: account1 });
						await synthetix.burnSynths(burnAllSynths, { from: account2 });
						await synthetix.burnSynths(burnAllSynths, { from: account3 });

						const debtBalance1After = await synthetix.debtBalanceOf(account1, sUSD);
						const debtBalance2After = await synthetix.debtBalanceOf(account2, sUSD);
						const debtBalance3After = await synthetix.debtBalanceOf(account3, sUSD);

						assert.bnEqual(debtBalance1After, '0');
						assert.bnEqual(debtBalance2After, '0');
						assert.bnEqual(debtBalance3After, '0');
					});

					it('should allow user to burn all synths issued even after other users have issued', async () => {
						// Give some SNX to account1
						await synthetix.transfer(account1, toUnit('500000'), {
							from: owner,
						});
						await synthetix.transfer(account2, toUnit('140000'), {
							from: owner,
						});
						await synthetix.transfer(account3, toUnit('1400000'), {
							from: owner,
						});

						// Issue
						const issuedSynths1 = toUnit('2000');
						const issuedSynths2 = toUnit('2000');
						const issuedSynths3 = toUnit('2000');

						await synthetix.issueSynths(issuedSynths1, { from: account1 });
						await synthetix.issueSynths(issuedSynths2, { from: account2 });
						await synthetix.issueSynths(issuedSynths3, { from: account3 });

						const debtBalanceBefore = await synthetix.debtBalanceOf(account1, sUSD);
						await synthetix.burnSynths(debtBalanceBefore, { from: account1 });
						const debtBalanceAfter = await synthetix.debtBalanceOf(account1, sUSD);

						assert.bnEqual(debtBalanceAfter, '0');
					});

					it('should allow a user to burn up to their balance if they try too burn too much', async () => {
						// Give some SNX to account1
						await synthetix.transfer(account1, toUnit('500000'), {
							from: owner,
						});

						// Issue
						const issuedSynths1 = toUnit('10');

						await synthetix.issueSynths(issuedSynths1, { from: account1 });
						await synthetix.burnSynths(issuedSynths1.add(toUnit('9000')), {
							from: account1,
						});
						const debtBalanceAfter = await synthetix.debtBalanceOf(account1, sUSD);

						assert.bnEqual(debtBalanceAfter, '0');
					});

					it('should allow users to burn their debt and adjust the debtBalanceOf correctly for remaining users', async () => {
						// Give some SNX to account1
						await synthetix.transfer(account1, toUnit('40000000'), {
							from: owner,
						});
						await synthetix.transfer(account2, toUnit('40000000'), {
							from: owner,
						});

						// Issue
						const issuedSynths1 = toUnit('150000');
						const issuedSynths2 = toUnit('50000');

						await synthetix.issueSynths(issuedSynths1, { from: account1 });
						await synthetix.issueSynths(issuedSynths2, { from: account2 });

						let debtBalance1After = await synthetix.debtBalanceOf(account1, sUSD);
						let debtBalance2After = await synthetix.debtBalanceOf(account2, sUSD);

						// debtBalanceOf has rounding error but is within tolerance
						assert.bnClose(debtBalance1After, toUnit('150000'));
						assert.bnClose(debtBalance2After, toUnit('50000'));

						// Account 1 burns 100,000
						await synthetix.burnSynths(toUnit('100000'), { from: account1 });

						debtBalance1After = await synthetix.debtBalanceOf(account1, sUSD);
						debtBalance2After = await synthetix.debtBalanceOf(account2, sUSD);

						assert.bnClose(debtBalance1After, toUnit('50000'));
						assert.bnClose(debtBalance2After, toUnit('50000'));
					});

					it('should revert if sender tries to issue synths with 0 amount', async () => {
						// Issue 0 amount of synth
						const issuedSynths1 = toUnit('0');

						await assert.revert(
							synthetix.issueSynths(issuedSynths1, { from: account1 }),
							'SafeMath: division by zero'
						);
					});
				});

				describe('burnSynthsToTarget', () => {
					beforeEach(async () => {
						// Give some SNX to account1
						await synthetix.transfer(account1, toUnit('40000'), {
							from: owner,
						});
						// Set SNX price to 1
						await exchangeRates.updateRates([SNX], ['1'].map(toUnit), timestamp, {
							from: oracle,
						});
						await debtCache.takeDebtSnapshot();
						// Issue
						await synthetix.issueMaxSynths({ from: account1 });
						assert.bnClose(await synthetix.debtBalanceOf(account1, sUSD), toUnit('8000'));

						// Set minimumStakeTime to 1 hour
						await systemSettings.setMinimumStakeTime(60 * 60, { from: owner });
					});

					describe('when the SNX price drops 50%', () => {
						let maxIssuableSynths;
						beforeEach(async () => {
							await exchangeRates.updateRates([SNX], ['.5'].map(toUnit), timestamp, {
								from: oracle,
							});
							await debtCache.takeDebtSnapshot();
							maxIssuableSynths = await synthetix.maxIssuableSynths(account1);
							assert.equal(await feePool.isFeesClaimable(account1), false);
						});

						it('then the maxIssuableSynths drops 50%', async () => {
							assert.bnClose(maxIssuableSynths, toUnit('4000'));
						});
						it('then calling burnSynthsToTarget() reduces sUSD to c-ratio target', async () => {
							await synthetix.burnSynthsToTarget({ from: account1 });
							assert.bnClose(await synthetix.debtBalanceOf(account1, sUSD), toUnit('4000'));
						});
						it('then fees are claimable', async () => {
							await synthetix.burnSynthsToTarget({ from: account1 });
							assert.equal(await feePool.isFeesClaimable(account1), true);
						});
					});

					describe('when the SNX price drops 10%', () => {
						let maxIssuableSynths;
						beforeEach(async () => {
							await exchangeRates.updateRates([SNX], ['.9'].map(toUnit), timestamp, {
								from: oracle,
							});
							await debtCache.takeDebtSnapshot();
							maxIssuableSynths = await synthetix.maxIssuableSynths(account1);
						});

						it('then the maxIssuableSynths drops 10%', async () => {
							assert.bnEqual(maxIssuableSynths, toUnit('7200'));
						});
						it('then calling burnSynthsToTarget() reduces sUSD to c-ratio target', async () => {
							await synthetix.burnSynthsToTarget({ from: account1 });
							assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('7200'));
						});
						it('then fees are claimable', async () => {
							await synthetix.burnSynthsToTarget({ from: account1 });
							assert.equal(await feePool.isFeesClaimable(account1), true);
						});
					});

					describe('when the SNX price drops 90%', () => {
						let maxIssuableSynths;
						beforeEach(async () => {
							await exchangeRates.updateRates([SNX], ['.1'].map(toUnit), timestamp, {
								from: oracle,
							});
							await debtCache.takeDebtSnapshot();
							maxIssuableSynths = await synthetix.maxIssuableSynths(account1);
						});

						it('then the maxIssuableSynths drops 10%', async () => {
							assert.bnEqual(maxIssuableSynths, toUnit('800'));
						});
						it('then calling burnSynthsToTarget() reduces sUSD to c-ratio target', async () => {
							await synthetix.burnSynthsToTarget({ from: account1 });
							assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('800'));
						});
						it('then fees are claimable', async () => {
							await synthetix.burnSynthsToTarget({ from: account1 });
							assert.equal(await feePool.isFeesClaimable(account1), true);
						});
					});

					describe('when the SNX price increases 100%', () => {
						let maxIssuableSynths;
						beforeEach(async () => {
							await exchangeRates.updateRates([SNX], ['2'].map(toUnit), timestamp, {
								from: oracle,
							});
							await debtCache.takeDebtSnapshot();
							maxIssuableSynths = await synthetix.maxIssuableSynths(account1);
						});

						it('then the maxIssuableSynths increases 100%', async () => {
							assert.bnEqual(maxIssuableSynths, toUnit('16000'));
						});
						it('then calling burnSynthsToTarget() reverts', async () => {
							await assert.revert(
								synthetix.burnSynthsToTarget({ from: account1 }),
								'SafeMath: subtraction overflow'
							);
						});
					});
				});

				describe('burnSynths() after exchange()', () => {
					describe('given the waiting period is set to 60s', () => {
						let amount;
						const exchangeFeeRate = toUnit('0');
						beforeEach(async () => {
							amount = toUnit('1250');
							await setExchangeWaitingPeriod({ owner, systemSettings, secs: 60 });

							// set the exchange fee to 0 to effectively ignore it
							await setExchangeFeeRateForSynths({
								owner,
								systemSettings,
								synthKeys,
								exchangeFeeRates: synthKeys.map(() => exchangeFeeRate),
							});
						});
						describe('and a user has 1250 sUSD issued', () => {
							beforeEach(async () => {
								await synthetix.transfer(account1, toUnit('1000000'), { from: owner });
								await synthetix.issueSynths(amount, { from: account1 });
							});
							describe('and is has been exchanged into sEUR at a rate of 1.25:1 and the waiting period has expired', () => {
								beforeEach(async () => {
									await synthetix.exchange(sUSD, amount, sEUR, { from: account1 });
									await fastForward(90); // make sure the waiting period is expired on this
								});
								describe('and they have exchanged all of it back into sUSD', () => {
									beforeEach(async () => {
										await synthetix.exchange(sEUR, toUnit('1000'), sUSD, { from: account1 });
									});
									describe('when they attempt to burn the sUSD', () => {
										it('then it fails as the waiting period is ongoing', async () => {
											await assert.revert(
												synthetix.burnSynths(amount, { from: account1 }),
												'Cannot settle during waiting period'
											);
										});
									});
									describe('and 60s elapses with no change in the sEUR rate', () => {
										beforeEach(async () => {
											fastForward(60);
										});
										describe('when they attempt to burn the sUSD', () => {
											let txn;
											beforeEach(async () => {
												txn = await synthetix.burnSynths(amount, { from: account1 });
											});
											it('then it succeeds and burns the entire sUSD amount', async () => {
												const logs = await getDecodedLogs({
													hash: txn.tx,
													contracts: [synthetix, sUSDContract],
												});

												decodedEventEqual({
													event: 'Burned',
													emittedFrom: sUSDContract.address,
													args: [account1, amount],
													log: logs.find(({ name } = {}) => name === 'Burned'),
												});

												const sUSDBalance = await sUSDContract.balanceOf(account1);
												assert.equal(sUSDBalance, '0');

												const debtBalance = await synthetix.debtBalanceOf(account1, sUSD);
												assert.equal(debtBalance, '0');
											});
										});
									});
									describe('and the sEUR price decreases by 20% to 1', () => {
										beforeEach(async () => {
											await exchangeRates.updateRates([sEUR], ['1'].map(toUnit), timestamp, {
												from: oracle,
											});
											await debtCache.takeDebtSnapshot();
										});
										describe('and 60s elapses', () => {
											beforeEach(async () => {
												fastForward(60);
											});
											describe('when they attempt to burn the entire amount sUSD', () => {
												let txn;
												beforeEach(async () => {
													txn = await synthetix.burnSynths(amount, { from: account1 });
												});
												it('then it succeeds and burns their sUSD minus the reclaim amount from settlement', async () => {
													const logs = await getDecodedLogs({
														hash: txn.tx,
														contracts: [synthetix, sUSDContract],
													});

													decodedEventEqual({
														event: 'Burned',
														emittedFrom: sUSDContract.address,
														args: [account1, amount.sub(toUnit('250'))],
														log: logs
															.reverse()
															.filter(l => !!l)
															.find(({ name }) => name === 'Burned'),
													});

													const sUSDBalance = await sUSDContract.balanceOf(account1);
													assert.equal(sUSDBalance, '0');
												});
												it('and their debt balance is now 0 because they are the only debt holder in the system', async () => {
													// the debt balance remaining is what was reclaimed from the exchange
													const debtBalance = await synthetix.debtBalanceOf(account1, sUSD);
													// because this user is the only one holding debt, when we burn 250 sUSD in a reclaim,
													// it removes it from the totalIssuedSynths and
													assert.equal(debtBalance, '0');
												});
											});
											describe('when another user also has the same amount of debt', () => {
												beforeEach(async () => {
													await synthetix.transfer(account2, toUnit('1000000'), { from: owner });
													await synthetix.issueSynths(amount, { from: account2 });
												});
												describe('when the first user attempts to burn the entire amount sUSD', () => {
													let txn;
													beforeEach(async () => {
														txn = await synthetix.burnSynths(amount, { from: account1 });
													});
													it('then it succeeds and burns their sUSD minus the reclaim amount from settlement', async () => {
														const logs = await getDecodedLogs({
															hash: txn.tx,
															contracts: [synthetix, sUSDContract],
														});

														decodedEventEqual({
															event: 'Burned',
															emittedFrom: sUSDContract.address,
															args: [account1, amount.sub(toUnit('250'))],
															log: logs
																.reverse()
																.filter(l => !!l)
																.find(({ name }) => name === 'Burned'),
														});

														const sUSDBalance = await sUSDContract.balanceOf(account1);
														assert.equal(sUSDBalance, '0');
													});
													it('and their debt balance is now half of the reclaimed balance because they owe half of the pool', async () => {
														// the debt balance remaining is what was reclaimed from the exchange
														const debtBalance = await synthetix.debtBalanceOf(account1, sUSD);
														// because this user is holding half the debt, when we burn 250 sUSD in a reclaim,
														// it removes it from the totalIssuedSynths and so both users have half of 250
														// in owing synths
														assert.bnEqual(debtBalance, divideDecimal('250', 2));
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
			});

			describe('debt calculation in multi-issuance scenarios', () => {
				it('should correctly calculate debt in a multi-issuance scenario', async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('200000'), {
						from: owner,
					});
					await synthetix.transfer(account2, toUnit('200000'), {
						from: owner,
					});

					// Issue
					const issuedSynthsPt1 = toUnit('2000');
					const issuedSynthsPt2 = toUnit('2000');
					await synthetix.issueSynths(issuedSynthsPt1, { from: account1 });
					await synthetix.issueSynths(issuedSynthsPt2, { from: account1 });
					await synthetix.issueSynths(toUnit('1000'), { from: account2 });

					const debt = await synthetix.debtBalanceOf(account1, sUSD);
					assert.bnClose(debt, toUnit('4000'));
				});

				it('should correctly calculate debt in a multi-issuance multi-burn scenario', async () => {
					// Give some SNX to account1
					await synthetix.transfer(account1, toUnit('500000'), {
						from: owner,
					});
					await synthetix.transfer(account2, toUnit('14000'), {
						from: owner,
					});

					// Issue
					const issuedSynthsPt1 = toUnit('2000');
					const burntSynthsPt1 = toUnit('1500');
					const issuedSynthsPt2 = toUnit('1600');
					const burntSynthsPt2 = toUnit('500');

					await synthetix.issueSynths(issuedSynthsPt1, { from: account1 });
					await synthetix.burnSynths(burntSynthsPt1, { from: account1 });
					await synthetix.issueSynths(issuedSynthsPt2, { from: account1 });

					await synthetix.issueSynths(toUnit('100'), { from: account2 });
					await synthetix.issueSynths(toUnit('51'), { from: account2 });
					await synthetix.burnSynths(burntSynthsPt2, { from: account1 });

					const debt = await synthetix.debtBalanceOf(account1, toBytes32('sUSD'));
					const expectedDebt = issuedSynthsPt1
						.add(issuedSynthsPt2)
						.sub(burntSynthsPt1)
						.sub(burntSynthsPt2);

					assert.bnClose(debt, expectedDebt);
				});

				it("should allow me to burn all synths I've issued when there are other issuers", async () => {
					const totalSupply = await synthetix.totalSupply();
					const account2Synthetixs = toUnit('120000');
					const account1Synthetixs = totalSupply.sub(account2Synthetixs);

					await synthetix.transfer(account1, account1Synthetixs, {
						from: owner,
					}); // Issue the massive majority to account1
					await synthetix.transfer(account2, account2Synthetixs, {
						from: owner,
					}); // Issue a small amount to account2

					// Issue from account1
					const account1AmountToIssue = await synthetix.maxIssuableSynths(account1);
					await synthetix.issueMaxSynths({ from: account1 });
					const debtBalance1 = await synthetix.debtBalanceOf(account1, sUSD);
					assert.bnClose(debtBalance1, account1AmountToIssue);

					// Issue and burn from account 2 all debt
					await synthetix.issueSynths(toUnit('43'), { from: account2 });
					let debt = await synthetix.debtBalanceOf(account2, sUSD);
					await synthetix.burnSynths(toUnit('43'), { from: account2 });
					debt = await synthetix.debtBalanceOf(account2, sUSD);

					assert.bnEqual(debt, 0);

					// Should set user issuanceData to 0 debtOwnership and retain debtEntryIndex of last action
					assert.deepEqual(await synthetixState.issuanceData(account2), {
						initialDebtOwnership: 0,
						debtEntryIndex: 2,
					});
				});
			});

			// These tests take a long time to run
			// ****************************************
			describe('multiple issue and burn scenarios', () => {
				it('should correctly calculate debt in a high issuance and burn scenario', async () => {
					const getRandomInt = (min, max) => {
						return min + Math.floor(Math.random() * Math.floor(max));
					};

					const totalSupply = await synthetix.totalSupply();
					const account2Synthetixs = toUnit('120000');
					const account1Synthetixs = totalSupply.sub(account2Synthetixs);

					await synthetix.transfer(account1, account1Synthetixs, {
						from: owner,
					}); // Issue the massive majority to account1
					await synthetix.transfer(account2, account2Synthetixs, {
						from: owner,
					}); // Issue a small amount to account2

					const account1AmountToIssue = await synthetix.maxIssuableSynths(account1);
					await synthetix.issueMaxSynths({ from: account1 });
					const debtBalance1 = await synthetix.debtBalanceOf(account1, sUSD);
					assert.bnClose(debtBalance1, account1AmountToIssue);

					let expectedDebtForAccount2 = web3.utils.toBN('0');
					const totalTimesToIssue = 40;
					for (let i = 0; i < totalTimesToIssue; i++) {
						// Seems that in this case, issuing 43 each time leads to increasing the variance regularly each time.
						const amount = toUnit('43');
						await synthetix.issueSynths(amount, { from: account2 });
						expectedDebtForAccount2 = expectedDebtForAccount2.add(amount);

						const desiredAmountToBurn = toUnit(web3.utils.toBN(getRandomInt(4, 14)));
						const amountToBurn = desiredAmountToBurn.lte(expectedDebtForAccount2)
							? desiredAmountToBurn
							: expectedDebtForAccount2;
						await synthetix.burnSynths(amountToBurn, { from: account2 });
						expectedDebtForAccount2 = expectedDebtForAccount2.sub(amountToBurn);

						// Useful debug logging
						// const db = await synthetix.debtBalanceOf(account2, sUSD);
						// const variance = fromUnit(expectedDebtForAccount2.sub(db));
						// console.log(
						// 	`#### debtBalance: ${db}\t\t expectedDebtForAccount2: ${expectedDebtForAccount2}\t\tvariance: ${variance}`
						// );
					}
					const debtBalance = await synthetix.debtBalanceOf(account2, sUSD);

					// Here we make the variance a calculation of the number of times we issue/burn.
					// This is less than ideal, but is the result of calculating the debt based on
					// the results of the issue/burn each time.
					const variance = web3.utils.toBN(totalTimesToIssue).mul(web3.utils.toBN('2'));
					assert.bnClose(debtBalance, expectedDebtForAccount2, variance);
				}).timeout(60e3);

				it('should correctly calculate debt in a high (random) issuance and burn scenario', async () => {
					const getRandomInt = (min, max) => {
						return min + Math.floor(Math.random() * Math.floor(max));
					};

					const totalSupply = await synthetix.totalSupply();
					const account2Synthetixs = toUnit('120000');
					const account1Synthetixs = totalSupply.sub(account2Synthetixs);

					await synthetix.transfer(account1, account1Synthetixs, {
						from: owner,
					}); // Issue the massive majority to account1
					await synthetix.transfer(account2, account2Synthetixs, {
						from: owner,
					}); // Issue a small amount to account2

					const account1AmountToIssue = await synthetix.maxIssuableSynths(account1);
					await synthetix.issueMaxSynths({ from: account1 });
					const debtBalance1 = await synthetix.debtBalanceOf(account1, sUSD);
					assert.bnClose(debtBalance1, account1AmountToIssue);

					let expectedDebtForAccount2 = web3.utils.toBN('0');
					const totalTimesToIssue = 40;
					for (let i = 0; i < totalTimesToIssue; i++) {
						// Seems that in this case, issuing 43 each time leads to increasing the variance regularly each time.
						const amount = toUnit(web3.utils.toBN(getRandomInt(40, 49)));
						await synthetix.issueSynths(amount, { from: account2 });
						expectedDebtForAccount2 = expectedDebtForAccount2.add(amount);

						const desiredAmountToBurn = toUnit(web3.utils.toBN(getRandomInt(37, 46)));
						const amountToBurn = desiredAmountToBurn.lte(expectedDebtForAccount2)
							? desiredAmountToBurn
							: expectedDebtForAccount2;
						await synthetix.burnSynths(amountToBurn, { from: account2 });
						expectedDebtForAccount2 = expectedDebtForAccount2.sub(amountToBurn);

						// Useful debug logging
						// const db = await synthetix.debtBalanceOf(account2, sUSD);
						// const variance = fromUnit(expectedDebtForAccount2.sub(db));
						// console.log(
						// 	`#### debtBalance: ${db}\t\t expectedDebtForAccount2: ${expectedDebtForAccount2}\t\tvariance: ${variance}`
						// );
					}
					const debtBalance = await synthetix.debtBalanceOf(account2, sUSD);

					// Here we make the variance a calculation of the number of times we issue/burn.
					// This is less than ideal, but is the result of calculating the debt based on
					// the results of the issue/burn each time.
					const variance = web3.utils.toBN(totalTimesToIssue).mul(web3.utils.toBN('2'));
					assert.bnClose(debtBalance, expectedDebtForAccount2, variance);
				}).timeout(60e3);

				it('should correctly calculate debt in a high volume contrast issuance and burn scenario', async () => {
					const totalSupply = await synthetix.totalSupply();

					// Give only 100 Synthetix to account2
					const account2Synthetixs = toUnit('100');

					// Give the vast majority to account1 (ie. 99,999,900)
					const account1Synthetixs = totalSupply.sub(account2Synthetixs);

					await synthetix.transfer(account1, account1Synthetixs, {
						from: owner,
					}); // Issue the massive majority to account1
					await synthetix.transfer(account2, account2Synthetixs, {
						from: owner,
					}); // Issue a small amount to account2

					const account1AmountToIssue = await synthetix.maxIssuableSynths(account1);
					await synthetix.issueMaxSynths({ from: account1 });
					const debtBalance1 = await synthetix.debtBalanceOf(account1, sUSD);
					assert.bnEqual(debtBalance1, account1AmountToIssue);

					let expectedDebtForAccount2 = web3.utils.toBN('0');
					const totalTimesToIssue = 40;
					for (let i = 0; i < totalTimesToIssue; i++) {
						const amount = toUnit('0.000000000000000002');
						await synthetix.issueSynths(amount, { from: account2 });
						expectedDebtForAccount2 = expectedDebtForAccount2.add(amount);
					}
					const debtBalance2 = await synthetix.debtBalanceOf(account2, sUSD);

					// Here we make the variance a calculation of the number of times we issue/burn.
					// This is less than ideal, but is the result of calculating the debt based on
					// the results of the issue/burn each time.
					const variance = web3.utils.toBN(totalTimesToIssue).mul(web3.utils.toBN('2'));
					assert.bnClose(debtBalance2, expectedDebtForAccount2, variance);
				}).timeout(60e3);
			});

			// ****************************************

			it("should prevent more issuance if the user's collaterisation changes to be insufficient", async () => {
				// Set sEUR for purposes of this test
				const timestamp1 = await currentTime();
				await exchangeRates.updateRates([sEUR], [toUnit('0.75')], timestamp1, { from: oracle });
				await debtCache.takeDebtSnapshot();

				const issuedSynthetixs = web3.utils.toBN('200000');
				await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
					from: owner,
				});

				const maxIssuableSynths = await synthetix.maxIssuableSynths(account1);

				// Issue
				const synthsToNotIssueYet = web3.utils.toBN('2000');
				const issuedSynths = maxIssuableSynths.sub(synthsToNotIssueYet);
				await synthetix.issueSynths(issuedSynths, { from: account1 });

				// exchange into sEUR
				await synthetix.exchange(sUSD, issuedSynths, sEUR, { from: account1 });

				// Increase the value of sEUR relative to synthetix
				const timestamp2 = await currentTime();
				await exchangeRates.updateRates([sEUR], [toUnit('1.10')], timestamp2, { from: oracle });
				await debtCache.takeDebtSnapshot();

				await assert.revert(
					synthetix.issueSynths(synthsToNotIssueYet, { from: account1 }),
					'Amount too large'
				);
			});

			// Check user's collaterisation ratio

			describe('check collaterisation ratio', () => {
				const duration = 52 * WEEK;
				beforeEach(async () => {
					// setup rewardEscrowV2 with mocked feePool address
					await addressResolver.importAddresses([toBytes32('FeePool')], [account6], {
						from: owner,
					});

					// update the cached addresses
					await rewardEscrowV2.rebuildCache({ from: owner });
				});
				it('should return 0 if user has no synthetix when checking the collaterisation ratio', async () => {
					const ratio = await synthetix.collateralisationRatio(account1);
					assert.bnEqual(ratio, new web3.utils.BN(0));
				});

				it('Any user can check the collaterisation ratio for a user', async () => {
					const issuedSynthetixs = web3.utils.toBN('320000');
					await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
						from: owner,
					});

					// Issue
					const issuedSynths = toUnit(web3.utils.toBN('6400'));
					await synthetix.issueSynths(issuedSynths, { from: account1 });

					await synthetix.collateralisationRatio(account1, { from: account2 });
				});

				it('should be able to read collaterisation ratio for a user with synthetix but no debt', async () => {
					const issuedSynthetixs = web3.utils.toBN('30000');
					await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
						from: owner,
					});

					const ratio = await synthetix.collateralisationRatio(account1);
					assert.bnEqual(ratio, new web3.utils.BN(0));
				});

				it('should be able to read collaterisation ratio for a user with synthetix and debt', async () => {
					const issuedSynthetixs = web3.utils.toBN('320000');
					await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
						from: owner,
					});

					// Issue
					const issuedSynths = toUnit(web3.utils.toBN('6400'));
					await synthetix.issueSynths(issuedSynths, { from: account1 });

					const ratio = await synthetix.collateralisationRatio(account1, { from: account2 });
					assert.unitEqual(ratio, '0.2');
				});

				it("should include escrowed synthetix when calculating a user's collaterisation ratio", async () => {
					const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
					const transferredSynthetixs = toUnit('60000');
					await synthetix.transfer(account1, transferredSynthetixs, {
						from: owner,
					});

					// Setup escrow
					const oneWeek = 60 * 60 * 24 * 7;
					const twelveWeeks = oneWeek * 12;
					const now = await currentTime();
					const escrowedSynthetixs = toUnit('30000');
					await synthetix.transfer(escrow.address, escrowedSynthetixs, {
						from: owner,
					});
					await escrow.appendVestingEntry(
						account1,
						web3.utils.toBN(now + twelveWeeks),
						escrowedSynthetixs,
						{
							from: owner,
						}
					);

					// Issue
					const maxIssuable = await synthetix.maxIssuableSynths(account1);
					await synthetix.issueSynths(maxIssuable, { from: account1 });

					// Compare
					const collaterisationRatio = await synthetix.collateralisationRatio(account1);
					const expectedCollaterisationRatio = divideDecimal(
						maxIssuable,
						multiplyDecimal(escrowedSynthetixs.add(transferredSynthetixs), snx2usdRate)
					);
					assert.bnEqual(collaterisationRatio, expectedCollaterisationRatio);
				});

				it("should include escrowed reward synthetix when calculating a user's collateralisation ratio", async () => {
					const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
					const transferredSynthetixs = toUnit('60000');
					await synthetix.transfer(account1, transferredSynthetixs, {
						from: owner,
					});

					const escrowedSynthetixs = toUnit('30000');
					await synthetix.transfer(rewardEscrowV2.address, escrowedSynthetixs, {
						from: owner,
					});
					await rewardEscrowV2.appendVestingEntry(account1, escrowedSynthetixs, duration, {
						from: account6,
					});

					// Issue
					const maxIssuable = await synthetix.maxIssuableSynths(account1);
					await synthetix.issueSynths(maxIssuable, { from: account1 });

					// Compare
					const collaterisationRatio = await synthetix.collateralisationRatio(account1);
					const expectedCollaterisationRatio = divideDecimal(
						maxIssuable,
						multiplyDecimal(escrowedSynthetixs.add(transferredSynthetixs), snx2usdRate)
					);
					assert.bnEqual(collaterisationRatio, expectedCollaterisationRatio);
				});

				it('should permit user to issue sUSD debt with only escrowed SNX as collateral (no SNX in wallet)', async () => {
					const oneWeek = 60 * 60 * 24 * 7;
					const twelveWeeks = oneWeek * 12;
					const now = await currentTime();

					// ensure collateral of account1 is empty
					let collateral = await synthetix.collateral(account1, { from: account1 });
					assert.bnEqual(collateral, 0);

					// ensure account1 has no SNX balance
					const snxBalance = await synthetix.balanceOf(account1);
					assert.bnEqual(snxBalance, 0);

					// Append escrow amount to account1
					const escrowedAmount = toUnit('15000');
					await synthetix.transfer(escrow.address, escrowedAmount, {
						from: owner,
					});
					await escrow.appendVestingEntry(
						account1,
						web3.utils.toBN(now + twelveWeeks),
						escrowedAmount,
						{
							from: owner,
						}
					);

					// collateral should include escrowed amount
					collateral = await synthetix.collateral(account1, { from: account1 });
					assert.bnEqual(collateral, escrowedAmount);

					// Issue max synths. (300 sUSD)
					await synthetix.issueMaxSynths({ from: account1 });

					// There should be 300 sUSD of value for account1
					assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('300'));
				});

				it('should permit user to issue sUSD debt with only reward escrow as collateral (no SNX in wallet)', async () => {
					// ensure collateral of account1 is empty
					let collateral = await synthetix.collateral(account1, { from: account1 });
					assert.bnEqual(collateral, 0);

					// ensure account1 has no SNX balance
					const snxBalance = await synthetix.balanceOf(account1);
					assert.bnEqual(snxBalance, 0);

					// Append escrow amount to account1
					const escrowedAmount = toUnit('15000');
					await synthetix.transfer(rewardEscrowV2.address, escrowedAmount, {
						from: owner,
					});
					await rewardEscrowV2.appendVestingEntry(account1, escrowedAmount, duration, {
						from: account6,
					});

					// collateral now should include escrowed amount
					collateral = await synthetix.collateral(account1, { from: account1 });
					assert.bnEqual(collateral, escrowedAmount);

					// Issue max synths. (300 sUSD)
					await synthetix.issueMaxSynths({ from: account1 });

					// There should be 300 sUSD of value for account1
					assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('300'));
				});

				it("should permit anyone checking another user's collateral", async () => {
					const amount = toUnit('60000');
					await synthetix.transfer(account1, amount, { from: owner });
					const collateral = await synthetix.collateral(account1, { from: account2 });
					assert.bnEqual(collateral, amount);
				});

				it("should include escrowed synthetix when checking a user's collateral", async () => {
					const oneWeek = 60 * 60 * 24 * 7;
					const twelveWeeks = oneWeek * 12;
					const now = await currentTime();
					const escrowedAmount = toUnit('15000');
					await synthetix.transfer(escrow.address, escrowedAmount, {
						from: owner,
					});
					await escrow.appendVestingEntry(
						account1,
						web3.utils.toBN(now + twelveWeeks),
						escrowedAmount,
						{
							from: owner,
						}
					);

					const amount = toUnit('60000');
					await synthetix.transfer(account1, amount, { from: owner });
					const collateral = await synthetix.collateral(account1, { from: account2 });
					assert.bnEqual(collateral, amount.add(escrowedAmount));
				});

				it("should include escrowed reward synthetix when checking a user's collateral", async () => {
					const escrowedAmount = toUnit('15000');
					await synthetix.transfer(rewardEscrowV2.address, escrowedAmount, {
						from: owner,
					});
					await rewardEscrowV2.appendVestingEntry(account1, escrowedAmount, duration, {
						from: account6,
					});
					const amount = toUnit('60000');
					await synthetix.transfer(account1, amount, { from: owner });
					const collateral = await synthetix.collateral(account1, { from: account2 });
					assert.bnEqual(collateral, amount.add(escrowedAmount));
				});

				it("should calculate a user's remaining issuable synths", async () => {
					const transferredSynthetixs = toUnit('60000');
					await synthetix.transfer(account1, transferredSynthetixs, {
						from: owner,
					});

					// Issue
					const maxIssuable = await synthetix.maxIssuableSynths(account1);
					const issued = maxIssuable.div(web3.utils.toBN(3));
					await synthetix.issueSynths(issued, { from: account1 });
					const expectedRemaining = maxIssuable.sub(issued);
					const remaining = await getRemainingIssuableSynths(account1);
					assert.bnEqual(expectedRemaining, remaining);
				});

				it("should correctly calculate a user's max issuable synths with escrowed synthetix", async () => {
					const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
					const transferredSynthetixs = toUnit('60000');
					await synthetix.transfer(account1, transferredSynthetixs, {
						from: owner,
					});

					// Setup escrow
					const oneWeek = 60 * 60 * 24 * 7;
					const twelveWeeks = oneWeek * 12;
					const now = await currentTime();
					const escrowedSynthetixs = toUnit('30000');
					await synthetix.transfer(escrow.address, escrowedSynthetixs, {
						from: owner,
					});
					await escrow.appendVestingEntry(
						account1,
						web3.utils.toBN(now + twelveWeeks),
						escrowedSynthetixs,
						{
							from: owner,
						}
					);

					const maxIssuable = await synthetix.maxIssuableSynths(account1);
					// await synthetix.issueSynths(maxIssuable, { from: account1 });

					// Compare
					const issuanceRatio = await systemSettings.issuanceRatio();
					const expectedMaxIssuable = multiplyDecimal(
						multiplyDecimal(escrowedSynthetixs.add(transferredSynthetixs), snx2usdRate),
						issuanceRatio
					);
					assert.bnEqual(maxIssuable, expectedMaxIssuable);
				});
			});

			describe('issue and burn on behalf', async () => {
				const authoriser = account1;
				const delegate = account2;

				beforeEach(async () => {
					// Assign the authoriser SNX
					await synthetix.transfer(authoriser, toUnit('20000'), {
						from: owner,
					});
					await exchangeRates.updateRates([SNX], ['1'].map(toUnit), timestamp, { from: oracle });
					await debtCache.takeDebtSnapshot();
				});
				describe('when not approved it should revert on', async () => {
					it('issueMaxSynthsOnBehalf', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: synthetix.issueMaxSynthsOnBehalf,
							args: [authoriser],
							accounts,
							reason: 'Not approved to act on behalf',
						});
					});
					it('issueSynthsOnBehalf', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: synthetix.issueSynthsOnBehalf,
							args: [authoriser, toUnit('1')],
							accounts,
							reason: 'Not approved to act on behalf',
						});
					});
					it('burnSynthsOnBehalf', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: synthetix.burnSynthsOnBehalf,
							args: [authoriser, toUnit('1')],
							accounts,
							reason: 'Not approved to act on behalf',
						});
					});
					it('burnSynthsToTargetOnBehalf', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: synthetix.burnSynthsToTargetOnBehalf,
							args: [authoriser],
							accounts,
							reason: 'Not approved to act on behalf',
						});
					});
				});

				['System', 'Issuance'].forEach(section => {
					describe(`when ${section} is suspended`, () => {
						beforeEach(async () => {
							// ensure user has synths to burn
							await synthetix.issueSynths(toUnit('1000'), { from: authoriser });
							await delegateApprovals.approveIssueOnBehalf(delegate, { from: authoriser });
							await delegateApprovals.approveBurnOnBehalf(delegate, { from: authoriser });
							await setStatus({ owner, systemStatus, section, suspend: true });
						});
						it('then calling issueSynthsOnBehalf() reverts', async () => {
							await assert.revert(
								synthetix.issueSynthsOnBehalf(authoriser, toUnit('1'), { from: delegate }),
								'Operation prohibited'
							);
						});
						it('and calling issueMaxSynthsOnBehalf() reverts', async () => {
							await assert.revert(
								synthetix.issueMaxSynthsOnBehalf(authoriser, { from: delegate }),
								'Operation prohibited'
							);
						});
						it('and calling burnSynthsOnBehalf() reverts', async () => {
							await assert.revert(
								synthetix.burnSynthsOnBehalf(authoriser, toUnit('1'), { from: delegate }),
								'Operation prohibited'
							);
						});
						it('and calling burnSynthsToTargetOnBehalf() reverts', async () => {
							await assert.revert(
								synthetix.burnSynthsToTargetOnBehalf(authoriser, { from: delegate }),
								'Operation prohibited'
							);
						});

						describe(`when ${section} is resumed`, () => {
							beforeEach(async () => {
								await setStatus({ owner, systemStatus, section, suspend: false });
							});
							it('then calling issueSynthsOnBehalf() succeeds', async () => {
								await synthetix.issueSynthsOnBehalf(authoriser, toUnit('1'), { from: delegate });
							});
							it('and calling issueMaxSynthsOnBehalf() succeeds', async () => {
								await synthetix.issueMaxSynthsOnBehalf(authoriser, { from: delegate });
							});
							it('and calling burnSynthsOnBehalf() succeeds', async () => {
								await synthetix.burnSynthsOnBehalf(authoriser, toUnit('1'), { from: delegate });
							});
							it('and calling burnSynthsToTargetOnBehalf() succeeds', async () => {
								// need the user to be undercollaterized for this to succeed
								await exchangeRates.updateRates([SNX], ['0.001'].map(toUnit), timestamp, {
									from: oracle,
								});
								await debtCache.takeDebtSnapshot();
								await synthetix.burnSynthsToTargetOnBehalf(authoriser, { from: delegate });
							});
						});
					});
				});

				it('should approveIssueOnBehalf for account1', async () => {
					await delegateApprovals.approveIssueOnBehalf(delegate, { from: authoriser });
					const result = await delegateApprovals.canIssueFor(authoriser, delegate);

					assert.isTrue(result);
				});
				it('should approveBurnOnBehalf for account1', async () => {
					await delegateApprovals.approveBurnOnBehalf(delegate, { from: authoriser });
					const result = await delegateApprovals.canBurnFor(authoriser, delegate);

					assert.isTrue(result);
				});
				it('should approveIssueOnBehalf and IssueMaxSynths', async () => {
					await delegateApprovals.approveIssueOnBehalf(delegate, { from: authoriser });

					const sUSDBalanceBefore = await sUSDContract.balanceOf(account1);
					const issuableSynths = await synthetix.maxIssuableSynths(account1);

					await synthetix.issueMaxSynthsOnBehalf(authoriser, { from: delegate });
					const sUSDBalanceAfter = await sUSDContract.balanceOf(account1);
					assert.bnEqual(sUSDBalanceAfter, sUSDBalanceBefore.add(issuableSynths));
				});
				it('should approveIssueOnBehalf and IssueSynths', async () => {
					await delegateApprovals.approveIssueOnBehalf(delegate, { from: authoriser });

					await synthetix.issueSynthsOnBehalf(authoriser, toUnit('100'), { from: delegate });

					const sUSDBalance = await sUSDContract.balanceOf(account1);
					assert.bnEqual(sUSDBalance, toUnit('100'));
				});
				it('should approveBurnOnBehalf and BurnSynths', async () => {
					await synthetix.issueMaxSynths({ from: authoriser });
					await delegateApprovals.approveBurnOnBehalf(delegate, { from: authoriser });

					const sUSDBalanceBefore = await sUSDContract.balanceOf(account1);
					await synthetix.burnSynthsOnBehalf(authoriser, sUSDBalanceBefore, { from: delegate });

					const sUSDBalance = await sUSDContract.balanceOf(account1);
					assert.bnEqual(sUSDBalance, toUnit('0'));
				});
				it('should approveBurnOnBehalf and burnSynthsToTarget', async () => {
					await synthetix.issueMaxSynths({ from: authoriser });
					await exchangeRates.updateRates([SNX], ['0.01'].map(toUnit), timestamp, { from: oracle });
					await debtCache.takeDebtSnapshot();

					await delegateApprovals.approveBurnOnBehalf(delegate, { from: authoriser });

					await synthetix.burnSynthsToTargetOnBehalf(authoriser, { from: delegate });

					const sUSDBalanceAfter = await sUSDContract.balanceOf(account1);
					assert.bnEqual(sUSDBalanceAfter, toUnit('40'));
				});
			});

			describe('when EtherWrapper is set', async () => {
				it('should have zero totalIssuedSynths', async () => {
					assert.bnEqual(
						await synthetix.totalIssuedSynths(sUSD),
						await synthetix.totalIssuedSynthsExcludeOtherCollateral(sUSD)
					);
				});
				describe('depositing WETH on the EtherWrapper to issue sETH', async () => {
					let etherWrapper;
					beforeEach(async () => {
						// mock etherWrapper
						etherWrapper = await MockEtherWrapper.new({ from: owner });
						await addressResolver.importAddresses(
							[toBytes32('EtherWrapper')],
							[etherWrapper.address],
							{ from: owner }
						);

						// ensure DebtCache has the latest EtherWrapper
						await debtCache.rebuildCache();
					});

					it('should be able to exclude sETH issued by EtherWrapper from totalIssuedSynths', async () => {
						const totalSupplyBefore = await synthetix.totalIssuedSynths(sETH);

						const amount = toUnit('10');

						await etherWrapper.setTotalIssuedSynths(amount, { from: account1 });

						// totalSupply of synths should exclude EtherWrapper issued sETH
						assert.bnEqual(
							totalSupplyBefore,
							await synthetix.totalIssuedSynthsExcludeOtherCollateral(sETH)
						);

						// totalIssuedSynths after includes amount issued
						const { rate } = await exchangeRates.rateAndInvalid(sETH);
						assert.bnEqual(
							await synthetix.totalIssuedSynths(sETH),
							totalSupplyBefore.add(divideDecimalRound(amount, rate))
						);
					});
				});
			});

			describe('burnForRedemption', () => {
				it('only allowed by the synth redeemer', async () => {
					await onlyGivenAddressCanInvoke({
						fnc: issuer.burnForRedemption,
						args: [ZERO_ADDRESS, ZERO_ADDRESS, toUnit('1')],
						accounts,
						reason: 'Issuer: Only the SynthRedeemer contract can perform this action',
					});
				});
				describe('when a user has 100 sETH', () => {
					beforeEach(async () => {
						await sETHContract.issue(account1, toUnit('100'));
					});
					describe('when burnForRedemption is invoked on the user for 75 sETH', () => {
						beforeEach(async () => {
							// spoof the synth redeemer
							await addressResolver.importAddresses([toBytes32('SynthRedeemer')], [account6], {
								from: owner,
							});
							// rebuild the resolver cache in the issuer
							await issuer.rebuildCache();
							// now invoke the burn
							await issuer.burnForRedemption(await sETHContract.proxy(), account1, toUnit('75'), {
								from: account6,
							});
						});
						it('then the user has 25 sETH remaining', async () => {
							assert.bnEqual(await sETHContract.balanceOf(account1), toUnit('25'));
						});
					});
				});
			});
		});
	});
});
