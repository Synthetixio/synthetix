# TokenFallbackCaller

## Description

Allows inheriting contracts to call an ERC223 token fallback function of an external contract upon token transfers, if such a function exists.

!!! bug
    The file docstring still refers to "Fee Token", which no longer exists.

**Source:** [TokenFallbackCaller.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/TokenFallbackCaller.sol)

<section-sep />

## Inheritance Graph

<inheritance-graph>
    ![TokenFallbackCaller inheritance graph](../img/graphs/TokenFallbackCaller.svg)
</inheritance-graph>

<section-sep />

## Functions

---

### `callTokenFallbackIfNeeded`

Checks if the target address is a smart contract, and attempts to call its ERC223 fallback function if it is. If this call fails, then it fails silently, which allows tokens that are not ERC223-compliant to still function.

???+ example "Details"
    **Signature**

    `callTokenFallbackIfNeeded(address recipient, uint amount, bytes data) internal`

    **Modifiers**

    * [`ReentrancyPreventer.preventReentrancy`](ReentrancyPreventer.md#preventreentrancy)

---

<section-sep />
