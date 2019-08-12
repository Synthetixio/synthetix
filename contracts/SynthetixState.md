# SynthetixState

This is a state contract, controlled by the main Synthetix contract.

## Inherited Contracts

* State
* LimitedSetup

## Referenced Contracts

* Synthetix as this contract's `State.associatedContract`
* `SafeMath` and `SafeDecimalMath` for `uint`.

## Structs

Holds the issuance state and preferred currency of users in the Synthetix system.
Individual wallets have an issuance data object associated with their address:

```solidity
struct IssuanceData {
    uint initialDebtOwnership; // Percentage of the total debt owned by this address at the time of issuance.
    uint debtEntryIndex; // The relative index of when this user issued tokens (entered the debt pool).
}
```

This is used to compute user's exit price and collateralisation ratio.

## Variables

* `issuanceData`: mapping from addresses to their issuance data struct.
* `totalIssuerCount`: number of people with outstanding synths.
* `debtLedger`: a list of factors indicating for each debt-modifying event, what effect it had on the percentage of debt of all other holders.
* `importedXDRAmount`: The number of XDRs outstanding from before the multicurrency transition.
* `issuanceRatio`: The current issuance ratio: set to 0.2 to begin with.
* `MAX_ISSUANCE_RATIO`: No more than 1 synth may be issued per dollar of backing.
* `preferredCurrency`: If users nominate a preferred currency, all synths they receive will be converted to this currency.

## Functions

* `setCurrentIssuanceData(address account, uint initialDebtOwnership)`: updates the debtOwnership of account, and sets their debt entry index to the current length of the debt ledger, without appending anything to that ledger.
* `clearIssuanceData(address account)`: Delete the issuance data associated with this account.
* `increment/decrementTotalIssuerCount()`: totalIssuerCount++/--
* `appendDebtLedgerValue(uint value)`: debtLedger.push(value)
* `setPreferredCurrency(address account, bytes4 currencyKey)`: preferredCurrency[account] = currencyKey. I guess you set this to 0 to unset the value?
* `setIssuanceRatio(uint _issuanceRatio)`: Sets the ratio for synth issuance. The new ratio cannot exceed MAX_ISSUANCE_RATIO.
* `importIssuerData(address[] accounts, uint[] sUSDAmounts)`: adds a certain amount of sUSD debt for a given set of accounts, but only during the setup period.
* `_addToDebtRegister(address account, uint amount)`: Called in a loop by importIssuerData. Duplicates the code from the `Synthetix` except that the total debt is given during initialisation (`importedXDRAmount`).
* `debtLedgerLength()`: View function.
* `lastDebtLedgerEntry()`: View function.
* `hasIssued(address account)`: True when the account has outstanding debt -- i.e. when `issuanceData[account].initialDebtOwnership > 0`
