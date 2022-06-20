pragma solidity ^0.5.16;

// Inheritance
import "./ExchangerBase.sol";

// https://docs.synthetix.io/contracts/source/contracts/exchanger
contract Exchanger is ExchangerBase {
    bytes32 public constant CONTRACT_NAME = "Exchanger";

    constructor(address _owner, address _resolver) public ExchangerBase(_owner, _resolver) {}

    /* ========== VIEWS ========== */

    function waitingPeriodSecs() external view returns (uint) {
        return getWaitingPeriodSecs();
    }

    function tradingRewardsEnabled() external view returns (bool) {
        return getTradingRewardsEnabled();
    }

    function priceDeviationThresholdFactor() external view returns (uint) {
        return getPriceDeviationThresholdFactor();
    }

    function lastExchangeRate(bytes32 currencyKey) external view returns (uint) {
        return exchangeCircuitBreaker().lastExchangeRate(currencyKey);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function exchange(
        address exchangeForAddress,
        address from,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        address destinationAddress,
        bool virtualSynth,
        address rewardAddress,
        bytes32 trackingCode
    ) external onlySynthetixorSynth returns (uint amountReceived, IVirtualSynth vSynth) {
        uint protocolFee;
        uint partnerFee;
        if (from != exchangeForAddress) {
            require(delegateApprovals().canExchangeFor(exchangeForAddress, from), "Not approved to act on behalf");
        }

        (amountReceived, protocolFee, partnerFee, vSynth) = _exchange(
            exchangeForAddress,
            sourceCurrencyKey,
            sourceAmount,
            destinationCurrencyKey,
            destinationAddress,
            virtualSynth,
            trackingCode
        );

        _processTradingRewards(protocolFee, rewardAddress);

        if (trackingCode != bytes32(0)) {
            _emitTrackingEvent(trackingCode, destinationCurrencyKey, amountReceived, partnerFee);
        }
    }

    function exchangeAtomically(
        address,
        bytes32,
        uint,
        bytes32,
        address,
        bytes32,
        uint
    ) external returns (uint) {
        _notImplemented();
    }

    function _exchange(
        address from,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        address destinationAddress,
        bool virtualSynth,
        bytes32 trackingCode
    )
        internal
        returns (
            uint amountReceived,
            uint protocolFee,
            uint partnerFee,
            IVirtualSynth vSynth
        )
    {
        require(sourceAmount > 0, "Zero amount");

        // Using struct to resolve stack too deep error
        IExchanger.ExchangeEntry memory entry;

        entry.roundIdForSrc = exchangeRates().getCurrentRoundId(sourceCurrencyKey);
        entry.roundIdForDest = exchangeRates().getCurrentRoundId(destinationCurrencyKey);

        uint sourceAmountAfterSettlement = _settleAndCalcSourceAmountRemaining(sourceAmount, from, sourceCurrencyKey);

        // If, after settlement the user has no balance left (highly unlikely), then return to prevent
        // emitting events of 0 and don't revert so as to ensure the settlement queue is emptied
        if (sourceAmountAfterSettlement == 0) {
            return (0, 0, IVirtualSynth(0));
        }

        (entry.destinationAmount, entry.sourceRate, entry.destinationRate) = exchangeRates().effectiveValueAndRatesAtRound(
            sourceCurrencyKey,
            sourceAmountAfterSettlement,
            destinationCurrencyKey,
            entry.roundIdForSrc,
            entry.roundIdForDest
        );

        _ensureCanExchangeAtRound(sourceCurrencyKey, destinationCurrencyKey, entry.roundIdForSrc, entry.roundIdForDest);

        // SIP-65: Decentralized Circuit Breaker
        // mutative call to suspend system if the rate is invalid
        if (_exchangeRatesCircuitBroken(sourceCurrencyKey, destinationCurrencyKey)) {
            return (0, 0, 0, IVirtualSynth(0));
        }

        bool tooVolatile;
        (entry.exchangeFeeRate, tooVolatile) = _feeRateForExchangeAtRounds(
            sourceCurrencyKey,
            destinationCurrencyKey,
            entry.roundIdForSrc,
            entry.roundIdForDest
        );

        if (entry.tooVolatile) {
            // do not exchange if rates are too volatile, this to prevent charging
            // dynamic fees that are over the max value
            return (0, 0, 0, IVirtualSynth(0));
        }

        // Note: fees are denominated in the destinationCurrencyKey.
        amountReceived = _deductFeesFromAmount(entry.destinationAmount, entry.exchangeFeeRate);
        protocolFee = entry.destinationAmount.sub(amountReceived);

        if (trackingCode != bytes32(0)) {
            partnerFee = _deductFeesFromAmount(entry.destinationAmount, volumePartner().getFeeRate(trackingCode)).sub(
                amountReceived
            );
            amountReceived = amountReceived.sub(partnerFee);
        }

        // Note: We don't need to check their balance as the _convert() below will do a safe subtraction which requires
        // the subtraction to not overflow, which would happen if their balance is not sufficient.
        vSynth = _convert(
            sourceCurrencyKey,
            from,
            sourceAmountAfterSettlement,
            destinationCurrencyKey,
            amountReceived,
            destinationAddress,
            virtualSynth
        );

        // When using a virtual synth, it becomes the destinationAddress for event and settlement tracking
        if (vSynth != IVirtualSynth(0)) {
            destinationAddress = address(vSynth);
        }

        // Remit the protocolFee if required
        if (protocolFee > 0) {
            // Normalize protocolFee to sUSD
            // Note: `protocolFee` is being reused to avoid stack too deep errors.
            protocolFee = exchangeRates().effectiveValue(destinationCurrencyKey, protocolFee, sUSD);

            // Remit the protocolFee in sUSDs
            issuer().synths(sUSD).issue(feePool().FEE_ADDRESS(), protocolFee);

            // Tell the fee pool about this
            feePool().recordFeePaid(protocolFee);
        }

        if (partnerFee > 0) {
            // Normalize partnerFee to sUSD
            // Note: `partnerFee` is being reused to avoid stack too deep errors.
            partnerFee = exchangeRates().effectiveValue(destinationCurrencyKey, partnerFee, sUSD);

            volumePartner().accrueFee(trackingCode, partnerFee);
        }

        // Note: As of this point, fees are denominated in sUSD.

        // Nothing changes as far as issuance data goes because the total value in the system hasn't changed.
        // But we will update the debt snapshot in case exchange rates have fluctuated since the last exchange
        // in these currencies
        _updateSNXIssuedDebtOnExchange(
            [sourceCurrencyKey, destinationCurrencyKey],
            [entry.sourceRate, entry.destinationRate]
        );

        // Let the DApps know there was a Synth exchange
        ISynthetixInternal(address(synthetix())).emitSynthExchange(
            from,
            sourceCurrencyKey,
            sourceAmountAfterSettlement,
            destinationCurrencyKey,
            amountReceived,
            destinationAddress
        );

        // iff the waiting period is gt 0
        if (getWaitingPeriodSecs() > 0) {
            // persist the exchange information for the dest key
            appendExchange(
                destinationAddress,
                sourceCurrencyKey,
                sourceAmountAfterSettlement,
                destinationCurrencyKey,
                amountReceived,
                entry.exchangeFeeRate
            );
        }
    }

    // Note: this function can intentionally be called by anyone on behalf of anyone else (the caller just pays the gas)
    function settle(address from, bytes32 currencyKey)
        external
        returns (
            uint reclaimed,
            uint refunded,
            uint numEntriesSettled
        )
    {
        systemStatus().requireSynthActive(currencyKey);
        return _internalSettle(from, currencyKey, true);
    }

    function suspendSynthWithInvalidRate(bytes32 currencyKey) external {
        systemStatus().requireSystemActive();
        // SIP-65: Decentralized Circuit Breaker
        (, bool circuitBroken) = exchangeCircuitBreaker().rateWithBreakCircuit(currencyKey);
        require(circuitBroken, "Synth price is valid");
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _ensureCanExchangeAtRound(
        bytes32 sourceCurrencyKey,
        bytes32 destinationCurrencyKey,
        uint roundIdForSrc,
        uint roundIdForDest
    ) internal view {
        require(sourceCurrencyKey != destinationCurrencyKey, "Can't be same synth");

        bytes32[] memory synthKeys = new bytes32[](2);
        synthKeys[0] = sourceCurrencyKey;
        synthKeys[1] = destinationCurrencyKey;

        uint[] memory roundIds = new uint[](2);
        roundIds[0] = roundIdForSrc;
        roundIds[1] = roundIdForDest;
        require(!exchangeRates().anyRateIsInvalidAtRound(synthKeys, roundIds), "src/dest rate stale or flagged");
    }

    /* ========== Exchange Related Fees ========== */
    /// @notice public function to get the total fee rate for a given exchange
    /// @param sourceCurrencyKey The source currency key
    /// @param destinationCurrencyKey The destination currency key
    /// @return The exchange fee rate, and whether the rates are too volatile
    function feeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey) external view returns (uint) {
        (uint feeRate, bool tooVolatile) = _feeRateForExchange(sourceCurrencyKey, destinationCurrencyKey);
        require(!tooVolatile, "too volatile");
        return feeRate;
    }

    /// @notice public function to get the dynamic fee rate for a given exchange
    /// @param sourceCurrencyKey The source currency key
    /// @param destinationCurrencyKey The destination currency key
    /// @return The exchange dynamic fee rate and if rates are too volatile
    function dynamicFeeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey)
        external
        view
        returns (uint feeRate, bool tooVolatile)
    {
        return _dynamicFeeRateForExchange(sourceCurrencyKey, destinationCurrencyKey);
    }

    /// @notice Calculate the exchange fee for a given source and destination currency key
    /// @param sourceCurrencyKey The source currency key
    /// @param destinationCurrencyKey The destination currency key
    /// @return The exchange fee rate
    /// @return The exchange dynamic fee rate and if rates are too volatile
    function _feeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey)
        internal
        view
        returns (uint feeRate, bool tooVolatile)
    {
        // Get the exchange fee rate as per the source currencyKey and destination currencyKey
        uint baseRate = getExchangeFeeRate(sourceCurrencyKey).add(getExchangeFeeRate(destinationCurrencyKey));
        uint dynamicFee;
        (dynamicFee, tooVolatile) = _dynamicFeeRateForExchange(sourceCurrencyKey, destinationCurrencyKey);
        return (baseRate.add(dynamicFee), tooVolatile);
    }

    /// @notice Calculate the exchange fee for a given source and destination currency key
    /// @param sourceCurrencyKey The source currency key
    /// @param destinationCurrencyKey The destination currency key
    /// @param roundIdForSrc The round id of the source currency.
    /// @param roundIdForDest The round id of the target currency.
    /// @return The exchange fee rate
    /// @return The exchange dynamic fee rate
    function _feeRateForExchangeAtRounds(
        bytes32 sourceCurrencyKey,
        bytes32 destinationCurrencyKey,
        uint roundIdForSrc,
        uint roundIdForDest
    ) internal view returns (uint feeRate, bool tooVolatile) {
        // Get the exchange fee rate as per the source currencyKey and destination currencyKey
        uint baseRate = getExchangeFeeRate(sourceCurrencyKey).add(getExchangeFeeRate(destinationCurrencyKey));
        uint dynamicFee;
        (dynamicFee, tooVolatile) = _dynamicFeeRateForExchangeAtRounds(
            sourceCurrencyKey,
            destinationCurrencyKey,
            roundIdForSrc,
            roundIdForDest
        );
        return (baseRate.add(dynamicFee), tooVolatile);
    }

    function _dynamicFeeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey)
        internal
        view
        returns (uint dynamicFee, bool tooVolatile)
    {
        DynamicFeeConfig memory config = getExchangeDynamicFeeConfig();
        (uint dynamicFeeDst, bool dstVolatile) = _dynamicFeeRateForCurrency(destinationCurrencyKey, config);
        (uint dynamicFeeSrc, bool srcVolatile) = _dynamicFeeRateForCurrency(sourceCurrencyKey, config);
        dynamicFee = dynamicFeeDst.add(dynamicFeeSrc);
        // cap to maxFee
        bool overMax = dynamicFee > config.maxFee;
        dynamicFee = overMax ? config.maxFee : dynamicFee;
        return (dynamicFee, overMax || dstVolatile || srcVolatile);
    }

    function _dynamicFeeRateForExchangeAtRounds(
        bytes32 sourceCurrencyKey,
        bytes32 destinationCurrencyKey,
        uint roundIdForSrc,
        uint roundIdForDest
    ) internal view returns (uint dynamicFee, bool tooVolatile) {
        DynamicFeeConfig memory config = getExchangeDynamicFeeConfig();
        (uint dynamicFeeDst, bool dstVolatile) =
            _dynamicFeeRateForCurrencyRound(destinationCurrencyKey, roundIdForDest, config);
        (uint dynamicFeeSrc, bool srcVolatile) = _dynamicFeeRateForCurrencyRound(sourceCurrencyKey, roundIdForSrc, config);
        dynamicFee = dynamicFeeDst.add(dynamicFeeSrc);
        // cap to maxFee
        bool overMax = dynamicFee > config.maxFee;
        dynamicFee = overMax ? config.maxFee : dynamicFee;
        return (dynamicFee, overMax || dstVolatile || srcVolatile);
    }

    /// @notice Get dynamic dynamicFee for a given currency key (SIP-184)
    /// @param currencyKey The given currency key
    /// @param config dynamic fee calculation configuration params
    /// @return The dynamic fee and if it exceeds max dynamic fee set in config
    function _dynamicFeeRateForCurrency(bytes32 currencyKey, DynamicFeeConfig memory config)
        internal
        view
        returns (uint dynamicFee, bool tooVolatile)
    {
        // no dynamic dynamicFee for sUSD or too few rounds
        if (currencyKey == sUSD || config.rounds <= 1) {
            return (0, false);
        }
        uint roundId = exchangeRates().getCurrentRoundId(currencyKey);
        return _dynamicFeeRateForCurrencyRound(currencyKey, roundId, config);
    }

    /// @notice Get dynamicFee for a given currency key (SIP-184)
    /// @param currencyKey The given currency key
    /// @param roundId The round id
    /// @param config dynamic fee calculation configuration params
    /// @return The dynamic fee and if it exceeds max dynamic fee set in config
    function _dynamicFeeRateForCurrencyRound(
        bytes32 currencyKey,
        uint roundId,
        DynamicFeeConfig memory config
    ) internal view returns (uint dynamicFee, bool tooVolatile) {
        // no dynamic dynamicFee for sUSD or too few rounds
        if (currencyKey == sUSD || config.rounds <= 1) {
            return (0, false);
        }
        uint[] memory prices;
        (prices, ) = exchangeRates().ratesAndUpdatedTimeForCurrencyLastNRounds(currencyKey, config.rounds, roundId);
        dynamicFee = _dynamicFeeCalculation(prices, config.threshold, config.weightDecay);
        // cap to maxFee
        bool overMax = dynamicFee > config.maxFee;
        dynamicFee = overMax ? config.maxFee : dynamicFee;
        return (dynamicFee, overMax);
    }

    /// @notice Calculate dynamic fee according to SIP-184
    /// @param prices A list of prices from the current round to the previous rounds
    /// @param threshold A threshold to clip the price deviation ratop
    /// @param weightDecay A weight decay constant
    /// @return uint dynamic fee rate as decimal
    function _dynamicFeeCalculation(
        uint[] memory prices,
        uint threshold,
        uint weightDecay
    ) internal pure returns (uint) {
        // don't underflow
        if (prices.length == 0) {
            return 0;
        }

        uint dynamicFee = 0; // start with 0
        // go backwards in price array
        for (uint i = prices.length - 1; i > 0; i--) {
            // apply decay from previous round (will be 0 for first round)
            dynamicFee = dynamicFee.multiplyDecimal(weightDecay);
            // calculate price deviation
            uint deviation = _thresholdedAbsDeviationRatio(prices[i - 1], prices[i], threshold);
            // add to total fee
            dynamicFee = dynamicFee.add(deviation);
        }
        return dynamicFee;
    }

    /// absolute price deviation ratio used by dynamic fee calculation
    /// deviationRatio = (abs(current - previous) / previous) - threshold
    /// if negative, zero is returned
    function _thresholdedAbsDeviationRatio(
        uint price,
        uint previousPrice,
        uint threshold
    ) internal pure returns (uint) {
        if (previousPrice == 0) {
            return 0; // don't divide by zero
        }
        // abs difference between prices
        uint absDelta = price > previousPrice ? price - previousPrice : previousPrice - price;
        // relative to previous price
        uint deviationRatio = absDelta.divideDecimal(previousPrice);
        // only the positive difference from threshold
        return deviationRatio > threshold ? deviationRatio - threshold : 0;
    }

    function getAmountsForExchange(
        uint sourceAmount,
        bytes32 sourceCurrencyKey,
        bytes32 destinationCurrencyKey
    )
        public
        view
        returns (
            uint amountReceived,
            uint fee,
            uint exchangeFeeRate
        )
    {
        // The checks are added for consistency with the checks performed in _exchange()
        // The reverts (instead of no-op returns) are used order to prevent incorrect usage in calling contracts
        // (The no-op in _exchange() is in order to trigger system suspension if needed)

        // check synths active
        systemStatus().requireSynthActive(sourceCurrencyKey);
        systemStatus().requireSynthActive(destinationCurrencyKey);

        // check rates don't deviate above ciruit breaker allowed deviation
        (, bool srcInvalid) = exchangeCircuitBreaker().rateWithInvalid(sourceCurrencyKey);
        (, bool dstInvalid) = exchangeCircuitBreaker().rateWithInvalid(destinationCurrencyKey);
        require(!srcInvalid, "source synth rate invalid");
        require(!dstInvalid, "destination synth rate invalid");

        // check rates not stale or flagged
        _ensureCanExchange(sourceCurrencyKey, sourceAmount, destinationCurrencyKey);

        bool tooVolatile;
        (exchangeFeeRate, tooVolatile) = _feeRateForExchange(sourceCurrencyKey, destinationCurrencyKey);

        // check rates volatility result
        require(!tooVolatile, "exchange rates too volatile");

        (uint destinationAmount, , ) =
            exchangeRates().effectiveValueAndRates(sourceCurrencyKey, sourceAmount, destinationCurrencyKey);

        amountReceived = _deductFeesFromAmount(destinationAmount, exchangeFeeRate);
        fee = destinationAmount.sub(amountReceived);
    }

    function getAmountsForExchangeWithTrackingCode(
        uint sourceAmount,
        bytes32 sourceCurrencyKey,
        bytes32 destinationCurrencyKey,
        bytes32 trackingCode
    )
        external
        view
        returns (
            uint amountReceived,
            uint fee,
            uint exchangeFeeRate
        )
    {
        (amountReceived, fee, exchangeFeeRate) = getAmountsForExchange(
            sourceAmount,
            sourceCurrencyKey,
            destinationCurrencyKey
        );

        if (trackingCode != bytes32(0)) {
            uint partnerFeeRate = volumePartner().getFeeRate(trackingCode);
            (uint destinationAmount, , ) =
                exchangeRates().effectiveValueAndRates(sourceCurrencyKey, sourceAmount, destinationCurrencyKey);
            uint partnerFee = _deductFeesFromAmount(destinationAmount, partnerFeeRate).sub(amountReceived);

            amountReceived = amountReceived.sub(partnerFee);
            fee = fee.add(partnerFee);
            exchangeFeeRate = exchangeFeeRate.add(partnerFeeRate);
        }
    }

    function appendExchange(
        address account,
        bytes32 src,
        uint amount,
        bytes32 dest,
        uint amountReceived,
        uint exchangeFeeRate
    ) internal {
        IExchangeRates exRates = exchangeRates();
        uint roundIdForSrc = exRates.getCurrentRoundId(src);
        uint roundIdForDest = exRates.getCurrentRoundId(dest);
        exchangeState().appendExchangeEntry(
            account,
            src,
            amount,
            dest,
            amountReceived,
            exchangeFeeRate,
            now,
            roundIdForSrc,
            roundIdForDest
        );

        emit ExchangeEntryAppended(
            account,
            src,
            amount,
            dest,
            amountReceived,
            exchangeFeeRate,
            roundIdForSrc,
            roundIdForDest
        );
    }

    // ========== EVENTS ==========
    event ExchangeEntryAppended(
        address indexed account,
        bytes32 src,
        uint256 amount,
        bytes32 dest,
        uint256 amountReceived,
        uint256 exchangeFeeRate,
        uint256 roundIdForSrc,
        uint256 roundIdForDest
    );
}
