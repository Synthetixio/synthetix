# EscrowChecker

## Description

A small utility contract that augments the SNX escrow contract to allow extracting a user's schedule as an array rather than as individual entries.

**Source:** [EscrowChecker.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/EscrowChecker.sol)

## Inheritance Graph

<inheritance-graph>
    ![EscrowChecker inheritance graph](../img/graphs/EscrowChecker.svg)
</inheritance-graph>

## Related Contracts

* [SynthetixEscrow](SynthetixEscrow.md)

## Variables

---

### `synthetix_escrow`

The [SNX escrow contract](SynthetixEscrow.md).

**Type:** `SynthetixEscrow public`

---

<section-sep />


## Functions

---

### `constructor`

Initialises the [synthetix escrow address](#synthetix_escrow).

???+ example "Details"
    **Signature**

    `constructor(SynthetixEscrow _esc) public`

---

### `checkAccountSchedule`

Returns the given address's vesting schedule as up to 16 `uints`, composed of an alternating sequence of up to 8 `(timestamp, quantity)` pairs, as per [`SynthetixEscrow.getVestingScheduleEntry`](SynthetixEscrow.md#getVestingScheduleEntry).

Vested entries are not skipped, and appear as a leading sequence of zeroes.

???+ example "Details"
    **Signature**

    `checkAccountSchedule(address account) public view returns (uint[16])`
