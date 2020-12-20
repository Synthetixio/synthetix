'use strict';

const { artifacts, contract } = require('hardhat');

const { assert } = require('./common');

const { toPreciseUnit, toUnit } = require('../utils')();
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const FeePoolState = artifacts.require('FeePoolState');

contract('FeePoolState', async accounts => {
	const [
		deployerAccount,
		owner,
		,
		feePoolAccount,
		account1,
		account2,
		account3,
		account4,
		account5,
		account6,
	] = accounts;

	let feePoolState;

	beforeEach(async () => {
		feePoolState = await FeePoolState.new(owner, feePoolAccount, { from: deployerAccount });
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: FeePoolState.abi,
			ignoreParents: ['Owned', 'LimitedSetup'],
			expected: ['setFeePool', 'appendAccountIssuanceRecord', 'importIssuerData'],
		});
	});

	it('should set constructor params on deployment', async () => {
		assert.equal(await feePoolState.feePool(), feePoolAccount);
		assert.equal(await feePoolState.owner(), owner);
	});

	describe('setFeePool()', () => {
		it('can only be invoked by the owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: feePoolState.setFeePool,
				accounts,
				address: owner,
				args: [account1],
			});
		});
	});

	describe('Appending Account issuance record', async () => {
		async function checkIssuanceLedgerData(
			address,
			issuanceLedgerIndex,
			expectedEntryIndex,
			expectedDebtPercentage
		) {
			const accountLedger = await feePoolState.accountIssuanceLedger(address, issuanceLedgerIndex); // accountIssuanceLedger[address][index]
			// console.log(
			// 	'debtEntryIndex, debtPercentage',
			// 	issuanceLedgerIndex,
			// 	accountLedger.debtEntryIndex.toString(),
			// 	accountLedger.debtPercentage.toString()
			// );
			assert.bnEqual(accountLedger.debtEntryIndex, expectedEntryIndex);
			assert.bnEqual(accountLedger.debtPercentage, expectedDebtPercentage);
		}

		const issuanceData = [
			{ address: account3, debtRatio: toPreciseUnit('1'), debtEntryIndex: '0' },
			{ address: account3, debtRatio: toPreciseUnit('0.5'), debtEntryIndex: '1' },
			{ address: account3, debtRatio: toPreciseUnit('0.25'), debtEntryIndex: '2' },
			{ address: account3, debtRatio: toPreciseUnit('0.125'), debtEntryIndex: '3' },
			{ address: account3, debtRatio: toPreciseUnit('0.625'), debtEntryIndex: '4' },
			{ address: account3, debtRatio: toPreciseUnit('0.3125'), debtEntryIndex: '5' },
		];

		it('should return the issuanceData that exists that is within the closingDebtIndex via applicableIssuanceData', async () => {
			// Fill the accountIssuanceLedger with debt entries per period
			for (var i = 0; i < issuanceData.length; i++) {
				await feePoolState.appendAccountIssuanceRecord(
					issuanceData[i].address,
					issuanceData[i].debtRatio,
					issuanceData[i].debtEntryIndex,
					i + 1,
					{
						from: feePoolAccount,
					}
				);
			}

			// check the latest accountIssuance for account3
			// address, issuanceLedgerIndex, expectedEntryIndex, expectedDebtPercentage
			await checkIssuanceLedgerData(account3, 0, '5', toPreciseUnit('0.3125'));
			await checkIssuanceLedgerData(account3, 1, '4', toPreciseUnit('0.625'));
			await checkIssuanceLedgerData(account3, 2, '3', toPreciseUnit('0.125'));
			await checkIssuanceLedgerData(account3, 3, '2', toPreciseUnit('0.25'));
			await checkIssuanceLedgerData(account3, 4, '1', toPreciseUnit('0.5'));
			await checkIssuanceLedgerData(account3, 5, '0', toPreciseUnit('1'));

			let accountsDebtEntry;
			// Assert that applicableIssuanceData returns the correct data
			accountsDebtEntry = await feePoolState.applicableIssuanceData(account3, 6);
			assert.bnEqual(accountsDebtEntry[0], toPreciseUnit('.3125'));
			assert.bnEqual(accountsDebtEntry[1], 5);

			accountsDebtEntry = await feePoolState.applicableIssuanceData(account3, 5);
			assert.bnEqual(accountsDebtEntry[0], toPreciseUnit('.3125'));
			assert.bnEqual(accountsDebtEntry[1], 5);

			accountsDebtEntry = await feePoolState.applicableIssuanceData(account3, 4);
			assert.bnEqual(accountsDebtEntry[0], toPreciseUnit('.625'));
			assert.bnEqual(accountsDebtEntry[1], 4);

			accountsDebtEntry = await feePoolState.applicableIssuanceData(account3, 3);
			assert.bnEqual(accountsDebtEntry[0], toPreciseUnit('.125'));
			assert.bnEqual(accountsDebtEntry[1], 3);

			accountsDebtEntry = await feePoolState.applicableIssuanceData(account3, 2);
			assert.bnEqual(accountsDebtEntry[0], toPreciseUnit('.25'));
			assert.bnEqual(accountsDebtEntry[1], 2);

			accountsDebtEntry = await feePoolState.applicableIssuanceData(account3, 1);
			assert.bnEqual(accountsDebtEntry[0], toPreciseUnit('.5'));
			assert.bnEqual(accountsDebtEntry[1], 1);

			accountsDebtEntry = await feePoolState.applicableIssuanceData(account3, 0);
			assert.bnEqual(accountsDebtEntry[0], toPreciseUnit('1'));
			assert.bnEqual(accountsDebtEntry[1], 0);
		});

		it('should return the issuanceData for an account given an index', async () => {
			let accountsDebtEntry;

			// simulate a mint and append debtRatio to ledger in Period[0]
			const firstIndex = 1;
			await feePoolState.appendAccountIssuanceRecord(account1, toPreciseUnit('1'), firstIndex, 0, {
				from: feePoolAccount,
			});

			// check the latest accountIssuance for account1
			accountsDebtEntry = await feePoolState.getAccountsDebtEntry(account1, 0);

			// Assert they have their matching inputs
			assert.bnEqual(accountsDebtEntry[0], toPreciseUnit('1'));
			assert.bnEqual(accountsDebtEntry[1], firstIndex);

			// simulate a mint and append debtRatio to ledger in Period[0]
			const secondIndex = 1;
			await feePoolState.appendAccountIssuanceRecord(
				account1,
				toPreciseUnit('.5'),
				secondIndex,
				0,
				{
					from: feePoolAccount,
				}
			);

			// check the latest accountIssuance for account1
			accountsDebtEntry = await feePoolState.getAccountsDebtEntry(account1, 0);

			// Assert they have their matching inputs
			assert.bnEqual(accountsDebtEntry[0], toPreciseUnit('.5'));
			assert.bnEqual(accountsDebtEntry[1], secondIndex);
		});

		it('should importIssuerData', async () => {
			const accounts = [account1, account2, account3, account4, account5, account6];
			const ratios = [
				toPreciseUnit('1'),
				toPreciseUnit('0.5'),
				toPreciseUnit('0.25'),
				toPreciseUnit('0.125'),
				toPreciseUnit('0.625'),
				toPreciseUnit('0.3125'),
			];
			const issuanceLedgerIndex = 1;
			const dummyDebtEntryIndex = 5555;

			// Import issuser data into the last closed period and 5555 as the feePeriodCloseIndex
			await feePoolState.importIssuerData(
				accounts,
				ratios,
				issuanceLedgerIndex,
				dummyDebtEntryIndex,
				{
					from: owner,
				}
			);

			// Iterate the accounts
			for (let i = 0; i < accounts.length; i++) {
				// accountIssuanceLedger[address][index]
				const accountLedger = await feePoolState.accountIssuanceLedger(
					accounts[i],
					issuanceLedgerIndex
				);
				// console.log(
				// 	'debtEntryIndex, debtPercentage',
				// 	issuanceLedgerIndex,
				// 	accountLedger.debtEntryIndex.toString(),
				// 	accountLedger.debtPercentage.toString()
				// );

				// Assert they have their matching ratios
				assert.bnEqual(accountLedger.debtPercentage, ratios[i]);
				assert.bnEqual(accountLedger.debtEntryIndex, dummyDebtEntryIndex);
			}
		});

		it('should append account issuance record for curent feePeriod', async () => {
			const currentPeriodStartDebtIndex = 0;

			// simulate a mint and append debtRatio to ledger in Period[0]
			await feePoolState.appendAccountIssuanceRecord(
				issuanceData[0].address,
				issuanceData[0].debtRatio,
				issuanceData[0].debtEntryIndex,
				currentPeriodStartDebtIndex,
				{ from: feePoolAccount }
			);

			// check the latest accountIssuance for account1
			await checkIssuanceLedgerData(
				issuanceData[0].address,
				0,
				issuanceData[0].debtEntryIndex,
				issuanceData[0].debtRatio
			);

			// simulate a mint and append to ledger in Period[0]
			await feePoolState.appendAccountIssuanceRecord(
				issuanceData[1].address,
				issuanceData[1].debtRatio,
				issuanceData[1].debtEntryIndex,
				currentPeriodStartDebtIndex,
				{ from: feePoolAccount }
			);

			// accountIssuanceLedger[0] has new issuanceData
			await checkIssuanceLedgerData(
				issuanceData[1].address,
				0,
				issuanceData[1].debtEntryIndex,
				issuanceData[1].debtRatio
			);
		});

		it('should append account issuance record twice for each feePeriod, up to feePeriod length', async () => {
			const FEE_PERIOD_LENGTH = (await feePoolState.FEE_PERIOD_LENGTH()).toNumber();
			const initialDebtRatio = toUnit('1');
			const secondDebtRatio = toUnit('.5');
			let entryIndexCounter = 0;
			let currentPeriodStartDebtIndex = 0;

			// loop through the feePeriods
			for (let i = 0; i < FEE_PERIOD_LENGTH; i++) {
				// write an entry to debt ledger in Period[0]
				// console.log('init data entry,', initialDebtRatio.toString(), entryIndexCounter);
				await feePoolState.appendAccountIssuanceRecord(
					account3,
					initialDebtRatio,
					entryIndexCounter,
					currentPeriodStartDebtIndex,
					{
						from: feePoolAccount,
					}
				);
				entryIndexCounter++;
				// overwrite the previous entry to debt ledger in Period[0]
				// console.log('overwrite data,', secondDebtRatio.toString(), entryIndexCounter);
				await feePoolState.appendAccountIssuanceRecord(
					account3,
					secondDebtRatio,
					entryIndexCounter,
					i + 1,
					{
						from: feePoolAccount,
					}
				);
				entryIndexCounter++;
				// Simulate the closing of this period (closeFeePeriod)
				currentPeriodStartDebtIndex = entryIndexCounter + 1;
			}

			// Assert that we always have the Last issuance data for each fee period
			// The latest debtEntryIndex will be in the current Fee Period index [0]
			await checkIssuanceLedgerData(account3, 0, '11', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 1, '9', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 2, '7', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 3, '5', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 4, '3', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 5, '1', secondDebtRatio);
		});

		it('should append account issuance record twice for each feePeriod, beyond the fee period length', async () => {
			const FEE_PERIOD_LENGTH = 12;
			const initialDebtRatio = toUnit('1');
			const secondDebtRatio = toUnit('.5');
			let entryIndexCounter = 0;
			let currentPeriodStartDebtIndex = 0;

			// loop through the feePeriods
			for (let i = 0; i < FEE_PERIOD_LENGTH; i++) {
				// write an entry to debt ledger in Period[0]
				// console.log('init data entry,', initialDebtRatio.toString(), entryIndexCounter);
				await feePoolState.appendAccountIssuanceRecord(
					account3,
					initialDebtRatio,
					entryIndexCounter,
					currentPeriodStartDebtIndex,
					{
						from: feePoolAccount,
					}
				);
				entryIndexCounter++;
				// overwrite the previous entry to debt ledger in Period[0]
				// console.log('overwrite data,', secondDebtRatio.toString(), entryIndexCounter);
				await feePoolState.appendAccountIssuanceRecord(
					account3,
					secondDebtRatio,
					entryIndexCounter,
					i + 1,
					{
						from: feePoolAccount,
					}
				);
				entryIndexCounter++;
				// Simulate the closing of this period (closeFeePeriod)
				currentPeriodStartDebtIndex = entryIndexCounter + 1;
			}

			// Assert that we always have the Last issuance data for each fee period
			// The latest debtEntryIndex will be in the current Fee Period index [0]
			await checkIssuanceLedgerData(account3, 0, '23', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 1, '21', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 2, '19', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 3, '17', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 4, '15', secondDebtRatio);

			await checkIssuanceLedgerData(account3, 5, '13', secondDebtRatio);
		});
	});

	// TODO checks SynthetixState debt entry is same as stored FeePoolState Entry
	// it.only('should allow an issuer to issue max synths and track debt issuance in feePool', async function() {
	// 	// Send a price update to guarantee we're not depending on values from outside this test.
	// 	const oracle = await exchangeRates.oracle();
	// 	const timestamp = await currentTime();

	// 	await exchangeRates.updateRates(
	// 		[sAUD, sEUR, SNX],
	// 		['0.5', '1.25', '0.1'].map(toUnit),
	// 		timestamp,
	// 		{ from: oracle }
	// 	);

	// 	// Give some SNX to account1
	// 	await synthetix.transfer(account1, toUnit('10000'), { from: owner });

	// 	// Determine maximum amount that can be issued.
	// 	const maxIssuable = await synthetix.maxIssuableSynths(account1, sUSD);

	// 	// Issue
	// 	await synthetix.issueSynths(maxIssuable, { from: account1 });

	// 	// There should be 200 sUSD of value in the system
	// 	assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('200'));

	// 	// And account1 should own all of it.
	// 	assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('200'));

	// 	// And feePool.accountIssuanceLedger[account1] should record debt minted
	// 	const issuanceDataFromState = await synthetixState.issuanceData(account1);
	// 	const feePoolLedger = await feePool.accountIssuanceLedger(account1, 0);

	// 	assert.bnEqual(feePoolLedger.debtEntryIndex, 0);
	// 	assert.bnEqual(feePoolLedger.debtEntryIndex, issuanceDataFromState.debtEntryIndex);
	// 	assert.bnEqual(feePoolLedger.debtPercentage, toPreciseUnit('1'));
	// 	assert.bnEqual(feePoolLedger.debtPercentage, issuanceDataFromState.initialDebtOwnership);
	// });

	// it('should allow an issuer to issue synths many times and track debt issuance in feePool', async function() {
	// 	// Send a price update to guarantee we're not depending on values from outside this test.
	// 	const oracle = await exchangeRates.oracle();
	// 	const timestamp = await currentTime();

	// 	await exchangeRates.updateRates(
	// 		[sAUD, sEUR, SNX],
	// 		['0.5', '1.25', '0.1'].map(toUnit),
	// 		timestamp,
	// 		{ from: oracle }
	// 	);

	// 	// Give some SNX to account1
	// 	await synthetix.transfer(account1, toUnit('20000'), { from: owner });

	// 	// Issue
	// 	await synthetix.issueSynths(toUnit('200'), { from: account1 });

	// 	// There should be 200 sUSD of value in the system
	// 	assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('200'));

	// 	// And account1 should own all of it.
	// 	assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('200'));

	// 	// And feePool.accountIssuanceLedger[account1] should record debt minted
	// 	let issuanceDataFromState, feePoolLedger;
	// 	issuanceDataFromState = await synthetixState.issuanceData(account1);
	// 	feePoolLedger = await feePool.accountIssuanceLedger(account1, 0);

	// 	assert.bnEqual(feePoolLedger.debtEntryIndex, 0);
	// 	assert.bnEqual(feePoolLedger.debtEntryIndex, issuanceDataFromState.debtEntryIndex);
	// 	assert.bnEqual(feePoolLedger.debtPercentage, toPreciseUnit('1'));
	// 	assert.bnEqual(feePoolLedger.debtPercentage, issuanceDataFromState.initialDebtOwnership);

	// 	// Issue
	// 	await synthetix.issueSynths(toUnit('200'), { from: account1 });

	// 	// And account1 should own all of it.
	// 	assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('400'));

	// 	issuanceDataFromState = await synthetixState.issuanceData(account1);
	// 	feePoolLedger = await feePool.accountIssuanceLedger(account1, 0);

	// 	// debtEntryIndex is updated to 1 and still own whole system
	// 	assert.bnEqual(feePoolLedger.debtEntryIndex, 1);
	// 	assert.bnEqual(feePoolLedger.debtEntryIndex, issuanceDataFromState.debtEntryIndex);
	// 	assert.bnEqual(feePoolLedger.debtPercentage, toPreciseUnit('1'));
	// 	assert.bnEqual(feePoolLedger.debtPercentage, issuanceDataFromState.initialDebtOwnership);
	// });
});
