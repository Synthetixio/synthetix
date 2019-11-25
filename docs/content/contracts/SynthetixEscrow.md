# SynthetixEscrow

## Description

This contract holds the SNX which were escrowed at the time of the original token sale, releasing them according to a defined schedule.

The contract was subject to an eight week setup period during which the vesting schedules were set up.

This contract is augmented by the [`EscrowChecker`](EscrowChecker.md) contract, which is able to return vesting schedules as an array rather than one at a time.

**Source:** [SynthetixEscrow.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/SynthetixEscrow.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![SynthetixEscrow inheritance graph](../img/graphs/SynthetixEscrow.svg)
</centered-image>

---

### Libraries

* [`SafeMath`](SafeMath.md) for `uint`

---

## Variables

---

### `synthetix`

The address of the main [`Synthetix`](Synthetix.md) contract.

**Type:** `Synthetix public`

---

### `vestingSchedules`

Stores the vesting schedule for each for each account. Each schedule is a list of `(vesting timestamp, quantity)` pairs in ascending time order.

**Type:** `mapping(address => uint[2][]) public`

---

### `totalVestedAccountBalance`

The quantity of remaining tokens for a given account; it saves the recomputation involved in summing over [`vestingSchedules`](#vestingschedules) entries.

**Type:** `mapping(address => uint) public`

---

### `totalVestedBalance`

The total remaining vested balance in this contract.

**Type:** `uint public`

---

### `TIME_INDEX`

The vesting timestamp is the first entry in vesting schedule entry pairs.

**Type:** `uint constant`

**Value:** `0`

---

### `QUANTITY_INDEX`

The vesting quantity is the second entry in vesting schedule entry pairs.

**Type:** `uint constant`.

**Value:** `1`

---

### `MAX_VESTING_ENTRIES`

This constant limits vesting schedules to be shorter than twenty entries long so that iteration is bounded.

**Type:** `uint constant`.

**Value:** `20`

---

## Functions

---

### `constructor`

Initialises the [`Synthetix`](Synthetix.md) contract address, and the inherited [`Owned`](Owned.md) instance.

??? example "Details"
    **Signature**

    `constructor(address _owner, Synthetix _synthetix) public`

    **Superconstructors**

    * [`Owned(_owner)`](Owned.md#constructor)

---

### `setSynthetix`

Sets the address of the [`Synthetix`](Synthetix.md) contract, so that escrowed SNX can be transferred to accounts claiming them.

??? example "Details"
    **Signature**

    `setSynthetix(Synthetix _synthetix) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyOwner)

    **Emits**

    * [`SynthetixUpdated(_synthetix)`](#synthetixupdated)

---

### `balanceOf`

An alias to [`totalVestedAccountBalance[account]`](#totalvestedaccountbalance) for ERC20 integration.

??? example "Details"
    **Signature**

    `balanceOf(address account) public view returns (uint)`

---

### `numVestingEntries`

The number of entries in an account's vesting schedule, including those already claimed.

??? example "Details"
    **Signature**

    `numVestingEntries(account) public view returns (uint)`.

---

### `getVestingScheduleEntry`

Returns a particular schedule entry for an account, which is a pair of uints: `(vesting timestamp, SNX quantity)`.

This is here because the public function generated for [`vestingSchedules`](#vestingschedules) awkwardly requires the index into the pair as its third argument.

??? example "Details"
    **Signature**

    `getVestingScheduleEntry(address account, uint index) public view returns (uint[2])`

---

### `getVestingTime`

Returns the time at which a given schedule entry will vest.

??? example "Details"
    **Signature**

    `getVestingTime(address account, uint index) public view returns (uint)`

---

### `getVestingQuantity`

Returns the quantity of SNX a given schedule entry will yield.

??? example "Details"
    **Signature**

    `getVestingQuantity(address account, uint index) public view returns (uint)`

---

### `getNextVestingIndex`

Returns the index of the next vesting entry that will vest for a given account. Returns one past the end if there are none remaining.

The function iterates until it finds the first nonzero vesting entry timestamp, so the gas cost increases slightly as more entries vest.

??? example "Details"
    **Signature**

    `getNextVestingIndex(address account) public view returns (uint)`

---

### `getNextVestingEntry`

Returns the next vesting entry in the same manner as [`getNextVestingIndex`](#getnextvestingindex). Returns `[0,0]` if there is no next vesting entry.

??? example "Details"
    **Signature**

    `getNextVestingEntry(address account) public view returns (uint[2])`

---

### `getNextVestingTime`

Returns the timestamp of the next vesting entry. Returns `0` if there is no such entry.

??? example "Details"
    **Signature**

    `getNextVestingTime(address account) public view returns (uint)`

---

### `getNextVestingQuantity`

Returns the SNX quantity of the next vesting entry. Returns `0` if there is no such entry.

??? example "Details"
    **Signature**

    `getNextVestingQuantity(address account) public view returns (uint)`

---

### `withdrawSynthetix`

Transfers a quantity of SNX back to the Synthetix contract.

This was callable by the owner during the setup period in case too much SNX was deposited into the escrow contract.

??? example "Details"
    **Signature**

    `withdrawSynthetix(uint quantity) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)
    * [`LimitedSetup.onlyDuringSetup`](LimitedSetup.md#onlyduringsetup)

---

### `purgeAccount`

In case a vesting schedule was incorrectly set up, this function deletes all vesting information associated with a given account and updates relevant totals. `purgeAccount` was only callable by the owner, during the setup period.

??? example "Details"
    **Signature**

    `purgeAccount(address account)`
    
    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)
    * [`LimitedSetup.onlyDuringSetup`](LimitedSetup.md#onlyduringsetup)

---

### `appendVestingEntry`

Allows new entry to be added to the given account's vesting schedule by the owner during the setup period.

??? example "Details"
    **Signature**

    `appendVestingEntry(address account, uint time, uint quantity) public`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)
    * [`LimitedSetup.onlyDuringSetup`](LimitedSetup.md#onlyduringsetup)

    **Preconditions**

    * `time` must be in the future.
    * `quantity` must be nonzero.
    * The balance of SNX in the escrow contract must be sufficient to supply the new vesting entry.
    * The given account's existing schedule length must be less than [`MAX_VESTING_ENTRIES`](#max_vesting_entries).
    * `time` must be after the last vesting entry's timestamp, if such an entry exists.

---

### `addVestingSchedule`

During the setup period, allows the contract owner to add an entire vesting schedule to the given account by calling [`appendVestingEntry`](#appendvestingentry) in a loop. If a schedule already exists, the new one is concatenated to the old one.

!!! caution
    Beware that no checking is done that the lengths of the `times` and `quantities` input arrays are equal. If `times` is shorter than `quantities`, the extra quantities are ignored; if it is longer, the transaction reverts since past-the-end quantities will be 0 (but don't rely on this).

??? example "Details"
    **Signature**

    `addVestingSchedule(address account, uint[] times, uint[] quantities) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)
    * [`LimitedSetup.onlyDuringSetup`](LimitedSetup.md#onlyduringsetup)

    **Preconditions**

    * `times` must be a strictly increasing sequence.
    * Each entry in `quantities` must be nonzero.

---

### `vest`

Finds all vesting schedule entries that have come due for the caller and transfers the total quantity of tokens to them. Vested entries are overwritten with `[0,0]`.

??? example "Details"
    **Signature**

    `vest() external`

    **Emits**

    [`Vested(msg.sender, now, total)`](#vested)

    Where `total` is the sum of the quantities of this user's schedule entries with timestamps no later than the current time. That is, if multiple vesting entries were claimed, only one `Vested` event is emitted. No event is emitted if `total` is $0$.

---

## Events

---

### `SynthetixUpdated`

Records that the SNX contract address was altered.

**Signature:** `SynthetixUpdated(address newSynthetix)`

---

### `Vested`

Records that an account vested a quantity of tokens.

**Signature:** `Vested(address indexed beneficiary, uint time, uint value)`

---
