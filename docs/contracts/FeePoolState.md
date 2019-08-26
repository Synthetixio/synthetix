# FeePoolState

[Go Back](../contracts.md)

## Notes

Stores the issuance percentage for each address for up to six fee periods. Note that this contract limits to 6 periods, while the FeePool contract limits it to only 3.

NOTE: Typo in the file docstring: "caclulate".

## Inherited Contracts

* SelfDestructible
* [LimitedSetup](LimitedSetup.md)
* ^[State](State.md)
* ^[Owned](Owned.md)

## Related Contracts

* <>[FeePool](FeePool.md)
* \>[SafeDecimalMath](SafeDecimalMath.md)
* \>SafeMath

## Structs

```solidity
// As in SynthetixState.sol, modulo naming, but one per fee period.
struct IssuanceData {
    uint debtPercentage;
    uint debtEntryIndex;
}
```

## Variables

* `FEE_PERIOD_LENGTH: uint8 constant public`: The number of fee periods worth of issuance data to keep. Initialised to 6; note the inconsistency with the corresponding constant in `FeePool`, which is set to 3.
* `accountIssuanceLedger`: A list of up to 6 issuance data entries per account, for the last 6 fee periods they changed their issuance levels in, from newest to oldest (decreasing debt ledger indexes).

## Functions

* `setFeePool(FeePool _feePool)`: Only callable by the contract owner.
* `getAccountsDebtEntry(address account, uint index)`: Accesses `accountIssuanceLedger`. It is an error to access an entry past the end of the array.
* `applicableIssuanceData(address account, uint closingDebtIndex)`: Retrieve the most-recent issuance data entry for this user which closed no later than the provided index. That is: the oldest entry in their ledger up to that index. TODO: Not sure what happens if there is no such entry. I think it returns (0,0), but this needs to be verified.
* `appendAccountIssuanceRecord(address account, uint debtRatio, uint debtEntryIndex, uint currentPeriodStartDebtIndex)`: Only callable by the fee pool contract. If the latest entry in this account's issuance ledger was from this period, overwrite it.
  Otherwise, shift the existing entries down one spot, dropping the last one (using `issuanceDataIndexOrder`), and add a new entry at the head of the list for the current fee period.
  Note that debtRatio is misnamed, it's actually the global debt percentage of this account.
  Note: typo in one of hte comments: "its" -> "it's".
* `issuanceDataIndexOrder(address account)`: Shifts this account's array of ledge entries down one place, overwriting the last entry.
* `importIssuerData(address[] accounts, uint[] ratios, uint periodToInsert, uint feePeriodCloseIndex)`: Only callable by the owner, and only during the six week setup period. Allowed the issuance ledger to be initialised from the previous issuance ledger state. NOTE: Docstring needs a spell check.

## Events

* `IssuanceDebtRatioEntry(address indexed account, uint debtRatio, uint feePeriodCloseIndex)`
