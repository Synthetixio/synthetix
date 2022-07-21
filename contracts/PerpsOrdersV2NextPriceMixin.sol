pragma solidity ^0.5.16;

// Inheritance
import "./PerpsOrdersV2Base.sol";

/**
 Mixin that implements NextPrice orders mechanism for the perps market.
 The purpose of the mechanism is to allow reduced fees for trades that commit to next price instead
 of current price. Specifically, this should serve funding rate arbitrageurs, such that funding rate
 arb is profitable for smaller skews. This in turn serves the protocol by reducing the skew, and so
 the risk to the debt pool, and funding rate for traders. 
 The fees can be reduced when comitting to next price, because front-running (MEV and oracle delay)
 is less of a risk when committing to next price.
 The relative complexity of the mechanism is due to having to enforce the "commitment" to the trade
 without either introducing free (or cheap) optionality to cause cancellations, and without large
 sacrifices to the UX / risk of the traders (e.g. blocking all actions, or penalizing failures too much).
 */
contract PerpsOrdersV2NextPriceMixin is PerpsOrdersV2Base {
    ///// Events
    event NextPriceOrderSubmitted(
        bytes32 indexed marketKey,
        address indexed account,
        int sizeDelta,
        uint targetRoundId,
        uint commitDeposit,
        uint keeperDeposit,
        bytes32 trackingCode
    );

    event NextPriceOrderRemoved(
        bytes32 indexed marketKey,
        address indexed account,
        uint curRoundId,
        int sizeDelta,
        uint targetRoundId,
        uint commitDeposit,
        uint keeperDeposit,
        bytes32 trackingCode
    );

    /// @dev Holds a mapping of [marketKey][account] to orders. Only one order per market & account is supported
    mapping(bytes32 => mapping(address => NextPriceOrder)) public nextPriceOrders;

    function baseFeeNextPrice(bytes32 marketKey) external view returns (uint) {
        return _baseFeeNextPrice(marketKey);
    }

    function feeRateNextPrice(bytes32 marketKey) external view returns (uint) {
        return _feeRateNextPrice(marketKey);
    }

    function orderFeeNextPrice(bytes32 marketKey, int sizeDelta) external view returns (uint fee, bool invalid) {
        return engineContract().orderFee(marketKey, sizeDelta, _feeRateNextPrice(marketKey));
    }

    function currentRoundId(bytes32 marketKey) public view returns (uint) {
        bytes32 baseAsset = stateContract().marketScalars(marketKey).baseAsset;
        return _exchangeRates().getCurrentRoundId(baseAsset);
    }

    ///// Mutative methods

    /**
     * @notice submits an order to be filled at a price of the next oracle update.
     * Reverts if a previous order still exists (wasn't executed or cancelled).
     * Reverts if the order cannot be filled at current price to prevent witholding commitFee for
     * incorrectly submitted orders (that cannot be filled).
     * @param sizeDelta size in baseAsset (notional terms) of the order, similar to `modifyPosition` interface
     */
    function submitNextPriceOrder(bytes32 marketKey, int sizeDelta) external {
        _submitNextPriceOrder(marketKey, sizeDelta, bytes32(0));
    }

    /// same as submitNextPriceOrder but emits an event with the tracking code
    /// to allow volume source fee sharing for integrations
    function submitNextPriceOrderWithTracking(
        bytes32 marketKey,
        int sizeDelta,
        bytes32 trackingCode
    ) external {
        _submitNextPriceOrder(marketKey, sizeDelta, trackingCode);
    }

    function _submitNextPriceOrder(
        bytes32 marketKey,
        int sizeDelta,
        bytes32 trackingCode
    ) internal {
        address account = msg.sender;
        // check that a previous order doesn't exist
        require(nextPriceOrders[marketKey][account].sizeDelta == 0, "previous order exists");

        // To prevent submitting bad orders in good faith and being charged commitDeposit for them
        // simulate the order with current price and market and check that the order doesn't revert.
        // The spot rate is used because the commitDeposit will be deducted from margin on submission.
        // Dynamic fee should be included because current dynamic fee is better approximation than 0
        uint feeRate = _feeRate(marketKey);
        (, , , Status status) = engineContract().postTradeDetails(marketKey, account, sizeDelta, feeRate);
        require(status == Status.Ok, "order would fail as spot");

        // deduct fees from margin
        uint commitDeposit = _nextPriceCommitDeposit(marketKey, sizeDelta);
        uint keeperDeposit = _minKeeperFee();
        _engineInternal().modifyLockedMargin(marketKey, account, int(commitDeposit + keeperDeposit), 0);

        // create order
        uint targetRoundId = currentRoundId(marketKey) + 1; // next round
        NextPriceOrder memory order =
            NextPriceOrder({
                sizeDelta: int128(sizeDelta),
                targetRoundId: uint128(targetRoundId),
                commitDeposit: uint128(commitDeposit),
                keeperDeposit: uint128(keeperDeposit),
                trackingCode: trackingCode
            });
        // emit event
        emit NextPriceOrderSubmitted(
            marketKey,
            account,
            order.sizeDelta,
            order.targetRoundId,
            order.commitDeposit,
            order.keeperDeposit,
            order.trackingCode
        );
        // store order
        nextPriceOrders[marketKey][account] = order;
    }

    /**
     * @notice Cancels an existing order for an account.
     * Anyone can call this method for any account, but only the account owner
     *  can cancel their own order during the period when it can still potentially be executed (before it becomes stale).
     *  Only after the order becomes stale, can anyone else (e.g. a keeper) cancel the order for the keeperFee.
     * Cancelling the order:
     * - Removes the stored order.
     * - commitFee (deducted during submission) is sent to the fee pool.
     * - keeperFee (deducted during submission) is refunded into margin if it's the account holder,
     *  or send to the msg.sender if it's not the account holder.
     * @param account the account for which the stored order should be cancelled
     */
    function cancelNextPriceOrder(bytes32 marketKey, address account) external {
        address keeper = msg.sender;

        // important!! order of the account, not the msg.sender
        NextPriceOrder memory order = nextPriceOrders[marketKey][account];
        // check that a previous order exists
        require(order.sizeDelta != 0, "no previous order");

        uint curRoundId = currentRoundId(marketKey);

        uint burn = order.commitDeposit;
        uint refund = 0;
        if (account == keeper) {
            // this is account owner, so refund keeper fee to margin
            refund += order.keeperDeposit;
        } else {
            // this is someone else (like a keeper)
            // cancellation by third party is only possible when execution cannot be attempted any longer
            // otherwise someone might try to grief an account by cancelling for the keeper fee
            require(
                _confirmationWindowOver(marketKey, curRoundId, order.targetRoundId),
                "cannot be cancelled by keeper yet"
            );

            // burn keeper fee from locked margin
            burn += order.keeperDeposit;
            // send keeper fee to keeper
            _manager().issueSUSD(keeper, order.keeperDeposit);
        }
        // record the margin changes
        // lockAmount = -refund because refund is unlocked back into margin
        _engineInternal().modifyLockedMargin(marketKey, account, -int(refund), burn);

        // pay the commitDeposit as fee to the FeePool
        _manager().payFee(order.commitDeposit, order.trackingCode);

        // remove stored order
        delete nextPriceOrders[marketKey][account];
        // emit event
        emit NextPriceOrderRemoved(
            marketKey,
            account,
            curRoundId,
            order.sizeDelta,
            order.targetRoundId,
            order.commitDeposit,
            order.keeperDeposit,
            order.trackingCode
        );
    }

    /**
     * @notice Tries to execute a previously submitted next-price order.
     * Reverts if:
     * - There is no order
     * - Target roundId wasn't reached yet
     * - Order is stale (target roundId is too low compared to current roundId).
     * - Order fails for accounting reason (e.g. margin was removed, leverage exceeded, etc)
     * If order reverts, it has to be removed by calling cancelNextPriceOrder().
     * Anyone can call this method for any account.
     * If this is called by the account holder - the keeperFee is refunded into margin,
     *  otherwise it sent to the msg.sender.
     * @param account address of the account for which to try to execute a next-price order
     */
    function executeNextPriceOrder(bytes32 marketKey, address account) external {
        address keeper = msg.sender;
        // important!: order  of the account, not the sender!
        NextPriceOrder memory order = nextPriceOrders[marketKey][account];
        // check that a previous order exists
        require(order.sizeDelta != 0, "no previous order");

        // check round-Id
        uint curRoundId = currentRoundId(marketKey);
        require(order.targetRoundId <= curRoundId, "target roundId not reached");

        // check order is not too old to execute
        // we cannot allow executing old orders because otherwise perps knowledge
        // can be used to trigger failures of orders that are more profitable
        // then the commitFee that was charged, or can be used to confirm
        // orders that are more profitable than known then (which makes this into a "cheap option").
        require(!_confirmationWindowOver(marketKey, curRoundId, order.targetRoundId), "order too old, use cancel");

        // handle the fees and refunds according to the mechanism rules
        uint refund = order.commitDeposit; // refund the commitment deposit
        uint burn = 0;

        // refund keeperFee to margin if it's the account holder
        if (keeper == account) {
            refund += order.keeperDeposit;
        } else {
            burn += order.keeperDeposit;
            _manager().issueSUSD(keeper, order.keeperDeposit);
        }
        // record the margin changes
        // lockAmount = -refund because refund is unlocked back into margin
        _engineInternal().modifyLockedMargin(marketKey, account, -int(refund), burn);

        IPerpsEngineV2Internal.ExecutionOptions memory options =
            IPerpsEngineV2Internal.ExecutionOptions({
                priceDelta: _priceDeltaForRoundId(marketKey, order.targetRoundId),
                feeRate: _feeRateNextPrice(marketKey),
                trackingCode: order.trackingCode
            });
        _engineInternal().trade(marketKey, account, order.sizeDelta, options);

        // remove stored order
        delete nextPriceOrders[marketKey][account];
        // emit event
        emit NextPriceOrderRemoved(
            marketKey,
            account,
            curRoundId,
            order.sizeDelta,
            order.targetRoundId,
            order.commitDeposit,
            order.keeperDeposit,
            order.trackingCode
        );
    }

    /// helper for getting `int priceDelta` for the `trade()` interface for a specific target roundId
    /// from current asset price
    function _priceDeltaForRoundId(bytes32 marketKey, uint targetRoundId) internal view returns (int) {
        (uint pastPrice, ) = _exchangeRates().rateAndTimestampAtRound(_baseAsset(marketKey), targetRoundId);
        return _priceDeltaFromCurrent(marketKey, pastPrice);
    }

    ///// Internal views

    // confirmation window is over when current roundId is more than nextPriceConfirmWindow
    // rounds after target roundId
    function _confirmationWindowOver(
        bytes32 marketKey,
        uint curRoundId,
        uint targetRoundId
    ) internal view returns (bool) {
        return (curRoundId > targetRoundId) && (curRoundId - targetRoundId > _nextPriceConfirmWindow(marketKey)); // don't underflow
    }

    // calculate the commitFee, which is the fee that would be charged on the order if it was spot
    function _nextPriceCommitDeposit(bytes32 marketKey, int sizeDelta) internal view returns (uint) {
        // Commit fee is equal to the spot fee that would be paid.
        // This is to prevent free cancellation manipulations (by e.g. withdrawing the margin).
        // The dynamic fee rate is passed as 0 since for the purposes of the commitment deposit
        // it is not important since at the time of order execution it will be refunded and the correct
        // dynamic fee will be charged.
        (uint fee, ) = engineContract().orderFee(marketKey, sizeDelta, _baseFee(marketKey));
        return fee;
    }

    function _feeRateNextPrice(bytes32 marketKey) internal view returns (uint feeRate) {
        // add to base fee
        return _baseFeeNextPrice(marketKey).add(_dynamicFeeRateChecked(marketKey));
    }
}
