# TokenState

## Description

An external state contract to hold ERC20 balances and allowances. This operates as an adjunct to [`ExternStateToken`](ExternStateToken.md), so that important token information can persist while the token contract itself can be switched out to upgrade its functionality.

**Source:** [TokenState.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/TokenState.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![TokenState inheritance graph](../img/graphs/TokenState.svg)
</centered-image>

---

## Variables

---

### `balanceOf`

ERC20 balances, note that as a public variable, this synthesises an accessor which is itself ERC20 compliant, so balances can be queried by dApps directly from the state contract.

**Type:** `mapping(address => uint) public`

---

### `allowance`

ERC20 allowances. Also generates an ERC20 accessor in the same way as the `balanceOf` member.

**Type:** `mapping(address => mapping(address => uint)) public`

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

### `setAllowance`

Sets the token allowance granted to the `spender` by the `tokenOwner`.

??? example "Details"
    **Signature**

    `setAllowance(address tokenOwner, address spender, uint value) external`
    
    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

---

### `setBalanceOf`

Sets the balance of the specified account.

??? example "Details"
    **Signature**

    `setBalanceOf(address account, uint value)`
    
    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

---
