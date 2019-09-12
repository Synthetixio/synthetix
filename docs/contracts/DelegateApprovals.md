# DelegateApprovals

## Description

This contract is used to allow users to allow other addresses to withdraw fees for them. In principle it is generic, as approver just marks a number of delegates as authorised to perform some action on their behalf, with no reference to what that action is.

!!! caution
    The file docstring is inaccurate. It says `Withdrawing approval sets the delegate as false instead of removing from the approvals list for auditability.`, but the contract actually uses a nested mapping. That is to say, there no explicit approvals list exists and the audit trail is by event emission. So setting `false` and deletion are equivalent operations.

<section-sep />

## Inheritance Graph

<inheritance-graph>
    ![graph](../img/graphs/DelegateApprovals.svg)
</inheritance-graph>

<section-sep />

## Variables

---

### `approval`

Stores who has approved whom to perform actions. The double mapping allows each authoriser to have multiple delegates, ordered as `approval[authoriser][delegate]`.

**Type:** `mapping(address => mapping(address => bool)) public`

---

<section-sep />

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

    ***Signature**
    
    `withdrawApproval(address authoriser, address delegate) external`
    
    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

    **Emits**

    * [`WithdrawApproval(authoriser, delegate)`](#withdrawapproval)

---

<section-sep />

## Events

---

### `Approval`

The delegate was approved to act on the authoriser's behalf.

**Signature:** `Approval(address indexed authoriser, address delegate)`

---

### `WithdrawApproval`

The delegate was disapproved to act on the authoriser's behalf.

**Signature:** `WithdrawApproval(address indexed authoriser, address delegate)`

<section-sep />
