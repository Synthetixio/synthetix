pragma solidity ^0.5.16;

// Inheritance
import "./interfaces/IOwnerRelay.sol";
import "./Owned.sol";
import "./MixinSystemSettings.sol";

// Internal references
import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";

contract OwnerRelayOnEthereum is MixinSystemSettings, Owned {
    // contract OwnerRelayOnEthereum is IOwnerRelay, MixinSystemSettings, Owned {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_OVM_OWNER_RELAYER_ON_OPTIMISM = "ovm:OwnerRelayerOnOptimism";

    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== INTERNALS ============ */

    function messenger() internal view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function ownerRelayOnOptimism() private view returns (address) {
        return requireAndGetAddress(CONTRACT_OVM_OWNER_RELAYER_ON_OPTIMISM);
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](2);
        newAddresses[0] = CONTRACT_EXT_MESSENGER;
        newAddresses[1] = CONTRACT_OVM_OWNER_RELAYER_ON_OPTIMISM;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    /* ========== RESTRICTED ========== */

    function relay(address target, bytes calldata data) external onlyOwner {
        bytes memory messageData = abi.encodeWithSelector(IOwnerRelay(0).relay.selector, target, data);

        messenger().sendMessage(
            ownerRelayOnOptimism(),
            messageData,
            uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Relay))
        );
    }
}
