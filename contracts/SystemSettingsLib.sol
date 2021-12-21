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

    function setIntValue(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        int value
    ) internal {
        IFlexibleStorage(flexibleStorage).setIntValue(settingContractName, settingName, value);
    }

    function setBoolValue(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        bool value
    ) internal {
        IFlexibleStorage(flexibleStorage).setBoolValue(settingContractName, settingName, value);
    }

    function setAddressValue(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        address value
    ) internal {
        IFlexibleStorage(flexibleStorage).setAddressValue(settingContractName, settingName, value);
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

    function setExchangeFeeRateForSynths(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingExchangeFeeRate,
        bytes32[] calldata synthKeys,
        uint256[] calldata exchangeFeeRates,
        uint maxExchangeFeeRate
    ) external {
        require(synthKeys.length == exchangeFeeRates.length, "Array lengths dont match");
        for (uint i = 0; i < synthKeys.length; i++) {
            require(exchangeFeeRates[i] <= maxExchangeFeeRate, "MAX_EXCHANGE_FEE_RATE exceeded");
            setUIntValue(
                flexibleStorage,
                settingContractName,
                keccak256(abi.encodePacked(settingExchangeFeeRate, synthKeys[i])),
                exchangeFeeRates[i]
            );
            emit ExchangeFeeUpdated(synthKeys[i], exchangeFeeRates[i]);
        }
    }

    function setMinimumStakeTime(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _seconds,
        uint maxMinimumStakeTime
    ) external {
        require(_seconds <= maxMinimumStakeTime, "stake time exceed maximum 1 week");
        setUIntValue(flexibleStorage, settingContractName, settingName, _seconds);
        emit MinimumStakeTimeUpdated(_seconds);
    }

    function setDebtSnapshotStaleTime(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _seconds
    ) external {
        setUIntValue(flexibleStorage, settingContractName, settingName, _seconds);
        emit DebtSnapshotStaleTimeUpdated(_seconds);
    }

    function setAggregatorWarningFlags(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        address _flags
    ) external {
        require(_flags != address(0), "Valid address must be given");
        setAddressValue(flexibleStorage, settingContractName, settingName, _flags);
        emit AggregatorWarningFlagsUpdated(_flags);
    }

    function setEtherWrapperMaxETH(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _maxETH
    ) external {
        setUIntValue(flexibleStorage, settingContractName, settingName, _maxETH);
        emit EtherWrapperMaxETHUpdated(_maxETH);
    }

    function setEtherWrapperMintFeeRate(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _rate,
        int maxWrapperMintFeeRate
    ) external {
        require(_rate <= uint(maxWrapperMintFeeRate), "rate > MAX_WRAPPER_MINT_FEE_RATE");
        setUIntValue(flexibleStorage, settingContractName, settingName, _rate);
        emit EtherWrapperMintFeeRateUpdated(_rate);
    }

    function setEtherWrapperBurnFeeRate(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _rate,
        int maxWrapperBurnFeeRate
    ) external {
        require(_rate <= uint(maxWrapperBurnFeeRate), "rate > MAX_WRAPPER_BURN_FEE_RATE");
        setUIntValue(flexibleStorage, settingContractName, settingName, _rate);
        emit EtherWrapperBurnFeeRateUpdated(_rate);
    }

    function setWrapperMaxTokenAmount(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        address _wrapper,
        uint _maxTokenAmount
    ) external {
        setUIntValue(
            flexibleStorage,
            settingContractName,
            keccak256(abi.encodePacked(settingName, _wrapper)),
            _maxTokenAmount
        );
        emit WrapperMaxTokenAmountUpdated(_wrapper, _maxTokenAmount);
    }

    function setWrapperMintFeeRate(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        address _wrapper,
        int _rate,
        int maxWrapperMintFeeRate,
        int getWrapperBurnFeeRate
    ) external {
        require(_rate <= maxWrapperMintFeeRate, "rate > MAX_WRAPPER_MINT_FEE_RATE");
        require(_rate >= -maxWrapperMintFeeRate, "rate < -MAX_WRAPPER_MINT_FEE_RATE");

        // if mint rate is negative, burn fee rate should be positive and at least equal in magnitude
        // otherwise risk of flash loan attack
        if (_rate < 0) {
            require(-_rate <= getWrapperBurnFeeRate, "-rate > wrapperBurnFeeRate");
        }

        setIntValue(flexibleStorage, settingContractName, keccak256(abi.encodePacked(settingName, _wrapper)), _rate);
        emit WrapperMintFeeRateUpdated(_wrapper, _rate);
    }

    function setWrapperBurnFeeRate(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        address _wrapper,
        int _rate,
        int maxWrapperBurnFeeRate,
        int getWrapperMintFeeRate
    ) external {
        require(_rate <= maxWrapperBurnFeeRate, "rate > MAX_WRAPPER_BURN_FEE_RATE");
        require(_rate >= -maxWrapperBurnFeeRate, "rate < -MAX_WRAPPER_BURN_FEE_RATE");

        // if burn rate is negative, burn fee rate should be negative and at least equal in magnitude
        // otherwise risk of flash loan attack
        if (_rate < 0) {
            require(-_rate <= getWrapperMintFeeRate, "-rate > wrapperMintFeeRate");
        }

        setIntValue(flexibleStorage, settingContractName, keccak256(abi.encodePacked(settingName, _wrapper)), _rate);
        emit WrapperBurnFeeRateUpdated(_wrapper, _rate);
    }

    function setInteractionDelay(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        address _collateral,
        uint _interactionDelay
    ) external {
        require(_interactionDelay <= SafeDecimalMath.unit() * 3600, "Max 1 hour");
        setUIntValue(
            flexibleStorage,
            settingContractName,
            keccak256(abi.encodePacked(settingName, _collateral)),
            _interactionDelay
        );
        emit InteractionDelayUpdated(_interactionDelay);
    }

    function setCollapseFeeRate(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        address _collateral,
        uint _collapseFeeRate
    ) external {
        setUIntValue(
            flexibleStorage,
            settingContractName,
            keccak256(abi.encodePacked(settingName, _collateral)),
            _collapseFeeRate
        );
        emit CollapseFeeRateUpdated(_collapseFeeRate);
    }

    function setAtomicMaxVolumePerBlock(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _maxVolume,
        uint maxAtomicVolumePerBlock
    ) external {
        require(_maxVolume <= maxAtomicVolumePerBlock, "Atomic max volume exceed maximum uint192");
        setUIntValue(flexibleStorage, settingContractName, settingName, _maxVolume);
        emit AtomicMaxVolumePerBlockUpdated(_maxVolume);
    }

    function setAtomicTwapWindow(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        uint _window,
        uint minAtomicTwapWindow,
        uint maxAtomicTwapWindow
    ) external {
        require(_window >= minAtomicTwapWindow, "Atomic twap window under minimum 1 min");
        require(_window <= maxAtomicTwapWindow, "Atomic twap window exceed maximum 1 day");
        setUIntValue(flexibleStorage, settingContractName, settingName, _window);
        emit AtomicTwapWindowUpdated(_window);
    }

    function setAtomicEquivalentForDexPricing(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        bytes32 _currencyKey,
        address _equivalent
    ) external {
        require(_equivalent != address(0), "Atomic equivalent is 0 address");
        setAddressValue(
            flexibleStorage,
            settingContractName,
            keccak256(abi.encodePacked(settingName, _currencyKey)),
            _equivalent
        );
        emit AtomicEquivalentForDexPricingUpdated(_currencyKey, _equivalent);
    }

    function setAtomicExchangeFeeRate(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        bytes32 _currencyKey,
        uint _exchangeFeeRate,
        uint maxExchangeFeeRate
    ) external {
        require(_exchangeFeeRate <= maxExchangeFeeRate, "MAX_EXCHANGE_FEE_RATE exceeded");
        setUIntValue(
            flexibleStorage,
            settingContractName,
            keccak256(abi.encodePacked(settingName, _currencyKey)),
            _exchangeFeeRate
        );
        emit AtomicExchangeFeeUpdated(_currencyKey, _exchangeFeeRate);
    }

    function setAtomicPriceBuffer(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        bytes32 _currencyKey,
        uint _buffer
    ) external {
        setUIntValue(flexibleStorage, settingContractName, keccak256(abi.encodePacked(settingName, _currencyKey)), _buffer);
        emit AtomicPriceBufferUpdated(_currencyKey, _buffer);
    }

    function setAtomicVolatilityConsiderationWindow(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        bytes32 _currencyKey,
        uint _window,
        uint minAtomicVolatilityConsiderationWindow,
        uint maxAtomicVolatilityConsiderationWindow
    ) external {
        if (_window != 0) {
            require(
                _window >= minAtomicVolatilityConsiderationWindow,
                "Atomic volatility consideration window under minimum 1 min"
            );
            require(
                _window <= maxAtomicVolatilityConsiderationWindow,
                "Atomic volatility consideration window exceed maximum 1 day"
            );
        }
        setUIntValue(flexibleStorage, settingContractName, keccak256(abi.encodePacked(settingName, _currencyKey)), _window);
        emit AtomicVolatilityConsiderationWindowUpdated(_currencyKey, _window);
    }

    function setAtomicVolatilityUpdateThreshold(
        address flexibleStorage,
        bytes32 settingContractName,
        bytes32 settingName,
        bytes32 _currencyKey,
        uint _threshold
    ) external {
        setUIntValue(
            flexibleStorage,
            settingContractName,
            keccak256(abi.encodePacked(settingName, _currencyKey)),
            _threshold
        );
        emit AtomicVolatilityUpdateThresholdUpdated(_currencyKey, _threshold);
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
    event ExchangeFeeUpdated(bytes32 synthKey, uint newExchangeFeeRate);
    event MinimumStakeTimeUpdated(uint minimumStakeTime);
    event DebtSnapshotStaleTimeUpdated(uint debtSnapshotStaleTime);
    event AggregatorWarningFlagsUpdated(address flags);
    event EtherWrapperMaxETHUpdated(uint maxETH);
    event EtherWrapperMintFeeRateUpdated(uint rate);
    event EtherWrapperBurnFeeRateUpdated(uint rate);
    event WrapperMaxTokenAmountUpdated(address wrapper, uint maxTokenAmount);
    event WrapperMintFeeRateUpdated(address wrapper, int rate);
    event WrapperBurnFeeRateUpdated(address wrapper, int rate);
    event InteractionDelayUpdated(uint interactionDelay);
    event CollapseFeeRateUpdated(uint collapseFeeRate);
    event AtomicMaxVolumePerBlockUpdated(uint newMaxVolume);
    event AtomicTwapWindowUpdated(uint newWindow);
    event AtomicEquivalentForDexPricingUpdated(bytes32 synthKey, address equivalent);
    event AtomicExchangeFeeUpdated(bytes32 synthKey, uint newExchangeFeeRate);
    event AtomicPriceBufferUpdated(bytes32 synthKey, uint newBuffer);
    event AtomicVolatilityConsiderationWindowUpdated(bytes32 synthKey, uint newVolatilityConsiderationWindow);
    event AtomicVolatilityUpdateThresholdUpdated(bytes32 synthKey, uint newVolatilityUpdateThreshold);
}
