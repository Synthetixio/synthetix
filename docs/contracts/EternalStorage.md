# EternalStorage

## Notes

A key:value store for various data types, each data type has a mapping from bytes32 to entries of that type. Intended to be used by keccak256-hashing a key value to retrieve its corresponding value. The contract is architected this way so that the access pattern is uniform across all clients: thus they can retain state across updates. This contract is used in particular for storing fee pool last withdrawal time information.

## Inherited Contracts

* [State](State.md)
* ^[Owned](Owned.md)

## Variables

* `XStorage: mapping(bytes32 => X)`: a generically expressed mapping from keys to values of type X.

## Functions

* `getXValue(bytes32 record) returns (X)`: simply accesses the `XStorage` mapping. In theory, could have made the mapping itself public.
* `setXValue(bytes32 record, X value)`: Sets the value associated with a given record. Only callable by the associated contract.
* `deleteXValue(bytes32 record)`: Deletes the given record.
