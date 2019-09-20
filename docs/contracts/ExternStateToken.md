# ExternStateToken

## Description

A partial ERC20 token contract, designed to operate with a proxy.
To produce a complete ERC20 token, transfer and transferFrom
tokens must be implemented, using the provided _byProxy internal
functions.
This contract utilises an external state for upgradeability.

**Old:** ExternStateToken.sol: The concept of an ERC20/ERC223(ish) token which stores its allowances and balances outside of the contract for upgradability.

**Source:** [ExternStateToken.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/ExternStateToken.sol)

<section-sep />

## Inheritance Graph

<inheritance-graph>
    ![ExternStateToken inheritance graph](../img/graphs/ExternStateToken.svg)
</inheritance-graph>

<section-sep />

## Related Contracts

TokenState

<section-sep />

## Libraries

* [`SafeMath`](SafeMath.md) for `uint`
* [`SafeDecimalMath`](SafeDecimalMath.md) for `uint`

<section-sep />

## Variables

---

### `tokenState`

The external state contract holding this token's balances and allowances.

**Type:** `TokenState public`

---

### `name`

The ERC20 name of this token.

**Type:** `string public`

---

### `symbol`

The ERC20 symbol of this token.

**Type:** `string public`

---

### `totalSupply`

The ERC20 total token supply.

**Type:** `uint public`

---

### `decimals`

The ERC20 decimal precision of this token. This is usually set to 18 in Synthetix.

**Type:** `uint8 public`

---

<section-sep />

## Functions

---

### `constructor`

Initialises this token's ERC20 fields, its proxy, token state, and its inherited [`SelfDestructible`](SelfDestructible.md) and [`Proxyable`](Proxyable.md) instances.

???+ example "Details"
    **Signature**

    `constructor(address _proxy, TokenState _tokenState, string _name, string _symbol, uint _totalSupply, uint8 _decimals, address _owner) public`

    **Superconstructors**

    * [`SelfDestructible(_owner)`](SelfDestructible.md)
    * [`Proxyable(_proxy, _owner)`](Proxyable.md)

---

### `allowance`

Returns the ERC20 allowance of one party to spend on behalf of another.
This information is retrieved from the [`tokenState`](TokenState.md) contract.

???+ example "Details"
    **Signature**

    `allowance(address owner, address spender) public view returns (uint)`

---

### `balanceOf`

Returns the ERC20 token balance of the given address.
This information is retrieved from the [`tokenState`](TokenState.md) contract.

???+ example "Details"
    **Signature**

    `balanceOf(address account) public view returns (uint)`

---

### `setTokenState`

Allows the owner to set the address of the `tokenState`(TokenState.md) contract.
Unhooking the token state will pause the contract by causing all transactions to revert.

???+ example "Details"
    **Signature**

    `setTokenState(TokenState _tokenState) external`

    **Modifiers**

    * [`optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

    **Emits**

    * [`TokenStateUpdated(_tokenState)`](#tokenstateupdated)

---

### `_internalTransfer`

Internal ERC20 transfer function used to implement [`_transfer_byProxy`](#_transfer_byproxy) and [`_transferFrom_byProxy`](#_transferfrom_byproxy).

In addition to the ordinary ERC20 transfer behaviour, `_internalTransfer` also takes an ERC223 `data` parameter, and will call tokenFallback functions.

This function always returns true if the transaction does not revert.

???+ example "Details"
    **Signature**

    `_internalTransfer(address from, address to, uint value, bytes data) internal returns (bool)`

    **Preconditions**

    * The recipient cannot be the zero address.
    * The recipient cannot be the token contract itself.
    * The recipient cannot be the proxy.
    * The sender's token balance must not be less than `value`.

    **Emits**

    * [`Transfer(from, to, value)`](#transfer)

---

### `_transfer_byProxy`

Designed to be used in a transfer function posessing the [`onlyProxy`](Proxyable.md#onlyproxy) modifier in an inheriting contract.

Implemented as [`_internalTransfer(from, to, value, data)`](#_internaltransfer).

???+ example "Details"
    **Signature**

    `_transfer_byProxy(address from, address to, uint value, bytes data) internal returns (bool)`

    Other details are as per [`_internalTransfer`](#_internaltransfer)

---

### `_transferFrom_byProxy`

Designed to be used in a transferFrom function posessing the [`onlyProxy`](Proxyable.md#onlyproxy) modifier in an inheriting contract.

After allowance has been deducted, Implemented by [`_internalTransfer(from, to, value, data)`](#_internaltransfer).

???+ example "Details"
    **Signature**

    `_transferFrom_byProxy(address sender, address from, address to, uint value, bytes data) internal returns (bool)`

    **Preconditions**

    * The sender must have an approval greater than `value`.

    Other details are as per [`_internalTransfer`](#_internaltransfer)

---

### `approve`

ERC20 approve function.

???+ example "Details"
    **Signature**

    `approve(address spender, uint value) public returns (bool)`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

    **Emits**

    * [`Approval(messageSender, spender, value)`](#approval)

---

### `emitTransfer`

Emits an ERC20 [`Transfer`](#transfer) event.

Encodes the transfer signature and parameters, then forwards them to the proxy to be [emitted](Proxy.md#_emit).

???+ example "Details"
    **Signature**

    `emitTransfer(address from, address to, uint value) internal`

---

### `emitApproval`

Emits an ERC20 [`Approval`](#approval) event.

Encodes the event signature and parameters, then forwards them to the proxy to be [emitted](Proxy.md#_emit).

???+ example "Details"
    **Signature**

    `emitApproval(address owner, address spender, uint value) internal`

---

### `emitTokenStateUpdated`

Emits a [`TokenStateUpdated`](#tokenstateupdated) event.

Encodes the event signature and parameters, then forwards them to the proxy to be [emitted](Proxy.md#_emit).

???+ example "Details"
    **Signature**

    `emitTokenStateUpdated(address newTokenState) internal`

---

<section-sep />

## Events

---

### `Transfer`

Records that an ERC20 transfer occurred.

**Signature:** `Transfer(address indexed from, address indexed to, uint value)`

---

### `Approval`

Records that an ERC20 approval occurred.

**Signature:** `Approval(address indexed owner, address indexed spender, uint value)`

---

### `TokenStateUpdated`

Records that the [token state address](#tokenstate) was updated.

**Signature:** `TokenStateUpdated(address newTokenState)`

---

<section-sep />
