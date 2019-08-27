# DelegateApprovals

Each approver may authorise a number of delegates to perform an action (withdrawing fees) on their behalf.

NOTE: the file docstring is inaccurate. It says "Withdrawing approval sets the delegate as false instead of removing from the approvals list for auditability.", but the contract actually uses a nested mapping. That is to say, there no explicit approvals list exists and the audit trail is by event emission. So setting false and deletion are equivalent operations.

## Inherited Contracts

### Direct

* [State](State.md)

### Indirect

* [Owned](Owned.md)

## Related Contracts

### Referencing

* [FeePool.delegates](FeePool.md) (and also is the value of `this.associatedContract`)

## Variables

* `approval: mapping(address => mapping(address => bool)) public`. The double mapping allows each authoriser to have multiple delegates.

## Functions

* `setApproval(address authoriser, address delegate)`: only callable by the associated contract. Emits an Approval event.
* `withdrawApproval(address authoriser, address delegate)`: only callable by the associated contract. Emits a WithdrawApproval event.

## Events

* `event Approval(address indexed authoriser, address delegate)`
* `event WithdrawApproval(address indexed authoriser, address delegate)`
