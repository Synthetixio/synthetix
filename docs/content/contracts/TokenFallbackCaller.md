# TokenFallbackCaller

## Description

Allows inheriting contracts to call an ERC223 token fallback function of an external contract upon token transfers, if such a function exists.

**Source:** [TokenFallbackCaller.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/TokenFallbackCaller.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![TokenFallbackCaller inheritance graph](../img/graphs/TokenFallbackCaller.svg)
</centered-image>

---

## Functions

---

### `callTokenFallbackIfNeeded`

Checks if the target address is a smart contract, and attempts to call its ERC223 fallback function if it is. If this call fails, it fails without reverting the transaction, which allows targets that are not ERC223-compliant to still be valid recipients.

??? example "Details"
    **Signature**

    `callTokenFallbackIfNeeded(address recipient, uint amount, bytes data) internal`

    **Modifiers**

    * [`ReentrancyPreventer.preventReentrancy`](ReentrancyPreventer.md#preventreentrancy)

---
