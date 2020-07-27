pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/ISystemSetting.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IFlexibleStorage.sol";


contract SystemSetting is Owned, MixinResolver, ISystemSetting {
    using SafeMath for uint;

    bytes32 private constant CONTRACT_NAME = "SystemSetting";

    bytes32 private constant SETTING_WAITING_PERIOD_SECS = "waitingPeriodSecs";
    bytes32 private constant SETTING_PRICE_DEVIATION_THRESHOLD_FACTOR = "priceDeviationThresholdFactor";

    bytes32 private constant CONTRACT_FLEXIBLESTORAGE = "FlexibleStorage";

    bytes32[24] private addressesToCache = [CONTRACT_FLEXIBLESTORAGE];

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {}

    function flexibleStorage() internal view returns (IFlexibleStorage) {
        return IFlexibleStorage(requireAndGetAddress(CONTRACT_FLEXIBLESTORAGE, "Missing FlexibleStorage address"));
    }

    // ========== VIEWS ==========

    function waitingPeriodSecs() external view returns (uint) {
        return flexibleStorage().getUIntValue(CONTRACT_NAME, SETTING_WAITING_PERIOD_SECS);
    }

    // The factor amount expressed in decimal format
    // E.g. 3e18 = factor 3, meaning movement up to 3x and above or down to 1/3x and below
    function priceDeviationThresholdFactor() external view returns (uint) {
        return flexibleStorage().getUIntValue(CONTRACT_NAME, SETTING_PRICE_DEVIATION_THRESHOLD_FACTOR);
    }

    // ========== RESTRICTED ==========

    function setWaitingPeriodSecs(uint _waitingPeriodSecs) external onlyOwner {
        flexibleStorage().setUIntValue(CONTRACT_NAME, SETTING_WAITING_PERIOD_SECS, _waitingPeriodSecs);
        emit WaitingPeriodSecsUpdated(_waitingPeriodSecs);
    }

    function setPriceDeviationThresholdFactor(uint _priceDeviationThresholdFactor) external onlyOwner {
        flexibleStorage().setUIntValue(
            CONTRACT_NAME,
            SETTING_PRICE_DEVIATION_THRESHOLD_FACTOR,
            _priceDeviationThresholdFactor
        );
        emit PriceDeviationThresholdUpdated(_priceDeviationThresholdFactor);
    }

    // ========== EVENTS ==========
    event WaitingPeriodSecsUpdated(uint waitingPeriodSecs);
    event PriceDeviationThresholdUpdated(uint threshold);
}
