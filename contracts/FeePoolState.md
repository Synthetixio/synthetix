# FeePoolState

Stores the issuance percentage for each address for up to six fee periods. Note that this contract limits to 6 periods, while the FeePool contract limits it to only 3.

## Inherited Contracts

* SelfDestructible
* LimitedSetup

## Referenced Contracts

* FeePool

## Structs

```solidity
// As in SynthetixState.sol, modulo naming, but one per fee period.
struct IssuanceData {
    uint debtPercentage;
    uint debtEntryIndex;
}
```

## Variables

* `FEE_PERIOD_LENGTH`: 6; note the inconsistency with the corresponding constant in FeePool, which is set to 3.
* `accountIssuanceLedger`: A list of up to 6 issuance data entries per account, for the last 6 fee periods they changed their issuance levels in, from newest to oldest (decreasing debt ledger indexes).

## Functions

* `getAccountsDebtEntry(address account, uint index`: Accesses `accountIssuanceLedger`
* `applicableIssuanceData(address account, uint closingDebtIndex)`: Retrieve the most-recent issuance data entry for this user which closed no later than the provided index. Comment is wrong.
* `appendAccountIssuanceRecord(address account, uint debtRatio, uint debtEntryIndex, uint currentPeriodStartDebtIndex)`: If the latest entry in this account's issuance ledger was from this period, overwrite it.
  Otherwise, shift the existing entries down one spot, dropping the last one, and add a new entry at the head of the list for the current fee period.
  Note that debtRatio is misnamed, it's actually the global debt percentage of this account.
* `importIssuerData(address[] accounts, uint[] ratios, uint periodToInsert, uint feePeriodCloseIndex)`: Docstring needs a spell check.
