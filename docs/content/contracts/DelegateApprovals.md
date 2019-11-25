# DelegateApprovals

## Description

This contract is used by the [`FeePool`](FeePool.md) to enable users to permit other addresses to withdraw fees for them. In Synthetix this was intended to allow mobile wallets to claim fees for a cold storage wallet.

In principle it is generic, as the approver just marks a number of delegates as authorised to perform some action on their behalf, with no reference to what that action is, or who the delegates are.

**Source:** [DelegateApprovals.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/DelegateApprovals.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![DelegateApprovals inheritance graph](../img/graphs/DelegateApprovals.svg)
</centered-image>

---

### Related Contracts

<centered-image>
    ![DelegateApprovals architecture graph](../img/graphs/DelegateApprovals-architecture.svg)
</centered-image>

??? example "Details"
    * [`FeePool`](FeePool.md): This contract allows the fee pool to delegate fee withdrawal approvals.

---

## Variables

---

### `approval`

Stores who has approved whom to perform actions. The double mapping allows each authoriser to have multiple delegates. A given delegate is authorised by an authoriser when `approval[authoriser][delegate]` is true.

**Type:** `mapping(address => mapping(address => bool)) public`

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

### `setApproval`

Grants approval for a delegate to act on behalf of a given authoriser.

??? example "Details"
    **Signature**

    `setApproval(address authoriser, address delegate) external`

    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

    **Emits**

    * [`Approval(authoriser, delegate)`](#approval)

---

### `withdrawApproval`

Revokes the approval of a delegate to act on behalf of a given authoriser.

??? example "Details"

    **Signature**
    
    `withdrawApproval(address authoriser, address delegate) external`
    
    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

    **Emits**

    * [`WithdrawApproval(authoriser, delegate)`](#withdrawapproval)

---

## Events

---

### `Approval`

The delegate was approved to act on the authoriser's behalf.

**Signature:** `Approval(address indexed authoriser, address delegate)`

---

### `WithdrawApproval`

The delegate was disapproved to act on the authoriser's behalf.

**Signature:** `WithdrawApproval(address indexed authoriser, address delegate)`

---
