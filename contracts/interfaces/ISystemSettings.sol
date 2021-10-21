pragma solidity >=0.4.24;

// https://docs.synthetix.io/contracts/source/interfaces/isystemsettings
interface ISystemSettings {
    // Views
    function waitingPeriodSecs() external view returns (uint);

    function priceDeviationThresholdFactor() external view returns (uint);

    function issuanceRatio() external view returns (uint);

    function feePeriodDuration() external view returns (uint);

    function targetThreshold() external view returns (uint);

    function liquidationDelay() external view returns (uint);

    function liquidationRatio() external view returns (uint);

    function liquidationPenalty() external view returns (uint);

    function rateStalePeriod() external view returns (uint);

    function exchangeFeeRate(bytes32 currencyKey) external view returns (uint);

    function minimumStakeTime() external view returns (uint);

    function debtSnapshotStaleTime() external view returns (uint);

    function aggregatorWarningFlags() external view returns (address);

    function tradingRewardsEnabled() external view returns (bool);

    // function crossDomainMessageGasLimit(CrossDomainMessageGasLimits gasLimitType) external view returns (uint);

    function etherWrapperMaxETH() external view returns (uint);

    function etherWrapperBurnFeeRate() external view returns (uint);

    function etherWrapperMintFeeRate() external view returns (uint);

    function minCratio(address collateral) external view returns (uint);

    function collateralManager(address collateral) external view returns (address);

    function interactionDelay(address collateral) external view returns (uint);

    function atomicMaxVolumePerBlock() external view returns (uint);

    function atomicTwapWindow() external view returns (uint);

    function atomicEquivalentForDexPricing(bytes32 currencyKey) external view returns (address);

    function atomicExchangeFeeRate(bytes32 currencyKey) external view returns (uint);

    function atomicPriceBuffer(bytes32 currencyKey) external view returns (uint);

    function atomicVolatilityConsiderationWindow(bytes32 currencyKey) external view returns (uint);

    function atomicVolatilityUpdateThreshold(bytes32 currencyKey) external view returns (uint);
}
