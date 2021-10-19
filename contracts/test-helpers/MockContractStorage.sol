pragma solidity ^0.8.8;

import "../ContractStorage.sol";

contract MockContractStorage is ContractStorage {
    struct SomeEntry {
        uint value;
        bool flag;
    }

    mapping(bytes32 => mapping(bytes32 => SomeEntry)) public entries;

    constructor(address _resolver) public ContractStorage(_resolver) {}

    function getEntry(bytes32 contractName, bytes32 record) external view returns (uint value, bool flag) {
        SomeEntry storage entry = entries[hashes[contractName]][record];
        return (entry.value, entry.flag);
    }

    function persistEntry(
        bytes32 contractName,
        bytes32 record,
        uint value,
        bool flag
    ) external onlyContract(contractName) {
        entries[_memoizeHash(contractName)][record].value = value;
        entries[_memoizeHash(contractName)][record].flag = flag;
    }
}
