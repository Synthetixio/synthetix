# ProxyERC20

## Notes

This proxy contract explicitly implements ERC20 functions because it's designed to sit in front of ERC20 tokens.
In this way the proxy itself can verifiably support this interface and include ERC20 functions in its ABI. Apart from this explicit representation of these functions in its ABI, the proxy otherwise operates identically to the [proxy contract](Proxy.md) it inherits. In the Synthetix system, this ERC20 proxy operates in front of the main SNX token contract, alongside the pre-existing standard proxy. Thus users can choose to use either of these two proxies to interact with the system, but one may have a more convenient interface.

NOTE: Typo in the file docstring: 'compatable'

## Inherited Contracts

### Direct

* [Proxy](Proxy.md)

### Indirect

* [Owned](Owned.md)

## Functions

This contract defines all ERC20 functions, and they simply call down to the underlying token contract.

NOTE: Although these functions properly set up the message sender, they do not forward ether to the target contract, so these funds could get stuck in the proxy, and the underlying functionality will not work properly if it expects ether.

## Events

* `Transfer(address indexed from, address indexed to, uint value)`
* `Approval(address indexed owner, address indexed spender, uint value)`
