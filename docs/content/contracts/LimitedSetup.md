# LimitedSetup

## Description

This contract allows certain functions within inheriting contracts to only operate during a specific limited setup period. After this period elapses, any functions with the [`onlyDuringSetup`](#onlyduringsetup) modifier no longer operate.

**Source:** [LimitedSetup.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/LimitedSetup.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![LimitedSetup inheritance graph](../img/graphs/LimitedSetup.svg)
</centered-image>

---

## Variables

---

### `setupExpiryTime`

The timestamp at which functions which have the [`onlyDuringSetup`](#onlyduringsetup) modifier will cease operating. This is determined by the `setupDuration` parameter passed into the contract [constructor](#constructor).

**Type:** `uint`

---

## Functions

---

### `constructor`

Sets [`setupExpiryTime`](#setupexpirytime) to the current timestamp plus `setupDuration` seconds.

??? example "Details"

    **Signature**
    
    `constructor(uint setupDuration) public`

---

## Modifiers

---

### `onlyDuringSetup`

Reverts the transaction if the current timestamp is not before [`setupExpiryTime`](#setupexpirytime).

---
