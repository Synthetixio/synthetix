pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsV2MarketProxyable.sol";

// Reference
import "./interfaces/IPerpsV2MarketBaseTypes.sol";

/**
 Contract that implements DelayedOrders (base for on-chain and off-chain) mechanism for the PerpsV2 market.
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
// https://docs.synthetix.io/contracts/source/contracts/PerpsV2MarketDelayedOrdersBase
contract PerpsV2MarketDelayedOrdersBase is PerpsV2MarketProxyable {
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

    ///// Mutative methods

    function _submitDelayedOrder(
        bytes32 marketKey,
        int sizeDelta,
        uint priceImpactDelta,
        uint desiredTimeDelta,
        bytes32 trackingCode,
        bool isOffchain
    ) internal {
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
        // simulate the order with current price (+ p/d) and market and check that the order doesn't revert
        uint price = _fillPrice(sizeDelta, _assetPriceRequireSystemChecks());
        uint fundingIndex = _recomputeFunding();

        TradeParams memory params =
            TradeParams({
                sizeDelta: sizeDelta,
                price: price,
                takerFee: isOffchain ? _takerFeeOffchainDelayedOrder(marketKey) : _takerFeeDelayedOrder(marketKey),
                makerFee: isOffchain ? _makerFeeOffchainDelayedOrder(marketKey) : _makerFeeDelayedOrder(marketKey),
                priceImpactDelta: priceImpactDelta,
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
                priceImpactDelta: uint128(priceImpactDelta),
                targetRoundId: uint128(targetRoundId),
                commitDeposit: uint128(commitDeposit),
                keeperDeposit: uint128(keeperDeposit),
                executableAtTime: block.timestamp + desiredTimeDelta,
                intentionTime: block.timestamp,
                trackingCode: trackingCode
            });
        // emit event
        emitDelayedOrderSubmitted(messageSender, order);
        // store order
        marketState.updateDelayedOrder(
            messageSender,
            order.isOffchain,
            order.sizeDelta,
            order.priceImpactDelta,
            order.targetRoundId,
            order.commitDeposit,
            order.keeperDeposit,
            order.executableAtTime,
            order.intentionTime,
            order.trackingCode
        );
    }

    function _cancelDelayedOrder(address account, DelayedOrder memory order) internal {
        uint currentRoundId = _exchangeRates().getCurrentRoundId(_baseAsset());

        _confirmCanCancel(account, order, currentRoundId);

        if (account == messageSender) {
            // this is account owner
            // refund keeper fee to margin
            Position memory position = marketState.positions(account);

            // cancelling an order does not induce a fillPrice as no skew has moved.
            uint price = _assetPriceRequireSystemChecks();
            uint fundingIndex = _recomputeFunding();
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
        emitDelayedOrderRemoved(account, currentRoundId, order);
    }

    function _executeDelayedOrder(
        address account,
        DelayedOrder memory order,
        uint currentPrice,
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

        uint fundingIndex = _recomputeFunding();

        // we need to grab the fillPrice for events and margin updates (but this is also calc in _trade).
        //
        // warning: do not pass fillPrice into `_trade`!
        uint fillPrice = _fillPrice(order.sizeDelta, currentPrice);

        // refund the commitFee (and possibly the keeperFee) to the margin before executing the order
        // if the order later fails this is reverted of course
        _updatePositionMargin(account, position, fillPrice, int(toRefund));
        // emit event for modifying the position (refunding fee/s)
        emitPositionModified(position.id, account, position.margin, position.size, 0, fillPrice, fundingIndex, 0);

        // execute or revert
        _trade(
            account,
            TradeParams({
                sizeDelta: order.sizeDelta, // using the pastPrice from the target roundId
                price: currentPrice, // the funding is applied only from order confirmation time
                takerFee: takerFee, //_takerFeeDelayedOrder(_marketKey()),
                makerFee: makerFee, //_makerFeeDelayedOrder(_marketKey()),
                priceImpactDelta: order.priceImpactDelta,
                trackingCode: order.trackingCode
            })
        );

        // remove stored order
        marketState.deleteDelayedOrder(account);
        // emit event
        emitDelayedOrderRemoved(account, currentRoundId, order);
    }

    function _confirmCanCancel(
        address account,
        DelayedOrder memory order,
        uint currentRoundId
    ) internal {}

    ///// Internal views

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
        uint intentionTime,
        uint executableAtTime,
        uint commitDeposit,
        uint keeperDeposit,
        bytes32 trackingCode
    );
    bytes32 internal constant DELAYEDORDERSUBMITTED_SIG =
        keccak256("DelayedOrderSubmitted(address,bool,int256,uint256,uint256,uint256,uint256,uint256,bytes32)");

    function emitDelayedOrderSubmitted(address account, DelayedOrder memory order) internal {
        proxy._emit(
            abi.encode(
                order.isOffchain,
                order.sizeDelta,
                order.targetRoundId,
                order.intentionTime,
                order.executableAtTime,
                order.commitDeposit,
                order.keeperDeposit,
                order.trackingCode
            ),
            2,
            DELAYEDORDERSUBMITTED_SIG,
            addressToBytes32(account),
            0,
            0
        );
    }

    event DelayedOrderRemoved(
        address indexed account,
        bool isOffchain,
        uint currentRoundId,
        int sizeDelta,
        uint targetRoundId,
        uint commitDeposit,
        uint keeperDeposit,
        bytes32 trackingCode
    );
    bytes32 internal constant DELAYEDORDERREMOVED_SIG =
        keccak256("DelayedOrderRemoved(address,bool,uint256,int256,uint256,uint256,uint256,bytes32)");

    function emitDelayedOrderRemoved(
        address account,
        uint currentRoundId,
        DelayedOrder memory order
    ) internal {
        proxy._emit(
            abi.encode(
                order.isOffchain,
                currentRoundId,
                order.sizeDelta,
                order.targetRoundId,
                order.commitDeposit,
                order.keeperDeposit,
                order.trackingCode
            ),
            2,
            DELAYEDORDERREMOVED_SIG,
            addressToBytes32(account),
            0,
            0
        );
    }
}
