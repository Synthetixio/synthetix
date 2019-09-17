# ReentrancyPreventer

This contract provides a modifier which prevents a function from being called again in the same invocation.
If multiple functions have this modifier, only one of them will be callable within a particular execution.

**Source:** [ReentrancyPreventer.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/ReentrancyPreventer.sol)

## Related Contracts

### Referencing

* [TokenFallbackCaller](TokenFallbackCaller.md)

## Variables

* `isInFunctionBody: bool`

## Modifiers

* `preventReentrancy`: Throws an exception if `isInFunctionBody` is true. Sets it to true, then runs the modifier function, then sets it to false.
