pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsV2MarketProxyable.sol";
import "./interfaces/IPerpsV2MarketDelayedIntent.sol";

// Reference
import "./interfaces/IPerpsV2MarketBaseTypes.sol";

/**
 Contract that implements DelayedOrders (on-chain & off-chain) mechanism for the PerpsV2 market.
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
// https://docs.synthetix.io/contracts/source/contracts/PerpsV2MarketDelayedIntent
contract PerpsV2MarketDelayedIntent is IPerpsV2MarketDelayedIntent, PerpsV2MarketProxyable {
    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        address _marketState,
        address _owner,
        address _resolver
    ) public PerpsV2MarketProxyable(_proxy, _marketState, _owner, _resolver) {}

    ///// Mutative methods

    function submitCloseOffchainDelayedOrderWithTracking(uint priceImpactDelta, bytes32 trackingCode) external {
        _submitCloseDelayedOrder(priceImpactDelta, 0, trackingCode, IPerpsV2MarketBaseTypes.OrderType.Offchain);
    }

    function submitCloseDelayedOrderWithTracking(
        uint desiredTimeDelta,
        uint priceImpactDelta,
        bytes32 trackingCode
    ) external {
        _submitCloseDelayedOrder(
            priceImpactDelta,
            desiredTimeDelta,
            trackingCode,
            IPerpsV2MarketBaseTypes.OrderType.Delayed
        );
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
     * @param priceImpactDelta is a percentage tolerance on fillPrice to be check upon execution
     * @param desiredTimeDelta maximum time in seconds to wait before filling this order
     */
    function submitDelayedOrder(
        int sizeDelta,
        uint priceImpactDelta,
        uint desiredTimeDelta
    ) external onlyProxy notFlagged(messageSender) {
        // @dev market key is obtained here and not in internal function to prevent stack too deep there
        // bytes32 marketKey = _marketKey();

        _submitDelayedOrder(_marketKey(), sizeDelta, priceImpactDelta, desiredTimeDelta, bytes32(0), false);
    }

    /// Same as submitDelayedOrder but emits an event with the tracking code to allow volume source
    /// fee sharing for integrations.
    function submitDelayedOrderWithTracking(
        int sizeDelta,
        uint priceImpactDelta,
        uint desiredTimeDelta,
        bytes32 trackingCode
    ) external onlyProxy notFlagged(messageSender) {
        // @dev market key is obtained here and not in internal function to prevent stack too deep there
        // bytes32 marketKey = _marketKey();

        _submitDelayedOrder(_marketKey(), sizeDelta, priceImpactDelta, desiredTimeDelta, trackingCode, false);
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
     * @param priceImpactDelta is a percentage tolerance on fillPrice to be check upon execution
     */
    function submitOffchainDelayedOrder(int sizeDelta, uint priceImpactDelta) external onlyProxy notFlagged(messageSender) {
        // @dev market key is obtained here and not in internal function to prevent stack too deep there
        // bytes32 marketKey = _marketKey();

        // enforcing desiredTimeDelta to 0 to use default (not needed for offchain delayed order)
        _submitDelayedOrder(_marketKey(), sizeDelta, priceImpactDelta, 0, bytes32(0), true);
    }

    function submitOffchainDelayedOrderWithTracking(
        int sizeDelta,
        uint priceImpactDelta,
        bytes32 trackingCode
    ) external onlyProxy notFlagged(messageSender) {
        // @dev market key is obtained here and not in internal function to prevent stack too deep there
        // bytes32 marketKey = _marketKey();

        _submitDelayedOrder(_marketKey(), sizeDelta, priceImpactDelta, 0, trackingCode, true);
    }

    ///// Internal

    function _submitCloseDelayedOrder(
        uint priceImpactDelta,
        uint desiredTimeDelta,
        bytes32 trackingCode,
        IPerpsV2MarketBaseTypes.OrderType orderType
    ) internal notFlagged(messageSender) {
        Position memory position = marketState.positions(messageSender);

        // a position must be present before closing.
        require(position.size != 0, "no existing position");

        // we only allow off-chain and delayed orders.
        //
        // note: although this is internal and may _never_ be called incorrectly, just a safety check.
        require(orderType != IPerpsV2MarketBaseTypes.OrderType.Atomic, "invalid order type");

        _submitDelayedOrder(
            _marketKey(),
            -position.size,
            priceImpactDelta,
            desiredTimeDelta,
            trackingCode,
            orderType == IPerpsV2MarketBaseTypes.OrderType.Offchain
        );
    }

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
        uint price = _assetPriceRequireSystemChecks(isOffchain);
        uint fillPrice = _fillPrice(sizeDelta, price);
        uint fundingIndex = _recomputeFunding(price);

        TradeParams memory params =
            TradeParams({
                sizeDelta: sizeDelta,
                oraclePrice: price,
                fillPrice: fillPrice,
                takerFee: isOffchain ? _takerFeeOffchainDelayedOrder(marketKey) : _takerFeeDelayedOrder(marketKey),
                makerFee: isOffchain ? _makerFeeOffchainDelayedOrder(marketKey) : _makerFeeDelayedOrder(marketKey),
                priceImpactDelta: priceImpactDelta,
                trackingCode: trackingCode
            });

        // stack too deep
        {
            (, , Status status) = _postTradeDetails(position, params);
            _revertIfError(status);
        }

        // deduct fees from margin
        //
        // commitDeposit is simply the maker/taker fee. note the dynamic fee rate is 0 since for the purposes of the
        // commitment deposit it is not important since at the time of the order execution it will be refunded and the
        // correct dynamic fee will be charged.
        // If the overrideCommitFee is set (value > 0) use this one instead.
        uint commitDeposit = _overrideCommitFee(marketKey) > 0 ? _overrideCommitFee(marketKey) : _orderFee(params, 0);
        uint keeperDeposit = _minKeeperFee();

        _updatePositionMargin(messageSender, position, sizeDelta, fillPrice, -int(commitDeposit + keeperDeposit));
        emitPositionModified(position.id, messageSender, position.margin, position.size, 0, fillPrice, fundingIndex, 0);

        uint targetRoundId = _exchangeRates().getCurrentRoundId(_baseAsset()) + 1; // next round
        DelayedOrder memory order =
            DelayedOrder({
                isOffchain: isOffchain,
                sizeDelta: int128(sizeDelta),
                priceImpactDelta: uint128(priceImpactDelta),
                targetRoundId: isOffchain ? 0 : uint128(targetRoundId),
                commitDeposit: uint128(commitDeposit),
                keeperDeposit: uint128(keeperDeposit), // offchain orders do _not_ have an executableAtTime as it's based on price age.
                executableAtTime: isOffchain ? 0 : block.timestamp + desiredTimeDelta, // zero out - not used and minimise confusion.
                intentionTime: block.timestamp,
                trackingCode: trackingCode
            });

        emitDelayedOrderSubmitted(messageSender, order);
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
}
