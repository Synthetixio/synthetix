pragma solidity >=0.4.24;


interface ISystemSetting {
    // Views
    function priceDeviationThresholdFactor() external view returns (uint);

    function waitingPeriodSecs() external view returns (uint);
}
