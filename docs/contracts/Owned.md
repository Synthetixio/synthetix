# Owned

## Notes

Provides facilities for a contract to have an owner, and functions that only the owner can call with the
`onlyOwner` function modifier.
The owner can be changed by a nomination process, where the nominated owner must accept ownership before
it is switched.

## Variables

* `owner: address public`: The contract owner.
* `nominatedOwner: address public`: The newly-nominated owner.

## Functions

* `nominatedOwner(address _owner)`: only callable by the owner.
* `acceptOwnership()`: if called by `nominatedOwner`, transfers ownership to that address.

## Events

* `OwnerNominated(address newOwner)`
* `OwnerChanged(address oldOwner, address newOwner)`
