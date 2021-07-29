pragma solidity ^0.5.16;

// Inheritance
import "./MixinResolver.sol";
import "./TempOwned.sol";

// Internal references
import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";

interface IOwned {
    function acceptOwnership() external;
}

contract OwnerRelayOnOptimism is MixinResolver, TempOwned {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_BASE_OWNER_RELAY_ON_ETHEREUM = "base:OwnerRelayOnEthereum";

    /* ========== CONSTRUCTOR ============ */

    constructor(
        address _resolver,
        address _tempOwner,
        uint _tempOwnerEOL
    ) public MixinResolver(_resolver) TempOwned(_tempOwner, _tempOwnerEOL) {}

    /* ========== INTERNALS ============ */

    function messenger() private view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function ownerRelayOnEthereum() private view returns (address) {
        return requireAndGetAddress(CONTRACT_BASE_OWNER_RELAY_ON_ETHEREUM);
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](2);
        addresses[0] = CONTRACT_EXT_MESSENGER;
        addresses[1] = CONTRACT_BASE_OWNER_RELAY_ON_ETHEREUM;
    }

    /* ========== EXTERNAL ========== */

    function acceptOwnershipOn(address target) external {
        IOwned(target).acceptOwnership();
    }

    function finalizeRelay(address target, bytes calldata data) external {
        iAbs_BaseCrossDomainMessenger messenger = messenger();

        require(msg.sender == address(messenger), "Sender is not the messenger");
        require(messenger.xDomainMessageSender() == ownerRelayOnEthereum(), "L1 sender is not the owner relay");

        // solhint-disable avoid-low-level-calls
        (bool success, bytes memory result) = target.call(data);

        require(success, string(abi.encode("xChain call failed:", result)));

        emit RelayFinalized(target, data);
    }

    function directRelay(address target, bytes calldata data) external onlyTemporaryOwner {
        // solhint-disable avoid-low-level-calls
        (bool success, bytes memory result) = target.call(data);

        require(success, string(abi.encode("xChain call failed:", result)));

        emit RelayFinalized(target, data);
    }

    /* ========== EVENTS ========== */

    event RelayFinalized(address target, bytes data);
}
