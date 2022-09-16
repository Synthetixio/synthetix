pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./FuturesV2MarketProxyable.sol";
import "./interfaces/IFuturesV2MarketNextPriceOrders.sol";

// Reference
import "./interfaces/IFuturesV2MarketBaseTypes.sol";

/**
 Mixin that implements NextPrice orders mechanism for the futures market.
 The purpose of the mechanism is to allow reduced fees for trades that commit to next price instead
 of current price. Specifically, this should serve funding rate arbitrageurs, such that funding rate
 arb is profitable for smaller skews. This in turn serves the protocol by reducing the skew, and so
 the risk to the debt pool, and funding rate for traders. 
 The fees can be reduced when committing to next price, because front-running (MEV and oracle delay)
 is less of a risk when committing to next price.
 The relative complexity of the mechanism is due to having to enforce the "commitment" to the trade
 without either introducing free (or cheap) optionality to cause cancellations, and without large
 sacrifices to the UX / risk of the traders (e.g. blocking all actions, or penalizing failures too much).
 */
contract FuturesV2MarketDelayedOrders is IFuturesV2MarketNextPriceOrders, FuturesV2MarketProxyable {
    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        address _marketState,
        address _owner,
        address _resolver
    ) public FuturesV2MarketProxyable(_proxy, _marketState, _owner, _resolver) {}

    function nextPriceOrders(address account) external view returns (DelayedOrder memory) {
        return marketState.nextPriceOrders(account);
    }

    uint public constant MIN_NEXT_PRICE_ORDER_DELAY = 60 seconds;

    /// Minimum amount of time (in seconds) before a delayed order can be executed.
    uint public constant MIN_ORDER_DELAY = 60 seconds;

    ///// Mutative methods

    /**
     * @notice submits an order to be filled at a price of the next oracle update.
     * Reverts if a previous order still exists (wasn't executed or cancelled).
     * Reverts if the order cannot be filled at current price to prevent withholding commitFee for
     * incorrectly submitted orders (that cannot be filled).
     *
     * The order is executable after maxTimeDelta. However, we also allow execution if the next price update
     * occurs before the maxTimeDelta.
     * Reverts if the maxTimeDelta is < minimum required delay.
     *
     * @param sizeDelta size in baseAsset (notional terms) of the order, similar to `modifyPosition` interface
     * @param maxTimeDelta maximum time in seconds to wait before filling this order
     */
    function submitDelayedOrder(int sizeDelta, uint maxTimeDelta) external {
        _submitDelayedOrder(sizeDelta, maxTimeDelta, bytes32(0));
    }

    /// same as submitDelayedOrder but emits an event with the tracking code
    /// to allow volume source fee sharing for integrations
    function submitDelayedOrderWithTracking(
        int sizeDelta,
        uint maxTimeDelta,
        bytes32 trackingCode
    ) external {
        _submitDelayedOrder(sizeDelta, maxTimeDelta, trackingCode);
    }

    function _submitDelayedOrder(
        int sizeDelta,
        uint maxTimeDelta,
        bytes32 trackingCode
    ) internal {
        // check that a previous order doesn't exist
        require(marketState.delayedOrder(messageSender).sizeDelta == 0, "previous order exists");

        // ensure the maxTimeDelta is above the minimum required delay
        require(maxTimeDelta >= MIN_ORDER_DELAY, "minTimeDelta delay too short");

        // storage position as it's going to be modified to deduct commitFee and keeperFee
        Position memory position = marketState.positions(messageSender);

        // to prevent submitting bad orders in good faith and being charged commitDeposit for them
        // simulate the order with current price and market and check that the order doesn't revert
        uint price = _assetPriceRequireSystemChecks();
        uint fundingIndex = _recomputeFunding(price);
        TradeParams memory params =
            TradeParams({
                sizeDelta: sizeDelta,
                price: price,
                takerFee: _takerFeeNextPrice(marketState.marketKey()),
                makerFee: _makerFeeNextPrice(marketState.marketKey()),
                trackingCode: trackingCode
            });
        (, , Status status) = _postTradeDetails(position, params);
        _revertIfError(status);

        // deduct fees from margin
        uint commitDeposit = _nextPriceCommitDeposit(params);
        uint keeperDeposit = _minKeeperFee();
        _updatePositionMargin(messageSender, position, price, -int(commitDeposit + keeperDeposit));
        // emit event for modifying the position (subtracting the fees from margin)
        emitPositionModified(position.id, messageSender, position.margin, position.size, 0, price, fundingIndex, 0);

        // create order
        uint targetRoundId = _exchangeRates().getCurrentRoundId(marketState.baseAsset()) + 1; // next round
        DelayedOrder memory order =
            DelayedOrder({
                sizeDelta: int128(sizeDelta),
                targetRoundId: uint128(targetRoundId),
                commitDeposit: uint128(commitDeposit),
                keeperDeposit: uint128(keeperDeposit),
                executableAtTime: block.timestamp + maxTimeDelta,
                trackingCode: trackingCode
            });
        // emit event
        emitDelayedOrderSubmitted(
            messageSender,
            order.sizeDelta,
            order.targetRoundId,
            order.commitDeposit,
            order.keeperDeposit,
            order.trackingCode
        );
        // store order
        marketState.updateDelayedOrder(
            messageSender,
            order.sizeDelta,
            order.targetRoundId,
            order.commitDeposit,
            order.keeperDeposit,
            order.executableAtTime,
            order.trackingCode
        );
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
    function cancelDelayedOrder(address account) external {
        // important!! order of the account, not the msg.sender
        DelayedOrder memory order = marketState.delayedOrder(account);
        // check that a previous order exists
        require(order.sizeDelta != 0, "no previous order");

        uint currentRoundId = _exchangeRates().getCurrentRoundId(marketState.baseAsset());

        if (account == messageSender) {
            // this is account owner
            // refund keeper fee to margin
            Position memory position = marketState.positions(account);
            uint price = _assetPriceRequireSystemChecks();
            uint fundingIndex = _recomputeFunding(price);
            _updatePositionMargin(account, position, price, int(order.keeperDeposit));

            // emit event for modifying the position (add the fee to margin)
            emitPositionModified(position.id, account, position.margin, position.size, 0, price, fundingIndex, 0);
        } else {
            // this is someone else (like a keeper)
            // cancellation by third party is only possible when execution cannot be attempted any longer
            // otherwise someone might try to grief an account by cancelling for the keeper fee
            require(_confirmationWindowOver(currentRoundId, order.targetRoundId), "cannot be cancelled by keeper yet");

            // send keeper fee to keeper
            _manager().issueSUSD(messageSender, order.keeperDeposit);
        }

        // pay the commitDeposit as fee to the FeePool
        _manager().payFee(order.commitDeposit);

        // remove stored order
        // important!! position of the account, not the msg.sender
        marketState.deleteDelayedOrder(account);
        // emit event
        emitDelayedOrderRemoved(
            account,
            currentRoundId,
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
     * If order reverts, it has to be removed by calling cancelDelayedOrder().
     * Anyone can call this method for any account.
     * If this is called by the account holder - the keeperFee is refunded into margin,
     *  otherwise it sent to the msg.sender.
     * @param account address of the account for which to try to execute a next-price order
     */
    function executeDelayedOrder(address account) external {
        // important!: order of the account, not the sender!
        DelayedOrder memory order = marketState.delayedOrder(account);
        // check that a previous order exists
        require(order.sizeDelta != 0, "no previous order");

        // check order executability and round-id
        uint currentRoundId = _exchangeRates().getCurrentRoundId(marketState.baseAsset());
        require(
            block.timestamp >= order.executableAtTime || order.targetRoundId <= currentRoundId,
            "executability not reached"
        );

        // check order is not too old to execute
        // we cannot allow executing old orders because otherwise future knowledge
        // can be used to trigger failures of orders that are more profitable
        // then the commitFee that was charged, or can be used to confirm
        // orders that are more profitable than known then (which makes this into a "cheap option").
        require(!_confirmationWindowOver(currentRoundId, order.targetRoundId), "order too old, use cancel");

        // handle the fees and refunds according to the mechanism rules
        uint toRefund = order.commitDeposit; // refund the commitment deposit

        // refund keeperFee to margin if it's the account holder
        if (messageSender == account) {
            toRefund += order.keeperDeposit;
        } else {
            _manager().issueSUSD(messageSender, order.keeperDeposit);
        }

        Position memory position = marketState.positions(account);
        uint currentPrice = _assetPriceRequireSystemChecks();
        uint fundingIndex = _recomputeFunding(currentPrice);
        // refund the commitFee (and possibly the keeperFee) to the margin before executing the order
        // if the order later fails this is reverted of course
        _updatePositionMargin(account, position, currentPrice, int(toRefund));
        // emit event for modifying the position (refunding fee/s)
        emitPositionModified(position.id, account, position.margin, position.size, 0, currentPrice, fundingIndex, 0);

        // the correct price for the past round
        (uint pastPrice, ) = _exchangeRates().rateAndTimestampAtRound(marketState.baseAsset(), order.targetRoundId);
        // execute or revert
        _trade(
            account,
            TradeParams({
                sizeDelta: order.sizeDelta, // using the pastPrice from the target roundId
                price: pastPrice, // the funding is applied only from order confirmation time
                takerFee: _takerFeeNextPrice(marketState.marketKey()),
                makerFee: _makerFeeNextPrice(marketState.marketKey()),
                trackingCode: order.trackingCode
            })
        );

        // remove stored order
        marketState.deleteDelayedOrder(account);
        // emit event
        emitDelayedOrderRemoved(
            account,
            currentRoundId,
            order.sizeDelta,
            order.targetRoundId,
            order.commitDeposit,
            order.keeperDeposit,
            order.trackingCode
        );
    }

    ///// Internal views

    // confirmation window is over when current roundId is more than nextPriceConfirmWindow
    // rounds after target roundId
    function _confirmationWindowOver(uint currentRoundId, uint targetRoundId) internal view returns (bool) {
        return
            (currentRoundId > targetRoundId) &&
            (currentRoundId - targetRoundId > _nextPriceConfirmWindow(marketState.marketKey())); // don't underflow
    }

    // convenience view to access exchangeRates contract for methods that are not exposed
    // via _exchangeCircuitBreaker() contract
    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(_exchangeCircuitBreaker().exchangeRates());
    }

    // calculate the commitFee, which is the fee that would be charged on the order if it was spot
    function _nextPriceCommitDeposit(TradeParams memory params) internal view returns (uint) {
        // modify params to spot fee
        params.takerFee = _takerFee(marketState.marketKey());
        params.makerFee = _makerFee(marketState.marketKey());
        // Commit fee is equal to the spot fee that would be paid.
        // This is to prevent free cancellation manipulations (by e.g. withdrawing the margin).
        // The dynamic fee rate is passed as 0 since for the purposes of the commitment deposit
        // it is not important since at the time of order execution it will be refunded and the correct
        // dynamic fee will be charged.
        return _orderFee(params, 0);
    }

    ///// Events
    event DelayedOrderSubmitted(
        address indexed account,
        int sizeDelta,
        uint targetRoundId,
        uint commitDeposit,
        uint keeperDeposit,
        bytes32 trackingCode
    );
    bytes32 internal constant NEXTPRICEORDERSUBMITTED_SIG =
        keccak256("DelayedOrderSubmitted(address,int256,uint256,uint256,uint256,bytes32)");

    function emitDelayedOrderSubmitted(
        address account,
        int sizeDelta,
        uint targetRoundId,
        uint commitDeposit,
        uint keeperDeposit,
        bytes32 trackingCode
    ) internal {
        proxy._emit(
            abi.encode(sizeDelta, targetRoundId, commitDeposit, keeperDeposit, trackingCode),
            2,
            NEXTPRICEORDERSUBMITTED_SIG,
            addressToBytes32(account),
            0,
            0
        );
    }

    event DelayedOrderRemoved(
        address indexed account,
        uint currentRoundId,
        int sizeDelta,
        uint targetRoundId,
        uint commitDeposit,
        uint keeperDeposit,
        bytes32 trackingCode
    );
    bytes32 internal constant NEXTPRICEORDERREMOVED_SIG =
        keccak256("DelayedOrderRemoved(address,uint256,int256,uint256,uint256,uint256,bytes32)");

    function emitDelayedOrderRemoved(
        address account,
        uint currentRoundId,
        int sizeDelta,
        uint targetRoundId,
        uint commitDeposit,
        uint keeperDeposit,
        bytes32 trackingCode
    ) internal {
        proxy._emit(
            abi.encode(currentRoundId, sizeDelta, targetRoundId, commitDeposit, keeperDeposit, trackingCode),
            2,
            NEXTPRICEORDERREMOVED_SIG,
            addressToBytes32(account),
            0,
            0
        );
    }

    bytes32 internal constant POSITIONMODIFIED_SIG =
        keccak256("PositionModified(uint256,address,uint256,int256,int256,uint256,uint256,uint256)");

    function emitPositionModified(
        uint id,
        address account,
        uint margin,
        int size,
        int tradeSize,
        uint lastPrice,
        uint fundingIndex,
        uint fee
    ) internal {
        proxy._emit(
            abi.encode(margin, size, tradeSize, lastPrice, fundingIndex, fee),
            3,
            POSITIONMODIFIED_SIG,
            bytes32(id),
            addressToBytes32(account),
            0
        );
    }
}
