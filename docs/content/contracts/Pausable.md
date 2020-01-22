# Pausable

## Description

Allows an inheriting contract to be paused and resumed, providing a modifier that will allow modified functions to operate only if the contract is not paused.

**Source:** [Pausable.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/Pausable.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![Pausable inheritance graph](../img/graphs/Pausable.svg)
</centered-image>

---

## Variables

---

### `lastPauseTime`

The UNIX timestamp in seconds at which the contract was last paused.

**Type:** `uint public`

---

## `paused`

True iff the contract is currently paused.

**Type:** `bool public`

---

## Functions

---

### `constructor`

The owner this constructor initialises has the exclusive right to pause the contract. The contract begins unpaused.

??? example "Details"

    **Signature**

    `constructor(address _owner) public`

    **Superconstructors**

    * [`Owned(_owner)`](Owned.md#constructor)

---

### `setPaused`

Pauses or unpauses the contract. Sets [`lastPauseTime`](#lastPauseTime) to the current timestamp if the contract is newly paused.

??? example "Details"

    **Signature**

    `setPaused(bool _paused)`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Emits**

    * [`PauseChanged(paused)`](#pausechanged)

---

## Modifiers

---

### `notPaused`

Reverts the transaction the contract is [`paused`](#paused). Provided for use by inheriting contracts.

---

## Events

---

### `PauseChanged`

The contract has gone from paused to unpaused or vice versa. This event reports the new state.

**Signature:** `PauseChanged(bool isPaused)`

---
