# MixinResolver

## Description

A utility that gives the inheritor access to the [`AddressResolver`](AddressResolver.md)

**Source:** [.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/MixinResolver.sol)

---

### Inheritance Graph


<centered-image>
    ![[name] inheritance graph](../img/graphs/MixinResolver.svg)
</centered-image>

---

## Variables

---


### `resolver`

The `AddressResolver` instance

**Type:** `AddressResolver public`

---

## Owner Functions

---

### `setResolver`

Set the address resolver

??? example "Details"

    **Signature**

    `setResolver(AddressResolver _resolver) public`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

---
