# ProxyERC20

This is a wrapper around [`Proxy`](Proxy.md) which explicitly implements the [ERC20 token standard](https://docs.openzeppelin.com/contracts/2.x/api/token/erc20#ERC20Detailed).

As a result this proxy can verifiably support token functionality in its ABI if it sits in front of an ERC20-compliant smart contract. Apart from these functions, ProxyERC20 operates identically to the [proxy it inherits](Proxy.md).

In the Synthetix system, an ERC20 proxy operates in front of the main [SNX token contract](Synthetix.md), alongside the pre-existing standard proxy. Thus clients can choose to use either of these two proxies to interact with the system.

**Source:** [ProxyERC20.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/ProxyERC20.sol)

<section-sep />

## Architecture

---

### Inheritance Graph

<centered-image>
    ![ProxyERC20 inheritance graph](../img/graphs/ProxyERC20.svg)
</centered-image>

---

<section-sep />

## Functions

This contract defines all ERC20 functions, including `name()`, `symbol()`, and `decimals()`. These functions simply call down to the underlying token contract.

!!! caution
    Although the `transfer()`, `approve()`, and `transferFrom()` functions properly set up the message sender, they do not forward ether to the target contract. Hence these funds could get stuck in the proxy, and the underlying functionality will not work properly if it expects ether. Such funds can be recovered by operating in `DELEGATECALL` mode and transferring the ether out with an appropriate underlying contract.

    It is conceivable that a future version of this proxy could potentially allow the underlying contract to transfer funds held in the proxy, which would eliminate this issue.

<section-sep />
