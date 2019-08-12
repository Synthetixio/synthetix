# State

[Go Back](../contracts.md)

## Notes

Allows a contract to have an external state whose values only it can modify.

## Inherited Contracts

### Direct

* [Owned](Owned.md)

## Variables

* `associatedContract: address public`: The contract (presumably) which is permitted to use functions on this contract which have the `onlyAssociatedContract` modifier.

## Functions

* `setAssociatedContract(address _associatedContract)`: Only callable by the owner of this contract.

## Events

* `AssociatedContractUpdated(address associatedContract)`
