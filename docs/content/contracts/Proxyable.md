# Proxyable

## Description

This contract is designed to operate in tandem with [`Proxy`](#Proxy.md).
In fact, in order to function properly, every contract operating behind a `CALL`-style proxy must inherit `Proxyable` to ensure that the [message sender](#messageSender) is set and that events are correctly emitted.

This contract can support two proxies simultaneously. Events can be emitted independently from each proxy, but it is sensible to restrict event emission to a single proxy in most cases.

**Source:** [Proxyable.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/Proxyable.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![Proxyable inheritance graph](../img/graphs/Proxyable.svg)
</centered-image>

---

## Variables

---

### `proxy`

The address of the main [proxy](Proxy.md) that this contract operates underneath. It is this address that events should be emitted from using [`Proxy._emit`](Proxy.md#_emit).

**Type:** `Proxy public`

---

### `integrationProxy`

The address of an additional proxy which can be used to forward contract calls to this contract.
Generally speaking, events should not be passed to the integrationProxy.

In the case of the [`Synthetix`](Synthetix.md) contract, this integrationProxy is an instance of the [ERC20 proxy](ProxyERC20.md).

**Type:** `Proxy public`

---

### `messageSender`

The caller of the proxy in the current invocation. This variable is set to the value of `msg.sender` visible to the proxy before every function call by that `Proxy` to this `Proxyable`. Once set, `messageSender` should be used in place of `msg.sender` wherever it is used in contracts inheriting `Proxyable`.

All functions which make use of `messageSender` should have one of the modifiers provided by the `Proxyable` interface, otherwise users who call the contract directly rather than through the proxy will be executing with stale values of `messageSender`.

Functions which do not require `messageSender` need not apply any of the proxy modifiers, but care must be taken when applying other function modifiers within a proxyable contract. For example, see [`optionalProxy_onlyOwner`](#optionalproxy_onlyowner).

**Type:** `address`

---

## Functions

---

### `constructor`

Initialises this contract's [proxy](#proxy) and the inherited [`Owned`](Owned.md) instance.

??? example "Details"

    **Signature**

    `constructor(address _proxy, address _owner) public`

    **Superconstructors**

    * [`Owned(_owner)`](Owned.md#constructor)

    **Emits**

    * [`ProxyUpdated(_proxy)`](#proxyupdated)

---

### `setProxy`

Sets this contract's primary proxy. `setProxy` cannot be called through a proxy.

??? example "Details"

    **Signature**

    `setProxy(address _proxy) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Emits**

    * [`ProxyUpdated(_proxy)`](#proxyupdated)

---

### `setIntegrationProxy`

Sets this contract's secondary proxy. `setIntegrationProxy` cannot be called through a proxy.

??? example "Details"

    **Signature**

    `setIntegrationProxy(address _IntegrationProxy) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

---

### `setMessageSender`

This is used by proxies to set [`messageSender`](#messageSender) before forwarding a function call. This is only callable by the [`proxy`](#proxy) or [`integrationProxy`](#integrationProxy).

??? example "Details"

    **Signature**

    `setMessageSender(address sender) external`

    **Modifiers**

    * [`onlyProxy`](#onlyproxy)

---

## Modifiers

---

### `onlyProxy`

Reverts the transaction if the actual `msg.sender` (not [`messageSender`](#messagesender)) is not the proxy or the integration proxy.

---

### `optionalProxy`

This modifier allows a function to be called through the proxies, or alternatively to be called directly for a small gas savings.

It operates simply: if the caller is not either the proxy or the integration proxy, then overwrite `messageSender` with `msg.sender`, otherwise use whatever it was set to by the proxy.

---

### `optionalProxy_onlyOwner`

This modifier is largely the same as `optionalProxy`, but it disallow callers who are not the contract owner. This modifier exists because [`Owned.onlyOwner`](Owned.md#onlyowner) checks `msg.sender`, and not `messageSender`.

---

## Events

---

### `ProxyUpdated`

`proxyAddress` has been set as the new [`proxy`](#proxy).

**Signature:** `ProxyUpdated(address proxyAddress)`

---
