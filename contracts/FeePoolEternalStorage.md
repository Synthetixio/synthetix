# FeePoolEternalStorage

This is just wrapper around the EternalStorage contract with a limited setup period and a setup function that sets each account's last fee withdrawal times.

## Inherited Contracts

* EternalStorage
* LimitedSetup

## Variables

* `LAST_FEE_WITHDRAWAL`: Just a const string with the value "last_fee_withdrawal".

## Functions

* `importFeeWithdrawalData(address[] accounts, uint[] feePeriodIDs)`: Callable only by the owner, and only during the six-week setup period.
