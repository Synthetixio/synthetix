pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./Proxyable.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IBaseSynthetixBridge.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IRewardEscrowV2.sol";
import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";

contract BaseSynthetixBridge is Owned, Proxyable, MixinSystemSettings, IBaseSynthetixBridge {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 internal constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_REWARDESCROW = "RewardEscrowV2";

    bool public initiationActive;

    // ========== CONSTRUCTOR ==========

    constructor(
        address payable _proxy,
        address _owner,
        address _resolver
    ) internal Owned(_owner) Proxyable(_proxy) MixinSystemSettings(_resolver) {
        initiationActive = true;
    }

    // ========== INTERNALS ============

    function messenger() internal view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function rewardEscrowV2() internal view returns (IRewardEscrowV2) {
        return IRewardEscrowV2(requireAndGetAddress(CONTRACT_REWARDESCROW));
    }

    function initiatingActive() internal view {
        require(initiationActive, "Initiation deactivated");
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](3);
        newAddresses[0] = CONTRACT_EXT_MESSENGER;
        newAddresses[1] = CONTRACT_SYNTHETIX;
        newAddresses[2] = CONTRACT_REWARDESCROW;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    // ========== MODIFIERS ============

    modifier requireInitiationActive() {
        initiatingActive();
        _;
    }

    // ========= RESTRICTED FUNCTIONS ==============

    function suspendInitiation() external optionalProxy_onlyOwner {
        initiationActive = false;
        emitInitiationSuspended();
    }

    function resumeInitiation() external optionalProxy_onlyOwner {
        initiationActive = true;
        emitInitiationResumed();
    }

    // ========== EVENTS ==========

    event InitiationSuspended();
    bytes32 private constant INITIATIONSUSPENDED_SIG = keccak256("FeePeriodClosed()");

    function emitInitiationSuspended() internal {
        proxy._emit("", 1, INITIATIONSUSPENDED_SIG, 0, 0, 0);
    }

    event InitiationResumed();
    bytes32 private constant INITIATIONRESUMED_SIG = keccak256("InitiationResumed()");

    function emitInitiationResumed() internal {
        proxy._emit("", 1, INITIATIONRESUMED_SIG, 0, 0, 0);
    }
}
