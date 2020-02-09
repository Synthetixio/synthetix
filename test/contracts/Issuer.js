require('.'); // import common test scaffolding

const ExchangeRates = artifacts.require('ExchangeRates');
const Escrow = artifacts.require('SynthetixEscrow');
const RewardEscrow = artifacts.require('RewardEscrow');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const SynthetixState = artifacts.require('SynthetixState');
const Synth = artifacts.require('Synth');

const {
	currentTime,
	fastForward,
	multiplyDecimal,
	divideDecimal,
	toUnit,
} = require('../utils/testUtils');

const { toBytes32 } = require('../..');

contract('Issuer (via Synthetix)', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, sBTC, iBTC] = ['sUSD', 'sAUD', 'sEUR', 'SNX', 'sBTC', 'iBTC'].map(
		toBytes32
	);

	const [, owner, account1, account2, account3, account6] = accounts;

	let synthetix,
		synthetixState,
		exchangeRates,
		feePool,
		sUSDContract,
		escrow,
		rewardEscrow,
		oracle,
		timestamp;

	async function getRemainingIssuableSynths(account) {
		const result = await synthetix.remainingIssuableSynths(account);
		return result[0];
	}

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		escrow = await Escrow.deployed();
		rewardEscrow = await RewardEscrow.deployed();

		synthetix = await Synthetix.deployed();
		synthetixState = await SynthetixState.deployed();
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));

		// Send a price update to guarantee we're not stale.
		oracle = await exchangeRates.oracle();
		timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC, iBTC],
			['0.5', '1.25', '0.1', '5000', '4000'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	});

	// Issuance
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

	it('should fail when trying to burn synths that do not exist', async () => {
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

		// Burning any amount of sUSD from account1 should fail
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

	// These tests take a long time to run
	// ****************************************

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

	// ****************************************

	it('should not change debt balance % if exchange rates change', async () => {
		let newAUDRate = toUnit('0.5');
		let timestamp = await currentTime();
		await exchangeRates.updateRates([sAUD], [newAUDRate], timestamp, { from: oracle });

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
		const account1DebtRatio = divideDecimal(amountIssuedAcc1, totalIssuedSynthsUSD, PRECISE_UNIT);
		const account2DebtRatio = divideDecimal(amountIssuedAcc2, totalIssuedSynthsUSD, PRECISE_UNIT);

		timestamp = await currentTime();
		newAUDRate = toUnit('1.85');
		await exchangeRates.updateRates([sAUD], [newAUDRate], timestamp, { from: oracle });

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

	it("should correctly calculate a user's maximum issuable synths without prior issuance", async () => {
		const rate = await exchangeRates.rateForCurrency(toBytes32('SNX'));
		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
			from: owner,
		});
		const issuanceRatio = await synthetixState.issuanceRatio();

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

		const issuanceRatio = await synthetixState.issuanceRatio();
		const amountIssued = web3.utils.toBN('1234');
		await synthetix.issueSynths(toUnit(amountIssued), { from: account1 });

		const expectedIssuableSynths = multiplyDecimal(
			toUnit(issuedSynthetixs),
			multiplyDecimal(snx2usdRate, issuanceRatio)
		);

		const maxIssuableSynths = await synthetix.maxIssuableSynths(account1);
		assert.bnEqual(expectedIssuableSynths, maxIssuableSynths);
	});

	it('should error when calculating maximum issuance when the SNX rate is stale', async () => {
		// Add stale period to the time to ensure we go stale.
		await fastForward((await exchangeRates.rateStalePeriod()) + 1);

		await exchangeRates.updateRates([sAUD, sEUR], ['0.5', '1.25'].map(toUnit), timestamp, {
			from: oracle,
		});

		await assert.revert(synthetix.maxIssuableSynths(account1));
	});

	it('should error when calculating maximum issuance when the currency rate is stale', async () => {
		// Add stale period to the time to ensure we go stale.
		await fastForward((await exchangeRates.rateStalePeriod()) + 1);

		await exchangeRates.updateRates([sEUR, SNX], ['1.25', '0.12'].map(toUnit), timestamp, {
			from: oracle,
		});

		await assert.revert(synthetix.maxIssuableSynths(account1));
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

	it("should correctly calculate a user's remaining issuable synths with prior issuance", async () => {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const issuanceRatio = await synthetixState.issuanceRatio();

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
		const issuanceRatio = await synthetixState.issuanceRatio();

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

	it('should not be possible to transfer locked synthetix', async () => {
		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
			from: owner,
		});

		// Issue
		const amountIssued = toUnit('2000');
		await synthetix.issueSynths(amountIssued, { from: account1 });

		await assert.revert(
			synthetix.transfer(account2, toUnit(issuedSynthetixs), {
				from: account1,
			})
		);
	});

	it("should lock synthetix if the user's collaterisation changes to be insufficient", async () => {
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

	it("should lock newly received synthetix if the user's collaterisation is too high", async () => {
		// Set sEUR for purposes of this test
		const timestamp1 = await currentTime();
		await exchangeRates.updateRates([sEUR], [toUnit('0.75')], timestamp1, { from: oracle });

		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
			from: owner,
		});
		await synthetix.transfer(account2, toUnit(issuedSynthetixs), {
			from: owner,
		});

		const maxIssuableSynths = await synthetix.maxIssuableSynths(account1);

		// Issue
		await synthetix.issueSynths(maxIssuableSynths, { from: account1 });

		// Exchange into sEUR
		await synthetix.exchange(sUSD, maxIssuableSynths, sEUR, { from: account1 });

		// Ensure that we can transfer in and out of the account successfully
		await synthetix.transfer(account1, toUnit('10000'), {
			from: account2,
		});
		await synthetix.transfer(account2, toUnit('10000'), {
			from: account1,
		});

		// Increase the value of sEUR relative to synthetix
		const timestamp2 = await currentTime();
		await exchangeRates.updateRates([sEUR], [toUnit('2.10')], timestamp2, { from: oracle });

		// Ensure that the new synthetix account1 receives cannot be transferred out.
		await synthetix.transfer(account1, toUnit('10000'), {
			from: account2,
		});
		await assert.revert(synthetix.transfer(account2, toUnit('10000'), { from: account1 }));
	});

	it('should unlock synthetix when collaterisation ratio changes', async () => {
		// Set sAUD for purposes of this test
		const timestamp1 = await currentTime();
		const aud2usdrate = toUnit('2');

		await exchangeRates.updateRates([sAUD], [aud2usdrate], timestamp1, { from: oracle });

		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), {
			from: owner,
		});

		// Issue
		const issuedSynths = await synthetix.maxIssuableSynths(account1);
		await synthetix.issueSynths(issuedSynths, { from: account1 });
		const remainingIssuable = await getRemainingIssuableSynths(account1);
		assert.bnClose(remainingIssuable, '0');

		const transferable1 = await synthetix.transferableSynthetix(account1);
		assert.bnEqual(transferable1, '0');

		// Exchange into sAUD
		await synthetix.exchange(sUSD, issuedSynths, sAUD, { from: account1 });

		// Increase the value of sAUD relative to synthetix
		const timestamp2 = await currentTime();
		const newAUDExchangeRate = toUnit('1');
		await exchangeRates.updateRates([sAUD], [newAUDExchangeRate], timestamp2, { from: oracle });

		const transferable2 = await synthetix.transferableSynthetix(account1);
		assert.equal(transferable2.gt(toUnit('1000')), true);
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
});
