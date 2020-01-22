# EternalStorage

## Description

This is an implementation of the well-known eternal storage smart contract pattern, described in more detail [here](https://fravoll.github.io/solidity-patterns/eternal_storage.html) and [here](https://medium.com/rocket-pool/upgradable-solidity-contract-design-54789205276d).

In short, it is a key-value store for variables which are retrieved by a byte string, typically a hash of their name and an index.

The contract is architected this way so that the access pattern is uniform and the memory layout is not dependent on implementation or compilation details. In this way, smart contracts can retain state between updates while minimising the difficulty and expense of migrating this information.

Each type of variable has its own mapping, along with getters and setters. As this entails some replication, this document will express functions and variables generically with the type variable 𝕋, where 𝕋 $\in$ {`uint`, `string`, `address`, `bytes`, `bytes32`, `bool`, `int`}. This notation is used slightly abusively, standing in for both names and types; in the former case, substitution is in camelCase. More complex types, such as structs and nested mappings, are not supported.

**Source:** [EternalStorage.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/EternalStorage.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![EternalStorage inheritance graph](../img/graphs/EternalStorage.svg)
</centered-image>

---

## Variables

---

### `𝕋Storage`

A mapping from keys to values of type 𝕋.

**Type:** `mapping(bytes32 => 𝕋)`

---

## Functions

---

### `constructor`

Initialises the inherited [`State`](State.md) instance.

??? example "Details"

    **Signature**

    `constructor(address _owner, address _associatedContract) public`

    **Superconstructors**

    * [`State(_owner, _associatedContract)`](State.md#constructor)

---

### `get𝕋Value`

Return the value associated with a particular key in the [`𝕋Storage`](EternalStorage.md#storage) mapping.

In theory this function could be eliminated by making the storage mapping public, but providing it makes accessor naming more consistent.

??? example "Details"

    **Signature**

    `get𝕋Value(bytes32 record) external view returns (𝕋)`

    !!! note
        If 𝕋 is `string` or `bytes`, the result is returned in memory rather than storage.

---

### `set𝕋Value`

Sets the value associated with a particular key in the [`𝕋Storage`](EternalStorage.md#storage) mapping.

??? example "Details"

    **Signature**

    `set𝕋Value(bytes32 record, 𝕋 value) external`

    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

---

### `delete𝕋Value`

Deletes the value associated with a particular key in the [`𝕋Storage`](EternalStorage.md#storage) mapping.

??? example "Details"

    **Signature**

    `delete𝕋Value(bytes32 record) external`

    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

---
