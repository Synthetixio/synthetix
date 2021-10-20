pragma solidity ^0.8.9;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IBaseSynthetixBridge.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IRewardEscrowV2.sol";
import "./interfaces/iAbs_BaseCrossDomainMessenger.sol";

contract BaseSynthetixBridge is Owned, MixinSystemSettings, IBaseSynthetixBridge {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 internal constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_REWARDESCROW = "RewardEscrowV2";

    bool public initiationActive;

    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver) Owned(_owner) MixinSystemSettings(_resolver) {
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

    function resolverAddressesRequired() public view virtual override returns (bytes32[] memory addresses) {
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

    function suspendInitiation() external onlyOwner {
        require(initiationActive, "Initiation suspended");
        initiationActive = false;
        emit InitiationSuspended();
    }

    function resumeInitiation() external onlyOwner {
        require(!initiationActive, "Initiation not suspended");
        initiationActive = true;
        emit InitiationResumed();
    }

    // ========== EVENTS ==========

    event InitiationSuspended();

    event InitiationResumed();
}
