# RewardEscrow

This is the mechanism for distributing SNX rewards from the inflationary supply. When an SNX staker claims fees, the inflationary reward component is escrowed in this contract and an entry is added to an escrow schedule for that staker for them to claim after a year. These vesting schedules can only be appended to by the [FeePool](FeePool.md) contract.

The logic of RewardEscrow is derived from the [SynthetixEscrow](SynthetixEscrow.md) contract.

**Source:** [RewardEscrow.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/RewardEscrow.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![RewardEscrow inheritance graph](../img/graphs/RewardEscrow.svg)
</centered-image>

---

### Related Contracts

- <>[Synthetix](Synthetix.md)
- <>[FeePool](FeePool.md)

---

### Libraries

- [`SafeMath`](SafeMath.md) for `uint`

---

## Variables

---

### `synthetix`

The address of the main [`Synthetix`](Synthetix.md) contract.

**Type:** `Synthetix public`

---

### `feePool`

The address of the [`FeePool`](FeePool.md) contract.

**Type:** `FeePool public`

---

### `vestingSchedules`

Stores the vesting schedule for each for each account. Each schedule is a list of `(vesting timestamp, quantity)` pairs in ascending time order.

**Type:** `mapping(address => uint[2][]) public`

---

### `totalEscrowedAccountBalance`

The quantity of remaining tokens for each account; it saves the recomputation involved in summing over [`vestingSchedules`](#vestingschedules) entries.

**Type:** `mapping(address => uint) public`

---

### `totalVestedAccountBalance`

The quantity of tokens that have already been vested for each account.

**Type:** `mapping(address => uint) public`

---

### `totalEscrowedBalance`

A record of the total remaining vested balance in this contract, which should be equal to the actual SNX balance.

**Type:** `uint public`

---

### `TIME_INDEX`

The vesting timestamp is the first entry in vesting schedule entry pairs.

**Type:** `uint constant`

**Value:** `0`

---

### `QUANTITY_INDEX`

The vesting quantity is the second entry in vesting schedule entry pairs.

**Type:** `uint constant`

**Value:** `1`

---

### `MAX_VESTING_ENTRIES`

This constant limits vesting schedules to be shorter than 260 entries long so that iteration is bounded. This allows up to five years of vesting entries to be handled, if one is generated per weekly fee period.

**Type:** `uint constant`

**Value:** `52 * 5`

---

## Functions

---

### `constructor`

Initialises the [`Synthetix`](Synthetix.md) and [`FeePool`](FeePool.md) contract addresses, and the inherited [`Owned`](Owned.md) instance.

??? example "Details"

    **Signature**

    `constructor(address _owner, Synthetix _synthetix, FeePool _feePool) public`

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

### `setFeePool`

Sets the address of the [`FeePool`](FeePool.md) contract, so that new vesting entries can be generated.

??? example "Details"

    **Signature**

    `setFeePool(FeePool _feePool) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyOwner)

    **Emits**

    * [`FeePoolUpdated(_feePool)`](#feepoolupdated)

---

### `balanceOf`

An alias to [`totalEscrowedAccountBalance[account]`](#totalescrowedaccountbalance) for ERC20 integration.

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

The function iterates until it finds the first nonzero vesting entry timestamp, so the gas cost increases slightly as more entries vest. A full schedule of 260 entries would cost a little over $50\,000$ gas to iterate over.

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

### `checkAccountSchedule`

Returns the full vesting schedule for a given account.

??? example "Details"

    **Signature**

    `checkAccountSchedule(address account) public view returns (uint[520])`

---

### `appendVestingEntry`

This function allows the [`FeePool`](FeePool.md) contract to add a new entry to a given account's vesting schedule when it claims its fees. All new entries are set to vest after one year.

??? example "Details"

    **Signature**

    `appendVestingEntry(address account, uint quantity) public`

    **Modifiers**

    * [`onlyFeePool`](#onlyfeepool)

    **Preconditions**

    * `quantity` must be nonzero.
    * The balance of SNX in the escrow contract must be sufficient to supply the new vesting entry.
    * The given account's existing schedule length must be less than [`MAX_VESTING_ENTRIES`](#max_vesting_entries).

    **Emits**

    * [`VestingEntryCreated(account, now, quantity)`](#vestingentrycreated)

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

## Modifiers

---

### `onlyFeePool`

Reverts the transaction if the `msg.sender` is not the [`FeePool`](FeePool.md).

---

## Events

---

### `SynthetixUpdated`

Records that the SNX contract address was altered.

**Signature:** `SynthetixUpdated(address newSynthetix)`

---

### `FeePoolUpdated`

Records that the fee pool contract address was altered.

**Signature:** `FeePoolUpdated(address newFeePool)`

---

### `Vested`

Records that an account vested a quantity of tokens.

**Signature:** `Vested(address indexed beneficiary, uint time, uint value)`

---

### `VestingEntryCreated`

Records that the fee pool created a vesting entry.

**Signature:** `VestingEntryCreated(address indexed beneficiary, uint time, uint value)`

---
