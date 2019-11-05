# ReentrancyPreventer

This contract provides inheriting functions a modifier which cannot be executed again in the same invocation; it operates like a mutex. If multiple functions have this modifier, only one of them will be callable within a particular execution, so it should not generally be used on internal functions.

In Synthetix this is used by [`ExternStateToken`](ExternStateToken.md) through [`TokenFallbackCaller`](TokenFallbackCaller.md) (hence [SNX](Synthetix.md) and all [Synths](Synth.md)) to secure them from reentrancy when calling the [ERC223](https://github.com/ethereum/EIPs/issues/223) `tokenFallback()` function.

The dangers of reentrant function calls and various solutions to are discussed further [here](https://github.com/ethereum/wiki/wiki/Safety#reentrancy).

**Source:** [ReentrancyPreventer.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/ReentrancyPreventer.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![ReentrancyPreventer inheritance graph](../img/graphs/ReentrancyPreventer.svg)
</centered-image>

---

## Variables

---

### `isInFunctionBody`

Indicates whether a lock has been acquired. That is, this is true when [`preventReentrancy`](#preventreentrancy) has already been executed during this execution.

**Type:** `bool`

---

## Modifiers

---

### `preventReentrancy`

Throws an exception if [`isInFunctionBody`](#isinfunctionbody) is true.
Otherwise, it acquires the lock, runs the modified function, and releases the lock.

---
