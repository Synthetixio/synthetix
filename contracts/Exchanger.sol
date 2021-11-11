pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IExchanger.sol";

// Libraries
import "./SafeDecimalMath.sol";
import "./DynamicFee.sol";

// Internal references
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IExchangeState.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/IDelegateApprovals.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/ITradingRewards.sol";
import "./interfaces/IVirtualSynth.sol";
import "./Proxyable.sol";

// Used to have strongly-typed access to internal mutative functions in Synthetix
interface ISynthetixInternal {
    function emitExchangeTracking(
        bytes32 trackingCode,
        bytes32 toCurrencyKey,
        uint256 toAmount,
        uint256 fee
    ) external;

    function emitSynthExchange(
        address account,
        bytes32 fromCurrencyKey,
        uint fromAmount,
        bytes32 toCurrencyKey,
        uint toAmount,
        address toAddress
    ) external;

    function emitExchangeReclaim(
        address account,
        bytes32 currencyKey,
        uint amount
    ) external;

    function emitExchangeRebate(
        address account,
        bytes32 currencyKey,
        uint amount
    ) external;
}

interface IExchangerInternalDebtCache {
    function updateCachedSynthDebtsWithRates(bytes32[] calldata currencyKeys, uint[] calldata currencyRates) external;

    function updateCachedSynthDebts(bytes32[] calldata currencyKeys) external;
}

// https://docs.synthetix.io/contracts/source/contracts/exchanger
contract Exchanger is Owned, MixinSystemSettings, IExchanger {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct ExchangeEntrySettlement {
        bytes32 src;
        uint amount;
        bytes32 dest;
        uint reclaim;
        uint rebate;
        uint srcRoundIdAtPeriodEnd;
        uint destRoundIdAtPeriodEnd;
        uint timestamp;
    }

    bytes32 public constant CONTRACT_NAME = "Exchanger";

    bytes32 private constant sUSD = "sUSD";

    // SIP-65: Decentralized circuit breaker
    uint public constant CIRCUIT_BREAKER_SUSPENSION_REASON = 65;

    mapping(bytes32 => uint) public lastExchangeRate;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_EXCHANGESTATE = "ExchangeState";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 private constant CONTRACT_TRADING_REWARDS = "TradingRewards";
    bytes32 private constant CONTRACT_DELEGATEAPPROVALS = "DelegateApprovals";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_DEBTCACHE = "DebtCache";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](9);
        newAddresses[0] = CONTRACT_SYSTEMSTATUS;
        newAddresses[1] = CONTRACT_EXCHANGESTATE;
        newAddresses[2] = CONTRACT_EXRATES;
        newAddresses[3] = CONTRACT_SYNTHETIX;
        newAddresses[4] = CONTRACT_FEEPOOL;
        newAddresses[5] = CONTRACT_TRADING_REWARDS;
        newAddresses[6] = CONTRACT_DELEGATEAPPROVALS;
        newAddresses[7] = CONTRACT_ISSUER;
        newAddresses[8] = CONTRACT_DEBTCACHE;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function exchangeState() internal view returns (IExchangeState) {
        return IExchangeState(requireAndGetAddress(CONTRACT_EXCHANGESTATE));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL));
    }

    function tradingRewards() internal view returns (ITradingRewards) {
        return ITradingRewards(requireAndGetAddress(CONTRACT_TRADING_REWARDS));
    }

    function delegateApprovals() internal view returns (IDelegateApprovals) {
        return IDelegateApprovals(requireAndGetAddress(CONTRACT_DELEGATEAPPROVALS));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function debtCache() internal view returns (IExchangerInternalDebtCache) {
        return IExchangerInternalDebtCache(requireAndGetAddress(CONTRACT_DEBTCACHE));
    }

    function maxSecsLeftInWaitingPeriod(address account, bytes32 currencyKey) public view returns (uint) {
        return secsLeftInWaitingPeriodForExchange(exchangeState().getMaxTimestamp(account, currencyKey));
    }

    function waitingPeriodSecs() external view returns (uint) {
        return getWaitingPeriodSecs();
    }

    function tradingRewardsEnabled() external view returns (bool) {
        return getTradingRewardsEnabled();
    }

    function priceDeviationThresholdFactor() external view returns (uint) {
        return getPriceDeviationThresholdFactor();
    }

    function settlementOwing(address account, bytes32 currencyKey)
        public
        view
        returns (
            uint reclaimAmount,
            uint rebateAmount,
            uint numEntries
        )
    {
        (reclaimAmount, rebateAmount, numEntries, ) = _settlementOwing(account, currencyKey);
    }

    // Internal function to emit events for each individual rebate and reclaim entry
    function _settlementOwing(address account, bytes32 currencyKey)
        internal
        view
        returns (
            uint reclaimAmount,
            uint rebateAmount,
            uint numEntries,
            ExchangeEntrySettlement[] memory
        )
    {
        // Need to sum up all reclaim and rebate amounts for the user and the currency key
        numEntries = exchangeState().getLengthOfEntries(account, currencyKey);

        // For each unsettled exchange
        ExchangeEntrySettlement[] memory settlements = new ExchangeEntrySettlement[](numEntries);
        for (uint i = 0; i < numEntries; i++) {
            uint reclaim;
            uint rebate;
            // fetch the entry from storage
            IExchangeState.ExchangeEntry memory exchangeEntry = _getExchangeEntry(account, currencyKey, i);

            // determine the last round ids for src and dest pairs when period ended or latest if not over
            (uint srcRoundIdAtPeriodEnd, uint destRoundIdAtPeriodEnd) = getRoundIdsAtPeriodEnd(exchangeEntry);

            // given these round ids, determine what effective value they should have received
            uint destinationAmount =
                exchangeRates().effectiveValueAtRound(
                    exchangeEntry.src,
                    exchangeEntry.amount,
                    exchangeEntry.dest,
                    srcRoundIdAtPeriodEnd,
                    destRoundIdAtPeriodEnd
                );

            // and deduct the fee from this amount using the exchangeFeeRate from storage
            uint amountShouldHaveReceived = _getAmountReceivedForExchange(destinationAmount, exchangeEntry.exchangeFeeRate);

            // SIP-65 settlements where the amount at end of waiting period is beyond the threshold, then
            // settle with no reclaim or rebate
            if (!_isDeviationAboveThreshold(exchangeEntry.amountReceived, amountShouldHaveReceived)) {
                if (exchangeEntry.amountReceived > amountShouldHaveReceived) {
                    // if they received more than they should have, add to the reclaim tally
                    reclaim = exchangeEntry.amountReceived.sub(amountShouldHaveReceived);
                    reclaimAmount = reclaimAmount.add(reclaim);
                } else if (amountShouldHaveReceived > exchangeEntry.amountReceived) {
                    // if less, add to the rebate tally
                    rebate = amountShouldHaveReceived.sub(exchangeEntry.amountReceived);
                    rebateAmount = rebateAmount.add(rebate);
                }
            }

            settlements[i] = ExchangeEntrySettlement({
                src: exchangeEntry.src,
                amount: exchangeEntry.amount,
                dest: exchangeEntry.dest,
                reclaim: reclaim,
                rebate: rebate,
                srcRoundIdAtPeriodEnd: srcRoundIdAtPeriodEnd,
                destRoundIdAtPeriodEnd: destRoundIdAtPeriodEnd,
                timestamp: exchangeEntry.timestamp
            });
        }

        return (reclaimAmount, rebateAmount, numEntries, settlements);
    }

    function _getExchangeEntry(
        address account,
        bytes32 currencyKey,
        uint index
    ) internal view returns (IExchangeState.ExchangeEntry memory) {
        (
            bytes32 src,
            uint amount,
            bytes32 dest,
            uint amountReceived,
            uint exchangeFeeRate,
            uint exchangeDynamicFeeRate,
            uint timestamp,
            uint roundIdForSrc,
            uint roundIdForDest
        ) = exchangeState().getEntryAt(account, currencyKey, index);

        return
            IExchangeState.ExchangeEntry({
                src: src,
                amount: amount,
                dest: dest,
                amountReceived: amountReceived,
                exchangeFeeRate: exchangeFeeRate,
                exchangeDynamicFeeRate: exchangeDynamicFeeRate,
                timestamp: timestamp,
                roundIdForSrc: roundIdForSrc,
                roundIdForDest: roundIdForDest
            });
    }

    function hasWaitingPeriodOrSettlementOwing(address account, bytes32 currencyKey) external view returns (bool) {
        if (maxSecsLeftInWaitingPeriod(account, currencyKey) != 0) {
            return true;
        }

        (uint reclaimAmount, , , ) = _settlementOwing(account, currencyKey);

        return reclaimAmount > 0;
    }

    /* ========== SETTERS ========== */

    function calculateAmountAfterSettlement(
        address from,
        bytes32 currencyKey,
        uint amount,
        uint refunded
    ) public view returns (uint amountAfterSettlement) {
        amountAfterSettlement = amount;

        // balance of a synth will show an amount after settlement
        uint balanceOfSourceAfterSettlement = IERC20(address(issuer().synths(currencyKey))).balanceOf(from);

        // when there isn't enough supply (either due to reclamation settlement or because the number is too high)
        if (amountAfterSettlement > balanceOfSourceAfterSettlement) {
            // then the amount to exchange is reduced to their remaining supply
            amountAfterSettlement = balanceOfSourceAfterSettlement;
        }

        if (refunded > 0) {
            amountAfterSettlement = amountAfterSettlement.add(refunded);
        }
    }

    function isSynthRateInvalid(bytes32 currencyKey) external view returns (bool) {
        return _isSynthRateInvalid(currencyKey, exchangeRates().rateForCurrency(currencyKey));
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
        uint fee;
        if (from != exchangeForAddress) {
            require(delegateApprovals().canExchangeFor(exchangeForAddress, from), "Not approved to act on behalf");
        }

        (amountReceived, fee, vSynth) = _exchange(
            exchangeForAddress,
            sourceCurrencyKey,
            sourceAmount,
            destinationCurrencyKey,
            destinationAddress,
            virtualSynth
        );

        if (fee > 0 && rewardAddress != address(0) && getTradingRewardsEnabled()) {
            tradingRewards().recordExchangeFeeForAccount(fee, rewardAddress);
        }

        if (trackingCode != bytes32(0)) {
            ISynthetixInternal(address(synthetix())).emitExchangeTracking(
                trackingCode,
                destinationCurrencyKey,
                amountReceived,
                fee
            );
        }
    }

    function _suspendIfRateInvalid(bytes32 currencyKey, uint rate) internal returns (bool circuitBroken) {
        if (_isSynthRateInvalid(currencyKey, rate)) {
            systemStatus().suspendSynth(currencyKey, CIRCUIT_BREAKER_SUSPENSION_REASON);
            circuitBroken = true;
        } else {
            lastExchangeRate[currencyKey] = rate;
        }
    }

    function _updateSNXIssuedDebtOnExchange(bytes32[2] memory currencyKeys, uint[2] memory currencyRates) internal {
        bool includesSUSD = currencyKeys[0] == sUSD || currencyKeys[1] == sUSD;
        uint numKeys = includesSUSD ? 2 : 3;

        bytes32[] memory keys = new bytes32[](numKeys);
        keys[0] = currencyKeys[0];
        keys[1] = currencyKeys[1];

        uint[] memory rates = new uint[](numKeys);
        rates[0] = currencyRates[0];
        rates[1] = currencyRates[1];

        if (!includesSUSD) {
            keys[2] = sUSD; // And we'll also update sUSD to account for any fees if it wasn't one of the exchanged currencies
            rates[2] = SafeDecimalMath.unit();
        }

        // Note that exchanges can't invalidate the debt cache, since if a rate is invalid,
        // the exchange will have failed already.
        debtCache().updateCachedSynthDebtsWithRates(keys, rates);
    }

    function _settleAndCalcSourceAmountRemaining(
        uint sourceAmount,
        address from,
        bytes32 sourceCurrencyKey
    ) internal returns (uint sourceAmountAfterSettlement) {
        (, uint refunded, uint numEntriesSettled) = _internalSettle(from, sourceCurrencyKey, false);

        sourceAmountAfterSettlement = sourceAmount;

        // when settlement was required
        if (numEntriesSettled > 0) {
            // ensure the sourceAmount takes this into account
            sourceAmountAfterSettlement = calculateAmountAfterSettlement(from, sourceCurrencyKey, sourceAmount, refunded);
        }
    }

    function _exchange(
        address from,
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        address destinationAddress,
        bool virtualSynth
    )
        internal
        returns (
            uint amountReceived,
            uint fee,
            IVirtualSynth vSynth
        )
    {
        _ensureCanExchange(sourceCurrencyKey, sourceAmount, destinationCurrencyKey);

        uint sourceAmountAfterSettlement = _settleAndCalcSourceAmountRemaining(sourceAmount, from, sourceCurrencyKey);

        // If, after settlement the user has no balance left (highly unlikely), then return to prevent
        // emitting events of 0 and don't revert so as to ensure the settlement queue is emptied
        if (sourceAmountAfterSettlement == 0) {
            return (0, 0, IVirtualSynth(0));
        }

        // Using struct ExchangeEntry here to fix stack too deep error
        IExchangeState.ExchangeEntry memory entry =
            IExchangeState.ExchangeEntry({
                src: 0,
                amount: 0,
                dest: 0,
                amountReceived: 0,
                exchangeFeeRate: 0,
                exchangeDynamicFeeRate: 0,
                timestamp: 0,
                roundIdForSrc: 0, // sourceRate
                roundIdForDest: 0 // destinationRate
            });

        // Note: `fee` is denominated in the destinationCurrencyKey.
        (
            amountReceived,
            fee,
            entry.exchangeFeeRate,
            entry.exchangeDynamicFeeRate,
            entry.roundIdForSrc,
            entry.roundIdForDest
        ) = _getAmountsForExchangeMinusFees(sourceAmountAfterSettlement, sourceCurrencyKey, destinationCurrencyKey);

        // SIP-65: Decentralized Circuit Breaker
        if (
            _suspendIfRateInvalid(sourceCurrencyKey, entry.roundIdForSrc) ||
            _suspendIfRateInvalid(destinationCurrencyKey, entry.roundIdForDest)
        ) {
            return (0, 0, IVirtualSynth(0));
        }

        // Note: We don't need to check their balance as the burn() below will do a safe subtraction which requires
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

        // Remit the fee if required
        if (fee > 0) {
            // Normalize fee to sUSD
            // Note: `fee` is being reused to avoid stack too deep errors.
            fee = exchangeRates().effectiveValue(destinationCurrencyKey, fee, sUSD);

            // Remit the fee in sUSDs
            issuer().synths(sUSD).issue(feePool().FEE_ADDRESS(), fee);

            // Tell the fee pool about this
            feePool().recordFeePaid(fee);
        }

        // Note: As of this point, `fee` is denominated in sUSD.

        // Nothing changes as far as issuance data goes because the total value in the system hasn't changed.
        // But we will update the debt snapshot in case exchange rates have fluctuated since the last exchange
        // in these currencies
        _updateSNXIssuedDebtOnExchange(
            [sourceCurrencyKey, destinationCurrencyKey],
            [entry.roundIdForSrc, entry.roundIdForDest]
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
                entry.exchangeFeeRate,
                entry.exchangeDynamicFeeRate
            );
        }
    }

    function _convert(
        bytes32 sourceCurrencyKey,
        address from,
        uint sourceAmountAfterSettlement,
        bytes32 destinationCurrencyKey,
        uint amountReceived,
        address recipient,
        bool virtualSynth
    ) internal returns (IVirtualSynth vSynth) {
        // Burn the source amount
        issuer().synths(sourceCurrencyKey).burn(from, sourceAmountAfterSettlement);

        // Issue their new synths
        ISynth dest = issuer().synths(destinationCurrencyKey);

        if (virtualSynth) {
            Proxyable synth = Proxyable(address(dest));
            vSynth = _createVirtualSynth(IERC20(address(synth.proxy())), recipient, amountReceived, destinationCurrencyKey);
            dest.issue(address(vSynth), amountReceived);
        } else {
            dest.issue(recipient, amountReceived);
        }
    }

    function _createVirtualSynth(
        IERC20,
        address,
        uint,
        bytes32
    ) internal returns (IVirtualSynth) {
        revert("Cannot be run on this layer");
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
        require(issuer().synths(currencyKey) != ISynth(0), "No such synth");
        require(_isSynthRateInvalid(currencyKey, exchangeRates().rateForCurrency(currencyKey)), "Synth price is valid");
        systemStatus().suspendSynth(currencyKey, CIRCUIT_BREAKER_SUSPENSION_REASON);
    }

    // SIP-78
    function setLastExchangeRateForSynth(bytes32 currencyKey, uint rate) external onlyExchangeRates {
        require(rate > 0, "Rate must be above 0");
        lastExchangeRate[currencyKey] = rate;
    }

    // SIP-139
    function resetLastExchangeRate(bytes32[] calldata currencyKeys) external onlyOwner {
        (uint[] memory rates, bool anyRateInvalid) = exchangeRates().ratesAndInvalidForCurrencies(currencyKeys);

        require(!anyRateInvalid, "Rates for given synths not valid");

        for (uint i = 0; i < currencyKeys.length; i++) {
            lastExchangeRate[currencyKeys[i]] = rates[i];
        }
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _ensureCanExchange(
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey
    ) internal view {
        require(sourceCurrencyKey != destinationCurrencyKey, "Can't be same synth");
        require(sourceAmount > 0, "Zero amount");

        bytes32[] memory synthKeys = new bytes32[](2);
        synthKeys[0] = sourceCurrencyKey;
        synthKeys[1] = destinationCurrencyKey;
        require(!exchangeRates().anyRateIsInvalid(synthKeys), "Src/dest rate invalid or not found");
    }

    function _isSynthRateInvalid(bytes32 currencyKey, uint currentRate) internal view returns (bool) {
        if (currentRate == 0) {
            return true;
        }

        uint lastRateFromExchange = lastExchangeRate[currencyKey];

        if (lastRateFromExchange > 0) {
            return _isDeviationAboveThreshold(lastRateFromExchange, currentRate);
        }

        // if no last exchange for this synth, then we need to look up last 3 rates (+1 for current rate)
        (uint[] memory rates, ) = exchangeRates().ratesAndUpdatedTimeForCurrencyLastNRounds(currencyKey, 4);

        // start at index 1 to ignore current rate
        for (uint i = 1; i < rates.length; i++) {
            // ignore any empty rates in the past (otherwise we will never be able to get validity)
            if (rates[i] > 0 && _isDeviationAboveThreshold(rates[i], currentRate)) {
                return true;
            }
        }

        return false;
    }

    function _isDeviationAboveThreshold(uint base, uint comparison) internal view returns (bool) {
        if (base == 0 || comparison == 0) {
            return true;
        }

        uint factor;
        if (comparison > base) {
            factor = comparison.divideDecimal(base);
        } else {
            factor = base.divideDecimal(comparison);
        }

        return factor >= getPriceDeviationThresholdFactor();
    }

    function _internalSettle(
        address from,
        bytes32 currencyKey,
        bool updateCache
    )
        internal
        returns (
            uint reclaimed,
            uint refunded,
            uint numEntriesSettled
        )
    {
        require(maxSecsLeftInWaitingPeriod(from, currencyKey) == 0, "Cannot settle during waiting period");

        (uint reclaimAmount, uint rebateAmount, uint entries, ExchangeEntrySettlement[] memory settlements) =
            _settlementOwing(from, currencyKey);

        if (reclaimAmount > rebateAmount) {
            reclaimed = reclaimAmount.sub(rebateAmount);
            reclaim(from, currencyKey, reclaimed);
        } else if (rebateAmount > reclaimAmount) {
            refunded = rebateAmount.sub(reclaimAmount);
            refund(from, currencyKey, refunded);
        }

        // by checking a reclaim or refund we also check that the currency key is still a valid synth,
        // as the deviation check will return 0 if the synth has been removed.
        if (updateCache && (reclaimed > 0 || refunded > 0)) {
            bytes32[] memory key = new bytes32[](1);
            key[0] = currencyKey;
            debtCache().updateCachedSynthDebts(key);
        }

        // emit settlement event for each settled exchange entry
        for (uint i = 0; i < settlements.length; i++) {
            emit ExchangeEntrySettled(
                from,
                settlements[i].src,
                settlements[i].amount,
                settlements[i].dest,
                settlements[i].reclaim,
                settlements[i].rebate,
                settlements[i].srcRoundIdAtPeriodEnd,
                settlements[i].destRoundIdAtPeriodEnd,
                settlements[i].timestamp
            );
        }

        numEntriesSettled = entries;

        // Now remove all entries, even if no reclaim and no rebate
        exchangeState().removeEntries(from, currencyKey);
    }

    function reclaim(
        address from,
        bytes32 currencyKey,
        uint amount
    ) internal {
        // burn amount from user
        issuer().synths(currencyKey).burn(from, amount);
        ISynthetixInternal(address(synthetix())).emitExchangeReclaim(from, currencyKey, amount);
    }

    function refund(
        address from,
        bytes32 currencyKey,
        uint amount
    ) internal {
        // issue amount to user
        issuer().synths(currencyKey).issue(from, amount);
        ISynthetixInternal(address(synthetix())).emitExchangeRebate(from, currencyKey, amount);
    }

    function secsLeftInWaitingPeriodForExchange(uint timestamp) internal view returns (uint) {
        uint _waitingPeriodSecs = getWaitingPeriodSecs();
        if (timestamp == 0 || now >= timestamp.add(_waitingPeriodSecs)) {
            return 0;
        }

        return timestamp.add(_waitingPeriodSecs).sub(now);
    }

    /* ========== Exchange Related Fees ========== */
    /// @notice public function to get the fee for a given exchange
    /// @param sourceCurrencyKey The source currency key
    /// @param destinationCurrencyKey The destination currency key
    /// @return The exchange fee rate
    function feeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey)
        external
        view
        returns (uint exchangeFeeRate)
    {
        (exchangeFeeRate, ) = _feeRateForExchange(sourceCurrencyKey, destinationCurrencyKey);
    }

    /// @notice Calculate the exchange fee for a given source and destination currency key
    /// @param sourceCurrencyKey The source currency key
    /// @param destinationCurrencyKey The destination currency key
    /// @return The exchange fee rate
    /// @return The exchange dynamic fee rate
    function _feeRateForExchange(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey)
        internal
        view
        returns (uint exchangeFeeRate, uint exchangeDynamicFeeRate)
    {
        // Get the exchange fee rate as per destination currencyKey
        exchangeFeeRate = getExchangeFeeRate(destinationCurrencyKey);

        // Get the exchange dynamic fee rate as per destination currencyKey
        exchangeDynamicFeeRate = _getDynamicFeeForExchange(destinationCurrencyKey);

        if (sourceCurrencyKey == sUSD || destinationCurrencyKey == sUSD) {
            exchangeFeeRate = exchangeFeeRate.add(exchangeDynamicFeeRate);
            // Cap max exchangeFeeRate to 100%
            exchangeFeeRate = exchangeFeeRate > SafeDecimalMath.unit() ? SafeDecimalMath.unit() : exchangeFeeRate;
            return (exchangeFeeRate, exchangeDynamicFeeRate);
        }

        // Is this a swing trade? long to short or short to long skipping sUSD.
        if (
            (sourceCurrencyKey[0] == 0x73 && destinationCurrencyKey[0] == 0x69) ||
            (sourceCurrencyKey[0] == 0x69 && destinationCurrencyKey[0] == 0x73)
        ) {
            // Double the exchange fee
            exchangeFeeRate = exchangeFeeRate.mul(2);

            // Double the exchange dynamic fee
            exchangeDynamicFeeRate = exchangeDynamicFeeRate.mul(2);
        }

        exchangeFeeRate = exchangeFeeRate.add(exchangeDynamicFeeRate);
        // Cap max exchangeFeeRate to 100%
        exchangeFeeRate = exchangeFeeRate > SafeDecimalMath.unit() ? SafeDecimalMath.unit() : exchangeFeeRate;
    }

    /// @notice Get dynamic fee for a given currency key (SIP-184)
    /// @param currencyKey The given currency key
    /// @return The dyanmic fee
    function _getDynamicFeeForExchange(bytes32 currencyKey) internal view returns (uint dynamicFee) {
        // No dynamic fee for sUSD
        if (currencyKey == sUSD) {
            return 0;
        }
        uint threshold = getExchangeDynamicFeeThreshold();
        uint weightDecay = getExchangeDynamicFeeWeightDecay();
        uint rounds = getExchangeDynamicFeeRounds();
        uint[] memory prices;
        (prices, ) = exchangeRates().ratesAndUpdatedTimeForCurrencyLastNRounds(currencyKey, rounds);
        dynamicFee = DynamicFee.getDynamicFee(prices, threshold, weightDecay);
    }

    function getAmountsForExchange(
        uint sourceAmount,
        bytes32 sourceCurrencyKey,
        bytes32 destinationCurrencyKey
    )
        external
        view
        returns (
            uint amountReceived,
            uint fee,
            uint exchangeFeeRate
        )
    {
        (amountReceived, fee, exchangeFeeRate, , , ) = _getAmountsForExchangeMinusFees(
            sourceAmount,
            sourceCurrencyKey,
            destinationCurrencyKey
        );
    }

    function _getAmountsForExchangeMinusFees(
        uint sourceAmount,
        bytes32 sourceCurrencyKey,
        bytes32 destinationCurrencyKey
    )
        internal
        view
        returns (
            uint amountReceived,
            uint fee,
            uint exchangeFeeRate,
            uint exchangeDynamicFeeRate,
            uint sourceRate,
            uint destinationRate
        )
    {
        uint destinationAmount;
        (destinationAmount, sourceRate, destinationRate) = exchangeRates().effectiveValueAndRates(
            sourceCurrencyKey,
            sourceAmount,
            destinationCurrencyKey
        );

        // Return when invalid rate
        if (destinationAmount == 0 && destinationRate == 0) {
            return (destinationAmount, 0, 0, 0, sourceRate, destinationRate);
        }

        (exchangeFeeRate, exchangeDynamicFeeRate) = _feeRateForExchange(sourceCurrencyKey, destinationCurrencyKey);
        amountReceived = _getAmountReceivedForExchange(destinationAmount, exchangeFeeRate);
        fee = destinationAmount.sub(amountReceived);
    }

    function _getAmountReceivedForExchange(uint destinationAmount, uint exchangeFeeRate)
        internal
        pure
        returns (uint amountReceived)
    {
        amountReceived = destinationAmount.multiplyDecimal(SafeDecimalMath.unit().sub(exchangeFeeRate));
    }

    function appendExchange(
        address account,
        bytes32 src,
        uint amount,
        bytes32 dest,
        uint amountReceived,
        uint exchangeFeeRate,
        uint exchangeDynamicFeeRate
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
            exchangeDynamicFeeRate,
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

    function getRoundIdsAtPeriodEnd(IExchangeState.ExchangeEntry memory exchangeEntry)
        internal
        view
        returns (uint srcRoundIdAtPeriodEnd, uint destRoundIdAtPeriodEnd)
    {
        IExchangeRates exRates = exchangeRates();
        uint _waitingPeriodSecs = getWaitingPeriodSecs();

        srcRoundIdAtPeriodEnd = exRates.getLastRoundIdBeforeElapsedSecs(
            exchangeEntry.src,
            exchangeEntry.roundIdForSrc,
            exchangeEntry.timestamp,
            _waitingPeriodSecs
        );
        destRoundIdAtPeriodEnd = exRates.getLastRoundIdBeforeElapsedSecs(
            exchangeEntry.dest,
            exchangeEntry.roundIdForDest,
            exchangeEntry.timestamp,
            _waitingPeriodSecs
        );
    }

    // ========== MODIFIERS ==========

    modifier onlySynthetixorSynth() {
        ISynthetix _synthetix = synthetix();
        require(
            msg.sender == address(_synthetix) || _synthetix.synthsByAddress(msg.sender) != bytes32(0),
            "Exchanger: Only synthetix or a synth contract can perform this action"
        );
        _;
    }

    modifier onlyExchangeRates() {
        IExchangeRates _exchangeRates = exchangeRates();
        require(msg.sender == address(_exchangeRates), "Restricted to ExchangeRates");
        _;
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

    event ExchangeEntrySettled(
        address indexed from,
        bytes32 src,
        uint256 amount,
        bytes32 dest,
        uint256 reclaim,
        uint256 rebate,
        uint256 srcRoundIdAtPeriodEnd,
        uint256 destRoundIdAtPeriodEnd,
        uint256 exchangeTimestamp
    );
}
