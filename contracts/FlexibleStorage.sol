pragma solidity ^0.5.16;

// Internal References
import "./interfaces/IAddressResolver.sol";


// https://docs.synthetix.io/contracts/source/contracts/FlexibleStorage
contract FlexibleStorage {
    IAddressResolver public resolver;

    mapping(bytes32 => bytes32) public hashes;

    mapping(bytes32 => mapping(bytes32 => uint)) internal UIntStorage;

    // mapping(bytes32 => uint) internal UIntStorage;
    // mapping(bytes32 => string) internal StringStorage;
    // mapping(bytes32 => address) internal AddressStorage;
    // mapping(bytes32 => bytes) internal BytesStorage;
    // mapping(bytes32 => bytes32) internal Bytes32Storage;
    // mapping(bytes32 => bool) internal BooleanStorage;
    // mapping(bytes32 => int) internal IntStorage;

    constructor(address _resolver) public {
        // ReadProxyAddressResolver
        resolver = IAddressResolver(_resolver);
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _setUIntValue(
        bytes32 contractName,
        bytes32 record,
        uint value
    ) internal {
        if (hashes[contractName] == bytes32(0)) {
            // set to unique hash at the time of creation
            hashes[contractName] = keccak256(abi.encodePacked(msg.sender, contractName, block.number));
        }
        UIntStorage[hashes[contractName]][record] = value;
        emit ValueSetUInt(contractName, record, value);
    }

    /* ========== VIEWS ========== */

    function getUIntValue(bytes32 contractName, bytes32 record) external view returns (uint) {
        return UIntStorage[hashes[contractName]][record];
    }

    function getUIntValues(bytes32 contractName, bytes32[] calldata records) external view returns (uint[] memory) {
        uint[] memory results = new uint[](records.length);
        for (uint i = 0; i < records.length; i++) {
            results[i] = (UIntStorage[hashes[contractName]][records[i]]);
        }
        return results;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setUIntValue(
        bytes32 contractName,
        bytes32 record,
        uint value
    ) external onlyContract(contractName) {
        _setUIntValue(contractName, record, value);
    }

    function setUIntValues(
        bytes32 contractName,
        bytes32[] calldata records,
        uint[] calldata values
    ) external onlyContract(contractName) {
        require(records.length == values.length, "Input lengths must match");

        for (uint i = 0; i < records.length; i++) {
            _setUIntValue(contractName, records[i], values[i]);
        }
    }

    function deleteUIntValue(bytes32 contractName, bytes32 record) external onlyContract(contractName) {
        delete UIntStorage[hashes[contractName]][record];
        emit ValueDeleted(contractName, record);
    }

    function migrateContractKey(
        bytes32 fromContractName,
        bytes32 toContractName,
        bool removeAccessFromPreviousContract
    ) external onlyContract(fromContractName) {
        require(hashes[fromContractName] != bytes32(0), "Cannot migrate empty contract");

        hashes[toContractName] = hashes[fromContractName];

        if (removeAccessFromPreviousContract) {
            delete hashes[fromContractName];
        }

        emit KeyMigrated(fromContractName, toContractName, removeAccessFromPreviousContract);
    }

    /* ========== MODIFIERS ========== */

    modifier onlyContract(bytes32 contractName) {
        address callingContract = resolver.requireAndGetAddress(contractName, "Cannot find contract in Address Resolver");
        require(callingContract == msg.sender, "Can only be invoked by the configured contract");
        _;
    }

    /* ========== EVENTS ========== */

    event ValueSetUInt(bytes32 contractName, bytes32 record, uint value);
    event ValueDeleted(bytes32 contractName, bytes32 record);
    event KeyMigrated(bytes32 fromContractName, bytes32 toContractName, bool removeAccessFromPreviousContract);
}
