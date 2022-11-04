pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsV2MarketProxyable.sol";
import "./interfaces/IPerpsV2MarketDelayedOrders.sol";
import "./interfaces/IPerpsV2MarketOffchainOrders.sol";

// Reference
import "./interfaces/IPerpsV2MarketBaseTypes.sol";
import "./interfaces/IPerpsV2ExchangeRate.sol";
import "./interfaces/IPyth.sol";

// import "hardhat/console.sol";
/**
 Contract that implements DelayedOrders (onchain and offchain) mechanism for the PerpsV2 market.
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
// https://docs.synthetix.io/contracts/source/contracts/PerpsV2MarketDelayedOrders
contract PerpsV2MarketDelayedOrders is IPerpsV2MarketDelayedOrders, IPerpsV2MarketOffchainOrders, PerpsV2MarketProxyable {
    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        address _marketState,
        address _owner,
        address _resolver
    ) public PerpsV2MarketProxyable(_proxy, _marketState, _owner, _resolver) {}

    function delayedOrders(address account) external view returns (DelayedOrder memory) {
        return marketState.delayedOrders(account);
    }

    function _perpsV2ExchangeRate() internal view returns (IPerpsV2ExchangeRate) {
        return IPerpsV2ExchangeRate(requireAndGetAddress(CONTRACT_PERPSV2EXCHANGERATE));
    }

    ///// Mutative methods

    /**
     * @notice submits an order to be filled some time in the future or at a price of the next oracle update.
     * Reverts if a previous order still exists (wasn't executed or cancelled).
     * Reverts if the order cannot be filled at current price to prevent withholding commitFee for
     * incorrectly submitted orders (that cannot be filled).
     *
     * The order is executable after desiredTimeDelta. However, we also allow execution if the next price update
     * occurs before the desiredTimeDelta.
     * Reverts if the desiredTimeDelta is < minimum required delay.
     *
     * @param sizeDelta size in baseAsset (notional terms) of the order, similar to `modifyPosition` interface
     * @param desiredTimeDelta maximum time in seconds to wait before filling this order
     */
    function submitDelayedOrder(int sizeDelta, uint desiredTimeDelta) external {
        // @dev market key is obtained here and not in internal function to prevent stack too deep there
        bytes32 marketKey = _marketKey();

        _submitDelayedOrder(marketKey, sizeDelta, desiredTimeDelta, bytes32(0), false);
    }

    /// same as submitDelayedOrder but emits an event with the tracking code
    /// to allow volume source fee sharing for integrations
    function submitDelayedOrderWithTracking(
        int sizeDelta,
        uint desiredTimeDelta,
        bytes32 trackingCode
    ) external {
        // @dev market key is obtained here and not in internal function to prevent stack too deep there
        bytes32 marketKey = _marketKey();

        _submitDelayedOrder(marketKey, sizeDelta, desiredTimeDelta, trackingCode, false);
    }

    /**
     * @notice submits an order to be filled some time in the future or at a price of the next oracle update.
     * Reverts if a previous order still exists (wasn't executed or cancelled).
     * Reverts if the order cannot be filled at current price to prevent withholding commitFee for
     * incorrectly submitted orders (that cannot be filled).
     *
     * The order is executable after desiredTimeDelta. However, we also allow execution if the next price update
     * occurs before the desiredTimeDelta.
     * Reverts if the desiredTimeDelta is < minimum required delay.
     *
     * @param sizeDelta size in baseAsset (notional terms) of the order, similar to `modifyPosition` interface
     */
    function submitOffchainDelayedOrder(int sizeDelta) external {
        // @dev market key is obtained here and not in internal function to prevent stack too deep there
        bytes32 marketKey = _marketKey();

        // enforcing desiredTimeDelta to 0 to use default (not needed for offchain delayed order)
        _submitDelayedOrder(marketKey, sizeDelta, 0, bytes32(0), true);
    }

    function submitOffchainDelayedOrderWithTracking(int sizeDelta, bytes32 trackingCode) external {
        // @dev market key is obtained here and not in internal function to prevent stack too deep there
        bytes32 marketKey = _marketKey();

        _submitDelayedOrder(marketKey, sizeDelta, 0, trackingCode, true);
    }

    function _submitDelayedOrder(
        bytes32 marketKey,
        int sizeDelta,
        uint desiredTimeDelta,
        bytes32 trackingCode,
        bool isOffchain
    ) internal onlyProxy {
        // check that a previous order doesn't exist
        require(marketState.delayedOrders(messageSender).sizeDelta == 0, "previous order exists");

        // automatically set desiredTimeDelta to min if 0 is specified
        if (desiredTimeDelta == 0) {
            desiredTimeDelta = _minDelayTimeDelta(marketKey);
        }

        // ensure the desiredTimeDelta is above the minimum required delay
        require(
            desiredTimeDelta >= _minDelayTimeDelta(marketKey) && desiredTimeDelta <= _maxDelayTimeDelta(marketKey),
            "delay out of bounds"
        );

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
                takerFee: isOffchain ? _takerFeeOffchainDelayedOrder(_marketKey()) : _takerFeeDelayedOrder(_marketKey()),
                makerFee: isOffchain ? _makerFeeOffchainDelayedOrder(_marketKey()) : _makerFeeDelayedOrder(_marketKey()),
                trackingCode: trackingCode
            });
        (, , Status status) = _postTradeDetails(position, params);
        _revertIfError(status);

        // deduct fees from margin
        uint commitDeposit = _delayedOrderCommitDeposit(params);
        uint keeperDeposit = _minKeeperFee();
        _updatePositionMargin(messageSender, position, price, -int(commitDeposit + keeperDeposit));
        // emit event for modifying the position (subtracting the fees from margin)
        emitPositionModified(position.id, messageSender, position.margin, position.size, 0, price, fundingIndex, 0);

        // create order
        uint targetRoundId = _exchangeRates().getCurrentRoundId(_baseAsset()) + 1; // next round
        DelayedOrder memory order =
            DelayedOrder({
                isOffchain: isOffchain,
                sizeDelta: int128(sizeDelta),
                targetRoundId: uint128(targetRoundId),
                commitDeposit: uint128(commitDeposit),
                keeperDeposit: uint128(keeperDeposit),
                executableAtTime: block.timestamp + desiredTimeDelta,
                intentionTime: block.timestamp,
                trackingCode: trackingCode
            });
        // emit event
        emitDelayedOrderSubmitted(
            messageSender,
            order.isOffchain,
            order.sizeDelta,
            order.targetRoundId,
            order.executableAtTime,
            order.commitDeposit,
            order.keeperDeposit,
            order.trackingCode
        );
        // store order
        marketState.updateDelayedOrder(
            messageSender,
            order.isOffchain,
            order.sizeDelta,
            order.targetRoundId,
            order.commitDeposit,
            order.keeperDeposit,
            order.executableAtTime,
            order.intentionTime,
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
    function cancelDelayedOrder(address account) external onlyProxy {
        // important!! order of the account, not the msg.sender
        DelayedOrder memory order = marketState.delayedOrders(account);
        // check that a previous order exists
        require(order.sizeDelta != 0, "no previous order");

        uint currentRoundId = _exchangeRates().getCurrentRoundId(_baseAsset());

        _confirmCanCancel(account, order, currentRoundId);

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
     * @notice Tries to execute a previously submitted delayed order.
     * Reverts if:
     * - There is no order
     * - Target roundId wasn't reached yet
     * - Order is stale (target roundId is too low compared to current roundId).
     * - Order fails for accounting reason (e.g. margin was removed, leverage exceeded, etc)
     * - Time delay and target round has not yet been reached
     * If order reverts, it has to be removed by calling cancelDelayedOrder().
     * Anyone can call this method for any account.
     * If this is called by the account holder - the keeperFee is refunded into margin,
     *  otherwise it sent to the msg.sender.
     * @param account address of the account for which to try to execute a delayed order
     */
    function executeDelayedOrder(address account) external onlyProxy {
        // important!: order of the account, not the sender!
        DelayedOrder memory order = marketState.delayedOrders(account);
        // check that a previous order exists
        require(order.sizeDelta != 0, "no previous order");

        require(!order.isOffchain, "use offchain method");

        // check order executability and round-id
        uint currentRoundId = _exchangeRates().getCurrentRoundId(_baseAsset());
        require(
            block.timestamp >= order.executableAtTime || order.targetRoundId <= currentRoundId,
            "executability not reached"
        );

        // check order is not too old to execute
        // we cannot allow executing old orders because otherwise future knowledge
        // can be used to trigger failures of orders that are more profitable
        // then the commitFee that was charged, or can be used to confirm
        // orders that are more profitable than known then (which makes this into a "cheap option").
        require(
            !_confirmationWindowOver(order.executableAtTime, currentRoundId, order.targetRoundId),
            "order too old, use cancel"
        );

        // price depends on whether the delay or price update has reached/occurred first
        uint currentPrice = _assetPriceRequireSystemChecks();
        uint tradePrice = currentPrice;
        if (currentRoundId >= order.targetRoundId) {
            // the correct price for the past round if target round was met
            (uint pastPrice, ) = _exchangeRates().rateAndTimestampAtRound(_baseAsset(), order.targetRoundId);
            tradePrice = pastPrice;
        }

        _executeDelayedOrder(
            account,
            order,
            currentPrice,
            tradePrice,
            currentRoundId,
            _takerFeeDelayedOrder(_marketKey()),
            _makerFeeDelayedOrder(_marketKey())
        );
    }

    /**
     * @notice Tries to execute a previously submitted delayed order.
     * Reverts if:
     * - There is no order
     * - Target roundId wasn't reached yet
     * - Order is stale (target roundId is too low compared to current roundId).
     * - Order fails for accounting reason (e.g. margin was removed, leverage exceeded, etc)
     * - Time delay and target round has not yet been reached
     * If order reverts, it has to be removed by calling cancelDelayedOrder().
     * Anyone can call this method for any account.
     * If this is called by the account holder - the keeperFee is refunded into margin,
     *  otherwise it sent to the msg.sender.
     * @param account address of the account for which to try to execute a delayed order
     */
    function executeOffchainDelayedOrder(address account, bytes[] calldata priceUpdateData) external payable onlyProxy {
        // important!: order of the account, not the sender!
        DelayedOrder memory order = marketState.delayedOrders(account);
        // check that a previous order exists
        require(order.sizeDelta != 0, "no previous order");

        require(order.isOffchain, "use onchain method");

        // update price feed (this is payable)
        _perpsV2ExchangeRate().updatePythPrice(messageSender, priceUpdateData);

        // get latest price for asset
        uint maxAge = _offchainDelayedOrderMaxAge(_marketKey());
        uint minAge = _offchainDelayedOrderMinAge(_marketKey());

        (uint currentPrice, uint executionTimestamp) = _offchainAssetPriceRequireSystemChecks(maxAge);
        require(
            (executionTimestamp > order.intentionTime) && (executionTimestamp - order.intentionTime > minAge),
            "too early"
        );
        require((executionTimestamp - order.intentionTime < maxAge), "too late");

        _executeDelayedOrder(
            account,
            order,
            currentPrice,
            currentPrice,
            0,
            _takerFeeOffchainDelayedOrder(_marketKey()),
            _makerFeeOffchainDelayedOrder(_marketKey())
        );
    }

    function _executeDelayedOrder(
        address account,
        DelayedOrder memory order,
        uint currentPrice,
        uint tradePrice,
        uint currentRoundId,
        uint takerFee,
        uint makerFee
    ) internal {
        // handle the fees and refunds according to the mechanism rules
        uint toRefund = order.commitDeposit; // refund the commitment deposit

        // refund keeperFee to margin if it's the account holder
        if (messageSender == account) {
            toRefund += order.keeperDeposit;
        } else {
            _manager().issueSUSD(messageSender, order.keeperDeposit);
        }

        Position memory position = marketState.positions(account);

        uint fundingIndex = _recomputeFunding(currentPrice);

        // refund the commitFee (and possibly the keeperFee) to the margin before executing the order
        // if the order later fails this is reverted of course
        _updatePositionMargin(account, position, currentPrice, int(toRefund));
        // emit event for modifying the position (refunding fee/s)
        emitPositionModified(position.id, account, position.margin, position.size, 0, currentPrice, fundingIndex, 0);

        // execute or revert
        _trade(
            account,
            TradeParams({
                sizeDelta: order.sizeDelta, // using the pastPrice from the target roundId
                price: tradePrice, // the funding is applied only from order confirmation time
                takerFee: takerFee, //_takerFeeDelayedOrder(_marketKey()),
                makerFee: makerFee, //_makerFeeDelayedOrder(_marketKey()),
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

    function _confirmCanCancel(
        address account,
        DelayedOrder memory order,
        uint currentRoundId
    ) internal {
        if (order.isOffchain) {
            require(
                block.timestamp - order.intentionTime > _offchainDelayedOrderMaxAge(_marketKey()) * 2,
                "cannot cancel yet"
            );
        } else {
            if (account != messageSender) {
                // this is someone else (like a keeper)
                // cancellation by third party is only possible when execution cannot be attempted any longer
                // otherwise someone might try to grief an account by cancelling for the keeper fee
                require(
                    _confirmationWindowOver(order.executableAtTime, currentRoundId, order.targetRoundId),
                    "cannot be cancelled by keeper yet"
                );
            }
        }
    }

    ///// Internal views

    /*
     * The current base price, reverting if it is invalid, or if system or synth is suspended.
     */
    function _offchainAssetPriceRequireSystemChecks(uint maxAge) internal view returns (uint price, uint publishTime) {
        // check that futures market isn't suspended, revert with appropriate message
        _systemStatus().requireFuturesMarketActive(_marketKey()); // asset and market may be different
        // check that synth is active, and wasn't suspended, revert with appropriate message
        _systemStatus().requireSynthActive(_baseAsset());

        return _perpsV2ExchangeRate().resolveAndGetPrice(_baseAsset(), maxAge);
    }

    /// confirmation window is over when:
    ///  1. current roundId is more than nextPriceConfirmWindow rounds after target roundId
    ///  2. or executableAtTime - block.timestamp is more than delayedOrderConfirmWindow
    ///
    /// if either conditions are met, an order is considered to have exceeded the window.
    function _confirmationWindowOver(
        uint executableAtTime,
        uint currentRoundId,
        uint targetRoundId
    ) internal view returns (bool) {
        bytes32 marketKey = _marketKey();
        return
            (block.timestamp > executableAtTime &&
                (block.timestamp - executableAtTime) > _delayedOrderConfirmWindow(marketKey)) ||
            ((currentRoundId > targetRoundId) && (currentRoundId - targetRoundId > _nextPriceConfirmWindow(marketKey))); // don't underflow
    }

    // convenience view to access exchangeRates contract for methods that are not exposed
    // via _exchangeCircuitBreaker() contract
    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(_exchangeCircuitBreaker().exchangeRates());
    }

    // calculate the commitFee, which is the fee that would be charged on the order if it was spot
    function _delayedOrderCommitDeposit(TradeParams memory params) internal view returns (uint) {
        // modify params to spot fee
        params.takerFee = _takerFee(_marketKey());
        params.makerFee = _makerFee(_marketKey());
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
        bool isOffchain,
        int sizeDelta,
        uint targetRoundId,
        uint executableAtTime,
        uint commitDeposit,
        uint keeperDeposit,
        bytes32 trackingCode
    );
    bytes32 internal constant DELAYEDORDERSUBMITTED_SIG =
        keccak256("DelayedOrderSubmitted(address,bool,int256,uint256,uint256,uint256,uint256,bytes32)");

    function emitDelayedOrderSubmitted(
        address account,
        bool isOffchain,
        int sizeDelta,
        uint targetRoundId,
        uint executableAtTime,
        uint commitDeposit,
        uint keeperDeposit,
        bytes32 trackingCode
    ) internal {
        proxy._emit(
            abi.encode(isOffchain, sizeDelta, targetRoundId, executableAtTime, commitDeposit, keeperDeposit, trackingCode),
            2,
            DELAYEDORDERSUBMITTED_SIG,
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
    bytes32 internal constant DELAYEDORDERREMOVED_SIG =
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
            DELAYEDORDERREMOVED_SIG,
            addressToBytes32(account),
            0,
            0
        );
    }
}
