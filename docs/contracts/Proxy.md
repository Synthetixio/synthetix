# Proxy

## Notes

This proxy sits in front of an underlying contract, forwarding calls to the proxy contract so that it operates as if it was the underlying contract which was executed. This is designed to allow contract functionality to be upgraded without altering the contract's address. Synthetix, Synth, and the FeePool contracts all exist behind proxies, which has allowed their functionality to be radically altered over time.

This proxy provides two different operation modes:

* `DELEGATECALL`: Execution occurs in the proxy's context, which preserves the message sender and writes state updates to the storage of the proxy itself.
* `CALL`: Execution occurs in the underlying contract's context, which must implement the `Proxyable` interface in order to properly be able to read the message sender (which from the perspective of the underlying contract would otherwise be the proxy itself) and emit events.

The `DELEGATECALL` style is much more common; the motivation for the `CALL` style was to allow complete decoupling of the storage structure from the proxy, except for proxy functionality itself. This means there's no necessity to know the storage architecture in advance, and we can avoid using untidy eternal storage solutions for state variables. Instead the proxy forwards calls to a main underlying contract defining the functionality, which itself has state contracts. So the structure will look something like:

```text
Proxy                P
                     ^
                     |
                     v
Main Contract        C
                     ^
                   /   \
                  v     v
State Contracts  S1 ... Sn
```

In this way the main contract can be swapped out without touching the proxy or state contracts.

## Inherited Contracts

### Direct

* [Owned](Owned.md)

## Related Contracts

### Referenced

* [Proxyable](Proxyable.md)

### Referencing

* [Proxyable](Proxyable.md)

## Variables

* `target: Proxable public`: The contract this proxy is standing in front of.
* `useDELEGATECALL: bool public`: This toggle indicates whether the proxy is in CALL or DELEGATECALL mode.

## Functions

* `setTarget(Proxyable _target)`: Only callable by the proxy's owner.
* `setUseDELEGATECALL(bool value)`: Only callable by the proxy's owner.
* `_emit(bytes callData, uint numTopics, bytes32 topic1, bytes32 topic2, bytes32 topic3, bytes32 topic4)`: Allows underlying contracts in the CALL style to emit events from the proxy's address. Invocation in an underlying contract would look something like `proxy._emit(abi.encode(data), 2, keccak256('MyEvent(type1,type2)'), bytes32(indexedArg), 0, 0);`, which would typically be wrapped in a function like `emitMyEvent(type1 x, type2 y)`. Only callable by the target contract.
* `()` (fallback function): if none of the above functions is hit, then the call data and any ether will be forwarded to the underlying contract and the result of that invocation returned.

## Events

* `TargetUpdated(Proxyable newTarget)`
