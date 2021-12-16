pragma solidity ^0.5.16;

// Internal references
import "./interfaces/IFlexibleStorage.sol";

// Libraries
import "./SafeDecimalMath.sol";

library SystemSettingsLib {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    function setUIntValue(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint value
    ) internal {
        IFlexibleStorage(flexibleStorage).setUIntValue(settingContractName, settingName, value);
    }

    function setBoolValue(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        bool value
    ) internal {
        IFlexibleStorage(flexibleStorage).setBoolValue(settingContractName, settingName, value);
    }

    function setCrossDomainMessageGasLimit(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 gasLimitSettings,
        uint crossDomainMessageGasLimit,
        uint minCrossDomainGasLimit,
        uint maxCrossDomainGasLimit
    ) external {
        require(
            crossDomainMessageGasLimit >= minCrossDomainGasLimit && crossDomainMessageGasLimit <= maxCrossDomainGasLimit,
            "Out of range xDomain gasLimit"
        );
        setUIntValue(flexibleStorage, settingContractName, gasLimitSettings, crossDomainMessageGasLimit);
    }

    function setIssuanceRatio(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _issuanceRatio,
        uint maxInssuranceRatio
    ) external {
        require(_issuanceRatio <= maxInssuranceRatio, "New issuance ratio cannot exceed MAX_ISSUANCE_RATIO");
        setUIntValue(flexibleStorage, settingContractName, settingName, _issuanceRatio);
        // slither-disable-next-line reentrancy-events
        emit IssuanceRatioUpdated(_issuanceRatio);
    }

    function setTradingRewardsEnabled(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        bool _tradingRewardsEnabled
    ) external {
        setBoolValue(flexibleStorage, settingContractName, settingName, _tradingRewardsEnabled);
        // slither-disable-next-line reentrancy-events
        emit TradingRewardsEnabled(_tradingRewardsEnabled);
    }

    function setWaitingPeriodSecs(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _waitingPeriodSecs
    ) external {
        setUIntValue(flexibleStorage, settingContractName, settingName, _waitingPeriodSecs);
        // slither-disable-next-line reentrancy-events
        emit WaitingPeriodSecsUpdated(_waitingPeriodSecs);
    }

    function setPriceDeviationThresholdFactor(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _priceDeviationThresholdFactor
    ) external {
        setUIntValue(flexibleStorage, settingContractName, settingName, _priceDeviationThresholdFactor);
        // slither-disable-next-line reentrancy-events
        emit PriceDeviationThresholdUpdated(_priceDeviationThresholdFactor);
    }

    function setFeePeriodDuration(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _feePeriodDuration,
        uint minFeePeriodDuration,
        uint maxFeePeriodDuration
    ) external {
        require(_feePeriodDuration >= minFeePeriodDuration, "value < MIN_FEE_PERIOD_DURATION");
        require(_feePeriodDuration <= maxFeePeriodDuration, "value > MAX_FEE_PERIOD_DURATION");

        setUIntValue(flexibleStorage, settingContractName, settingName, _feePeriodDuration);
        // slither-disable-next-line reentrancy-events
        emit FeePeriodDurationUpdated(_feePeriodDuration);
    }

    function setTargetThreshold(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _percent,
        uint maxTargetThreshold
    ) external {
        require(_percent <= maxTargetThreshold, "Threshold too high");
        uint _targetThreshold = _percent.mul(SafeDecimalMath.unit()).div(100);

        setUIntValue(flexibleStorage, settingContractName, settingName, _targetThreshold);
        // slither-disable-next-line reentrancy-events
        emit TargetThresholdUpdated(_targetThreshold);
    }

    function setLiquidationDelay(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint time,
        uint maxLiquidationDelay,
        uint minLiquidationDelay
    ) external {
        require(time <= maxLiquidationDelay, "Must be less than 30 days");
        require(time >= minLiquidationDelay, "Must be greater than 1 day");

        setUIntValue(flexibleStorage, settingContractName, settingName, time);
        // slither-disable-next-line reentrancy-events
        emit LiquidationDelayUpdated(time);
    }

    function setLiquidationRatio(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _liquidationRatio,
        uint maxLiquidationRatio,
        uint getLiquidationPenalty,
        uint getIssuanceRatio,
        uint ratioFromTargetBuffer
    ) external {
        require(
            _liquidationRatio <= maxLiquidationRatio.divideDecimal(SafeDecimalMath.unit().add(getLiquidationPenalty)),
            "liquidationRatio > MAX_LIQUIDATION_RATIO / (1 + penalty)"
        );

        // MIN_LIQUIDATION_RATIO is a product of target issuance ratio * RATIO_FROM_TARGET_BUFFER
        // Ensures that liquidation ratio is set so that there is a buffer between the issuance ratio and liquidation ratio.
        uint MIN_LIQUIDATION_RATIO = getIssuanceRatio.multiplyDecimal(ratioFromTargetBuffer);
        require(_liquidationRatio >= MIN_LIQUIDATION_RATIO, "liquidationRatio < MIN_LIQUIDATION_RATIO");

        setUIntValue(flexibleStorage, settingContractName, settingName, _liquidationRatio);
        // slither-disable-next-line reentrancy-events
        emit LiquidationRatioUpdated(_liquidationRatio);
    }

    function setLiquidationPenalty(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint penalty,
        uint maxLiquidationPenalty
    ) external {
        require(penalty <= maxLiquidationPenalty, "penalty > MAX_LIQUIDATION_PENALTY");

        setUIntValue(flexibleStorage, settingContractName, settingName, penalty);
        emit LiquidationPenaltyUpdated(penalty);
    }

    function setRateStalePeriod(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint period
    ) external {
        setUIntValue(flexibleStorage, settingContractName, settingName, period);
        emit RateStalePeriodUpdated(period);
    }

    // ========== EVENTS ==========
    event IssuanceRatioUpdated(uint newRatio);
    event TradingRewardsEnabled(bool enabled);
    event WaitingPeriodSecsUpdated(uint waitingPeriodSecs);
    event PriceDeviationThresholdUpdated(uint threshold);
    event FeePeriodDurationUpdated(uint newFeePeriodDuration);
    event TargetThresholdUpdated(uint newTargetThreshold);
    event LiquidationDelayUpdated(uint newDelay);
    event LiquidationRatioUpdated(uint newRatio);
    event LiquidationPenaltyUpdated(uint newPenalty);
    event RateStalePeriodUpdated(uint rateStalePeriod);
}
