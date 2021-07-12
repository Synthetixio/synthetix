pragma solidity ^0.5.16;

import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";

contract OwnerRelayerFromEthereum {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 internal constant CONTRACT_L1_OWNER = "OwnerL1";

    function ownerL1() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_L1_OWNER);
    }

    function messenger() internal view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function forward(address target, bytes memory data) external {
        iAbs_BaseCrossDomainMessenger messenger = messenger();

        require(msg.sender == messenger, "Sender is not the messenger");
        require(messenger.xDomainMessageSender() == ownerL1(), "L1 sender is not the owner");

        (bool success, bytes memory result) = target.call(data);

        require(success, string(abi.encode("xChain call failed:", res)));
    }
}
