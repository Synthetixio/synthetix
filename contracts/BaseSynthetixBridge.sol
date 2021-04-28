pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./Proxyable.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IBaseSynthetixBridge.sol";

// Internal references
import "./interfaces/IERC20.sol";
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
    ) public Proxyable(_proxy) Owned(_owner) MixinSystemSettings(_resolver) {
        initiationActive = true;
    }

    // ========== INTERNALS ============

    function messenger() internal view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function synthetixERC20() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX));
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
        require(initiationActive, "initiation suspended");
        initiationActive = false;
        emitInitiationSuspended();
    }

    function resumeInitiation() external optionalProxy_onlyOwner {
        require(!initiationActive, "initiation not suspended");
        initiationActive = true;
        emitInitiationResumed();
    }

    function recoverSnx(address _recoverAddress) external optionalProxy_onlyOwner {
        require(_recoverAddress != address(0) && _recoverAddress != address(this), "Invalid recover address");

        uint256 snxBalance = synthetixERC20().balanceOf(address(this));
        require(snxBalance > 0, "No SNX to recover");

        synthetixERC20().transfer(_recoverAddress, snxBalance);

        emitSNXRecovered(_recoverAddress, snxBalance);
    }

    // ========== EVENTS ==========

    event InitiationSuspended();
    bytes32 private constant INITIATIONSUSPENDED_SIG = keccak256("InitiationSuspended()");

    function emitInitiationSuspended() internal {
        proxy._emit("", 1, INITIATIONSUSPENDED_SIG, 0, 0, 0);
    }

    event InitiationResumed();
    bytes32 private constant INITIATIONRESUMED_SIG = keccak256("InitiationResumed()");

    function emitInitiationResumed() internal {
        proxy._emit("", 1, INITIATIONRESUMED_SIG, 0, 0, 0);
    }

    event SNXRecovered(address recoverAddress, uint256 amount);
    bytes32 private constant SNXRECOVERED_SIG = keccak256("SNXRecovered(address,uint256)");

    function emitSNXRecovered(address recoverAddress, uint256 amount) internal {
        proxy._emit(abi.encode(recoverAddress, amount), 1, SNXRECOVERED_SIG, 0, 0, 0);
    }
}
