pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./BaseRewardEscrowV2.sol";


// https://docs.synthetix.io/contracts/RewardEscrow
contract ImportableRewardEscrowV2 is BaseRewardEscrowV2 {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_SYNTHETIX_BRIDGE_BASE = "SynthetixBridgeToBase";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public BaseRewardEscrowV2(_owner, _resolver) {}

    /* ========== VIEWS ======================= */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = BaseRewardEscrowV2.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_SYNTHETIX_BRIDGE_BASE;
        return combineArrays(existingAddresses, newAddresses);
    }

    function synthetixBridgeToBase() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_SYNTHETIX_BRIDGE_BASE);
    }

    function _onlySynthetixBridge() internal view {
        require(msg.sender == synthetixBridgeToBase(), "Can only be invoked by SynthetixBridgeToBase contract");
    }
}
