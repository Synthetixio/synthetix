require('.'); // import common test scaffolding

const ExchangeRates = artifacts.require('ExchangeRates');
const DelegateApprovals = artifacts.require('DelegateApprovals');
const Escrow = artifacts.require('SynthetixEscrow');
const RewardEscrow = artifacts.require('RewardEscrow');
const Issuer = artifacts.require('Issuer');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const SynthetixState = artifacts.require('SynthetixState');
const Synth = artifacts.require('Synth');

const {
	currentTime,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	fastForward,
} = require('../utils/testUtils');

const {
	setExchangeWaitingPeriod,
	setExchangeFee,
	getDecodedLogs,
	decodedEventEqual,
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	updateRatesWithDefaults,
	setStatus,
} = require('../utils/setupUtils');

const { toBytes32 } = require('../..');

contract('Issuer (via Synthetix)', async accounts => {
	const [sUSD, sAUD, sEUR, SNX] = ['sUSD', 'sAUD', 'sEUR', 'SNX'].map(toBytes32);

	const [, owner, account1, account2, account3, account6] = accounts;

	let synthetix,
		synthetixState,
		delegateApprovals,
		exchangeRates,
		feePool,
		sUSDContract,
		escrow,
		rewardEscrow,
		oracle,
		timestamp,
		issuer;

	const getRemainingIssuableSynths = async account =>
		(await synthetix.remainingIssuableSynths(account))[0];

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		escrow = await Escrow.deployed();
		delegateApprovals = await DelegateApprovals.deployed();
		rewardEscrow = await RewardEscrow.deployed();

		synthetix = await Synthetix.deployed();
		synthetixState = await SynthetixState.deployed();
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		issuer = await Issuer.deployed();
		oracle = await exchangeRates.oracle();
		timestamp = await currentTime();

		// set minimumStakeTime on issue and burning to 0
		await issuer.setMinimumStakeTime(0, { from: owner });
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: issuer.abi,
			ignoreParents: ['MixinResolver'],
			expected: [
				'issueSynths',
				'issueSynthsOnBehalf',
				'issueMaxSynths',
				'issueMaxSynthsOnBehalf',
				'burnSynths',
				'burnSynthsOnBehalf',
				'burnSynthsToTarget',
				'burnSynthsToTargetOnBehalf',
				'setMinimumStakeTime',
			],
		});
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
		it('burnSynthsToTargetOnBehalf() cannot be invoked directly by a user', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: issuer.burnSynthsToTargetOnBehalf,
				args: [account1, account2],
				accounts,
				reason: 'Only the synthetix contract can perform this action',
			});
		});
		it('setMinimumStakeTime() can onlt be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: issuer.setMinimumStakeTime,
				args: [1],
				address: owner,
				accounts,
				reason: 'Only the contract owner may perform this action',
			});
		});
	});

	describe('minimumStakeTime - recording last issue and burn timestamp', async () => {
		let now;

		beforeEach(async () => {
			// Give some SNX to account1
			await synthetix.transfer(account1, toUnit('1000'), { from: owner });

			now = await currentTime();
		});
		it('should revert if setMinimumStakeTime > than 1 week', async () => {
			const week = 604800;

			// revert if setting minimumStakeTime greater than 1 week
			await assert.revert(
				issuer.setMinimumStakeTime(week + 1, { from: owner }),
				'stake time exceed maximum 1 week'
			);
		});
		it('should allow setMinimumStakeTime less than equal 1 week', async () => {
			const week = 604800;

			await issuer.setMinimumStakeTime(week, { from: owner });
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
				await issuer.setMinimumStakeTime(60 * 60 * 8, { from: owner });

				// issue synths first
				await synthetix.issueSynths(web3.utils.toBN('5'), { from: account1 });

				await assert.revert(
					synthetix.burnSynths(web3.utils.toBN('5'), { from: account1 }),
					'Minimum stake time not reached'
				);
			});
			it('should set minStakeTime to 120 seconds and able to burn after wait time', async () => {
				// set minimumStakeTime
				await issuer.setMinimumStakeTime(120, { from: owner });

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

	describe('issuance', () => {
		['System', 'Issuance'].forEach(section => {
			describe(`when ${section} is suspended`, () => {
				beforeEach(async () => {
					// ensure user has synths to issue from
					await synthetix.transfer(account1, toUnit('1000'), { from: owner });

					await setStatus({ owner, section, suspend: true });
				});
				it('then calling issue() reverts', async () => {
					await assert.revert(
						synthetix.issueSynths(toUnit('1'), { from: account1 }),
						'Operation prohibited'
					);
				});
				it('and calling issueMaxSynths() reverts', async () => {
					await assert.revert(synthetix.issueMaxSynths({ from: account1 }), 'Operation prohibited');
				});
				describe(`when ${section} is resumed`, () => {
					beforeEach(async () => {
						await setStatus({ owner, section, suspend: false });
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
			// Send a price update to guarantee we're not depending on values from outside this test.

			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX],
				['0.5', '1.25', '0.1'].map(toUnit),
				timestamp,
				{ from: oracle }
			);

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
			// Send a price update to guarantee we're not depending on values from outside this test.

			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX],
				['0.5', '1.25', '0.1'].map(toUnit),
				timestamp,
				{ from: oracle }
			);

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
			// Send a price update to guarantee we're not depending on values from outside this test.

			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX],
				['0.5', '1.25', '0.1'].map(toUnit),
				timestamp,
				{ from: oracle }
			);

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

		it('should allow an issuer to issue max synths in one flavour', async () => {
			// Send a price update to guarantee we're not depending on values from outside this test.

			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX],
				['0.5', '1.25', '0.1'].map(toUnit),
				timestamp,
				{ from: oracle }
			);

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

		it('should allow an issuer to issue max synths via the standard issue call', async () => {
			// Send a price update to guarantee we're not depending on values from outside this test.

			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX],
				['0.5', '1.25', '0.1'].map(toUnit),
				timestamp,
				{ from: oracle }
			);

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
			// Send a price update to guarantee we're not depending on values from outside this test.

			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX],
				['0.5', '1.25', '0.1'].map(toUnit),
				timestamp,
				{ from: oracle }
			);

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
			await assert.revert(synthetix.issueSynths('1', { from: account1 }));
		});
	});

	describe('burning', () => {
		['System', 'Issuance'].forEach(section => {
			describe(`when ${section} is suspended`, () => {
				beforeEach(async () => {
					// ensure user has synths to burb
					await synthetix.transfer(account1, toUnit('1000'), { from: owner });
					await synthetix.issueMaxSynths({ from: account1 });

					await setStatus({ owner, section, suspend: true });
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
						await setStatus({ owner, section, suspend: false });
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
		it('should allow an issuer with outstanding debt to burn synths and decrease debt', async () => {
			// Send a price update to guarantee we're not depending on values from outside this test.

			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX],
				['0.5', '1.25', '0.1'].map(toUnit),
				timestamp,
				{ from: oracle }
			);

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
			// Send a price update to guarantee we're not depending on values from outside this test.
			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX],
				['0.5', '1.25', '0.1'].map(toUnit),
				timestamp,
				{ from: oracle }
			);

			// Give some SNX to account1
			await synthetix.transfer(account1, toUnit('10000'), {
				from: owner,
			});

			// Issue
			await synthetix.issueMaxSynths({ from: account1 });

			// account2 should not have anything and can't burn.
			await assert.revert(synthetix.burnSynths(toUnit('10'), { from: account2 }));

			// And even when we give account2 synths, it should not be able to burn.
			await sUSDContract.transfer(account2, toUnit('100'), {
				from: account1,
			});
			await assert.revert(synthetix.burnSynths(toUnit('10'), { from: account2 }));
		});

		it('should revert when trying to burn synths that do not exist', async () => {
			// Send a price update to guarantee we're not depending on values from outside this test.

			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX],
				['0.5', '1.25', '0.1'].map(toUnit),
				timestamp,
				{ from: oracle }
			);

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
			await assert.revert(synthetix.burnSynths('1', { from: account1 }));
		});

		it("should only burn up to a user's actual debt level", async () => {
			// Send a price update to guarantee we're not depending on values from outside this test.

			await exchangeRates.updateRates(
				[sAUD, sEUR, SNX],
				['0.5', '1.25', '0.1'].map(toUnit),
				timestamp,
				{ from: oracle }
			);

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
			await sUSDContract.transfer(account1, toUnit('200'), {
				from: account2,
			});
			// return;

			// Calculate the amount that account1 should actually receive
			const amountReceived = await feePool.amountReceivedFromTransfer(toUnit('200'));

			const balanceOfAccount1 = await sUSDContract.balanceOf(account1);

			// Then try to burn them all. Only 10 synths (and fees) should be gone.
			await synthetix.burnSynths(balanceOfAccount1, { from: account1 });
			const balanceOfAccount1AfterBurn = await sUSDContract.balanceOf(account1);

			// console.log('##### txn', txn);
			// for (let i = 0; i < txn.logs.length; i++) {
			// 	const result = txn.logs[i].args;
			// 	// console.log('##### txn ???', result);
			// 	for (let j = 0; j < result.__length__; j++) {
			// 		if (txn.logs[i].event === 'SomethingElse' && j === 0) {
			// 			console.log(`##### txn ${i} str`, web3.utils.hexToAscii(txn.logs[i].args[j]));
			// 		} else {
			// 			console.log(`##### txn ${i}`, txn.logs[i].args[j].toString());
			// 		}
			// 	}
			// }

			// Recording debts in the debt ledger reduces accuracy.
			//   Let's allow for a 1000 margin of error.
			assert.bnClose(balanceOfAccount1AfterBurn, amountReceived, '1000');
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
		});

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
		});

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
		});
	});

	// ****************************************

	it("should prevent more issuance if the user's collaterisation changes to be insufficient", async () => {
		// Set sEUR for purposes of this test
		const timestamp1 = await currentTime();
		await exchangeRates.updateRates([sEUR], [toUnit('0.75')], timestamp1, { from: oracle });

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

		await assert.revert(synthetix.issueSynths(synthsToNotIssueYet, { from: account1 }));
	});

	// Check user's collaterisation ratio

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
		// Ensure SNX rate is set
		await updateRatesWithDefaults({ oracle: oracle });

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

	it("should include escrowed reward synthetix when calculating a user's collaterisation ratio", async () => {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const transferredSynthetixs = toUnit('60000');
		await synthetix.transfer(account1, transferredSynthetixs, {
			from: owner,
		});

		// Setup reward escrow
		const feePoolAccount = account6;
		await rewardEscrow.setFeePool(feePoolAccount, { from: owner });

		const escrowedSynthetixs = toUnit('30000');
		await synthetix.transfer(rewardEscrow.address, escrowedSynthetixs, {
			from: owner,
		});
		await rewardEscrow.appendVestingEntry(account1, escrowedSynthetixs, { from: feePoolAccount });

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

		// Send a price update to guarantee we're not depending on values from outside this test.
		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

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
		await escrow.appendVestingEntry(account1, web3.utils.toBN(now + twelveWeeks), escrowedAmount, {
			from: owner,
		});

		// collateral should include escrowed amount
		collateral = await synthetix.collateral(account1, { from: account1 });
		assert.bnEqual(collateral, escrowedAmount);

		// Issue max synths. (300 sUSD)
		await synthetix.issueMaxSynths({ from: account1 });

		// There should be 300 sUSD of value for account1
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('300'));
	});

	it('should permit user to issue sUSD debt with only reward escrow as collateral (no SNX in wallet)', async () => {
		// Setup reward escrow
		const feePoolAccount = account6;
		await rewardEscrow.setFeePool(feePoolAccount, { from: owner });

		// Send a price update to guarantee we're not depending on values from outside this test.
		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// ensure collateral of account1 is empty
		let collateral = await synthetix.collateral(account1, { from: account1 });
		assert.bnEqual(collateral, 0);

		// ensure account1 has no SNX balance
		const snxBalance = await synthetix.balanceOf(account1);
		assert.bnEqual(snxBalance, 0);

		// Append escrow amount to account1
		const escrowedAmount = toUnit('15000');
		await synthetix.transfer(RewardEscrow.address, escrowedAmount, {
			from: owner,
		});
		await rewardEscrow.appendVestingEntry(account1, escrowedAmount, { from: feePoolAccount });

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
		await escrow.appendVestingEntry(account1, web3.utils.toBN(now + twelveWeeks), escrowedAmount, {
			from: owner,
		});

		const amount = toUnit('60000');
		await synthetix.transfer(account1, amount, { from: owner });
		const collateral = await synthetix.collateral(account1, { from: account2 });
		assert.bnEqual(collateral, amount.add(escrowedAmount));
	});

	it("should include escrowed reward synthetix when checking a user's collateral", async () => {
		const feePoolAccount = account6;
		const escrowedAmount = toUnit('15000');
		await synthetix.transfer(rewardEscrow.address, escrowedAmount, {
			from: owner,
		});
		await rewardEscrow.setFeePool(feePoolAccount, { from: owner });
		await rewardEscrow.appendVestingEntry(account1, escrowedAmount, { from: feePoolAccount });
		const amount = toUnit('60000');
		await synthetix.transfer(account1, amount, { from: owner });
		const collateral = await synthetix.collateral(account1, { from: account2 });
		assert.bnEqual(collateral, amount.add(escrowedAmount));
	});

	// Stale rate check

	it('should allow anyone to check if any rates are stale', async () => {
		const instance = await ExchangeRates.deployed();
		const result = await instance.anyRateIsStale([sEUR, sAUD], { from: owner });
		assert.equal(result, false);
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
		const issuanceRatio = await synthetixState.issuanceRatio();
		const expectedMaxIssuable = multiplyDecimal(
			multiplyDecimal(escrowedSynthetixs.add(transferredSynthetixs), snx2usdRate),
			issuanceRatio
		);
		assert.bnEqual(maxIssuable, expectedMaxIssuable);
	});

	// Burning Synths

	it("should successfully burn all user's synths", async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates([SNX], [toUnit('0.1')], timestamp, {
			from: oracle,
		});

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('10000'), {
			from: owner,
		});

		// Issue
		await synthetix.issueSynths(toUnit('199'), { from: account1 });

		// Then try to burn them all. Only 10 synths (and fees) should be gone.
		await synthetix.burnSynths(await sUSDContract.balanceOf(account1), { from: account1 });
		assert.bnEqual(await sUSDContract.balanceOf(account1), web3.utils.toBN(0));
	});

	it('should burn the correct amount of synths', async () => {
		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('400000'), {
			from: owner,
		});

		// Issue
		await synthetix.issueSynths(toUnit('3987'), { from: account1 });

		// Then try to burn some of them. There should be 3000 left.
		await synthetix.burnSynths(toUnit('987'), { from: account1 });
		assert.bnEqual(await sUSDContract.balanceOf(account1), toUnit('3000'));
	});

	it("should successfully burn all user's synths even with transfer", async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates([SNX], [toUnit('0.1')], timestamp, {
			from: oracle,
		});

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('300000'), {
			from: owner,
		});

		// Issue
		const amountIssued = toUnit('2000');
		await synthetix.issueSynths(amountIssued, { from: account1 });

		// Transfer account1's synths to account2 and back
		const amountToTransfer = toUnit('1800');
		await sUSDContract.transfer(account2, amountToTransfer, {
			from: account1,
		});
		const remainingAfterTransfer = await sUSDContract.balanceOf(account1);
		await sUSDContract.transfer(account1, await sUSDContract.balanceOf(account2), {
			from: account2,
		});

		// Calculate the amount that account1 should actually receive
		const amountReceived = await feePool.amountReceivedFromTransfer(toUnit('1800'));
		const amountReceived2 = await feePool.amountReceivedFromTransfer(amountReceived);
		const amountLostToFees = amountToTransfer.sub(amountReceived2);

		// Check that the transfer worked ok.
		const amountExpectedToBeLeftInWallet = amountIssued.sub(amountLostToFees);
		assert.bnEqual(amountReceived2.add(remainingAfterTransfer), amountExpectedToBeLeftInWallet);

		// Now burn 1000 and check we end up with the right amount
		await synthetix.burnSynths(toUnit('1000'), { from: account1 });
		assert.bnEqual(
			await sUSDContract.balanceOf(account1),
			amountExpectedToBeLeftInWallet.sub(toUnit('1000'))
		);
	});

	it('should allow the last user in the system to burn all their synths to release their synthetix', async () => {
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

		await assert.revert(synthetix.issueSynths(issuedSynths1, { from: account1 }));
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
			// Issue
			await synthetix.issueMaxSynths({ from: account1 });
			assert.bnClose(await synthetix.debtBalanceOf(account1, sUSD), toUnit('8000'));

			// Set minimumStakeTime to 1 hour
			await issuer.setMinimumStakeTime(60 * 60, { from: owner });
		});

		describe('when the SNX price drops 50%', () => {
			let maxIssuableSynths;
			beforeEach(async () => {
				await exchangeRates.updateRates([SNX], ['.5'].map(toUnit), timestamp, {
					from: oracle,
				});
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
				maxIssuableSynths = await synthetix.maxIssuableSynths(account1);
			});

			it('then the maxIssuableSynths increases 100%', async () => {
				assert.bnEqual(maxIssuableSynths, toUnit('16000'));
			});
			it('then calling burnSynthsToTarget() reverts', async () => {
				await assert.revert(synthetix.burnSynthsToTarget({ from: account1 }));
			});
		});
	});

	describe('burnSynths() after exchange()', () => {
		describe('given the waiting period is set to 60s', () => {
			let amount;
			beforeEach(async () => {
				amount = toUnit('1250');
				await setExchangeWaitingPeriod({ owner, secs: 60 });
				// set the exchange fee to 0 to effectively ignore it
				await setExchangeFee({ owner, exchangeFeeRate: '0' });
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
						// let sUSDBalanceAfterExchange;
						beforeEach(async () => {
							await synthetix.exchange(sEUR, toUnit('1000'), sUSD, { from: account1 });
							// sUSDBalanceAfterExchange = await sUSDContract.balanceOf(account1);
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
									const logs = await getDecodedLogs({ hash: txn.tx });
									const sUSDProxy = await sUSDContract.proxy();

									decodedEventEqual({
										event: 'Burned',
										emittedFrom: sUSDProxy,
										args: [account1, amount],
										log: logs.find(({ name }) => name === 'Burned'),
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
								// fastForward(1);
								// timestamp = await currentTime();
								await exchangeRates.updateRates([sEUR], ['1'].map(toUnit), timestamp, {
									from: oracle,
								});
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
										const logs = await getDecodedLogs({ hash: txn.tx });
										const sUSDProxy = await sUSDContract.proxy();

										decodedEventEqual({
											event: 'Burned',
											emittedFrom: sUSDProxy,
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
											const logs = await getDecodedLogs({ hash: txn.tx });
											const sUSDProxy = await sUSDContract.proxy();

											decodedEventEqual({
												event: 'Burned',
												emittedFrom: sUSDProxy,
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

	describe('issue and burn on behalf', async () => {
		const authoriser = account1;
		const delegate = account2;

		beforeEach(async () => {
			// Assign the authoriser SNX
			await synthetix.transfer(account1, toUnit('20000'), {
				from: owner,
			});
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
					await setStatus({ owner, section, suspend: true });
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
						await setStatus({ owner, section, suspend: false });
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

			await delegateApprovals.approveBurnOnBehalf(delegate, { from: authoriser });

			await synthetix.burnSynthsToTargetOnBehalf(authoriser, { from: delegate });

			const sUSDBalanceAfter = await sUSDContract.balanceOf(account1);
			assert.bnEqual(sUSDBalanceAfter, toUnit('40'));
		});
	});
});
