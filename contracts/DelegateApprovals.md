# DelegateApprovals.sol

Each approver may authorise a number of delegates to perform an action (withdrawing fees) on their behalf.
Note that the file docstring is inaccurate "Withdrawing approval sets the delegate as false instead of 
removing from the approvals list for auditability.". But the contract actually uses a nested mapping so setting
false and deletion are equivalent operations (the contract actually deletes).

## Inherited Contracts

* State

## Referenced Contracts

* FeePool (associatedContract)
