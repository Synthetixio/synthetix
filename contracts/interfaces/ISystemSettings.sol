pragma solidity >=0.4.24;

// https://docs.synthetix.io/contracts/source/interfaces/isystemsettings
interface ISystemSettings {
    // Views
    function priceDeviationThresholdFactor() external view returns (uint);

    function waitingPeriodSecs() external view returns (uint);

    function issuanceRatio() external view returns (uint);

    function feePeriodDuration() external view returns (uint);

    function targetThreshold() external view returns (uint);

    function liquidationDelay() external view returns (uint);

    function liquidationRatio() external view returns (uint);

    function liquidationPenalty() external view returns (uint);

    function rateStalePeriod() external view returns (uint);

    function exchangeFeeRate(bytes32 currencyKey) external view returns (uint);

    function minimumStakeTime() external view returns (uint);

    function wrapperMaxTokenAmount(address wrapper) external view returns (uint);

    function wrapperMintFeeRate(address wrapper) external view returns (int);

    function wrapperBurnFeeRate(address wrapper) external view returns (int);

    function etherWrapperMaxETH() external view returns (uint);

    function etherWrapperMintFeeRate() external view returns (uint);

    function etherWrapperBurnFeeRate() external view returns (uint);

    function minCratio(address collateral) external view returns (uint);

    function collateralManager(address collateral) external view returns (address);

    function interactionDelay(address collateral) external view returns (uint);
}
