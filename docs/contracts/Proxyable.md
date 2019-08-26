# Proxyable

## Notes

Every contract using the `CALL`-style proxy must inherit this contract.

## Inherited Contracts

### Direct

* [Owned](Owned.md)

## Related Contracts

### Referenced

* [Proxy](Proxy.md)

### Referencing

* [Proxy](Proxy.md)

## Variables

* `proxy: Proxy public`: The address of the main proxy that this contract operates underneath.
* `integrationProxy: Proxy public`: The address of an additional proxy, which will not emit events, but which can still be used to forward contract calls. In Synthetix, this integrationProxy is an instance [ERC20 proxy](ProxyERC20.md).
* `messageSender: address`: The caller of the proxy, which is set by the proxy before every call by that `Proxy` to this `Proxyable`. Then this variable can be used in place of `msg.sender`. Note that all functions which make use of the message sender must have one of the modifiers provided by the `Proxyable` interface, otherwise users who call the contract directly and not through the proxy will be executing with the previously-set value of `messageSender`.

## Functions

* `setProxy(address _proxy)`: only callable by the contract owner (and only directly).
* `setIntegrationProxy(address _integrationProxy)`: only callable by the contract owner (and only directly).
* `setMessageSender(address sender)`: Used by the proxy to set `messageSender` before forwarding the function call. Only callable by the proxy.

## Modifiers

* `onlyProxy`: The actual message sender must be the proxy or the integration proxy, otherwise throw an exception.
* `optionalProxy`: If the caller is not the proxy, then overwrite `messageSender` with the actual message sender. This allows functions with this modifier to be called from the proxy, or to be called directly for a small gas savings.
* `optionalProxy_onlyOwner`: The same as `optionalProxy`, but disallow callers who are not the contract owner.

## Events

* `ProxyUpdated(address proxyAddress)`
