// describe('appending Account issuance record', async function() {
//     async function checkIssuanceLedgerData(
//         address,
//         issuanceLedgerIndex,
//         expectedEntryIndex,
//         expectedDebtPercentage
//     ) {
//         const accountLedger = await feePool.accountIssuanceLedger(address, issuanceLedgerIndex); // accountIssuanceLedger[address][index]
//         console.log(
//             'ledger from feepool',
//             issuanceLedgerIndex,
//             accountLedger.debtEntryIndex.toString(),
//             accountLedger.debtPercentage.toString()
//         );
//         assert.bnEqual(accountLedger.debtEntryIndex, expectedEntryIndex);
//         assert.bnEqual(accountLedger.debtPercentage, expectedDebtPercentage);
//     }

//     const issuanceData = [
//         { address: account3, debtRatio: '1', debtEntryIndex: '0' },
//         { address: account3, debtRatio: '1', debtEntryIndex: '1' },
//         { address: account3, debtRatio: '1', debtEntryIndex: '2' },
//         { address: account3, debtRatio: '1', debtEntryIndex: '3' },
//         { address: account3, debtRatio: '1', debtEntryIndex: '4' },
//         { address: account3, debtRatio: '0.5', debtEntryIndex: '5' },
//     ];

//     it('should append account issuance record for curent feePeriod', async function() {
//         await feePool.setSynthetix(account1, { from: owner });

//         // mint more synths and append to ledger in Period[0]
//         await feePool.appendAccountIssuanceRecord(
//             issuanceData[0].address,
//             toPreciseUnit(issuanceData[0].debtRatio),
//             issuanceData[0].debtEntryIndex,
//             { from: account1 }
//         );

//         // check the latest accountIssuance for account1
//         await checkIssuanceLedgerData(
//             issuanceData[0].address,
//             0,
//             issuanceData[0].debtEntryIndex,
//             toPreciseUnit(issuanceData[0].debtRatio)
//         );

//         // reset synthetix to Synthetix
//         await feePool.setSynthetix(Synthetix.address, { from: owner });

//         await closeFeePeriod();

//         await feePool.setSynthetix(account1, { from: owner });

//         // mint more synths and append to ledger in Period[1]
//         await feePool.appendAccountIssuanceRecord(
//             issuanceData[1].address,
//             toPreciseUnit(issuanceData[1].debtRatio),
//             issuanceData[1].debtEntryIndex,
//             { from: account1 }
//         );

//         // accountIssuanceLedger[0] has new issuanceData
//         await checkIssuanceLedgerData(
//             issuanceData[1].address,
//             0,
//             issuanceData[1].debtEntryIndex,
//             toPreciseUnit(issuanceData[1].debtRatio)
//         );
//     });

//     it.only('should append account issuance record twice for each feePeriod, up to feePeriod length', async function() {
//         const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

//         // loop through 4 feePeriods
//         for (let i = 0; i < length; i++) {
//             await feePool.setSynthetix(account1, { from: owner });

//             // mint more synths and append to ledger in Period[0]
//             console.log("appending data, debt ratio, debtEntryIndex", 1, i);
//             await feePool.appendAccountIssuanceRecord(account3, 1, i, {
//                 from: account1,
//             });

//             console.log("appending data, debt ratio, debtEntryIndex", 2, i+1);
//             await feePool.appendAccountIssuanceRecord(account3, 2, i + 1, {
//                 from: account1,
//             });

//             // reset synthetix to Synthetix
//             await feePool.setSynthetix(Synthetix.address, { from: owner });

//             await closeFeePeriod();
//         }

//         // accountIssuanceLedger[0] for account3 should be the last data set for period
//         await checkIssuanceLedgerData(account3, 0, '4', '2');

//         // accountIssuanceLedger[1] for account3 should be the last data set for period
//         await checkIssuanceLedgerData(account3, 1, '3', '2');

//         // accountIssuanceLedger[2] for account3 should be the last data set for period
//         await checkIssuanceLedgerData(account3, 2, '2', '2');

//         // accountIssuanceLedger[3] for account3 should be the last data set for period
//         // await checkIssuanceLedgerData(account3, 3, '1', '2');
//     });
// });
