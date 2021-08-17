pragma solidity ^0.5.16;

// Inheritance
import "./MixinResolver.sol";
import "./TemporarilyOwned.sol";

// Internal references
import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";

interface IOwned {
    function acceptOwnership() external;
}

contract OwnerRelayOnOptimism is MixinResolver, TemporarilyOwned {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_BASE_OWNER_RELAY_ON_ETHEREUM = "base:OwnerRelayOnEthereum";

    /* ========== CONSTRUCTOR ============ */

    constructor(
        address _resolver,
        address _tempOwner,
        uint _ownedDuration
    ) public MixinResolver(_resolver) TemporarilyOwned(_tempOwner, _ownedDuration) {}

    /* ========== INTERNALS ============ */

    function _messenger() private view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function _ownerRelayOnEthereum() private view returns (address) {
        return requireAndGetAddress(CONTRACT_BASE_OWNER_RELAY_ON_ETHEREUM);
    }

    function _relayCall(address target, bytes memory data) private {
        // solhint-disable avoid-low-level-calls
        (bool success, bytes memory result) = target.call(data);

        require(success, string(abi.encode("xChain call failed:", result)));

        emit CallRelayed(target, data);
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](2);
        addresses[0] = CONTRACT_EXT_MESSENGER;
        addresses[1] = CONTRACT_BASE_OWNER_RELAY_ON_ETHEREUM;
    }

    /* ========== EXTERNAL ========== */

    function acceptOwnershipOnBatch(address[] calldata targets) external {
        for (uint i = 0; i < targets.length; i++) {
            IOwned(targets[i]).acceptOwnership();
        }
    }

    function acceptOwnershipOn(address target) external {
        IOwned(target).acceptOwnership();
    }

    function finalizeRelay(address target, bytes calldata data) external {
        iAbs_BaseCrossDomainMessenger messenger = _messenger();

        require(msg.sender == address(messenger), "Sender is not the messenger");
        require(messenger.xDomainMessageSender() == _ownerRelayOnEthereum(), "L1 sender is not the owner relay");

        _relayCall(target, data);
    }

    function directRelay(address target, bytes calldata data) external onlyTemporaryOwner {
        _relayCall(target, data);
    }

    /* ========== EVENTS ========== */

    event CallRelayed(address target, bytes data);
}
