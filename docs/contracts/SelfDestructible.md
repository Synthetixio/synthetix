# SelfDestructible

## Description

SelfDestructible allows an inheriting contract to be destroyed by its owner, who must [announce an intention to destroy it](#initiateselfdestruct), and then wait for a four week cooling-off period before it can be [destroyed](#selfdestruct). Any ether remaining in the contract at this time is forwarded to [a nominated beneficiary](#selfdestructbeneficiary).

**Source:** [SelfDestructible.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/SelfDestructible.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![SelfDestructible inheritance graph](../img/graphs/SelfDestructible.svg)
</centered-image>

---

## Variables

---

### `initiationTime`

The timestamp at which the self destruction was begun.

**Type:** `uint public`

---

### `selfDestructInitiated`

True iff the contract is currently undergoing self destruction.

**Type:** `bool public`

---

### `selfDestructBeneficiary`

The address where any lingering eth in this contract will be sent.

**Type:** `address public`

---

### `SELFDESTRUCT_DELAY`

The duration (four weeks) that must be waited between self destruct initiation and actual destruction. That is the contract can only be destroyed after the timestamp `initiationTime + SELFDESTRUCT_DELAY`.

**Type:** `uint public constant`

**Value:** `4 weeks`

---

## Functions

---

### `constructor`

Initialises the inherited [`Owned`](Owned.md) instance and nominates that owner as the initial [self destruct beneficiary](#selfdestructbeneficiary).

??? example "Details"

    **Signature**

    `constructor(address _owner) public`

    **Superconstructors**

    * [`Owned(_owner)`](Owned.md#constructor)

    **Preconditions**

    * The provided owner must not be the zero address.

    **Emits**

    * [`SelfDestructBeneficiaryUpdated(_owner)`](#selfdestructbeneficiaryupdated)

---

### `setSelfDestructBeneficiary`

Changes the [self destruct beneficiary](#selfdestructbeneficiary).

??? example "Details"

    **Signature**
    
    `setSelfDestructBeneficiary(address _beneficiary) external`

    **Modifiers**

    * [Owned.onlyOwner](Owned.md#onlyowner)

    **Preconditions**

    * The provided beneficiary must not be the zero address.

    **Emits**

    * [`SelfDestructBeneficiaryUpdated(_beneficiary)`](#selfdestructbeneficiaryupdated)

---

### `initiateSelfDestruct`

Begins the self destruct countdown, updating [`initiationTime`](#initiationtime) and [`selfDestructInitiated`](#selfdestructinitiated). Only once the delay has elapsed can the contract be destroyed.

??? example "Details"
    **Signature**

    `initiateSelfDestruct() external`

    **Modifiers**

    * [Owned.onlyOwner](Owned.md#onlyowner)

    **Emits**

    * [`SelfDestructInitiated(`](#selfdestructinitiated)[`SELFDESTRUCT_DELAY`](#selfdestruct_delay)[`)`](#selfdestructinitiated)

---

### `terminateSelfDestruct`

Resets the timer and disables self destruction.

??? example "Details"

    **Signature**

    `terminateSelfDestruct() external`

    **Modifiers**

    * [Owned.onlyOwner](Owned.md#onlyowner)

    **Emits**

    * [`SelfDestructTerminated()`](#selfdestructterminated)

---

### `selfDestruct`

If self destruction is active and the timer has elapsed, destroy this contract and forward its ether to [`selfDestructBeneficiary`](#selfdestructbeneficiary).

??? example "Details"

    **Signature**

    `selfDestruct() external`

    **Modifiers**

    * [Owned.onlyOwner](Owned.md#onlyowner)

    **Preconditions**

    * Self destruction [must have been initiated](#selfdestructinitiated).
    * The [self destruct delay](#selfdestruct_delay) must have elapsed.

    **Emits**

    * [`SelfDestructed()`](#selfdestructed)

## Events

---

### `SelfDestructTerminated`

Self destruction was terminated by the contract owner.

**Signature:** `SelfDestructTerminated()`

---

### `SelfDestructed`

The contract was destroyed, forwarding the ether on to the [beneficiary](#selfdestructbeneficiary).

**Signature:** `SelfDestructed(address beneficiary)`

---

### `SelfDestructInitiated`

Self destruction was initiated with the indicated delay time.

**Signature:** `SelfDestructInitiated(uint selfDestructDelay)`

---

### `SelfDestructBeneficiaryUpdated`

The self destruct beneficiary was changed to the indicated new address.

**Signature:** `SelfDestructBeneficiaryUpdated(address newBeneficiary)`

---
