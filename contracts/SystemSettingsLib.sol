pragma solidity ^0.5.16;


library SystemSettingsLib {
    bytes32 internal constant CONTRACT_NAME = "SystemSettings";

    bytes32 internal constant SETTING_WAITING_PERIOD_SECS = "waitingPeriodSecs";
    bytes32 internal constant SETTING_PRICE_DEVIATION_THRESHOLD_FACTOR = "priceDeviationThresholdFactor";

    function contractName() internal pure returns (bytes32) {
        return CONTRACT_NAME;
    }

    function waitingPeriodSecs() internal pure returns (bytes32) {
        return SETTING_WAITING_PERIOD_SECS;
    }

    function priceDeviationThresholdFactor() internal pure returns (bytes32) {
        return SETTING_PRICE_DEVIATION_THRESHOLD_FACTOR;
    }
}
