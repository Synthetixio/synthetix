
# TokenFallbackCaller

[Go Back](../contracts.md)

## Notes

Allows inheriting contracts to call an ERC223 token fallback function of an external contract upon token transfers, if such a function exists.

NOTE: File docstring still refers to "Fee Token", which no longer exists.

## Inherited Contracts

### Direct

* [ReentrancyPreventer](ReentrancyPreventer.sol)

## Functions

* `callTokenFallbackIfNeeded(address recipient, uint amount, bytes data) internal`: Checks if the target address has code, and attempt to call its ERC223 fall back function. If this call fails, fail silently. Reentrant calls are disallowed. TODO: examine in what cases reentrancy is actually a risk.
