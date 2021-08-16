pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinSystemSettings.sol";

// Internal references
import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";


interface IOwnerRelayOnOptimism {
    function finalizeRelay(address target, bytes calldata data) external;
}


contract OwnerRelayOnEthereum is MixinSystemSettings, Owned {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_OVM_OWNER_RELAY_ON_OPTIMISM = "ovm:OwnerRelayOnOptimism";

    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== INTERNALS ============ */

    function _messenger() private view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function _ownerRelayOnOptimism() private view returns (address) {
        return requireAndGetAddress(CONTRACT_OVM_OWNER_RELAY_ON_OPTIMISM);
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](2);
        newAddresses[0] = CONTRACT_EXT_MESSENGER;
        newAddresses[1] = CONTRACT_OVM_OWNER_RELAY_ON_OPTIMISM;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    /* ========== RESTRICTED ========== */

    function initiateRelay(
        address target,
        bytes calldata data,
        uint32 crossDomainGasLimit // If zero, uses default value in SystemSettings
    ) external onlyOwner {
        bytes memory messageData = abi.encodeWithSelector(IOwnerRelayOnOptimism(0).finalizeRelay.selector, target, data);

        // Use specified crossDomainGasLimit if specified value is not zero.
        // otherwise use the default in SystemSettings.
        uint32 xGasLimit = crossDomainGasLimit != 0
            ? crossDomainGasLimit
            : uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Relay));

        _messenger().sendMessage(_ownerRelayOnOptimism(), messageData, xGasLimit);

        emit RelayInitiated(target, data);
    }

    /* ========== EVENTS ========== */

    event RelayInitiated(address target, bytes data);
}
