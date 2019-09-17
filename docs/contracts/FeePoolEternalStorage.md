# FeePoolEternalStorage

## Description

FeePoolEternalStorage is currently used only to store the last fee withdrawal timestamp for each address. See [`FeePool._claimFees`](FeePool.md#_claimFees) and [`FeePool.feesByPeriod`](FeePool.md#feesbyperiod) for details of what this information is used for.

This contract is just wrapper around [EternalStorage](EternalStorage.md) with a limited setup period and a setup function that sets each account's last fee withdrawal times.

<section-sep />

## Inheritance Graph

<inheritance-graph>
    ![FeePoolEternalStorage inheritance graph](../img/graphs/FeePoolEternalStorage.svg)
</inheritance-graph>

<section-sep />

## Variables

---

### `LAST_FEE_WITHDRAWAL`

This is a const string with the value "last_fee_withdrawal", to be used to access the correct slot in the eternal storage map.

This is hashed together with an address to obtain the key for that address's last withdrawal time (a `uint`). See [`FeePool.getLastFeeWithdrawal`](FeePool.md#getlastfeewithdrawal) and [`FeePool.setLastFeeWithdrawal`](FeePool.md#setlastfeewithdrawal) for applications.

**Type:** `bytes32 const`

---

<section-sep />

## Functions

---

### `constructor`

Initialises the inherited [`EternalStorage`](EternalStorage.md) instance, and sets a [limited setup period](LimitedSetup.md) of six weeks.

???+ example "Details"

    **Signature**

    `constructor(address _owner, address _feePool) public`

    **Superconstructors**

    * [`EternalStorage(_owner, _feePool)`](EternalStorage.md#constructor)
    * [`LimitedSetup(6 weeks)`](LimitedSetup.md#constructor)

---

### `importFeeWithdrawalData`

This is a helper to import fee withdrawal information from a previous version of the system during the setup period.

???+ example "Details"

    **Signature**

    `importFeeWithdrawalData(address[] accounts, uint[] feePeriodIDs) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)
    * [`LimitedSetup.onlyDuringSetup`](LimitedSetup.md#onlyduringsetup)

    **Preconditions**

    * The length of the accounts and feePeriodIDs arrays must be equal, otherwise the transaction reverts.

---

<section-sep />
