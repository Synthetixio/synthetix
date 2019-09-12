# Pausable

## Description

Allows an inheriting contract to be paused and resumed, providing a modifier that will allow modified functions to operate only if the contract is not paused.

## Inheritance Graph

<inheritance-graph>
    ![graph](../img/graphs/Pausable.svg)
</inheritance-graph>

<section-sep />

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

<section-sep />

## Functions

---

### `constructor`

The owner this constructor initialises has the exclusive right to pause the contract. The contract begins unpaused.

**Signature:** `constructor(address _owner) public`

**Superconstructors**

* [`Owned(_owner)`](Owned.md#constructor)

---

### `setPaused`

Pauses or unpauses the contract. Sets [`lastPauseTime`](#lastPauseTime) to the current timestamp if the contract is newly paused.

??? example "Details"

    **Signature:** `setPaused(bool _paused)`

    **Emits**

    * [`PauseChanged(paused)`](#pausechanged)

---

<section-sep />

## Modifiers

---

### `notPaused`

Reverts the transaction the contract is [`paused`](#paused). Provided for use by inheriting contracts.

---

<section-sep />

## Events

### `PauseChanged`

The contract has gone from paused to unpaused or vice versa. This event reports the new state.

**Signature:** `PauseChanged(bool isPaused)`

<section-sep />
